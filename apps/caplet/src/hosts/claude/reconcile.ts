import { realpath } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, Scope } from "@caplet/core";
import {
  type ClaudeCommand,
  type ClaudeScope,
  formatClaudeArgs,
  formatClaudeCommand,
  LIST_MARKETPLACES_ARGS,
  LIST_PLUGINS_ARGS,
} from "./commands.js";
import {
  cliUnavailableDiagnostic,
  commandFailedDiagnostic,
  duplicateScopeDiagnostic,
  marketplaceForeignDiagnostic,
  marketplaceKeptDiagnostic,
  otherScopeDiagnostic,
  stateReadDiagnostic,
  uninstallHeldDiagnostic,
  versionMismatchDiagnostic,
} from "./diagnostics.js";
import type { ClaudeHost, ClaudeHostFailure } from "./host.js";
import {
  type ClaudePluginAction,
  type ClaudeScopePlan,
  type DesiredClaudeScope,
  type PlannedClaudePlugin,
  partitionInstalls,
  planClaudeScope,
} from "./plan.js";
import { claudeMarketplaceName, claudeScopeFor } from "./scope.js";
import type { ClaudeInstalledPlugin, ClaudeSettingsFile, ObservedClaudeState } from "./state.js";

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

/** One plugin's planned action and the host state caplet reports for it. */
export type ClaudePluginReport = {
  name: string;
  id: string;
  action: ClaudePluginAction;
  state: ClaudeHostState;
  /** Version Claude reports at caplet's managed identity. */
  version?: string | undefined;
  /** Version caplet generated; absent for `uninstall`. */
  desiredVersion?: string | undefined;
  /** Claude's message when a command for this plugin failed or was skipped. */
  message?: string | undefined;
};

/** `not run`: planned but not attempted because the CLI is unavailable or state was unreadable. */
export type ClaudeCommandStatus = "succeeded" | "failed" | "skipped" | "not run";

/** One planned command, as a user can paste it, and what became of it. */
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

/** Host outcome of one ACF scope; the `--json` `claude` entry before file states are added. */
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

/** Host outcome of every desired scope, with the diagnostics of the run. */
export type ClaudeHostReport = { scopes: ClaudeScopeReport[]; diagnostics: Diagnostic[] };

/** A host state read; a failure names the list command that failed. */
type ClaudeStateRead =
  | { ok: true; value: ObservedClaudeState }
  | { ok: false; failure: ClaudeHostFailure; command: string };

/**
 * Reads `claude plugin list --json`, then `claude plugin marketplace list --json`, then the
 * settings files `marketplace remove` would edit, and resolves the real paths of the listed and
 * `desired` marketplace directories.
 */
async function readClaudeHostState(
  host: ClaudeHost,
  desired: readonly DesiredClaudeScope[],
): Promise<ClaudeStateRead> {
  const plugins = await host.listPlugins();
  if (!plugins.ok) return { ...plugins, command: formatClaudeArgs(LIST_PLUGINS_ARGS) };
  const marketplaces = await host.listMarketplaces();
  if (!marketplaces.ok) {
    return { ...marketplaces, command: formatClaudeArgs(LIST_MARKETPLACES_ARGS) };
  }
  return {
    ok: true,
    value: {
      plugins: plugins.value,
      marketplaces: marketplaces.value,
      projectDir: host.projectDir,
      settings: await host.readSettings(),
      realPaths: await realPaths([
        ...marketplaces.value.flatMap((m) => (m.path === undefined ? [] : [m.path])),
        ...desired.map((scope) => scope.marketplaceDir),
      ]),
    },
  };
}

/** Each path's real path, or its `path.resolve` form when it cannot be resolved (missing). */
async function realPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    paths.map(async (file) => {
      try {
        return [file, await realpath(file)] as const;
      } catch {
        return [file, path.resolve(file)] as const;
      }
    }),
  );
  return new Map(entries);
}

/** `not run` with an `unavailable` failure: the CLI stopped starting at or before this step. */
type StepResult =
  | { status: "succeeded" }
  | { status: "failed" | "skipped" | "not run"; failure: ClaudeHostFailure };

/** Shared by every scope of one run: the failure of the first command that could not start. */
type RunState = { unavailable: ClaudeHostFailure | undefined };

/**
 * Brings Claude's plugin registrations in line with the desired plugins of each ACF scope: reads
 * host state, runs each scope's plan (planClaudeScope) in order, and reads state again when
 * anything ran. A failed command skips only the steps that depend on it (the scope's installs and
 * updates after a failed marketplace add; the marketplace remove after a failed uninstall), so
 * one plugin's failure does not stop the others. A missing CLI is not a failure, even when it
 * stops starting partway: the commands from there on are `not run`, their plugins
 * `registration required`, and a warning lists them. Host failures never throw.
 */
export async function reconcileClaudeHost(
  host: ClaudeHost,
  desired: readonly DesiredClaudeScope[],
): Promise<ClaudeHostReport> {
  const before = await readClaudeHostState(host, desired);
  if (!before.ok) return await notRun(desired, before, host);

  const plans = desired.map((scope) => planClaudeScope(scope, before.value));
  const run: RunState = { unavailable: undefined };
  const results: StepResult[][] = [];
  for (const plan of plans) results.push(await runSteps(host, plan, run));

  const changed = plans.some((plan, i) =>
    plan.steps.some((step, j) => {
      const status = results[i]?.[j]?.status;
      return changesPlugins(step.command) && (status === "succeeded" || status === "failed");
    }),
  );
  const after = changed
    ? await host.listPlugins()
    : { ok: true as const, value: before.value.plugins };
  const diagnostics: Diagnostic[] = [];
  if (run.unavailable !== undefined) {
    const commands = plans.flatMap((plan, i) =>
      plan.steps
        .filter((_, j) => results[i]?.[j]?.status === "not run")
        .map((step) => formatClaudeCommand(step.command)),
    );
    diagnostics.push(cliUnavailableDiagnostic(run.unavailable, commands, "finished"));
  }
  // A CLI that stopped starting is reported above; the read after it fails the same way.
  if (!after.ok && !(run.unavailable !== undefined && after.failure.kind === "unavailable")) {
    diagnostics.push(stateReadDiagnostic(formatClaudeArgs(LIST_PLUGINS_ARGS), after.failure, true));
  }
  const scopes = plans.map((plan, index) =>
    scopeReport(
      plan,
      {
        results: results[index] ?? [],
        installed: after.ok ? after.value : undefined,
        unreadState: "unknown",
        preview: false,
      },
      diagnostics,
    ),
  );
  diagnostics.push(...duplicateScopeDiagnostics(plans, after.ok ? after.value : []));
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
  const state = await readClaudeHostState(host, desired);
  if (!state.ok) return await notRun(desired, state, host, { preview: true });
  const diagnostics: Diagnostic[] = [];
  const plans = desired.map((scope) => planClaudeScope(scope, state.value));
  const scopes = plans.map((plan) =>
    scopeReport(
      plan,
      { results: [], installed: state.value.plugins, unreadState: "unknown", preview: true },
      diagnostics,
    ),
  );
  diagnostics.push(...duplicateScopeDiagnostics(plans, state.value.plugins));
  return { scopes, diagnostics };
}

/**
 * Runs one scope plan's steps. Once a command cannot start (`run.unavailable`, shared across
 * scopes), it and every later step are `not run`.
 */
async function runSteps(
  host: ClaudeHost,
  plan: ClaudeScopePlan,
  run: RunState,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of plan.steps) {
    if (run.unavailable !== undefined) {
      results.push({ status: "not run", failure: run.unavailable });
      continue;
    }
    const blocker = step.after.map((i) => results[i]).find((r) => r?.status !== "succeeded");
    if (blocker !== undefined && "failure" in blocker) {
      results.push({ status: "skipped", failure: blocker.failure });
      continue;
    }
    const result = await host.run(step.command);
    if (result.ok) results.push({ status: "succeeded" });
    else if (result.failure.kind === "unavailable") {
      run.unavailable = result.failure;
      results.push({ status: "not run", failure: result.failure });
    } else results.push({ status: "failed", failure: result.failure });
  }
  return results;
}

/** What a scope report is built from besides its plan. */
type ScopeOutcome = {
  /** One result per plan step; empty when nothing ran. */
  results: readonly StepResult[];
  /**
   * What `claude plugin list` reported after the commands ran (for a preview, before);
   * undefined when it could not be read.
   */
  installed: ClaudeInstalledPlugin[] | undefined;
  /** State of a plugin without a failed command while `installed` is undefined. */
  unreadState: ClaudeHostState;
  /** Nothing ran, so a listed plugin's state is its current one and a missing one is not installed. */
  preview: boolean;
};

/** The report of one scope; appends the scope's diagnostics to `diagnostics`. */
function scopeReport(
  plan: ClaudeScopePlan,
  outcome: ScopeOutcome,
  diagnostics: Diagnostic[],
): ClaudeScopeReport {
  const { results, installed } = outcome;
  const commands = plan.steps.map((step, i) =>
    commandReport(step.command, step.plugin, results[i]),
  );
  diagnostics.push(...failureDiagnostics(plan, results));
  const installs = partitionInstalls(plan, installed ?? []);
  const managed =
    installed === undefined ? undefined : new Map(installs.managed.map((p) => [p.id, p]));
  // Under a foreign marketplace the installs of caplet's name are not caplet's to report.
  const foreign = plan.foreign !== undefined;
  if (foreign) diagnostics.push(marketplaceForeignDiagnostic(plan));
  const others = foreign ? [] : installs.otherScope;
  for (const other of others) diagnostics.push(otherScopeDiagnostic(plan, other));
  if (plan.keptBy.length > 0) {
    diagnostics.push(marketplaceKeptDiagnostic(plan, installed !== undefined));
  }
  for (const plugin of plan.plugins) {
    if (plugin.action === "kept") diagnostics.push(uninstallHeldDiagnostic(plan, plugin));
  }

  const plugins = plan.plugins.map((plugin) => {
    const index = plan.steps.findIndex((step) => step.plugin === plugin.id);
    const result = results[index];
    if (result !== undefined && "failure" in result) {
      return failedPluginReport(plugin, result.failure, managed);
    }
    if (managed === undefined) return pluginReport(plugin, outcome.unreadState);
    const pending = outcome.preview ? plan.steps[index]?.command : undefined;
    return listedPluginReport(
      plugin,
      managed.get(plugin.id),
      outcome.preview,
      pending,
      diagnostics,
    );
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
  if (plan.target.scope === "project" && managed !== undefined && !foreign) {
    report.local = {
      projectRoot: plan.target.projectRoot,
      settingsFile: path.join(plan.target.projectRoot, ".claude", "settings.local.json"),
      plugins: [...managed.keys()],
    };
  }
  return report;
}

/**
 * A plugin whose command failed, was skipped or did not run. When the host state was read after
 * it, report what Claude has; the failure diagnostic already explains a version left behind.
 */
function failedPluginReport(
  plugin: PlannedClaudePlugin,
  failure: ClaudeHostFailure,
  managed: Map<string, ClaudeInstalledPlugin> | undefined,
): ClaudePluginReport {
  const message = failure.message;
  if (failure.kind === "policy-blocked" || managed === undefined) {
    return pluginReport(plugin, failureState(failure), undefined, message);
  }
  const entry = managed.get(plugin.id);
  if (entry !== undefined) return pluginReport(plugin, listedState(plugin, entry), entry, message);
  const absent = plugin.action === "uninstall" ? "not installed" : "registration required";
  return pluginReport(plugin, absent, undefined, message);
}

/**
 * A plugin without a failed command, judged from `entry`, its listing at caplet's managed
 * identity. After a run, a plugin still listed after its uninstall or missing after its install is
 * `unknown`. A listed version other than caplet's is `unknown` with a mismatch warning that, in a
 * preview, names the `pending` command apply would run.
 */
function listedPluginReport(
  plugin: PlannedClaudePlugin,
  entry: ClaudeInstalledPlugin | undefined,
  preview: boolean,
  pending: ClaudeCommand | undefined,
  diagnostics: Diagnostic[],
): ClaudePluginReport {
  // Installed only at another Claude scope: `otherScopeInstalls` and `acf.claude.other-scope`
  // report that install; caplet's own registration does not exist.
  if (plugin.action === "other-scope") return pluginReport(plugin, "not installed");
  if (plugin.action === "blocked") return pluginReport(plugin, "unknown");
  if (plugin.action === "disabled") return pluginReport(plugin, "disabled by user");
  if (preview) {
    if (entry === undefined) return pluginReport(plugin, "not installed");
  } else if (plugin.action === "uninstall") {
    return pluginReport(plugin, entry === undefined ? "not installed" : "unknown", entry);
  } else if (entry === undefined) {
    return pluginReport(plugin, "unknown");
  }
  const state = listedState(plugin, entry);
  if (state === "unknown") {
    const command = pending === undefined ? undefined : formatClaudeCommand(pending);
    diagnostics.push(versionMismatchDiagnostic(plugin, entry, command));
  }
  return pluginReport(plugin, state, entry);
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
  return entry.enabled ? "registered" : "disabled by user";
}

function failureState(failure: ClaudeHostFailure): ClaudeHostState {
  if (failure.kind === "policy-blocked") return "blocked by host policy";
  if (failure.kind === "unavailable") return "registration required";
  return "unknown";
}

/**
 * The CLI could not report state: plan against the assumed host ({@link assumedState}), run
 * nothing, and report each planned command as `not run`, followed by the scopes' own diagnostics
 * (a marketplace the settings keep registered). A missing CLI is a warning listing the commands,
 * except in a `preview`, which reports them as planned.
 */
async function notRun(
  desired: readonly DesiredClaudeScope[],
  read: { failure: ClaudeHostFailure; command: string },
  host: ClaudeHost,
  options: { preview?: boolean } = {},
): Promise<ClaudeHostReport> {
  const { failure } = read;
  const settings = await host.readSettings();
  const scopeDiagnostics: Diagnostic[] = [];
  const plans = desired.map((scope) =>
    planClaudeScope(scope, assumedState(scope, host.projectDir, settings)),
  );
  const scopes = plans.map((plan) =>
    scopeReport(
      plan,
      { results: [], installed: undefined, unreadState: failureState(failure), preview: false },
      scopeDiagnostics,
    ),
  );
  scopeDiagnostics.push(...duplicateScopeDiagnostics(plans, []));
  const commands = scopes.flatMap((scope) => scope.commands.map((c) => c.command));
  const diagnostics: Diagnostic[] = [];
  if (failure.kind !== "unavailable") {
    diagnostics.push(stateReadDiagnostic(read.command, failure, false));
  } else if (commands.length > 0 && options.preview !== true) {
    diagnostics.push(cliUnavailableDiagnostic(failure, commands, "updated"));
  }
  return { scopes, diagnostics: [...diagnostics, ...scopeDiagnostics] };
}

/**
 * `acf.claude.duplicate-scope` for each plugin a project scope keeps that the user scope has too:
 * kept by a user scope plan of the same run, or listed in `installed` as an enabled user install
 * of `<name>@acf-user`. Claude then loads the capability twice in that project and caplet cannot
 * hide the user plugin for one project (design D27.3), so it warns instead.
 */
function duplicateScopeDiagnostics(
  plans: readonly ClaudeScopePlan[],
  installed: readonly ClaudeInstalledPlugin[],
): Diagnostic[] {
  const userMarketplace = claudeMarketplaceName({ scope: "user" });
  const userIds = new Set([
    ...plans
      .filter((plan) => plan.target.scope === "user")
      .flatMap((plan) => plan.plugins.filter(keptEnabled).map((plugin) => plugin.id)),
    ...installed.filter((p) => p.scope === "user" && p.enabled).map((p) => p.id),
  ]);
  return plans
    .filter((plan) => plan.target.scope === "project")
    .flatMap((plan) =>
      plan.plugins.filter(keptEnabled).flatMap((plugin) => {
        const userId = `${plugin.name}@${userMarketplace}`;
        return userIds.has(userId) ? [duplicateScopeDiagnostic(plan, plugin, userId)] : [];
      }),
    );
}

/** Whether the plan leaves `plugin` installed at its scope and the user has not disabled it. */
function keptEnabled(plugin: PlannedClaudePlugin): boolean {
  const installs = plugin.action === "install" || plugin.action === "update";
  return (installs || plugin.action === "unchanged") && plugin.observed?.enabled !== false;
}

/**
 * The host state to plan against when it cannot be read: nothing installed except the scope's
 * leftover plugins, whose marketplace is then assumed registered.
 */
function assumedState(
  scope: DesiredClaudeScope,
  projectDir: string,
  settings: ClaudeSettingsFile[],
): ObservedClaudeState {
  const leftover = scope.leftover ?? [];
  if (leftover.length === 0) return { plugins: [], marketplaces: [], projectDir, settings };
  const { target } = scope;
  const marketplace = claudeMarketplaceName(target);
  const claudeScope = claudeScopeFor(target.scope);
  return {
    plugins: leftover.map((name) => ({
      id: `${name}@${marketplace}`,
      name,
      marketplace,
      version: "",
      scope: claudeScope,
      enabled: true,
      installPath: "",
      projectPath: target.scope === "project" ? target.projectRoot : undefined,
    })),
    marketplaces: [{ name: marketplace, source: "directory", path: scope.marketplaceDir }],
    projectDir,
    settings,
  };
}

/** Whether a command can change what `claude plugin list` reports. */
function changesPlugins(command: ClaudeCommand): boolean {
  return command.op !== "marketplace add" && command.op !== "marketplace update";
}

/** A diagnostic per failed step, naming the steps it skipped. */
function failureDiagnostics(plan: ClaudeScopePlan, results: readonly StepResult[]): Diagnostic[] {
  return plan.steps.flatMap((step, i): Diagnostic[] => {
    const result = results[i];
    if (result?.status !== "failed") return [];
    const skipped = plan.steps
      .filter((_, j) => results[j]?.status === "skipped" && dependsOn(plan, j, i))
      .map((s) => formatClaudeCommand(s.command));
    return [commandFailedDiagnostic(formatClaudeCommand(step.command), result.failure, skipped)];
  });
}

/** Whether step `j` waits on step `i`, directly or through other steps. */
function dependsOn(plan: ClaudeScopePlan, j: number, i: number): boolean {
  const after = plan.steps[j]?.after ?? [];
  return after.includes(i) || after.some((k) => dependsOn(plan, k, i));
}
