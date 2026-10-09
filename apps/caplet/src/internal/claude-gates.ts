/**
 * Host gates of the Claude plugin carrier (claude-plugin-output): which planned file changes wait
 * for the `claude` CLI to settle a plugin or marketplace, and whether a host report opens them.
 */
import path from "node:path";
import { ACF_SYSTEM_OWNER } from "@caplet/core";
import type { ClaudeCommandReport } from "../hosts/claude/reconcile.js";
import type { ClaudePluginStatus, ClaudeReport, ClaudeScopeStatus } from "./claude-host-flow.js";
import { type ClaudeRootPlan, marketplaceFile, renderMarketplace } from "./claude-marketplace.js";
import { type ClaudeMigration, planClaudeMigration } from "./claude-migration.js";
import type { EmitPlan, EmittedDiff } from "./workflow.js";

/**
 * A file change that must wait for the host. `uninstalled`: deleting a removed plugin's files
 * waits until Claude no longer has it installed, because Claude keeps serving an installed plugin
 * from its cache. `retired`: deleting `marketplace.json` waits until the marketplace is removed.
 * `registered`: deleting the loose Claude files of a capability that became a plugin waits until
 * Claude reports the plugin registered or disabled by the user, so the capability never drops
 * out of Claude in between.
 */
export type ClaudeGate =
  | { kind: "uninstalled"; marketplaceDir: string; plugin: string }
  | { kind: "retired"; marketplaceDir: string }
  | { kind: "registered"; marketplaceDir: string; plugin: string };

/** The gate a planned change waits on, or undefined when it does not depend on the host. */
export function claudeGate(
  item: EmittedDiff,
  roots: readonly ClaudeRootPlan[],
): ClaudeGate | undefined {
  if (item.diff.after !== null || item.destination !== "native") return undefined;
  const root = roots.find((candidate) => candidate.installRoot === item.installRoot);
  if (root === undefined) return undefined;
  const marketplaceDir = root.marketplaceDir;
  if (item.capabilityName === ACF_SYSTEM_OWNER) {
    const file = path.resolve(item.installRoot, item.diff.path);
    return file === marketplaceFile(item.installRoot)
      ? { kind: "retired", marketplaceDir }
      : undefined;
  }
  const plugin = item.capabilityName;
  const wanted = root.plugins.some((candidate) => candidate.name === plugin);
  if (item.carrier === "loose") {
    return item.targetId === "claude" && wanted
      ? { kind: "registered", marketplaceDir, plugin }
      : undefined;
  }
  return wanted ? undefined : { kind: "uninstalled", marketplaceDir, plugin };
}

/** Whether the host report lets a change behind `gate` proceed. */
export function gateOpen(gate: ClaudeGate, report: ClaudeReport): boolean {
  const scope = gateScope(gate, report);
  if (scope === undefined || !scope.stateRead) return false;
  if (gate.kind === "registered") {
    const state = scope.plugins.find((item) => item.name === gate.plugin)?.state;
    return state === "registered" || state === "disabled by user";
  }
  if (gate.kind === "uninstalled") {
    const plugin = scope.plugins.find((item) => item.name === gate.plugin);
    return plugin === undefined || plugin.state === "not installed";
  }
  const remove = marketplaceRemove(scope);
  return (
    scope.otherScopeInstalls.length === 0 &&
    scope.plugins.every((plugin) => plugin.state === "not installed") &&
    (remove === undefined ? !scope.marketplaceKnown : remove.status === "succeeded")
  );
}

/**
 * The change to apply for a gated `item` once the host has run: `item` when its gate is open,
 * undefined to hold it back. A retired marketplace that stays registered
 * (`acf.claude.marketplace-kept`) keeps `marketplace.json` as an empty catalog instead of
 * deleting it, so the registration Claude keeps still points at a valid marketplace.
 */
export function gatedChange(
  item: EmittedDiff,
  gate: ClaudeGate,
  report: ClaudeReport,
): EmittedDiff | undefined {
  if (gateOpen(gate, report)) return item;
  if (gate.kind !== "retired") return undefined;
  const scope = gateScope(gate, report);
  if (scope === undefined) return undefined;
  const kept = marketplaceKept(scope, (plugin) => plugin.state === "not installed");
  return kept ? emptyCatalog(item, scope) : undefined;
}

/**
 * The plan's changes as apply will make them, judged from a host preview ({@link previewClaude}):
 * `marketplace.json` of a retired marketplace that stays registered becomes the empty catalog
 * apply writes ({@link gatedChange}) instead of a deletion, and drops out when the file already
 * is that catalog. Every other change is kept as planned.
 */
export function previewedDiffs(
  plan: Pick<EmitPlan, "diffs" | "claude">,
  report: ClaudeReport | undefined,
): EmittedDiff[] {
  if (report === undefined) return plan.diffs;
  return plan.diffs.flatMap((item) => {
    const gate = claudeGate(item, plan.claude);
    if (gate?.kind !== "retired") return [item];
    const scope = gateScope(gate, report);
    // The plugins the plan uninstalls are gone by the time apply settles the marketplace.
    const kept =
      scope !== undefined &&
      marketplaceKept(
        scope,
        (plugin) => plugin.state === "not installed" || plugin.action === "uninstall",
      );
    if (!kept) return [item];
    const change = emptyCatalog(item, scope);
    return change.diff.before === change.diff.after ? [] : [change];
  });
}

/**
 * Attaches to each of `diffs` the gate it waits on ({@link claudeGate}), then splits the gated
 * loose Claude retirements off into the migration ({@link planClaudeMigration}). Returns the
 * changes left to apply.
 */
export function gateClaudeChanges(
  diffs: EmittedDiff[],
  roots: readonly ClaudeRootPlan[],
): { diffs: EmittedDiff[]; migration: ClaudeMigration } {
  for (const item of diffs) {
    const gate = claudeGate(item, roots);
    if (gate !== undefined) item.gate = gate;
  }
  return planClaudeMigration(diffs);
}

/**
 * Whether the host keeps the retired marketplace of `scope` registered
 * (`acf.claude.marketplace-kept`): Claude lists it, caplet plans no `marketplace remove`, and
 * every plugin is gone by `gone`.
 */
function marketplaceKept(
  scope: ClaudeScopeStatus,
  gone: (plugin: ClaudePluginStatus) => boolean,
): boolean {
  return (
    scope.stateRead &&
    scope.marketplaceKnown &&
    marketplaceRemove(scope) === undefined &&
    scope.plugins.every(gone)
  );
}

/** `item` (the retired `marketplace.json`) rewritten as the marketplace's empty catalog. */
function emptyCatalog(item: EmittedDiff, scope: ClaudeScopeStatus): EmittedDiff {
  return { ...item, diff: { ...item.diff, after: renderMarketplace(scope.marketplace, []) } };
}

/** The scope of the marketplace `gate` belongs to. */
function gateScope(gate: ClaudeGate, report: ClaudeReport): ClaudeScopeStatus | undefined {
  return report.scopes.find((scope) => scope.marketplaceDir === gate.marketplaceDir);
}

function marketplaceRemove(scope: ClaudeScopeStatus): ClaudeCommandReport | undefined {
  return scope.commands.find((command) => command.op === "marketplace remove");
}
