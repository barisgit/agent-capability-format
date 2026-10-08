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
};

/**
 * What happens to one plugin. `other-scope`: the id is installed only at another Claude scope, so
 * caplet leaves it alone instead of installing over it.
 */
export type ClaudePluginAction = "install" | "update" | "unchanged" | "uninstall" | "other-scope";

export type PlannedClaudePlugin = {
  name: string;
  id: string;
  action: ClaudePluginAction;
  /** Absent for `uninstall`. */
  desiredVersion?: string | undefined;
  /** The entry at caplet's Claude scope, when installed there. */
  observed?: ClaudeInstalledPlugin | undefined;
};

/**
 * One command. `after` lists indexes of earlier steps in the same scope plan that must succeed
 * first; a failed or skipped prerequisite skips this step and nothing else.
 */
export type PlannedClaudeStep = { command: ClaudeCommand; plugin?: string | undefined; after: number[] };

export type ClaudeScopePlan = {
  target: ClaudeScopeTarget;
  claudeScope: ClaudeScope;
  marketplace: string;
  marketplaceDir: string;
  steps: PlannedClaudeStep[];
  plugins: PlannedClaudePlugin[];
  /** Installs of this marketplace at other Claude scopes; reported, never changed. */
  otherScopeInstalls: ClaudeInstalledPlugin[];
};

/**
 * Plans the `claude plugin` commands for one ACF scope (D8, D25): an unconditional, idempotent
 * `marketplace add` when any plugin is desired, `install` for plugins not installed at caplet's
 * Claude scope, `update` for changed versions (also for disabled plugins, which stay disabled),
 * and `uninstall` for plugins no longer desired. It never plans `install` for an installed plugin,
 * because install re-enables a plugin the user disabled (D15). The marketplace is removed only
 * when no plugin is desired and no other Claude scope has plugins from it, because
 * `marketplace remove` uninstalls its plugins in every scope.
 */
export function planClaudeScope(
  desired: DesiredClaudeScope,
  observed: ObservedClaudeState,
): ClaudeScopePlan {
  const marketplace = claudeMarketplaceName(desired.target);
  const claudeScope = claudeScopeFor(desired.target.scope);
  const fromMarketplace = observed.plugins.filter((p) => p.marketplace === marketplace);
  const atScope = new Map(
    fromMarketplace.filter((p) => p.scope === claudeScope).map((p) => [p.name, p]),
  );
  const otherScopeInstalls = fromMarketplace.filter((p) => p.scope !== claudeScope);
  const steps: PlannedClaudeStep[] = [];
  const plugins: PlannedClaudePlugin[] = [];
  const desiredNames = new Set(desired.plugins.map((p) => p.name));

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
    plugins.push({ name: plugin.name, id, action, desiredVersion: plugin.version, observed: current });
    if (action === "install" || action === "update") {
      steps.push({ command: { op: action, plugin: id, scope: claudeScope }, plugin: id, after: [0] });
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
  if (desired.plugins.length === 0 && known && otherScopeInstalls.length === 0) {
    steps.push({ command: { op: "marketplace remove", marketplace }, after: uninstalls });
  }
  return {
    target: desired.target,
    claudeScope,
    marketplace,
    marketplaceDir: desired.marketplaceDir,
    steps,
    plugins,
    otherScopeInstalls,
  };
}
