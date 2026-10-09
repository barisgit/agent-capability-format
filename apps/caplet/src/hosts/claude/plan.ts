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
};

/**
 * What happens to one plugin. `other-scope`: the id is installed only at another Claude scope that
 * applies here, so caplet leaves it alone instead of installing over it.
 */
export type ClaudePluginAction = "install" | "update" | "unchanged" | "uninstall" | "other-scope";

export type PlannedClaudePlugin = {
  name: string;
  id: string;
  action: ClaudePluginAction;
  /** Absent for `uninstall`. */
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
 * and `uninstall` for plugins no longer desired. It never plans `install` for an installed plugin,
 * because install re-enables a plugin the user disabled (D15). The marketplace is removed only
 * when no plugin is desired and nothing else, at any Claude scope or directory, has plugins from
 * it, because `marketplace remove` uninstalls its plugins everywhere.
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
    plugins.push({ name: current.name, id: current.id, action: "uninstall", observed: current });
    uninstalls.push(steps.length);
    steps.push({
      command: { op: "uninstall", plugin: current.id, scope: claudeScope },
      plugin: current.id,
      after: [],
    });
  }
  const known = observed.marketplaces.some((m) => m.name === marketplace);
  const retained = otherScopeInstalls.length + installs.elsewhere.length;
  if (desired.plugins.length === 0 && known && retained === 0) {
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
  };
}
