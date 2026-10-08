/**
 * Native skill serialization (canonical-skills, Native serialization replaces canonical
 * passthrough; Per-target skill support).
 *
 * A skill is rendered for one target and carrier from its canonical fields plus that target's
 * own native extras. Support cells decide whether each present field is written, degraded or
 * refuses the skill; extras of every other dialect are reported as dropped (or refuse the skill
 * when they restrict). Canonical-only keys (`invocation`, `only`, `except`, `targets`, `assets`)
 * never reach the output.
 */
import {
  type AcfCapability,
  type Carrier,
  type ComponentOutcome,
  type Diagnostic,
  extraDropped,
  extrasDialects,
  nativeExtras,
  nativeKeyInfo,
  type SkillFacet,
  type SupportSubject,
  stringifyYml,
  supportCell,
  supportDiagnostic,
  type TargetId,
  translatedOutcome,
} from "@caplet/core";

/** Relative path of the Codex skill metadata file (`agents/openai.yaml`). */
export const CODEX_SKILL_METADATA = "agents/openai.yaml";

/** A skill rendered for one target and carrier. */
export type NativeSkill = {
  /** SKILL.md frontmatter in the target's spelling and emission order. */
  frontmatter: Record<string, unknown>;
  /** Generated files of the skill directory besides SKILL.md, keyed by relative POSIX path. */
  files: Record<string, string>;
  /**
   * Output entries that came from the target's own native extras, keyed `<file>#<key>`. A
   * rendering shared by several targets must carry identical extras for each of them.
   */
  extras: Record<string, unknown>;
  diagnostics: Diagnostic[];
  /** Outcomes the writer knows positively (translated cells); others derive from diagnostics. */
  outcomes: ComponentOutcome[];
  /** True when a support cell or a restricting foreign extra refuses the skill for the target. */
  refused: boolean;
};

const SKILL_FILE = "SKILL.md";

/** Canonical fields written under the same key on every target that carries them. */
const sameKeyFields = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "argument-hint",
] as const;

/** Invocation value conditions and the frontmatter spelling of their native cells. */
const invocationFields = [
  {
    field: "skill.invocation.model=false",
    applies: (skill: SkillFacet) => skill.frontmatter.invocation?.model === false,
    frontmatter: ["disable-model-invocation", true],
    metadata: ["policy", "allow_implicit_invocation", false],
  },
  {
    field: "skill.invocation.user=false",
    applies: (skill: SkillFacet) => skill.frontmatter.invocation?.user === false,
    frontmatter: ["user-invocable", false],
    metadata: undefined,
  },
] as const;

/**
 * Renders `skill` for `target` on `carrier` (default `loose`). The result never contains
 * canonical-only keys; Codex receives `invocation.model: false` and its dotted native extras in
 * `agents/openai.yaml`. Reusable by every skill writer, including the Claude plugin carrier.
 */
export function renderNativeSkill(
  capability: AcfCapability,
  skill: SkillFacet,
  target: TargetId,
  carrier: Carrier = "loose",
): NativeSkill {
  const subject: SupportSubject & { family: "skill" } = {
    capability: capability.manifest.name,
    target,
    carrier,
    family: "skill",
    component: skill.name,
  };
  const result: NativeSkill = {
    frontmatter: {},
    files: {},
    extras: {},
    diagnostics: [],
    outcomes: [],
    refused: false,
  };
  const metadata: Record<string, unknown> = {};

  const consider = (field: string): boolean => {
    const diagnostic = supportDiagnostic(subject, field);
    if (diagnostic !== undefined) {
      result.diagnostics.push(diagnostic);
      if (diagnostic.code === "acf.support.refused") result.refused = true;
    }
    const translated = translatedOutcome(subject, field);
    if (translated !== undefined) result.outcomes.push(translated);
    return supportCell(field, target, carrier)?.kind === "native";
  };

  for (const key of sameKeyFields) {
    const value = skill.frontmatter[key];
    if (value !== undefined && consider(`skill.${key}`)) result.frontmatter[key] = value;
  }
  for (const entry of invocationFields) {
    if (!entry.applies(skill) || !consider(entry.field)) continue;
    const cell = supportCell(entry.field, target, carrier);
    if (cell?.kind === "native" && cell.location === CODEX_SKILL_METADATA) {
      if (entry.metadata === undefined) throw new Error(`${entry.field} has no metadata spelling`);
      const [section, key, value] = entry.metadata;
      setDotted(metadata, `${section}.${key}`, value);
    } else {
      const [key, value] = entry.frontmatter;
      result.frontmatter[key] = value;
    }
  }

  for (const [key, value] of Object.entries(nativeExtras(skill.frontmatter.targets, target))) {
    // Core fields own their generated keys; validation reports an extra that repeats one.
    if (nativeKeyInfo(target, "skill", key)?.generatedFrom !== undefined) continue;
    if (target === "codex" && key.includes(".")) {
      setDotted(metadata, key, value);
      result.extras[`${CODEX_SKILL_METADATA}#${key}`] = value;
    } else {
      result.frontmatter[key] = value;
      result.extras[`${SKILL_FILE}#${key}`] = value;
    }
  }
  for (const dialect of extrasDialects(skill.frontmatter.targets)) {
    if (dialect === target) continue;
    for (const key of Object.keys(nativeExtras(skill.frontmatter.targets, dialect))) {
      const diagnostic = extraDropped(subject, { owner: dialect, key });
      result.diagnostics.push(diagnostic);
      if (diagnostic.code === "acf.support.refused") result.refused = true;
    }
  }

  if (Object.keys(metadata).length > 0) result.files[CODEX_SKILL_METADATA] = stringifyYml(metadata);
  return result;
}

function setDotted(root: Record<string, unknown>, dotted: string, value: unknown): void {
  const segments = dotted.split(".");
  const last = segments.pop();
  if (last === undefined) return;
  let cursor = root;
  for (const segment of segments) {
    const next = cursor[segment];
    if (typeof next === "object" && next !== null && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      cursor[segment] = created;
      cursor = created;
    }
  }
  cursor[last] = value;
}
