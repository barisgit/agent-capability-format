import type { ClaudeCommand, ClaudeScope } from "./commands.js";
import { type ClaudeScopeTarget, claudeMarketplaceName, claudeScopeFor } from "./scope.js";
import type { ClaudeInstalledPlugin, ObservedClaudeState } from "./state.js";

/** A generated Claude plugin caplet wants installed: capability slug and its `+acf.<d>` version. */
export type DesiredClaudePlugin = { name: string; version: string };

/** Every plugin caplet wants in one ACF scope's marketplace; an empty list retires the scope. */
export type DesiredClaudeScope = {
  target: ClaudeScopeTarget;
  /** Absolute path of the scope's marketplace directory (`<install-root>/.acf/marketplace`). */
  marketplaceDir: string;
  plugins: DesiredClaudePlugin[];
  /**
   * Plugins caplet generated in this scope earlier and no longer wants. When host state cannot be
   * read, they are assumed installed so the recovery commands include their uninstall.
   */
  leftover?: string[] | undefined;
  /**
   * Left-over plugins whose capability now writes loose Claude files in this scope: the carrier
   * changed, so their uninstall keeps what Claude saved for them (`--keep-data`).
   * `declaresConfig`: the plugin's manifest declares configuration Claude prompts for, so Claude
   * may hold options or secrets for it that caplet cannot see.
   */
  carrierChanged?: ReadonlyArray<{ name: string; declaresConfig: boolean }> | undefined;
};

/**
 * What happens to one plugin. `other-scope`: the id is installed only at another Claude scope that
 * applies here, so caplet leaves it alone instead of installing over it. `kept`: its carrier
 * changed, but uninstalling it would delete the options and secrets Claude saved for it, so it
 * stays installed until the user uninstalls it.
 */
export type ClaudePluginAction =
  | "install"
  | "update"
  | "unchanged"
  | "uninstall"
  | "other-scope"
  | "kept";

/** The planned action for one plugin of the scope, desired or left over at caplet's identity. */
export type PlannedClaudePlugin = {
  name: string;
  id: string;
  action: ClaudePluginAction;
  /** Absent for `uninstall` and `kept`. */
  desiredVersion?: string | undefined;
  /** The entry at caplet's managed identity, when installed there. */
  observed?: ClaudeInstalledPlugin | undefined;
};

/**
 * One command. `after` lists indexes of earlier steps in the same scope plan that must succeed
 * first; a failed or skipped prerequisite skips this step and nothing else.
 */
export type PlannedClaudeStep = {
  command: ClaudeCommand;
  plugin?: string | undefined;
  after: number[];
};

/** The commands for one ACF scope, in run order, and what the plan found in host state. */
export type ClaudeScopePlan = {
  target: ClaudeScopeTarget;
  claudeScope: ClaudeScope;
  marketplace: string;
  marketplaceDir: string;
  /** Directory Claude resolves `project` and `local` scope from (`ObservedClaudeState`). */
  projectDir: string;
  steps: PlannedClaudeStep[];
  plugins: PlannedClaudePlugin[];
  /** Installs of this marketplace at other Claude scopes that apply here; reported, never changed. */
  otherScopeInstalls: ClaudeInstalledPlugin[];
  /**
   * Whether Claude already lists the marketplace. `marketplace list` does not say at which
   * scope, so the planned `marketplace add` still runs, as a no-op when it is registered.
   */
  marketplaceKnown: boolean;
  /**
   * Why the marketplace stays registered although no plugin is desired: what
   * `marketplace remove` would also change (another settings file declaring it, one caplet
   * cannot read, or an install outside caplet's registration). Empty otherwise.
   */
  keptBy: string[];
};

/** How the installs of a scope plan's marketplace relate to caplet's registration. */
export type ClaudeInstallPartition = {
  /** At caplet's managed identity: its Claude scope and, for `local`, its project root. */
  managed: ClaudeInstalledPlugin[];
  /** At another Claude scope that applies in `projectDir`: user scope, or that directory's. */
  otherScope: ClaudeInstalledPlugin[];
  /** Project and local installs of other directories, which caplet neither reports nor changes. */
  elsewhere: ClaudeInstalledPlugin[];
};

/** Partitions the listed installs of `plan`'s marketplace (D25). */
export function partitionInstalls(
  plan: Pick<ClaudeScopePlan, "target" | "claudeScope" | "marketplace" | "projectDir">,
  plugins: readonly ClaudeInstalledPlugin[],
): ClaudeInstallPartition {
  const partition: ClaudeInstallPartition = { managed: [], otherScope: [], elsewhere: [] };
  const { target } = plan;
  for (const plugin of plugins) {
    if (plugin.marketplace !== plan.marketplace) continue;
    const managed =
      plugin.scope === plan.claudeScope &&
      (target.scope === "user" || plugin.projectPath === target.projectRoot);
    if (managed) partition.managed.push(plugin);
    else if (plugin.scope === "user" || plugin.projectPath === plan.projectDir) {
      partition.otherScope.push(plugin);
    } else partition.elsewhere.push(plugin);
  }
  return partition;
}

/**
 * Plans the `claude plugin` commands for one ACF scope (D8, D25): an unconditional, idempotent
 * `marketplace add` when any plugin is desired, `install` for plugins not installed at caplet's
 * managed identity, `update` for changed versions (also for disabled plugins, which stay disabled),
 * and `uninstall` for plugins no longer desired, keeping Claude's data for a carrier change
 * ({@link planUninstall}). It never plans `install` for an installed plugin, because install
 * re-enables a plugin the user disabled (D15). The marketplace is removed only when no plugin is
 * desired or kept and the removal touches nothing but caplet's registration:
 * `marketplace remove` uninstalls its plugins at every scope and directory and drops its
 * declarations from every settings file it edits (`ObservedClaudeState.settings`).
 */
export function planClaudeScope(
  desired: DesiredClaudeScope,
  observed: ObservedClaudeState,
): ClaudeScopePlan {
  const target = desired.target;
  const marketplace = claudeMarketplaceName(target);
  const claudeScope = claudeScopeFor(target.scope);
  const projectDir = observed.projectDir;
  const installs = partitionInstalls(
    { target, claudeScope, marketplace, projectDir },
    observed.plugins,
  );
  const atScope = new Map(installs.managed.map((p) => [p.name, p]));
  const otherScopeInstalls = installs.otherScope;
  const steps: PlannedClaudeStep[] = [];
  const plugins: PlannedClaudePlugin[] = [];
  const desiredNames = new Set(desired.plugins.map((p) => p.name));

  // The marketplace add, when present, is step 0; installs and updates wait on it.
  if (desired.plugins.length > 0) {
    steps.push({
      command: { op: "marketplace add", dir: desired.marketplaceDir, scope: claudeScope },
      after: [],
    });
  }
  for (const plugin of desired.plugins) {
    const id = `${plugin.name}@${marketplace}`;
    const current = atScope.get(plugin.name);
    const action: ClaudePluginAction =
      current === undefined
        ? otherScopeInstalls.some((p) => p.name === plugin.name)
          ? "other-scope"
          : "install"
        : current.version === plugin.version
          ? "unchanged"
          : "update";
    plugins.push({
      name: plugin.name,
      id,
      action,
      desiredVersion: plugin.version,
      observed: current,
    });
    if (action === "install" || action === "update") {
      steps.push({
        command: { op: action, plugin: id, scope: claudeScope },
        plugin: id,
        after: [0],
      });
    }
  }
  const uninstalls: number[] = [];
  for (const current of atScope.values()) {
    if (desiredNames.has(current.name)) continue;
    const command = planUninstall(current, claudeScope, desired, observed);
    const action = command === undefined ? "kept" : "uninstall";
    plugins.push({ name: current.name, id: current.id, action, observed: current });
    if (command === undefined) continue;
    uninstalls.push(steps.length);
    steps.push({ command, plugin: current.id, after: [] });
  }
  const known = observed.marketplaces.some((m) => m.name === marketplace);
  // `marketplace remove` would uninstall a kept plugin and delete what Claude saved for it.
  const retiring =
    desired.plugins.length === 0 && known && plugins.every((p) => p.action !== "kept");
  const keptBy = retiring
    ? marketplaceKeptBy({ target, claudeScope, marketplace, projectDir }, installs, observed)
    : [];
  if (retiring && keptBy.length === 0) {
    steps.push({ command: { op: "marketplace remove", marketplace }, after: uninstalls });
  }
  return {
    target: desired.target,
    claudeScope,
    marketplace,
    marketplaceDir: desired.marketplaceDir,
    projectDir,
    steps,
    plugins,
    otherScopeInstalls,
    marketplaceKnown: known,
    keptBy,
  };
}

/**
 * The uninstall of `current`, a plugin no longer desired at caplet's identity, or undefined to
 * keep it installed. A removed capability's uninstall deletes what Claude saved for the plugin, as
 * a native uninstall does. A carrier change keeps the plugin's data directory (`--keep-data`), but
 * Claude still deletes its saved options and secrets when no other install of the id remains, so
 * the plugin stays installed when it may have any: user settings hold options for it or cannot be
 * read, or its manifest declares configuration (secrets live outside the settings files).
 */
function planUninstall(
  current: ClaudeInstalledPlugin,
  scope: ClaudeScope,
  desired: DesiredClaudeScope,
  observed: ObservedClaudeState,
): ClaudeCommand | undefined {
  const moved = desired.carrierChanged?.find((plugin) => plugin.name === current.name);
  const command = { op: "uninstall" as const, plugin: current.id, scope };
  if (moved === undefined) return { ...command, keepData: false };
  const lastInstall = !observed.plugins.some((p) => p.id === current.id && p !== current);
  const user = observed.settings.find((file) => file.scope === "user");
  const configured =
    user !== undefined &&
    (user.settings === undefined || user.settings.configuredPlugins.includes(current.id));
  return lastInstall && (moved.declaresConfig || configured)
    ? undefined
    : { ...command, keepData: true };
}

/**
 * Why a retired marketplace must stay registered: each install outside caplet's registration
 * that `marketplace remove` would uninstall, and each settings file it edits, other than caplet's
 * own, that declares the marketplace or cannot be read. Empty when the removal is safe.
 */
function marketplaceKeptBy(
  plan: Pick<ClaudeScopePlan, "target" | "claudeScope" | "marketplace" | "projectDir">,
  installs: ClaudeInstallPartition,
  observed: ObservedClaudeState,
): string[] {
  const { target, claudeScope, marketplace, projectDir } = plan;
  const keptBy: string[] = [];
  for (const plugin of [...installs.otherScope, ...installs.elsewhere]) {
    const where = plugin.projectPath === undefined ? "" : ` for ${plugin.projectPath}`;
    keptBy.push(`${plugin.id} is installed at Claude ${plugin.scope} scope${where}`);
  }
  for (const file of observed.settings) {
    const own =
      file.scope === claudeScope && (target.scope === "user" || target.projectRoot === projectDir);
    if (own) continue;
    if (file.settings === undefined) keptBy.push(`${file.path} cannot be read`);
    else if (file.settings.marketplaces.includes(marketplace)) {
      keptBy.push(`${file.path} declares it`);
    }
  }
  return keptBy;
}
