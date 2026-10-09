/**
 * Apply side of the Claude plugin carrier (claude-plugin-output): reconciles each planned Claude
 * install root with the host through the `claude` CLI, decides which host-dependent file changes
 * may proceed, and reports host and file state per plugin.
 */
import { homedir } from "node:os";
import path from "node:path";
import { ACF_SYSTEM_OWNER, type Diagnostic } from "@caplet/core";
import { colors } from "consola/utils";
import {
  hashOwnedRegions,
  type ManagedEntry,
  readSidecar,
  SIDECAR_FILENAME,
} from "../apply/sidecar.js";
import { execClaudeCli } from "../hosts/claude/cli.js";
import { createClaudeHost } from "../hosts/claude/host.js";
import type { ClaudePluginAction } from "../hosts/claude/plan.js";
import {
  type ClaudeCommandReport,
  type ClaudeHostReport,
  type ClaudePluginReport,
  type ClaudeScopeReport,
  previewClaudeHost,
  reconcileClaudeHost,
} from "../hosts/claude/reconcile.js";
import { type ClaudeRootPlan, marketplaceFile, renderMarketplace } from "./claude-marketplace.js";
import { type ClaudeRename, renameLines } from "./claude-migration.js";
import { readBytesIfExists } from "./fs.js";
import { displayPath } from "./plan-view.js";
import { columns } from "./render.js";
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

/** Whether a plugin's files under its package directory match what caplet recorded. */
export type ClaudeFileState = "current" | "drifted" | "missing";

/** A plugin's host report and, unless it is uninstalled, the state of its files. */
export type ClaudePluginStatus = ClaudePluginReport & { files?: ClaudeFileState | undefined };

/** A scope's host report with file states: the `--json` `claude` entry. */
export type ClaudeScopeStatus = Omit<ClaudeScopeReport, "plugins"> & {
  plugins: ClaudePluginStatus[];
};

/**
 * Host and file state of every planned Claude install root, and the invocation renames to
 * announce: those the migration completed on apply, or those it plans on a dry run.
 */
export type ClaudeReport = {
  scopes: ClaudeScopeStatus[];
  diagnostics: Diagnostic[];
  renames?: ClaudeRename[] | undefined;
};

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

/**
 * Registers, updates and uninstalls the plugins of `roots` with the `claude` CLI
 * (`reconcileClaudeHost`). Host failures never throw; they become states and diagnostics.
 */
export async function reconcileClaude(
  roots: readonly ClaudeRootPlan[],
  cwd: string,
): Promise<ClaudeReport> {
  return await withFileStates(await reconcileClaudeHost(claudeHost(roots, cwd), roots), roots);
}

/**
 * What {@link reconcileClaude} would do, without changing the host, and the invocation renames
 * the plan announces when the host registers its plugins.
 */
export async function previewClaude(
  plan: Pick<EmitPlan, "claude" | "cwd" | "migration">,
): Promise<ClaudeReport | undefined> {
  const roots = plan.claude;
  if (roots.length === 0) return undefined;
  const report = await withFileStates(
    await previewClaudeHost(claudeHost(roots, plan.cwd), roots),
    roots,
  );
  report.renames = plan.migration.renames;
  return report;
}

/** Adds the file state of each plugin whose files the root should hold after apply. */
async function withFileStates(
  report: ClaudeHostReport,
  roots: readonly ClaudeRootPlan[],
): Promise<ClaudeReport> {
  const scopes: ClaudeScopeStatus[] = [];
  for (const scope of report.scopes) {
    const root = roots.find((item) => item.marketplaceDir === scope.marketplaceDir);
    const managed =
      root === undefined
        ? []
        : (await readSidecar(path.join(root.installRoot, SIDECAR_FILENAME))).managed;
    const plugins: ClaudePluginStatus[] = [];
    for (const plugin of scope.plugins) {
      if (root === undefined || plugin.action === "uninstall") {
        plugins.push(plugin);
        continue;
      }
      plugins.push({ ...plugin, files: await fileState(root.installRoot, managed, plugin.name) });
    }
    scopes.push({ ...scope, plugins });
  }
  return { scopes, diagnostics: report.diagnostics };
}

/** What a succeeded command did to a plugin, for the applied host block. */
const appliedActions: Partial<Record<ClaudePluginAction, string>> = {
  install: "installed",
  update: "updated",
  uninstall: "uninstalled",
};

/**
 * Human lines for a Claude report: one block per scope with each plugin's host and file state
 * (and, after apply, whether its command installed, updated or uninstalled it), the local-scope
 * note for a project, and the commands a dry run would run.
 */
export function claudeLines(report: ClaudeReport, mode: "applied" | "planned"): string[] {
  const lines: string[] = [];
  for (const scope of report.scopes) {
    if (scope.plugins.length === 0 && scope.commands.length === 0) continue;
    lines.push(
      `${colors.bold("Claude plugins")} ${colors.dim(`${scope.scope} scope · ${scope.marketplace}`)}`,
    );
    const succeeded = new Set(
      scope.commands
        .filter((command) => command.status === "succeeded")
        .flatMap((command) => command.plugin ?? []),
    );
    const rows = scope.plugins.map((plugin) => [
      plugin.name,
      plugin.state,
      plugin.files === undefined ? "" : colors.dim(`files ${plugin.files}`),
      mode === "applied" && succeeded.has(plugin.id) ? (appliedActions[plugin.action] ?? "") : "",
    ]);
    lines.push(...columns(rows, { indent: "  " }));
    if (scope.local !== undefined && scope.local.plugins.length > 0) {
      lines.push(
        colors.dim(
          `  registered for this checkout only, at Claude local scope (${displayPath(scope.local.settingsFile)})`,
        ),
      );
    }
    // The add of a marketplace Claude already lists is a no-op re-registration, not pending work.
    const planned = scope.commands.filter(
      (command) =>
        command.status === "not run" &&
        !(scope.marketplaceKnown && command.op === "marketplace add"),
    );
    if (mode === "planned" && planned.length > 0) {
      lines.push(colors.dim("  would run"));
      for (const command of planned) lines.push(`    ${command.command}`);
    }
  }
  lines.push(...renameLines(report.renames ?? []));
  return lines;
}

function claudeHost(roots: readonly ClaudeRootPlan[], cwd: string) {
  // Claude resolves `local` scope from the working directory, so project-scope commands run in
  // the project root; user-scope commands work from anywhere. A run has at most one project scope
  // (resolveScopeRoots finds one `.agents` from the working directory), so one root serves all.
  const project = roots.find((root) => root.target.scope === "project")?.target;
  const projectRoot = project?.scope === "project" ? project.projectRoot : cwd;
  // Claude reads user settings from `CLAUDE_CONFIG_DIR` when it is set.
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), ".claude");
  return createClaudeHost(execClaudeCli({ cwd: projectRoot }), {
    projectDir: projectRoot,
    configDir,
  });
}

async function fileState(
  installRoot: string,
  managed: readonly ManagedEntry[],
  plugin: string,
): Promise<ClaudeFileState> {
  const entries = managed.filter(
    (entry) => entry.capability === plugin && entry.carrier === "plugin",
  );
  if (entries.length === 0) return "missing";
  let drifted = false;
  for (const entry of entries) {
    const content = await readBytesIfExists(path.resolve(installRoot, entry.path));
    if (content === null) return "missing";
    const wholeFile = entry.owns.some((own) => own.kind === "file");
    const current = wholeFile ? content : content.toString("utf8");
    if (hashOwnedRegions(current, entry.owns) !== entry.hash) drifted = true;
  }
  return drifted ? "drifted" : "current";
}
