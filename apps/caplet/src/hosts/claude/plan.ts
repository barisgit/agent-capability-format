import path from "node:path";
import type { ClaudeCommand, ClaudeScope } from "./commands.js";
import { type ClaudeScopeTarget, claudeMarketplaceName, claudeScopeFor } from "./scope.js";
import type {
  ClaudeInstalledPlugin,
  ClaudeKnownMarketplace,
  ObservedClaudeState,
} from "./state.js";

/** A generated Claude plugin caplet wants installed: capability slug and its `+acf.<d>` version. */
export type DesiredClaudePlugin = { name: string; version: string };

/** Every plugin caplet wants in one ACF scope's marketplace; an empty list retires the scope. */
export type DesiredClaudeScope = {
  target: ClaudeScopeTarget;
  /** Absolute path of the scope's marketplace directory (`<install-root>/.acf/marketplace`). */
  marketplaceDir: string;
  plugins: DesiredClaudePlugin[];
  /**
   * Whether the scope's sidecar records the marketplace as caplet's (caplet owns its
   * `marketplace.json`). Caplet removes only a marketplace it recorded.
   */
  recorded?: boolean | undefined;
  /**
   * Plugins of still-selected held or refused capabilities that stay exactly as installed
   * (`ClaudeRootPlan.kept`), regardless of their generated version. No command touches them, and the
   * marketplace is not removed while there is one, since `marketplace remove` uninstalls them.
   */
  kept?: readonly string[] | undefined;
  /**
   * Plugins caplet generated in this scope earlier and no longer wants. When host state cannot be
   * read, they are assumed installed so the recovery commands include their uninstall.
   */
  leftover?: string[] | undefined;
  /**
   * Capabilities the scope still selects for Claude, now without a plugin, even when the sidecar
   * no longer records their earlier plugin:
   * `output` `loose` when it writes loose Claude files instead (a carrier change), `empty` when
   * nothing of it reaches Claude. Their uninstall keeps what Claude saved for them
   * (`--keep-data`). `declaresConfig`: the plugin's manifest declares configuration Claude
   * prompts for, so Claude may hold options or secrets for it that caplet cannot see. Any other
   * left-over plugin's capability was deselected or removed.
   */
  retained?:
    | ReadonlyArray<{ name: string; output: "loose" | "empty"; declaresConfig: boolean }>
    | undefined;
};

/**
 * What happens to one plugin. `other-scope`: the id is installed only at another Claude scope that
 * applies here, so caplet leaves it alone instead of installing over it. `kept`: its capability is
 * still selected but has no plugin now, and uninstalling it would delete the options and secrets
 * Claude saved for it, so it stays installed until the user uninstalls it. `blocked`: Claude
 * lists caplet's marketplace name from another source, so caplet runs nothing for the scope
 * (`ClaudeScopePlan.foreign`).
 * `disabled`: Claude does not list it, but the settings that decide its enablement at caplet's
 * scope disable it, and `install` would enable it again (D15), so caplet does not install it.
 */
export type ClaudePluginAction =
  | "install"
  | "update"
  | "unchanged"
  | "uninstall"
  | "other-scope"
  | "kept"
  | "blocked"
  | "disabled";

/** The planned action for one plugin of the scope, desired or left over at caplet's identity. */
export type PlannedClaudePlugin = {
  name: string;
  id: string;
  action: ClaudePluginAction;
  /** Absent for `uninstall` and `kept`. */
  desiredVersion?: string | undefined;
  /**
   * For `kept`: what its capability has in Claude instead (`DesiredClaudeScope.retained`); absent
   * for a plugin `DesiredClaudeScope.kept` names.
   */
  output?: "loose" | "empty" | undefined;
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
   * The marketplace Claude lists under caplet's name from another source or directory. Then the
   * plan has no step: `marketplace add` would repoint it to caplet's directory, and uninstall or
   * `marketplace remove` would change plugins caplet did not install.
   */
  foreign: ClaudeKnownMarketplace | undefined;
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
 * and `uninstall` for plugins no longer desired, keeping Claude's data for a capability that is
 * still selected ({@link planUninstall}). It never plans `install` for an installed plugin, or for
 * one the settings disable ({@link disabledInSettings}), because install re-enables a plugin the
 * user disabled (D15). The marketplace is removed only when no plugin is desired or kept and the
 * removal touches nothing but caplet's registration:
 * `marketplace remove` uninstalls its plugins at every scope and directory and drops its
 * declarations from every settings file it edits (`ObservedClaudeState.settings`). When Claude
 * lists the marketplace name from anywhere but caplet's directory, the plan runs nothing.
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
  const listed = observed.marketplaces.find((m) => m.name === marketplace);
  if (listed !== undefined && !isDirectory(listed, desired.marketplaceDir, observed)) {
    return {
      target,
      claudeScope,
      marketplace,
      marketplaceDir: desired.marketplaceDir,
      projectDir,
      steps: [],
      plugins: desired.plugins.map((plugin) => ({
        name: plugin.name,
        id: `${plugin.name}@${marketplace}`,
        action: "blocked",
        desiredVersion: plugin.version,
      })),
      otherScopeInstalls: [],
      marketplaceKnown: true,
      foreign: listed,
      keptBy: [],
    };
  }
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
          : disabledInSettings(id, claudeScope, observed)
            ? "disabled"
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
    if (desired.kept?.includes(current.name) === true) {
      plugins.push({ name: current.name, id: current.id, action: "kept", observed: current });
      continue;
    }
    const retained = desired.retained?.find((plugin) => plugin.name === current.name);
    const command = planUninstall(current, claudeScope, retained, observed);
    if (command === undefined) {
      const output = retained?.output;
      plugins.push({
        name: current.name,
        id: current.id,
        action: "kept",
        output,
        observed: current,
      });
      continue;
    }
    plugins.push({ name: current.name, id: current.id, action: "uninstall", observed: current });
    uninstalls.push(steps.length);
    steps.push({ command, plugin: current.id, after: [] });
  }
  const known = listed !== undefined;
  // `marketplace remove` would uninstall a kept plugin and delete what Claude saved for it.
  const retiring =
    desired.plugins.length === 0 &&
    (desired.kept ?? []).length === 0 &&
    known &&
    plugins.every((p) => p.action !== "kept");
  const keptBy = retiring
    ? [
        ...(desired.recorded === true ? [] : ["caplet's sidecar has no record of it"]),
        ...marketplaceKeptBy({ target, claudeScope, marketplace, projectDir }, installs, observed),
      ]
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
    foreign: undefined,
    keptBy,
  };
}

/**
 * Whether the settings files that decide `id`'s enablement after an install at `claudeScope`
 * disable it. Claude merges `enabledPlugins` with local over project over user (the most specific
 * file naming the id wins), and `install` writes `true` into the file of its scope, so a user
 * install is decided by the user file alone (project and local files still override it per
 * project), while a local install overrides all three. Unreadable files decide nothing.
 */
function disabledInSettings(
  id: string,
  claudeScope: ClaudeScope,
  observed: ObservedClaudeState,
): boolean {
  const deciding: readonly ClaudeScope[] =
    claudeScope === "user" ? ["user"] : ["user", "project", "local"];
  let enabled: boolean | undefined;
  for (const scope of deciding) {
    const file = observed.settings.find((candidate) => candidate.scope === scope);
    const value = file?.settings?.enabledPlugins[id];
    if (value !== undefined) enabled = value;
  }
  return enabled === false;
}

/** Whether Claude lists `marketplace` from the directory `dir`, compared by real path. */
function isDirectory(
  marketplace: ClaudeKnownMarketplace,
  dir: string,
  observed: ObservedClaudeState,
): boolean {
  const real = (file: string) => observed.realPaths?.get(file) ?? path.resolve(file);
  return (
    marketplace.source === "directory" &&
    marketplace.path !== undefined &&
    real(marketplace.path) === real(dir)
  );
}

/**
 * The uninstall of `current`, a plugin no longer desired at caplet's identity, or undefined to
 * keep it installed. The plugin of a deselected or removed capability (not `retained`) is
 * uninstalled deleting what Claude saved for it, as a native uninstall does. A retained one keeps
 * its data directory (`--keep-data`), but Claude still deletes its saved options and secrets when
 * no other install of the id remains, so the plugin stays installed when it may have any: user
 * settings hold options for it or cannot be read, or its manifest declares configuration (secrets
 * live outside the settings files).
 */
function planUninstall(
  current: ClaudeInstalledPlugin,
  scope: ClaudeScope,
  retained: { declaresConfig: boolean } | undefined,
  observed: ObservedClaudeState,
): ClaudeCommand | undefined {
  const command = { op: "uninstall" as const, plugin: current.id, scope };
  if (retained === undefined) return { ...command, keepData: false };
  const lastInstall = !observed.plugins.some((p) => p.id === current.id && p !== current);
  const user = observed.settings.find((file) => file.scope === "user");
  const configured =
    user !== undefined &&
    (user.settings === undefined || user.settings.configuredPlugins.includes(current.id));
  return lastInstall && (retained.declaresConfig || configured)
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
