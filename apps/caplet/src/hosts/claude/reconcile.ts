import path from "node:path";
import type { Diagnostic, Scope } from "@caplet/core";
import { type ClaudeCommand, type ClaudeScope, formatClaudeCommand } from "./commands.js";
import type { ClaudeHost, ClaudeHostFailure, ClaudeHostResult } from "./host.js";
import {
  type ClaudePluginAction,
  type ClaudeScopePlan,
  type DesiredClaudeScope,
  type PlannedClaudePlugin,
  planClaudeScope,
} from "./plan.js";
import { claudeMarketplaceName, claudeScopeFor } from "./scope.js";
import type { ClaudeInstalledPlugin, ObservedClaudeState } from "./state.js";

/**
 * Host state of one caplet plugin (claude-plugin-output, Claude host state). `registration
 * required`: the CLI is missing, so the commands are the user's to run. `unknown`: a command or
 * the state read failed with a message caplet does not recognize. `not installed`: a removed
 * plugin is gone from caplet's Claude scope.
 */
export type ClaudeHostState =
  | "registered"
  | "registration required"
  | "disabled by user"
  | "blocked by host policy"
  | "unknown"
  | "not installed";

export type ClaudePluginReport = {
  name: string;
  id: string;
  action: ClaudePluginAction;
  state: ClaudeHostState;
  /** Version Claude reports at caplet's scope (or the other scope for `other-scope`). */
  version?: string | undefined;
  /** Version caplet generated; absent for `uninstall`. */
  desiredVersion?: string | undefined;
  /** Claude's message when a command for this plugin failed or was skipped. */
  message?: string | undefined;
};

/** `not run`: planned but not attempted because the CLI is unavailable or state was unreadable. */
export type ClaudeCommandStatus = "succeeded" | "failed" | "skipped" | "not run";

export type ClaudeCommandReport = {
  op: ClaudeCommand["op"];
  command: string;
  plugin?: string | undefined;
  status: ClaudeCommandStatus;
  message?: string | undefined;
};

/** Plugins caplet registered at Claude `local` scope, recorded in the project's untracked settings. */
export type ClaudeLocalRegistration = {
  projectRoot: string;
  settingsFile: string;
  plugins: string[];
};

export type ClaudeScopeReport = {
  scope: Scope;
  claudeScope: ClaudeScope;
  marketplace: string;
  marketplaceDir: string;
  plugins: ClaudePluginReport[];
  commands: ClaudeCommandReport[];
  /** Installs of caplet's marketplace at other Claude scopes, left unchanged. */
  otherScopeInstalls: { id: string; scope: string; enabled: boolean; version: string }[];
  /** Whether Claude listed caplet's marketplace before any command ran. */
  marketplaceKnown: boolean;
  /** Project scope only. */
  local?: ClaudeLocalRegistration | undefined;
  /** Whether plugin states come from `claude plugin list` read after the commands ran. */
  stateRead: boolean;
};

export type ClaudeHostReport = { scopes: ClaudeScopeReport[]; diagnostics: Diagnostic[] };

/** Reads `claude plugin list --json`, then `claude plugin marketplace list --json`. */
export async function readClaudeHostState(
  host: ClaudeHost,
): Promise<ClaudeHostResult<ObservedClaudeState>> {
  const plugins = await host.listPlugins();
  if (!plugins.ok) return plugins;
  const marketplaces = await host.listMarketplaces();
  if (!marketplaces.ok) return marketplaces;
  return { ok: true, value: { plugins: plugins.value, marketplaces: marketplaces.value } };
}

type StepResult =
  | { status: "succeeded" }
  | { status: "failed" | "skipped"; failure: ClaudeHostFailure }
  | { status: "not run" };

/**
 * Brings Claude's plugin registrations in line with the desired plugins of each ACF scope: reads
 * host state, runs each scope's plan (planClaudeScope) in order, and reads state again when
 * anything ran. A failed command skips only the steps that depend on it (the scope's installs and
 * updates after a failed marketplace add; the marketplace remove after a failed uninstall), so
 * one plugin's failure does not stop the others. A missing CLI is not a failure: every plugin is
 * `registration required` and a warning lists the commands. Host failures never throw.
 */
export async function reconcileClaudeHost(
  host: ClaudeHost,
  desired: readonly DesiredClaudeScope[],
): Promise<ClaudeHostReport> {
  const before = await readClaudeHostState(host);
  if (!before.ok) return notRun(desired, before.failure);

  const plans = desired.map((scope) => planClaudeScope(scope, before.value));
  const results: StepResult[][] = [];
  for (const plan of plans) results.push(await runSteps(host, plan));

  const changed = plans.some((plan, i) =>
    plan.steps.some(
      (step, j) => changesPlugins(step.command) && results[i]?.[j]?.status !== "skipped",
    ),
  );
  const after = changed
    ? await host.listPlugins()
    : { ok: true as const, value: before.value.plugins };
  const diagnostics: Diagnostic[] = [];
  if (!after.ok) diagnostics.push(stateUnreadable(after.failure));
  const scopes = plans.map((plan, index) =>
    scopeReport(
      plan,
      results[index] ?? [],
      after.ok ? after.value : undefined,
      "unknown",
      diagnostics,
    ),
  );
  return { scopes, diagnostics };
}

/**
 * What {@link reconcileClaudeHost} would do, without running a command: reads host state once and
 * reports each plugin's current state with every planned command `not run`. A missing CLI is not
 * a warning here; the commands are reported as planned.
 */
export async function previewClaudeHost(
  host: ClaudeHost,
  desired: readonly DesiredClaudeScope[],
): Promise<ClaudeHostReport> {
  const state = await readClaudeHostState(host);
  if (!state.ok) {
    const report = notRun(desired, state.failure);
    return state.failure.kind === "unavailable" ? { ...report, diagnostics: [] } : report;
  }
  const diagnostics: Diagnostic[] = [];
  const scopes = desired.map((scope) =>
    scopeReport(
      planClaudeScope(scope, state.value),
      [],
      state.value.plugins,
      "unknown",
      diagnostics,
      {
        preview: true,
      },
    ),
  );
  return { scopes, diagnostics };
}

async function runSteps(host: ClaudeHost, plan: ClaudeScopePlan): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of plan.steps) {
    const blocker = step.after.map((i) => results[i]).find((r) => r?.status !== "succeeded");
    if (blocker !== undefined && "failure" in blocker) {
      results.push({ status: "skipped", failure: blocker.failure });
      continue;
    }
    const result = await host.run(step.command);
    results.push(
      result.ok ? { status: "succeeded" } : { status: "failed", failure: result.failure },
    );
  }
  return results;
}

function scopeReport(
  plan: ClaudeScopePlan,
  results: StepResult[],
  installed: ClaudeInstalledPlugin[] | undefined,
  unreadState: ClaudeHostState,
  diagnostics: Diagnostic[],
  options: { preview?: boolean } = {},
): ClaudeScopeReport {
  const commands = plan.steps.map((step, i) =>
    commandReport(step.command, step.plugin, results[i]),
  );
  diagnostics.push(...failureDiagnostics(plan, results));
  const fromMarketplace = (installed ?? []).filter((p) => p.marketplace === plan.marketplace);
  const atScope = new Map(
    fromMarketplace.filter((p) => p.scope === plan.claudeScope).map((p) => [p.id, p]),
  );
  const others = fromMarketplace.filter((p) => p.scope !== plan.claudeScope);
  for (const other of others) diagnostics.push(otherScopeDiagnostic(plan, other));

  const plugins = plan.plugins.map((plugin): ClaudePluginReport => {
    const index = plan.steps.findIndex((step) => step.plugin === plugin.id);
    const result = results[index];
    if (result !== undefined && "failure" in result) {
      const message = result.failure.message;
      if (result.failure.kind === "policy-blocked" || installed === undefined) {
        return pluginReport(plugin, failureState(result.failure), undefined, message);
      }
      // The command failed but the host state was read after it: report what Claude has. The
      // failure diagnostic already explains a version left behind.
      const entry = atScope.get(plugin.id);
      if (entry !== undefined)
        return pluginReport(plugin, listedState(plugin, entry), entry, message);
      const absent = plugin.action === "uninstall" ? "not installed" : "registration required";
      return pluginReport(plugin, absent, undefined, message);
    }
    if (installed === undefined) return pluginReport(plugin, unreadState);
    if (options.preview === true) {
      const current =
        plugin.action === "other-scope"
          ? others.find((p) => p.name === plugin.name)
          : atScope.get(plugin.id);
      return current === undefined
        ? pluginReport(plugin, "not installed")
        : pluginReport(plugin, enabledState(current), current);
    }
    if (plugin.action === "other-scope") {
      const other = others.find((p) => p.name === plugin.name);
      return pluginReport(plugin, other === undefined ? "unknown" : enabledState(other), other);
    }
    const entry = atScope.get(plugin.id);
    if (plugin.action === "uninstall") {
      return pluginReport(plugin, entry === undefined ? "not installed" : "unknown", entry);
    }
    if (entry === undefined) return pluginReport(plugin, "unknown");
    const state = listedState(plugin, entry);
    if (state === "unknown") diagnostics.push(versionMismatchDiagnostic(plugin, entry));
    return pluginReport(plugin, state, entry);
  });

  const report: ClaudeScopeReport = {
    scope: plan.target.scope,
    claudeScope: plan.claudeScope,
    marketplace: plan.marketplace,
    marketplaceDir: plan.marketplaceDir,
    plugins,
    commands,
    otherScopeInstalls: others.map((p) => ({
      id: p.id,
      scope: p.scope,
      enabled: p.enabled,
      version: p.version,
    })),
    marketplaceKnown: plan.marketplaceKnown,
    stateRead: installed !== undefined,
  };
  if (plan.target.scope === "project" && installed !== undefined) {
    report.local = {
      projectRoot: plan.target.projectRoot,
      settingsFile: path.join(plan.target.projectRoot, ".claude", "settings.local.json"),
      plugins: [...atScope.keys()],
    };
  }
  return report;
}

function pluginReport(
  plugin: PlannedClaudePlugin,
  state: ClaudeHostState,
  entry?: ClaudeInstalledPlugin,
  message?: string,
): ClaudePluginReport {
  const report: ClaudePluginReport = {
    name: plugin.name,
    id: plugin.id,
    action: plugin.action,
    state,
  };
  if (entry !== undefined) report.version = entry.version;
  if (plugin.desiredVersion !== undefined) report.desiredVersion = plugin.desiredVersion;
  if (message !== undefined) report.message = message;
  return report;
}

function commandReport(
  command: ClaudeCommand,
  plugin: string | undefined,
  result: StepResult | undefined,
): ClaudeCommandReport {
  const report: ClaudeCommandReport = {
    op: command.op,
    command: formatClaudeCommand(command),
    status: result?.status ?? "not run",
  };
  if (plugin !== undefined) report.plugin = plugin;
  if (result !== undefined && "failure" in result) report.message = result.failure.message;
  return report;
}

/**
 * State of a plugin Claude lists at caplet's scope: `unknown` while it lists another version than
 * caplet generated, because Claude still serves the old content.
 */
function listedState(plugin: PlannedClaudePlugin, entry: ClaudeInstalledPlugin): ClaudeHostState {
  if (plugin.desiredVersion !== undefined && entry.version !== plugin.desiredVersion) {
    return "unknown";
  }
  return enabledState(entry);
}

function enabledState(entry: ClaudeInstalledPlugin): ClaudeHostState {
  return entry.enabled ? "registered" : "disabled by user";
}

function failureState(failure: ClaudeHostFailure): ClaudeHostState {
  if (failure.kind === "policy-blocked") return "blocked by host policy";
  if (failure.kind === "unavailable") return "registration required";
  return "unknown";
}

/**
 * The CLI could not report state: plan against an empty host, run nothing, and report each
 * planned command as `not run`.
 */
function notRun(
  desired: readonly DesiredClaudeScope[],
  failure: ClaudeHostFailure,
): ClaudeHostReport {
  const state = failureState(failure);
  const ignored: Diagnostic[] = [];
  const scopes = desired.map((scope) =>
    scopeReport(planClaudeScope(scope, assumedState(scope)), [], undefined, state, ignored),
  );
  if (failure.kind !== "unavailable") return { scopes, diagnostics: [stateUnreadable(failure)] };
  const commands = scopes.flatMap((scope) => scope.commands.map((c) => c.command));
  if (commands.length === 0) return { scopes, diagnostics: [] };
  return {
    scopes,
    diagnostics: [
      {
        severity: "warn",
        code: "acf.claude.cli-unavailable",
        targetId: "claude",
        message: `Claude plugin registration was not updated: ${failure.message}. Install Claude Code and re-run \`caplet apply\`, or run:\n${indent(commands)}`,
        data: { commands },
      },
    ],
  };
}

/**
 * The host state to plan against when it cannot be read: nothing installed except the scope's
 * leftover plugins, whose marketplace is then assumed registered.
 */
function assumedState(scope: DesiredClaudeScope): ObservedClaudeState {
  const leftover = scope.leftover ?? [];
  if (leftover.length === 0) return { plugins: [], marketplaces: [] };
  const marketplace = claudeMarketplaceName(scope.target);
  const claudeScope = claudeScopeFor(scope.target.scope);
  return {
    plugins: leftover.map((name) => ({
      id: `${name}@${marketplace}`,
      name,
      marketplace,
      version: "",
      scope: claudeScope,
      enabled: true,
      installPath: "",
    })),
    marketplaces: [{ name: marketplace, source: "directory" }],
  };
}

/** Whether a command can change what `claude plugin list` reports. */
function changesPlugins(command: ClaudeCommand): boolean {
  return command.op !== "marketplace add" && command.op !== "marketplace update";
}

function stateUnreadable(failure: ClaudeHostFailure): Diagnostic {
  return {
    severity: "warn",
    code: "acf.claude.state-unreadable",
    targetId: "claude",
    message: `Could not read Claude plugin state (${failure.message}); Claude registration was not changed. Run \`claude plugin list --json\` to inspect it, then re-run \`caplet apply\`.`,
  };
}

function failureDiagnostics(plan: ClaudeScopePlan, results: StepResult[]): Diagnostic[] {
  return plan.steps.flatMap((step, i): Diagnostic[] => {
    const result = results[i];
    if (result?.status !== "failed") return [];
    const command = formatClaudeCommand(step.command);
    const skipped = plan.steps
      .filter((_, j) => results[j]?.status === "skipped" && dependsOn(plan, j, i))
      .map((s) => formatClaudeCommand(s.command));
    const skippedText = skipped.length === 0 ? "" : ` Skipped:\n${indent(skipped)}`;
    const policy = result.failure.kind === "policy-blocked";
    return [
      {
        severity: policy ? "warn" : "error",
        code: policy ? "acf.claude.policy-blocked" : "acf.claude.command-failed",
        targetId: "claude",
        message: policy
          ? `\`${command}\` was blocked by Claude host policy: ${result.failure.message}. Caplet does not fall back to loose output; ask your administrator to allow the marketplace or set \`targets.claude.carrier: loose\`.${skippedText}`
          : `\`${command}\` failed: ${result.failure.message}. Fix the cause and re-run \`caplet apply\`.${skippedText}`,
        data: { command, skipped },
      },
    ];
  });
}

/** Whether step `j` waits on step `i`, directly or through other steps. */
function dependsOn(plan: ClaudeScopePlan, j: number, i: number): boolean {
  const after = plan.steps[j]?.after ?? [];
  return after.includes(i) || after.some((k) => dependsOn(plan, k, i));
}

function versionMismatchDiagnostic(
  plugin: PlannedClaudePlugin,
  entry: ClaudeInstalledPlugin,
): Diagnostic {
  return {
    severity: "warn",
    code: "acf.claude.version-mismatch",
    targetId: "claude",
    message: `Claude reports \`${plugin.id}\` at version ${entry.version}, expected ${plugin.desiredVersion}, so it still serves the old content. Check that the marketplace directory lists the new version and re-run \`caplet apply\`.`,
    data: { plugin: plugin.id, reported: entry.version, expected: plugin.desiredVersion },
  };
}

function otherScopeDiagnostic(plan: ClaudeScopePlan, other: ClaudeInstalledPlugin): Diagnostic {
  return {
    severity: "info",
    code: "acf.claude.other-scope",
    targetId: "claude",
    message: `\`${other.id}\` is also installed at Claude ${other.scope} scope; caplet manages only ${plan.claudeScope} scope and leaves it unchanged.`,
    data: { plugin: other.id, scope: other.scope },
  };
}

function indent(lines: string[]): string {
  return lines.map((line) => `  ${line}`).join("\n");
}
