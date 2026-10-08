import {
  componentLabel,
  exclusionRecovery,
  readSupportData,
  recoveryFor,
} from "../targets/support-diagnostics.js";
import type {
  AcfCapability,
  ComponentOutcome,
  ComponentOutcomeKind,
  Diagnostic,
  OutcomeFamily,
  TargetId,
} from "../types/index.js";

/** Outcome kinds from best to worst; a component takes the worst outcome reported for it. */
export const componentOutcomeKinds: readonly ComponentOutcomeKind[] = [
  "native",
  "translated",
  "changed-behavior",
  "omitted",
  "blocked",
];

type OutcomeUpdate = Omit<ComponentOutcome, "capability" | "target">;

/**
 * The compatibility-report outcome of every component of `capability` (after applicability
 * filtering) on `target`.
 *
 * Components start `native`. Writer-reported `outcomes`, diagnostics built by the support
 * helpers (`readSupportData`) and the pre-registry `acf.adapter.*` diagnostics then move a
 * component to a worse outcome; the worst one wins and carries its source, consequence and
 * recovery. Descriptive drops accumulate in `dropped`. Diagnostics for other targets are
 * ignored, so callers may pass the diagnostics of one capability across targets.
 *
 * A blocked component blocks the whole capability on the target ({@link capabilityBlocked}),
 * so every other component is reported blocked too, naming the refused components as its
 * source and the recovery that unblocks them all.
 */
export function componentOutcomes(input: {
  capability: AcfCapability;
  target: TargetId;
  diagnostics: readonly Diagnostic[];
  reported?: readonly ComponentOutcome[] | undefined;
}): ComponentOutcome[] {
  const { capability, target } = input;
  const outcomes = new Map<string, ComponentOutcome>();
  const update = (change: OutcomeUpdate): void => {
    const key = `${change.family}\u0000${change.component}`;
    const current = outcomes.get(key) ?? {
      capability: capability.manifest.name,
      target,
      family: change.family,
      component: change.component,
      outcome: "native",
    };
    const dropped = [...(current.dropped ?? [])];
    for (const field of change.dropped ?? []) if (!dropped.includes(field)) dropped.push(field);
    const worse = rank(change.outcome) > rank(current.outcome);
    const next: ComponentOutcome = worse
      ? { ...current, ...withoutDropped(change), capability: current.capability, target }
      : { ...current };
    if (dropped.length > 0) next.dropped = dropped;
    outcomes.set(key, next);
  };

  const components = listComponents(capability);
  for (const component of components) update({ ...component, outcome: "native" });
  for (const reported of input.reported ?? []) {
    if (reported.target === target) update(reported);
  }
  for (const diagnostic of input.diagnostics) {
    if (diagnostic.targetId !== undefined && diagnostic.targetId !== target) continue;
    for (const change of supportChanges(diagnostic, components)) update(change);
    for (const change of legacyChanges(diagnostic, capability, components, target)) update(change);
  }
  return blockedByRefusals([...outcomes.values()], capability.manifest.name, target);
}

/**
 * Whether `diagnostics` hold a refusal for `target`. A refusal blocks the refused component's
 * whole capability there (capability-model-layers, Writers honor the table or refuse): an apply
 * writes, updates and removes nothing of it for that target until the user excludes the refused
 * component, while other capabilities and other targets apply normally.
 */
export function capabilityBlocked(diagnostics: readonly Diagnostic[], target: TargetId): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "acf.support.refused" && (diagnostic.targetId ?? target) === target,
  );
}

function blockedByRefusals(
  outcomes: readonly ComponentOutcome[],
  capability: string,
  target: TargetId,
): ComponentOutcome[] {
  const refused = outcomes.filter((item) => item.outcome === "blocked");
  if (refused.length === 0) return [...outcomes];
  const excludable = refused.flatMap((item) =>
    item.family === "package" ? [] : [{ family: item.family, component: item.component }],
  );
  const recovery =
    excludable.length === refused.length
      ? exclusionRecovery(excludable, target)
      : recoveryFor({ family: "package", component: capability, target });
  const source = refused.map(componentLabel).join(", ");
  return outcomes.map((item) =>
    item.outcome === "blocked"
      ? item
      : {
          capability: item.capability,
          target,
          family: item.family,
          component: item.component,
          outcome: "blocked",
          source,
          consequence: `capability ${capability} is not installed for ${target}`,
          recovery,
        },
  );
}

function supportChanges(diagnostic: Diagnostic, components: readonly Component[]): OutcomeUpdate[] {
  const data = readSupportData(diagnostic);
  if (data === undefined) return [];
  const change: Omit<OutcomeUpdate, "family" | "component"> = {
    outcome: data.outcome ?? "native",
    source: data.source,
    consequence: data.consequence,
    recovery: data.recovery,
  };
  if (data.blocks === "package") {
    return components.map((component) => ({ ...component, ...change }));
  }
  return [
    {
      family: data.family,
      component: data.component,
      ...change,
      dropped: data.dropped === undefined ? [] : [data.dropped],
    },
  ];
}

/**
 * Outcomes implied by the `acf.adapter.*` diagnostics that writers emitted before the
 * field-level registry. Group-4 writers replace them with the support helpers.
 */
function legacyChanges(
  diagnostic: Diagnostic,
  capability: AcfCapability,
  components: readonly Component[],
  target: TargetId,
): OutcomeUpdate[] {
  const data = diagnostic.data ?? {};
  const affect = (
    family: OutcomeFamily,
    names: readonly string[],
    outcome: ComponentOutcomeKind,
    source: string,
  ): OutcomeUpdate[] =>
    names.map((component) => ({
      family,
      component,
      outcome,
      source,
      consequence: diagnostic.message,
      recovery: recoveryFor({ family, component, target }),
    }));
  const named = (key: string): string[] => (typeof data[key] === "string" ? [data[key]] : []);
  switch (diagnostic.code) {
    case "acf.adapter.facet-unsupported": {
      const family = diagnostic.family;
      if (family === undefined) return [];
      const names = components
        .filter((item) => item.family === family)
        .map((item) => item.component);
      const outcome = data.outcome === "changed-behavior" ? "changed-behavior" : "omitted";
      return affect(family, names, outcome, family);
    }
    case "acf.adapter.hook-event-unsupported": {
      const hookType = data.hookType;
      const bucket = typeof hookType === "string" ? hookBucket(capability, hookType) : [];
      return affect("hook", bucket, "omitted", `hook event ${String(hookType)}`);
    }
    case "acf.adapter.effect-degraded":
      return affect(
        "hook",
        named("hook"),
        "changed-behavior",
        `hook effect ${String(data.effect)}`,
      );
    case "acf.adapter.trigger-unsupported":
      return data.activation === "always"
        ? affect("instruction", named("instruction"), "omitted", "activation: always")
        : affect(
            "instruction",
            named("instruction"),
            "changed-behavior",
            `instruction trigger ${String(data.trigger)}`,
          );
    default:
      return [];
  }
}

type Component = { family: OutcomeFamily; component: string };

function listComponents(capability: AcfCapability): Component[] {
  const of = (family: OutcomeFamily, names: readonly string[]): Component[] =>
    names.map((component) => ({ family, component }));
  const hooks = Object.values(capability.hooks?.buckets ?? {}).flatMap((entries) =>
    (entries ?? []).map((entry) => entry.name),
  );
  return [
    ...of(
      "skill",
      capability.skills.map((facet) => facet.name),
    ),
    ...of(
      "agent",
      capability.agents.map((facet) => facet.name),
    ),
    ...of(
      "command",
      capability.commands.map((facet) => facet.name),
    ),
    ...of(
      "instruction",
      capability.instructions.map((facet) => facet.name),
    ),
    ...of("hook", [...new Set(hooks)]),
    ...of(
      "mcp",
      (capability.mcp?.servers ?? []).map((server) => server.name),
    ),
  ];
}

function hookBucket(capability: AcfCapability, hookType: string): string[] {
  const buckets: Partial<Record<string, readonly { name: string }[]>> =
    capability.hooks?.buckets ?? {};
  return (buckets[hookType] ?? []).map((entry) => entry.name);
}

function rank(kind: ComponentOutcomeKind): number {
  return componentOutcomeKinds.indexOf(kind);
}

function withoutDropped(change: OutcomeUpdate): Omit<OutcomeUpdate, "dropped"> {
  const { dropped: _dropped, ...rest } = change;
  return rest;
}
