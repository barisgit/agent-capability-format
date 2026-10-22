/**
 * The fetch stage of the caplet workflow ({@link fetchScopes}), and the executable inventories a
 * command compares across it: what was installed before fetching against what the plan wants.
 */
import path from "node:path";
import {
  type Diagnostic,
  type ExecutableChange,
  type ExecutableComponent,
  executableChanges,
  executableComponents,
  readCapletConfig,
  resolveScopeCapabilities,
  type ScopeRoot,
  targetMap,
} from "@caplet/core";
import {
  type PrefetchedSource,
  type ResolveResult,
  readLockfile,
  resolveCapabilities,
} from "@caplet/installer";
import { readSidecar, sidecarPath } from "../apply/sidecar.js";
import { type FetchMode, readCwd, readScope } from "./args.js";
import { installedMcpExecutables } from "./installed-executables.js";
import { resolveScopeRoots } from "./scopes.js";
import { targetSelection } from "./target-selection.js";
import { type EmitPlan, installRootFor } from "./workflow.js";

/**
 * Resolves the sources of the selected scopes into their snapshots and lockfiles, after changing
 * the process cwd to `--cwd`. With `capabilityName`, only the locked sources that provide it are
 * resolved.
 */
export async function fetchScopes(
  args: Record<string, unknown>,
  mode: FetchMode,
  capabilityName?: string,
  opts?: {
    updateLock?: boolean;
    prefetchedSources?: ReadonlyMap<string, PrefetchedSource>;
    frozen?: boolean;
  },
): Promise<{ scopes: ScopeRoot[]; results: ResolveResult[]; diagnostics: Diagnostic[] }> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const results: ResolveResult[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const scopeRoot of scopes) {
    const sourceIds =
      capabilityName === undefined
        ? undefined
        : ((await readLockfile(scopeRoot.lockPath))?.entries
            .filter((entry) => entry.capabilityNames.includes(capabilityName))
            .map((entry) => entry.sourceId) ?? []);
    const result = await resolveCapabilities({
      scopeRoot,
      mode,
      sourceIds,
      updateLock: opts?.updateLock,
      prefetchedSources: opts?.prefetchedSources,
      frozen: opts?.frozen,
    });
    results.push(result);
    diagnostics.push(...result.diagnostics);
  }
  return { scopes, results, diagnostics };
}

/**
 * Executable components of the snapshots installed in the selected scopes, for the targets a
 * plan would select. Call it before a command fetches: resolution replaces snapshots in place,
 * so this is the only point where the previously locked content is still readable. Snapshots
 * that no longer match the lock are skipped, so their components count as added afterwards.
 * A capability counts on a target only when that target has managed output for it, so one a
 * refusal kept from ever being written there contributes nothing.
 */
export async function installedExecutables(
  args: Record<string, unknown>,
): Promise<ExecutableComponent[]> {
  const cwd = path.resolve(readCwd(args));
  const { config } = await readCapletConfig(cwd);
  const targets = targetSelection(args, config);
  const executables: ExecutableComponent[] = [];
  for (const scopeRoot of await resolveScopeRoots(readScope(args), cwd)) {
    const { capabilities } = await resolveScopeCapabilities(scopeRoot);
    const canonical = await readSidecar(sidecarPath(scopeRoot.agentsDir));
    for (const targetId of targets) {
      const installRoot = installRootFor(targetId, scopeRoot, config, cwd);
      if (installRoot === null) continue;
      const managed = (await readSidecar(sidecarPath(installRoot))).managed.filter(
        (entry) => entry.target === undefined || entry.target === targetId,
      );
      const written = new Set(
        [
          ...managed,
          ...(targetMap[targetId]?.discoversCanonicalSkills === true
            ? canonical.managed.filter(
                (entry) => entry.target === undefined || entry.target === "canonical",
              )
            : []),
        ].map((entry) => entry.capability),
      );
      for (const capability of capabilities) {
        if (!written.has(capability.manifest.name)) continue;
        const components = await executableComponents(
          capability,
          targetId,
          config.targets?.[targetId]?.carrier,
        );
        executables.push(
          ...(await installedMcpExecutables(
            components,
            managed.filter((entry) => entry.capability === capability.manifest.name),
            targetId,
            installRoot,
            capability,
          )),
        );
      }
    }
  }
  return executables;
}

/**
 * Executable changes the plan makes: `installed` (from {@link installedExecutables}) against
 * the planned inventory. A blocked capability changes nothing on its target, so its components
 * there are left out of both sides.
 */
export function plannedExecutableChanges(
  installed: readonly ExecutableComponent[],
  plan: Pick<EmitPlan, "blocked" | "executables">,
): ExecutableChange[] {
  const blocked = new Set(
    plan.blocked.map((item) => `${item.scope}\u0000${item.target}\u0000${item.capability}`),
  );
  const unblocked = installed.filter(
    (item) => !blocked.has(`${item.scope}\u0000${item.target}\u0000${item.capability}`),
  );
  return executableChanges(unblocked, plan.executables);
}
