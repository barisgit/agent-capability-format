/**
 * Apply side of the Claude plugin carrier (claude-plugin-output): reconciles each planned Claude
 * install root with the host through the `claude` CLI and reports host and file state per plugin.
 * Which file changes wait for the host is decided in `claude-gates.ts`.
 */
import { homedir } from "node:os";
import path from "node:path";
import type { Diagnostic } from "@caplet/core";
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
  type ClaudeHostReport,
  type ClaudePluginReport,
  type ClaudeScopeReport,
  previewClaudeHost,
  reconcileClaudeHost,
} from "../hosts/claude/reconcile.js";
import type { ClaudeRootPlan } from "./claude-marketplace.js";
import { type ClaudeRename, renameLines } from "./claude-migration.js";
import { readBytesIfExists } from "./fs.js";
import { displayPath } from "./plan-view.js";
import { columns } from "./render.js";
import type { EmitPlan } from "./workflow.js";

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
