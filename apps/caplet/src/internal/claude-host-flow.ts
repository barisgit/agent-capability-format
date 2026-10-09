/**
 * Apply side of the Claude plugin carrier (claude-plugin-output): reconciles each planned Claude
 * install root with the host through the `claude` CLI, decides which host-dependent file changes
 * may proceed, and reports host and file state per plugin.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ACF_SYSTEM_OWNER, type Diagnostic } from "@caplet/core";
import { colors } from "consola/utils";
import { hashOwnedRegions, type ManagedEntry, readSidecar } from "../apply/sidecar.js";
import { execClaudeCli } from "../hosts/claude/cli.js";
import { createClaudeHost } from "../hosts/claude/host.js";
import type { ClaudePluginAction, DesiredClaudeScope } from "../hosts/claude/plan.js";
import {
  type ClaudeHostReport,
  type ClaudePluginReport,
  type ClaudeScopeReport,
  previewClaudeHost,
  reconcileClaudeHost,
} from "../hosts/claude/reconcile.js";
import { type ClaudeRootPlan, marketplaceFile } from "./claude-marketplace.js";
import { type ClaudeRename, renameLines } from "./claude-migration.js";
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

export type ClaudePluginStatus = ClaudePluginReport & { files?: ClaudeFileState | undefined };
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
  const scope = report.scopes.find((item) => item.marketplaceDir === gate.marketplaceDir);
  if (scope === undefined || !scope.stateRead) return false;
  if (gate.kind === "registered") {
    const state = scope.plugins.find((item) => item.name === gate.plugin)?.state;
    return state === "registered" || state === "disabled by user";
  }
  if (gate.kind === "uninstalled") {
    const plugin = scope.plugins.find((item) => item.name === gate.plugin);
    return plugin === undefined || plugin.state === "not installed";
  }
  const remove = scope.commands.find((command) =>
    command.command.startsWith("claude plugin marketplace remove "),
  );
  return (
    scope.otherScopeInstalls.length === 0 &&
    scope.plugins.every((plugin) => plugin.state === "not installed") &&
    (remove === undefined || remove.status === "succeeded")
  );
}

/**
 * Registers, updates and uninstalls the plugins of `roots` with the `claude` CLI
 * (`reconcileClaudeHost`). Host failures never throw; they become states and diagnostics.
 */
export async function reconcileClaude(
  roots: readonly ClaudeRootPlan[],
  cwd: string,
): Promise<ClaudeReport> {
  return await withFileStates(
    await reconcileClaudeHost(claudeHost(roots, cwd), desiredScopes(roots)),
    roots,
  );
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
    await previewClaudeHost(claudeHost(roots, plan.cwd), desiredScopes(roots)),
    roots,
  );
  report.renames = plan.migration.renames;
  return report;
}

/** Adds the file state of each plugin whose files the root should hold after apply. */
export async function withFileStates(
  report: ClaudeHostReport,
  roots: readonly ClaudeRootPlan[],
): Promise<ClaudeReport> {
  const scopes: ClaudeScopeStatus[] = [];
  for (const scope of report.scopes) {
    const root = roots.find((item) => item.marketplaceDir === scope.marketplaceDir);
    const managed =
      root === undefined
        ? []
        : (await readSidecar(path.join(root.installRoot, ".acf-managed.json"))).managed;
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
    const planned = scope.commands.filter((command) => command.status === "not run");
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
  // the project root; user-scope commands work from anywhere.
  const project = roots.find((root) => root.target.scope === "project")?.target;
  const projectRoot = project?.scope === "project" ? project.projectRoot : cwd;
  return createClaudeHost(execClaudeCli({ cwd: projectRoot }));
}

function desiredScopes(roots: readonly ClaudeRootPlan[]): DesiredClaudeScope[] {
  return roots.map((root) => ({
    target: root.target,
    marketplaceDir: root.marketplaceDir,
    plugins: root.plugins,
    leftover: root.leftover,
  }));
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
    const content = await readOrNull(path.resolve(installRoot, entry.path));
    if (content === null) return "missing";
    const wholeFile = entry.owns.some((own) => own.kind === "file");
    const current = wholeFile ? content : content.toString("utf8");
    if (hashOwnedRegions(current, entry.owns) !== entry.hash) drifted = true;
  }
  return drifted ? "drifted" : "current";
}

async function readOrNull(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
