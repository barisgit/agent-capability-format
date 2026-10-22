import {
  componentOutcomeKinds,
  type OutcomeFamily,
  outcomeFamilyNouns,
  type TargetId,
} from "@caplet/core";
import { colors } from "consola/utils";
import type { ScopedComponentOutcome } from "./workflow.js";

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

type Qualification = "bare" | "capability" | "scope";

/**
 * Behavior-first compatibility report: per target, non-native components (worst first), native
 * counts, then dropped descriptive fields. Components sharing scope, capability, outcome, source,
 * consequence and recovery share a line. Labels name the capability when several are present,
 * and also the scope when the report spans scopes. Returns no lines for an empty report.
 */
export function renderCompatibility(
  outcomes: readonly ScopedComponentOutcome[],
  targets: readonly TargetId[],
): string[] {
  const qualification: Qualification =
    new Set(outcomes.map((item) => item.scope)).size > 1
      ? "scope"
      : new Set(outcomes.map((item) => item.capability)).size > 1
        ? "capability"
        : "bare";
  const lines = targets.flatMap((target) =>
    targetLines(
      target,
      outcomes.filter((item) => item.target === target),
      qualification,
    ),
  );
  return lines.length === 0 ? [] : [colors.bold("Compatibility"), ...lines, ""];
}

/** One target's report lines: its non-native outcomes, then its native and dropped summaries. */
function targetLines(
  target: TargetId,
  own: readonly ScopedComponentOutcome[],
  qualification: Qualification,
): string[] {
  const lines: string[] = [];
  const groups = new Map<string, ScopedComponentOutcome[]>();
  for (const item of [...own].filter((entry) => entry.outcome !== "native").sort(worstFirst)) {
    const key = [
      item.scope,
      item.capability,
      item.outcome,
      item.source,
      item.consequence,
      item.recovery,
    ]
      .map((part) => part ?? "")
      .join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  // A refusal's own line precedes the line of the other components it blocks with it.
  const ordered = [...groups.values()].sort(
    (a, b) => outcomeRank(b[0]) - outcomeRank(a[0]) || a.length - b.length,
  );
  for (const [first, ...rest] of ordered) {
    if (first !== undefined) lines.push(`  ${outcomeLine(first, rest, qualification)}`);
  }
  const native = own.filter((item) => item.outcome === "native" && item.family !== "package");
  if (native.length > 0) {
    lines.push(`  ${target} - ${colors.green("native")}: ${familyCounts(native)}`);
  }
  const dropped = own.flatMap((item) =>
    (item.dropped ?? []).map((field) => `${field} (${label(item, qualification)})`),
  );
  if (dropped.length > 0)
    lines.push(`  ${target} - ${colors.dim("dropped")}: ${dropped.join(", ")}`);
  return lines;
}

/** The report line of `item`, also naming components of the same scoped capability in `rest`. */
function outcomeLine(
  item: ScopedComponentOutcome,
  rest: readonly ScopedComponentOutcome[],
  qualification: Qualification,
): string {
  const kind = colorKind(item.outcome);
  const source = item.source === undefined ? "" : ` (${item.source})`;
  const recovery = item.recovery === undefined ? "" : `. Recovery: ${item.recovery}`;
  const names = [item, ...rest].map((entry) => entry.component).join(", ");
  const subject = label({ ...item, component: names }, qualification);
  return `${subject} / ${item.target} - ${kind}: ${item.consequence ?? ""}${source}${recovery}`;
}

function colorKind(kind: ScopedComponentOutcome["outcome"]): string {
  if (kind === "blocked") return colors.red(kind);
  if (kind === "translated") return colors.cyan(kind);
  if (kind === "changed-behavior") return colors.yellow("changed behavior");
  return colors.yellow(kind);
}

function label(item: ScopedComponentOutcome, qualification: Qualification): string {
  if (qualification === "scope") {
    const owner = item.family === "package" ? item.scope : `${item.capability}, ${item.scope}`;
    return `${item.component} (${owner})`;
  }
  return qualification === "capability" && item.family !== "package"
    ? `${item.component} (${item.capability})`
    : item.component;
}

function familyCounts(items: readonly ScopedComponentOutcome[]): string {
  return familyOrder
    .map((family) => {
      const count = items.filter((item) => item.family === family).length;
      const [one, many] = outcomeFamilyNouns[family];
      return count === 0 ? "" : `${count} ${count === 1 ? one : many}`;
    })
    .filter((part) => part.length > 0)
    .join(", ");
}

function outcomeRank(item: ScopedComponentOutcome | undefined): number {
  return item === undefined ? -1 : componentOutcomeKinds.indexOf(item.outcome);
}

function worstFirst(a: ScopedComponentOutcome, b: ScopedComponentOutcome): number {
  return (
    outcomeRank(b) - outcomeRank(a) ||
    familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family) ||
    a.component.localeCompare(b.component) ||
    a.capability.localeCompare(b.capability) ||
    a.scope.localeCompare(b.scope)
  );
}
