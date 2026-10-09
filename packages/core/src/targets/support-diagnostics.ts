import type {
  Carrier,
  ComponentOutcome,
  ComponentOutcomeKind,
  Diagnostic,
  FacetFamily,
  InteropFamily,
  OutcomeFamily,
  SupportCell,
  TargetId,
} from "../types/index.js";
import { selectorKeys } from "../types/index.js";
import { carriersOf, findFieldSupport, supportCell } from "./field-support.js";
import { nativeKeyInfo } from "./native-keys.js";

/** The component a support decision is about, on one target and carrier. */
export type SupportSubject = {
  capability: string;
  target: TargetId;
  /** Defaults to the target's default carrier. */
  carrier?: Carrier | undefined;
  family: OutcomeFamily;
  component: string;
};

/**
 * Structured payload of every diagnostic built here (`diagnostic.data`). `componentOutcomes`
 * reads it to place the component in the compatibility report: `outcome` sets the component's
 * outcome (for the whole package when `blocks` is `package`), `dropped` records a field or
 * extra lost without changing behavior.
 */
export type SupportDiagnosticData = {
  family: OutcomeFamily;
  component: string;
  outcome?: Exclude<ComponentOutcomeKind, "native" | "translated"> | undefined;
  blocks?: "component" | "package" | undefined;
  source?: string | undefined;
  consequence?: string | undefined;
  recovery?: string | undefined;
  dropped?: string | undefined;
};

/**
 * Diagnostic for applying `field` to the subject: `acf.support.refused` (error) for a refused
 * cell, `acf.support.degraded` with the cell's severity and loss for a degraded cell, and
 * undefined for native, translated or absent cells. Throws for an unknown field id.
 */
export function supportDiagnostic(subject: SupportSubject, field: string): Diagnostic | undefined {
  const cell = cellFor(subject, field);
  if (cell?.kind === "refused") {
    return refusal(subject, field, `${subject.target} cannot honor ${field}: ${cell.reason}`);
  }
  if (cell?.kind !== "degraded") return undefined;
  const label = componentLabel(subject);
  const changesBehavior = findFieldSupport(field)?.class === "granting";
  return diagnostic(subject, {
    severity: cell.severity,
    code: "acf.support.degraded",
    message: `${subject.target}: ${cell.loss} (${field} on ${label})`,
    data: changesBehavior
      ? {
          outcome: "changed-behavior",
          source: field,
          consequence: cell.loss,
          recovery: recoveryFor(subject),
        }
      : { dropped: field },
  });
}

/**
 * The `translated` outcome for applying `field` to the subject when its cell is a translation,
 * else undefined. Writers return it in `EmitResult.outcomes`.
 */
export function translatedOutcome(
  subject: SupportSubject,
  field: string,
): ComponentOutcome | undefined {
  const cell = cellFor(subject, field);
  if (cell?.kind !== "translated") return undefined;
  return {
    capability: subject.capability,
    target: subject.target,
    family: subject.family,
    component: subject.component,
    outcome: "translated",
    source: field,
    consequence: cell.rule,
  };
}

/**
 * `acf.support.component-omitted` (lossy): the target has no carrier for the component type,
 * so the writer skips it. Use `packageRefused` instead when the component is restricting.
 * `options.recovery` replaces the default when another choice also resolves it (a carrier change);
 * `options.source` names the component type in the report and defaults to the family.
 */
export function componentOmitted(
  subject: SupportSubject,
  reason: string,
  {
    recovery = recoveryFor(subject),
    source = subject.family,
  }: { recovery?: string; source?: string } = {},
): Diagnostic {
  const label = componentLabel(subject);
  return diagnostic(subject, {
    severity: "lossy",
    code: "acf.support.component-omitted",
    message: `${label} is omitted for ${subject.target}: ${reason}`,
    data: {
      outcome: "omitted",
      source,
      consequence: `${label} is not installed for ${subject.target}`,
      recovery,
    },
  });
}

/**
 * `acf.support.refused` (error) for a restricting component the target cannot carry: the
 * whole package is refused for that target (capability-model-layers, Component omission).
 * `recovery` replaces the default when another choice also resolves it (a carrier change).
 */
export function packageRefused(
  subject: SupportSubject,
  reason: string,
  recovery = recoveryFor(subject),
): Diagnostic {
  const label = componentLabel(subject);
  return diagnostic(subject, {
    severity: "error",
    code: "acf.support.refused",
    message: `capability ${subject.capability} is blocked for ${subject.target}: ${label} ${reason}. Recovery: ${recovery}`,
    data: {
      outcome: "blocked",
      blocks: "package",
      source: label,
      consequence: `capability ${subject.capability} is not installed for ${subject.target}`,
      recovery,
    },
  });
}

/**
 * Diagnostic for an inline extra of `extra.owner` that is not emitted to `subject.target`:
 * `acf.extras.dropped` (lossy), or `acf.support.refused` when the registry classifies the key
 * as restricting and the target carries no core equivalent (capability-model-layers, Dropping
 * extras elsewhere). Unknown keys count as `unclassified`.
 */
export function extraDropped(
  subject: SupportSubject & { family: InteropFamily },
  extra: { owner: TargetId; key: string },
): Diagnostic {
  const info = nativeKeyInfo(extra.owner, subject.family, extra.key);
  const source = `targets.${extra.owner}.native.${extra.key}`;
  const keyClass = info?.class ?? "unclassified";
  if (keyClass === "restricting" && !carriesCoreEquivalent(subject, info?.generatedFrom)) {
    return refusal(
      subject,
      source,
      `${subject.target} has no equivalent for the restricting ${extra.owner} key ${extra.key}`,
    );
  }
  const label = componentLabel(subject);
  const changesBehavior = keyClass === "functional" || keyClass === "granting";
  return diagnostic(subject, {
    severity: "lossy",
    code: "acf.extras.dropped",
    message: `${subject.target} drops the ${keyClass} ${extra.owner} key ${extra.key} from ${label}`,
    data: changesBehavior
      ? {
          outcome: "changed-behavior",
          source,
          consequence: `${label} runs without ${extra.key} on ${subject.target}`,
          recovery: recoveryFor(subject),
          dropped: source,
        }
      : { dropped: source },
  });
}

/** `acf.extras.dropped` (lossy) for a capability's `native/<owner>/` tree on another target. */
export function nativeTreeDropped(
  subject: { capability: string; target: TargetId },
  owner: TargetId,
): Diagnostic {
  const tree = `native/${owner}/`;
  return diagnostic(
    { ...subject, family: "package", component: subject.capability },
    {
      severity: "lossy",
      code: "acf.extras.dropped",
      message: `${subject.target} drops ${tree} from capability ${subject.capability}`,
      data: { dropped: tree },
    },
  );
}

/**
 * `acf.core.pending` (info) when `key` is a native key of `subject.target` whose meaning is a
 * pending core field; undefined for any other key.
 */
export function corePending(
  subject: SupportSubject & { family: InteropFamily },
  key: string,
): Diagnostic | undefined {
  const pending = nativeKeyInfo(subject.target, subject.family, key)?.pending;
  if (pending === undefined) return undefined;
  return diagnostic(subject, {
    severity: "info",
    code: "acf.core.pending",
    message: `${subject.target} key ${key} on ${componentLabel(subject)} carries a pending core meaning; future core field ${pending.coreField}`,
    data: { source: `targets.${subject.target}.native.${key}` },
  });
}

/**
 * `acf.skill.placeholder-unexpanded` (lossy) for a skill body that uses Claude placeholders
 * (`$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`) on a target that does not expand them. Body placeholders
 * are a pending core meaning (`skill.arguments`) and the body travels unchanged, so the target's
 * agent reads the placeholder text where Claude would substitute a value.
 */
export function bodyPlaceholdersUnexpanded(
  subject: SupportSubject & { family: "skill" },
  placeholders: readonly string[],
): Diagnostic {
  const label = componentLabel(subject);
  const list = placeholders.join(", ");
  return diagnostic(subject, {
    severity: "lossy",
    code: "acf.skill.placeholder-unexpanded",
    message: `${subject.target} does not expand the Claude placeholders ${list} in the body of ${label}; they reach it as written`,
    data: {
      outcome: "changed-behavior",
      source: "skill body",
      consequence: `${label} reads ${list} as literal text on ${subject.target}`,
      recovery: recoveryFor(subject),
    },
  });
}

/** The support payload of a diagnostic built by this module, or undefined for any other. */
export function readSupportData(
  diagnostic: Diagnostic | undefined,
): SupportDiagnosticData | undefined {
  const data = diagnostic?.data;
  if (data === undefined || typeof data.component !== "string") return undefined;
  if (typeof data.family !== "string") return undefined;
  return data as SupportDiagnosticData;
}

function cellFor(subject: SupportSubject, field: string): SupportCell | undefined {
  return supportCell(field, subject.target, subject.carrier ?? carriersOf(subject.target).default);
}

function carriesCoreEquivalent(subject: SupportSubject, field: string | undefined): boolean {
  if (field === undefined || findFieldSupport(field) === undefined) return false;
  const kind = cellFor(subject, field)?.kind;
  return kind === "native" || kind === "translated";
}

function refusal(subject: SupportSubject, source: string, reason: string): Diagnostic {
  const label = componentLabel(subject);
  const recovery = recoveryFor(subject);
  const consequence = `${label} is not installed for ${subject.target}`;
  return diagnostic(subject, {
    severity: "error",
    code: "acf.support.refused",
    message: `${label} is blocked for ${subject.target} by ${source}: ${reason}. Recovery: ${recovery}`,
    data: { outcome: "blocked", blocks: "component", source, consequence, recovery },
  });
}

function diagnostic(
  subject: SupportSubject,
  input: {
    severity: Diagnostic["severity"];
    code: string;
    message: string;
    data: Omit<SupportDiagnosticData, "family" | "component">;
  },
): Diagnostic {
  const result: Diagnostic = {
    severity: input.severity,
    code: input.code,
    message: input.message,
    targetId: subject.target,
    capability: { name: subject.capability },
    data: { family: subject.family, component: subject.component, ...input.data },
  };
  if (subject.family !== "package" && subject.family !== "remainder") {
    result.family = subject.family;
  }
  return result;
}

/** Singular and plural nouns that name a component of each family in user-facing text. */
export const outcomeFamilyNouns: Readonly<Record<OutcomeFamily, readonly [string, string]>> = {
  package: ["package", "packages"],
  skill: ["skill", "skills"],
  agent: ["agent", "agents"],
  command: ["command", "commands"],
  instruction: ["instruction", "instructions"],
  hook: ["hook", "hooks"],
  mcp: ["MCP server", "MCP servers"],
  remainder: ["native component", "native components"],
};

/** A component named by its family noun, such as `skill review` or `capability tools`. */
export function componentLabel(subject: Pick<SupportSubject, "family" | "component">): string {
  return subject.family === "package"
    ? `capability ${subject.component}`
    : `${outcomeFamilyNouns[subject.family][0]} ${subject.component}`;
}

/**
 * The recovery a user applies to accept the loss: exclude the component for the target, or
 * restrict it to other targets (capability-model-layers, Writers honor the table or refuse).
 * Packages and native remainder outside the ACF families have no selector, only `except`.
 */
export function recoveryFor(subject: {
  family: OutcomeFamily;
  component: string;
  target: TargetId;
}): string {
  if (subject.family === "package" || subject.family === "remainder") {
    return `except: [${subject.target}]`;
  }
  return exclusionRecovery(
    [{ family: subject.family, component: subject.component }],
    subject.target,
  );
}

/**
 * The `capabilities.yml` recovery for blocked `components`: exclude all of them from the
 * entry (for every target), or except the entry from `target`. Families keep their
 * first-seen order and use the selector keys `exclude` accepts.
 */
export function exclusionRecovery(
  components: readonly { family: FacetFamily; component: string }[],
  target: TargetId,
): string {
  const byFamily = new Map<FacetFamily, string[]>();
  for (const { family, component } of components) {
    byFamily.set(family, [...(byFamily.get(family) ?? []), component]);
  }
  const lists = [...byFamily].map(
    ([family, names]) => `${selectorKeys[family]}: [${names.join(", ")}]`,
  );
  return `exclude: { ${lists.join(", ")} } or except: [${target}]`;
}
