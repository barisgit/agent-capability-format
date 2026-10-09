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
  "remainder",
];

/**
 * Behavior-first compatibility report (capability-model-layers): per target in `targets`
 * order, one line per non-native component (worst first) naming component, target, outcome,
 * consequence, source and recovery; then one line counting native components; then one line
 * grouping dropped descriptive fields and extras. Returns no lines when there are no outcomes.
 * Components of one capability that share outcome, source, consequence and recovery, such as
 * the components a refusal blocks with it, share one line. Components are named bare, or
 * `name (capability)` when the report spans several capabilities.
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
    const groups = new Map<string, ComponentOutcome[]>();
    for (const item of [...own].filter((entry) => entry.outcome !== "native").sort(worstFirst)) {
      const key = [item.capability, item.outcome, item.source, item.consequence, item.recovery]
        .map((part) => part ?? "")
        .join("\u0000");
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    // Within an outcome, single components come before the lines that share it among several,
    // so a refusal's own line precedes the line of the components it blocks with it.
    const ordered = [...groups.values()].sort(
      (a, b) => outcomeRank(b[0]) - outcomeRank(a[0]) || a.length - b.length,
    );
    for (const [first, ...rest] of ordered) {
      if (first !== undefined) lines.push(`  ${outcomeLine(first, rest, qualify)}`);
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

/** The report line of `item`, also naming the components in `rest` that share it. */
function outcomeLine(
  item: ComponentOutcome,
  rest: readonly ComponentOutcome[],
  qualify: boolean,
): string {
  const kind = colorKind(item.outcome);
  const source = item.source === undefined ? "" : ` (${item.source})`;
  const recovery = item.recovery === undefined ? "" : `. Recovery: ${item.recovery}`;
  const names = [item, ...rest].map((entry) => entry.component).join(", ");
  const subject = qualify && item.family !== "package" ? `${names} (${item.capability})` : names;
  return `${subject} / ${item.target} - ${kind}: ${item.consequence ?? ""}${source}${recovery}`;
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

function outcomeRank(item: ComponentOutcome | undefined): number {
  return item === undefined ? -1 : componentOutcomeKinds.indexOf(item.outcome);
}

function worstFirst(a: ComponentOutcome, b: ComponentOutcome): number {
  return (
    outcomeRank(b) - outcomeRank(a) ||
    familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family) ||
    a.component.localeCompare(b.component) ||
    a.capability.localeCompare(b.capability)
  );
}
