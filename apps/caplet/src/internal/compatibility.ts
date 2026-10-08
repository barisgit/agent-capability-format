import {
  type ComponentOutcome,
  componentOutcomeKinds,
  type OutcomeFamily,
  outcomeFamilyNouns,
  type TargetId,
} from "@caplet/core";
import { colors } from "consola/utils";

const familyOrder: readonly OutcomeFamily[] = [
  "package",
  "skill",
  "agent",
  "command",
  "instruction",
  "hook",
  "mcp",
];

/**
 * Behavior-first compatibility report (capability-model-layers): per target in `targets`
 * order, one line per non-native component (worst first) naming component, target, outcome,
 * consequence, source and recovery; then one line counting native components; then one line
 * grouping dropped descriptive fields and extras. Returns no lines when there are no outcomes.
 * Components are named bare, or `name (capability)` when the report spans several capabilities.
 */
export function renderCompatibility(
  outcomes: readonly ComponentOutcome[],
  targets: readonly TargetId[],
): string[] {
  const lines: string[] = [];
  const qualify = new Set(outcomes.map((item) => item.capability)).size > 1;
  for (const target of targets) {
    const own = outcomes.filter((item) => item.target === target);
    if (own.length === 0) continue;
    for (const item of [...own].filter((entry) => entry.outcome !== "native").sort(worstFirst)) {
      lines.push(`  ${outcomeLine(item, qualify)}`);
    }
    const native = own.filter((item) => item.outcome === "native" && item.family !== "package");
    if (native.length > 0) {
      lines.push(`  ${target} - ${colors.green("native")}: ${familyCounts(native)}`);
    }
    const dropped = own.flatMap((item) =>
      (item.dropped ?? []).map((field) => `${field} (${label(item, qualify)})`),
    );
    if (dropped.length > 0)
      lines.push(`  ${target} - ${colors.dim("dropped")}: ${dropped.join(", ")}`);
  }
  return lines.length === 0 ? [] : [colors.bold("Compatibility"), ...lines, ""];
}

function outcomeLine(item: ComponentOutcome, qualify: boolean): string {
  const kind = colorKind(item.outcome);
  const source = item.source === undefined ? "" : ` (${item.source})`;
  const recovery = item.recovery === undefined ? "" : `. Recovery: ${item.recovery}`;
  return `${label(item, qualify)} / ${item.target} - ${kind}: ${item.consequence ?? ""}${source}${recovery}`;
}

function colorKind(kind: ComponentOutcome["outcome"]): string {
  if (kind === "blocked") return colors.red(kind);
  if (kind === "translated") return colors.cyan(kind);
  if (kind === "changed-behavior") return colors.yellow("changed behavior");
  return colors.yellow(kind);
}

function label(item: ComponentOutcome, qualify: boolean): string {
  return qualify && item.family !== "package"
    ? `${item.component} (${item.capability})`
    : item.component;
}

function familyCounts(items: readonly ComponentOutcome[]): string {
  return familyOrder
    .map((family) => {
      const count = items.filter((item) => item.family === family).length;
      const [one, many] = outcomeFamilyNouns[family];
      return count === 0 ? "" : `${count} ${count === 1 ? one : many}`;
    })
    .filter((part) => part.length > 0)
    .join(", ");
}

function worstFirst(a: ComponentOutcome, b: ComponentOutcome): number {
  return (
    componentOutcomeKinds.indexOf(b.outcome) - componentOutcomeKinds.indexOf(a.outcome) ||
    familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family) ||
    a.component.localeCompare(b.component) ||
    a.capability.localeCompare(b.capability)
  );
}
