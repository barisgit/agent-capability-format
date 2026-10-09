import "@caplet/adapters";
import { readFileSync } from "node:fs";
import path from "node:path";
import { layoutFor } from "@caplet/adapters/common";
import {
  ACF_SYSTEM_OWNER,
  type AcfCapability,
  type AcfOwnership,
  applyApplicability,
  type CapletConfig,
  type Carrier,
  type ComponentOutcome,
  capabilityBlocked,
  componentOutcomes,
  type Diagnostic,
  type EmitOptions,
  type EmittedPlugin,
  type ExecutableChange,
  type ExecutableComponent,
  executableChanges,
  executableComponents,
  type FileDiff,
  readCapletConfig,
  resolveScopeCapabilities,
  type Scope,
  type ScopeRoot,
  type TargetId,
  targetIds,
  targetMap,
} from "@caplet/core";
import {
  type CapabilitiesLock,
  detectLockDrift,
  entrySourceId,
  type PrefetchedSource,
  type ResolveResult,
  readCapabilitiesYml,
  readLockfile,
  resolveCapabilities,
  sourceId,
} from "@caplet/installer";
import {
  type ApplyResult,
  applyDiffs,
  contentEquals,
  resolveDiffPath,
} from "../apply/apply-diffs.js";
import { containmentViolation, type OutputBoundary } from "../apply/containment.js";
import {
  detectDrift,
  hashOwnedRegions,
  type ManagedEntry,
  ownershipKey,
  readSidecar,
  relativeSidecarPath,
  type SidecarOwner,
  writeSidecar,
} from "../apply/sidecar.js";
import { type FetchMode, readCwd, readOptionalString, readScope, validationError } from "./args.js";
import {
  type ClaudeGate,
  type ClaudeReport,
  claudeGate,
  gateOpen,
  reconcileClaude,
} from "./claude-host-flow.js";
import {
  type ClaudeRootPlan,
  planClaudeMarketplaces,
  recordClaudeMarketplaces,
} from "./claude-marketplace.js";
import {
  type ClaudeMigration,
  driftedWarning,
  planClaudeMigration,
  recordRenameNotices,
} from "./claude-migration.js";
import { diskReadOnlyFs } from "./fs.js";
import { addManagementNotices, rootNoticeDiffFromSidecar } from "./managed-notices.js";
import { anchorPathSource } from "./manifest.js";
import { withholdConflictingMcpServers } from "./mcp-conflicts.js";
import { resolveScopeRoots } from "./scopes.js";

export type EmittedDiff = {
  scopeRoot: ScopeRoot;
  targetId: TargetId;
  destination: "canonical" | "native";
  installRoot: string;
  capabilityName: string;
  /** Carrier of the output the diff belongs to, recorded on its sidecar entry. */
  carrier: Carrier;
  diff: FileDiff;
  /** Host state the change waits for; such a change applies after Claude reconciliation. */
  gate?: ClaudeGate | undefined;
  /**
   * For the removal of a sidecar entry the plan no longer wants: the owned regions on disk differ
   * from the hash the sidecar recorded, so the user changed them.
   */
  drifted?: boolean | undefined;
};

/** A generated plugin package, with the scope and output root it was planned for. */
export type PlannedPlugin = EmittedPlugin & { scopeRoot: ScopeRoot; installRoot: string };

/** A sidecar entry the plan no longer wants, identified exactly as the sidecar stores it. */
export type StaleSidecarEntry = {
  installRoot: string;
  path: string;
  capability: string;
  owns: AcfOwnership[];
  owner: SidecarOwner;
};

/** A capability a refusal blocks on one target in one scope (`capabilityBlocked`). */
export type BlockedCapability = { scope: Scope; target: TargetId; capability: string };

export type EmitPlan = {
  /** Directory relative target paths resolve against (the process cwd while planning). */
  cwd: string;
  config: CapletConfig;
  scopes: ScopeRoot[];
  targets: TargetId[];
  diagnostics: Diagnostic[];
  /** Changes to apply; none belongs to a {@link blocked} capability on its target. */
  diffs: EmittedDiff[];
  /** Every plugin package the plan writes, whether or not its files changed. */
  plugins: PlannedPlugin[];
  /** Claude install roots whose local marketplace the plan maintains or retires. */
  claude: ClaudeRootPlan[];
  /**
   * Retirement of loose Claude output for capabilities that became plugins: drifted files to
   * release instead of delete, and the invocation renames to announce.
   */
  migration: ClaudeMigration;
  staleEntries: StaleSidecarEntry[];
  /**
   * Capabilities refused on a target: their earlier output there is kept as it was, so a later
   * apply after the user excludes the refused component starts from the last installed state.
   */
  blocked: BlockedCapability[];
  /**
   * Compatibility-report outcome of every planned component per target, independent of whether
   * its files changed. A capability planned in several scopes is reported once per target.
   */
  outcomes: ComponentOutcome[];
  /**
   * Executable components of every planned capability per scope and target, read while the
   * planned snapshots (or previews) exist; compare with {@link installedExecutables} through
   * {@link plannedExecutableChanges}.
   */
  executables: ExecutableComponent[];
};

/**
 * Outcome of applying a plan; `diagnostics` holds only what apply itself found. `claude` is the
 * host report of the plan's Claude install roots, absent when it has none.
 */
export type ApplySummary = {
  results: ApplyResult[];
  diagnostics: Diagnostic[];
  claude?: ClaudeReport | undefined;
};

export async function fetchScopes(
  args: Record<string, unknown>,
  mode: FetchMode,
  capabilityName?: string,
  opts?: {
    updateLock?: boolean;
    prefetchedSources?: ReadonlyMap<string, PrefetchedSource>;
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
      scope: scopeRoot.scope,
      scopeRoot,
      mode,
      sourceIds,
      updateLock: opts?.updateLock,
      prefetchedSources: opts?.prefetchedSources,
    });
    results.push(result);
    diagnostics.push(...result.diagnostics);
  }
  return { scopes, results, diagnostics };
}

export async function buildEmitPlan(
  args: Record<string, unknown>,
  opts?: {
    locks?: ReadonlyMap<string, CapabilitiesLock>;
    /** Per-scope snapshot directories standing in for `capabilitiesDir` (previews). */
    capabilitiesDirs?: ReadonlyMap<string, string>;
  },
): Promise<EmitPlan> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const configResult = await readCapletConfig(cwd);
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const targets = targetSelection(args, configResult.config);
  const diagnostics: Diagnostic[] = [...configResult.diagnostics];
  const desiredDiffs: EmittedDiff[] = [];
  const plugins: PlannedPlugin[] = [];
  const blocked: BlockedCapability[] = [];
  // `<install root>\0<capability>` pairs whose sidecar entries a blocked capability keeps.
  const keptOutput = new Set<string>();
  const outcomes = new Map<string, ComponentOutcome>();
  const executables: ExecutableComponent[] = [];
  const canonicalDiffs = new Set<string>();
  const resolvedNames = new Map<string, ReadonlySet<string>>();
  const resolvedFacets = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
  const fs = diskReadOnlyFs();

  for (const scopeRoot of scopes) {
    const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
    diagnostics.push(...manifest.diagnostics);
    const lockOverride = opts?.locks?.get(scopeRoot.scope);
    const diskLock = await readLockfile(scopeRoot.lockPath);
    const lock = lockOverride ?? diskLock;
    // Relative path: sources are relative to the manifest directory, not the process cwd.
    const manifestDirForDrift = path.dirname(scopeRoot.manifestPath);
    const anchoredManifest = {
      ...manifest.value,
      capabilities: manifest.value.capabilities.map((entry) =>
        anchorPathSource(entry, manifestDirForDrift),
      ),
    };
    diagnostics.push(...detectLockDrift(anchoredManifest, lock));
    const capabilitiesDir = opts?.capabilitiesDirs?.get(scopeRoot.scope);
    const resolved = await resolveScopeCapabilities(
      capabilitiesDir === undefined ? scopeRoot : { ...scopeRoot, capabilitiesDir },
      { lock },
    );
    diagnostics.push(...resolved.diagnostics);
    if (lock !== null) {
      const manifestDir = path.dirname(scopeRoot.manifestPath);
      const manifestSources = new Set(
        manifest.value.capabilities.flatMap((entry) => [
          entrySourceId(entry),
          entrySourceId(entry, manifestDir),
          sourceId(entry.source),
          sourceId(entry.source, manifestDir),
        ]),
      );
      const selected = new Set(
        lock.entries
          .filter((entry) => manifestSources.has(entry.sourceId))
          .flatMap((entry) => entry.capabilityNames),
      );
      const lockedNames = new Set(
        (diskLock ?? lock).entries.flatMap((entry) => entry.capabilityNames),
      );
      resolved.capabilities = resolved.capabilities.filter(
        (capability) =>
          selected.has(capability.manifest.name) || !lockedNames.has(capability.manifest.name),
      );
    }
    resolvedNames.set(
      scopeRoot.scope,
      new Set(resolved.capabilities.map((capability) => capability.manifest.name)),
    );
    resolvedFacets.set(
      scopeRoot.scope,
      new Map(
        resolved.capabilities.map((capability) => [
          capability.manifest.name,
          capabilityFacetKeys(capability),
        ]),
      ),
    );
    diagnostics.push(...(await driftDiagnostics(scopeRoot.agentsDir)));
    const canonicalSkillReaders = targets.filter(
      (targetId) =>
        targetMap[targetId]?.discoversCanonicalSkills === true &&
        installRootFor(targetId, scopeRoot, configResult.config, cwd) !== null,
    );
    for (const targetId of targets) {
      const installRoot = installRootFor(targetId, scopeRoot, configResult.config, cwd);
      if (installRoot === null) {
        diagnostics.push({
          severity: "lossy",
          code: "acf.adapter.scope-unsupported",
          message: `${targetId} does not support ${scopeRoot.scope} scope`,
          targetId,
        });
        continue;
      }
      diagnostics.push(...(await driftDiagnostics(installRoot)));
      const applicable = await withholdConflictingMcpServers(
        resolved.capabilities.flatMap(
          (capability) => applyApplicability(capability, targetId) ?? [],
        ),
        {
          target: targetId,
          scope: scopeRoot.scope,
          installRoot,
          carrier: configResult.config.targets?.[targetId]?.carrier,
          fs,
        },
      );
      diagnostics.push(...applicable.diagnostics);
      const emitted = new Map(
        applicable.capabilities.map((capability) => [capability.manifest.name, capability]),
      );
      for (const capability of resolved.capabilities) {
        const capabilityExecutables = await executableComponents(
          capability,
          targetId,
          configResult.config.targets?.[targetId]?.carrier,
        );
        const filtered = emitted.get(capability.manifest.name);
        if (filtered === undefined) {
          executables.push(...capabilityExecutables);
          continue;
        }
        const adapter = targetMap[targetId]?.adapter;
        if (adapter === undefined) {
          diagnostics.push({
            severity: "lossy",
            code: "acf.adapter.not-registered",
            message: `adapter not registered for target ${targetId}`,
            targetId,
          });
          executables.push(...capabilityExecutables);
          continue;
        }
        const input = {
          capability: filtered,
          scope: scopeRoot.scope,
          installRoot,
          options: emitOptionsForTarget(targetId, configResult.config, canonicalSkillReaders),
        };
        const validation = adapter.validate === undefined ? [] : await adapter.validate(input);
        diagnostics.push(...validation);
        const result = await adapter.emit(input, fs);
        diagnostics.push(...result.diagnostics);
        for (const outcome of componentOutcomes({
          capability: filtered,
          target: targetId,
          diagnostics: [...filtered.diagnostics, ...validation, ...result.diagnostics],
          reported: result.outcomes,
        })) {
          const key = `${outcome.capability}\u0000${outcome.target}\u0000${outcome.family}\u0000${outcome.component}`;
          if (!outcomes.has(key)) outcomes.set(key, outcome);
        }
        if (capabilityBlocked([...validation, ...result.diagnostics], targetId)) {
          const name = filtered.manifest.name;
          blocked.push({ scope: scopeRoot.scope, target: targetId, capability: name });
          keptOutput.add(`${installRoot}\u0000${name}`);
          // The shared skills root is this target's output too.
          if (canonicalSkillReaders.includes(targetId)) {
            keptOutput.add(`${scopeRoot.agentsDir}\u0000${name}`);
          }
          continue;
        }
        executables.push(...capabilityExecutables);
        const pluginDirs = new Set<string>();
        for (const plugin of result.plugins ?? []) {
          plugins.push({ ...plugin, scopeRoot, installRoot });
          pluginDirs.add(plugin.dir);
        }
        for (const diff of result.diffs) {
          const canonical = isCanonicalSkillPath(diff.path, scopeRoot);
          if (canonical) {
            const key = `${scopeRoot.scope}\0${filtered.manifest.name}\0${path.resolve(diff.path)}`;
            if (canonicalDiffs.has(key)) continue;
            canonicalDiffs.add(key);
          }
          desiredDiffs.push({
            scopeRoot,
            targetId,
            destination: canonical ? "canonical" : "native",
            installRoot: canonical ? scopeRoot.agentsDir : installRoot,
            capabilityName: filtered.manifest.name,
            carrier:
              diff.artifactRoot !== undefined && pluginDirs.has(diff.artifactRoot)
                ? "plugin"
                : "loose",
            diff,
          });
        }
      }
    }
  }
  const claude = await planClaudeMarketplaces({
    roots: targets.includes("claude")
      ? scopes.flatMap((scopeRoot) => {
          const installRoot = installRootFor("claude", scopeRoot, configResult.config, cwd);
          return installRoot === null ? [] : [{ scopeRoot, installRoot }];
        })
      : [],
    plugins,
    blocked,
  });
  desiredDiffs.push(...claude.diffs);
  const sweep = await sweepStaleSidecarEntries(
    scopes,
    targets,
    configResult.config,
    cwd,
    desiredDiffs,
    resolvedNames,
    resolvedFacets,
    keptOutput,
  );
  const desiredWithNotices = await addManagementNotices(desiredDiffs, fs, diagnostics, {
    staleByRoot: sweep.staleByRoot,
    rootContexts: sweep.rootContexts,
  });
  const diffs = [
    ...desiredWithNotices.filter(
      (item) => fileDiffChanged(item.diff) || sweep.forcedPaths.has(diffPathKey(item)),
    ),
    ...sweep.deletes.filter((item) => fileDiffChanged(item.diff)),
  ];
  for (const item of diffs) {
    const gate = claudeGate(item, claude.roots);
    if (gate !== undefined) item.gate = gate;
  }
  const migration = await planClaudeMigration(diffs);
  return {
    cwd,
    config: configResult.config,
    scopes,
    targets,
    diagnostics,
    diffs: migration.diffs,
    migration: migration.migration,
    plugins,
    claude: claude.roots,
    staleEntries: sweep.staleEntries,
    blocked,
    outcomes: [...outcomes.values()],
    executables,
  };
}

/**
 * Executable components of the snapshots installed in the selected scopes, for the targets a
 * plan would select. Call it before a command fetches: resolution replaces snapshots in place,
 * so this is the only point where the previously locked content is still readable. Snapshots
 * that no longer match the lock are skipped, so their components count as added afterwards.
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
    for (const targetId of targets) {
      if (installRootFor(targetId, scopeRoot, config, cwd) === null) continue;
      for (const capability of capabilities) {
        executables.push(
          ...(await executableComponents(
            capability,
            targetId,
            config.targets?.[targetId]?.carrier,
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

function diffPathKey(item: EmittedDiff): string {
  const relative = relativeSidecarPath(
    item.installRoot,
    resolveDiffPath(item.installRoot, item.diff.path),
  );
  return `${item.installRoot}\u0000${relative}`;
}

export type RootContext = {
  scopeRoot: ScopeRoot;
  targetId: TargetId;
  destination: "canonical" | "native";
};

type SweepResult = {
  deletes: EmittedDiff[];
  forcedPaths: ReadonlySet<string>;
  staleByRoot: Map<string, Set<string>>;
  staleEntries: StaleSidecarEntry[];
  rootContexts: Map<string, RootContext>;
};

/**
 * Finds sidecar entries the plan no longer wants and plans their removal.
 *
 * An owned region is stale when no desired diff of the same capability owns it at the same path.
 * Native roots belong to a selected target whose plan is complete, so any stale region there is
 * removed, including a renamed skill's directory, a file dropped from a kept skill and a renamed
 * MCP server key. The canonical root is shared with targets this run may not have planned, so an
 * entry there is kept while its capability and facet still exist unless this run planned that
 * facet into the canonical root. Regions another capability now owns are released without a
 * delete, and a partly stale entry forces its path so the remaining regions are re-recorded.
 * Entries of a capability blocked on the root's target (`keptOutput`, keyed
 * `<install root>\0<capability>`) are never stale: a refusal keeps the earlier install.
 */
async function sweepStaleSidecarEntries(
  scopes: readonly ScopeRoot[],
  targets: readonly TargetId[],
  config: CapletConfig,
  cwd: string,
  desired: readonly EmittedDiff[],
  resolvedNames: ReadonlyMap<string, ReadonlySet<string>>,
  resolvedFacets: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
  keptOutput: ReadonlySet<string>,
): Promise<SweepResult> {
  const desiredOwns = new Set<string>();
  const desiredOwnsAnyCapability = new Set<string>();
  const plannedFacets = new Set<string>();
  for (const item of desired) {
    const key = diffPathKey(item);
    for (const own of item.diff.owns) {
      desiredOwns.add(`${key}\u0000${item.capabilityName}\u0000${ownershipKey(own)}`);
      desiredOwnsAnyCapability.add(`${key}\u0000${ownershipKey(own)}`);
    }
    const facet = item.diff.facet;
    if (facet !== undefined) {
      plannedFacets.add(
        `${item.installRoot}\u0000${item.capabilityName}\u0000${facet.family}\u0000${facet.name}`,
      );
    }
  }
  const deletes: EmittedDiff[] = [];
  const forcedPaths = new Set<string>();
  const staleByRoot = new Map<string, Set<string>>();
  const staleEntries: StaleSidecarEntry[] = [];
  const rootContexts = new Map<string, RootContext>();
  for (const scopeRoot of scopes) {
    const names = resolvedNames.get(scopeRoot.scope) ?? new Set<string>();
    const candidates: Array<{ installRoot: string } & Omit<RootContext, "scopeRoot">> = [
      {
        destination: "canonical",
        targetId: targets[0] ?? "claude",
        installRoot: scopeRoot.agentsDir,
      },
    ];
    for (const targetId of targets) {
      const installRoot = installRootFor(targetId, scopeRoot, config, cwd);
      if (installRoot !== null) candidates.push({ destination: "native", targetId, installRoot });
    }
    for (const candidate of candidates) {
      if (rootContexts.has(candidate.installRoot)) continue;
      const context: RootContext = {
        scopeRoot,
        targetId: candidate.targetId,
        destination: candidate.destination,
      };
      rootContexts.set(candidate.installRoot, context);
      const sidecar = await readSidecar(path.join(candidate.installRoot, ".acf-managed.json"));
      for (const entry of sidecar.managed) {
        if (entry.capability === ACF_SYSTEM_OWNER) continue;
        const pathKey = `${candidate.installRoot}\u0000${entry.path}`;
        const wholeFile = entry.owns.some((own) => own.kind === "file");
        const absolutePath = path.resolve(candidate.installRoot, entry.path);
        const stale = entry.owns.filter(
          (own) =>
            !desiredOwns.has(`${pathKey}\u0000${entry.capability}\u0000${ownershipKey(own)}`),
        );
        if (stale.length === 0) {
          // Entry is still desired. If the recorded hash no longer matches the
          // owned regions on disk (stale sidecar metadata), force-apply so the
          // sidecar heals even when the file bytes are already up to date.
          const current = wholeFile ? readBytesOrNull(absolutePath) : readTextOrNull(absolutePath);
          if (hashOwnedRegions(current, entry.owns) !== entry.hash) forcedPaths.add(pathKey);
          continue;
        }
        if (keptOutput.has(`${candidate.installRoot}\u0000${entry.capability}`)) continue;
        if (
          candidate.destination === "canonical" &&
          names.has(entry.capability) &&
          facetStillExists(entry, resolvedFacets, scopeRoot) &&
          !facetPlanned(entry, candidate.installRoot, plannedFacets)
        ) {
          continue;
        }
        const bucket = staleByRoot.get(candidate.installRoot) ?? new Set<string>();
        bucket.add(`${entry.capability}\u0000${entry.path}`);
        staleByRoot.set(candidate.installRoot, bucket);
        staleEntries.push({
          installRoot: candidate.installRoot,
          path: entry.path,
          capability: entry.capability,
          owns: entry.owns,
          owner: sidecarOwner({ ...context, carrier: entry.carrier ?? "loose" }),
        });
        if (stale.length < entry.owns.length) forcedPaths.add(pathKey);
        const orphaned = stale.filter(
          (own) => !desiredOwnsAnyCapability.has(`${pathKey}\u0000${ownershipKey(own)}`),
        );
        if (orphaned.length < stale.length) forcedPaths.add(pathKey);
        if (orphaned.length === 0) continue;
        const diff: FileDiff = {
          path: absolutePath,
          before: wholeFile ? readBytesOrNull(absolutePath) : readTextOrNull(absolutePath),
          after: null,
          owns: orphaned,
        };
        if (entry.facet !== undefined) diff.facet = entry.facet;
        deletes.push({
          ...context,
          installRoot: candidate.installRoot,
          capabilityName: entry.capability,
          carrier: entry.carrier ?? "loose",
          diff,
          drifted: ownedRegionsDrifted(diff.before, entry),
        });
      }
    }
  }
  return { deletes, forcedPaths, staleByRoot, staleEntries, rootContexts };
}

/** Whether the regions `entry` owns in `current` no longer hash to what the sidecar recorded. */
function ownedRegionsDrifted(current: FileDiff["before"], entry: ManagedEntry): boolean {
  try {
    return hashOwnedRegions(current, entry.owns) !== entry.hash;
  } catch {
    // The file no longer parses as the structure the owned regions point into.
    return true;
  }
}

function facetPlanned(
  entry: ManagedEntry,
  installRoot: string,
  plannedFacets: ReadonlySet<string>,
): boolean {
  if (entry.facet === undefined) return false;
  return plannedFacets.has(
    `${installRoot}\u0000${entry.capability}\u0000${entry.facet.family}\u0000${entry.facet.name}`,
  );
}

function capabilityFacetKeys(capability: AcfCapability): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const facet of capability.skills) keys.add(`skill\u0000${facet.name}`);
  for (const facet of capability.agents) keys.add(`agent\u0000${facet.name}`);
  for (const facet of capability.commands) keys.add(`command\u0000${facet.name}`);
  for (const facet of capability.instructions) keys.add(`instruction\u0000${facet.name}`);
  for (const bucket of Object.keys(capability.hooks?.buckets ?? {}))
    keys.add(`hook\u0000${bucket}`);
  for (const server of capability.mcp?.servers ?? []) keys.add(`mcp\u0000${server.name}`);
  return keys;
}

function facetStillExists(
  entry: ManagedEntry,
  resolvedFacets: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
  scopeRoot: ScopeRoot,
): boolean {
  if (entry.facet === undefined) return true;
  const facets = resolvedFacets.get(scopeRoot.scope)?.get(entry.capability);
  if (facets === undefined) return true;
  return facets.has(`${entry.facet.family}\u0000${entry.facet.name}`);
}

function readTextOrNull(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) return null;
    throw error;
  }
}

function readBytesOrNull(filePath: string): Uint8Array | null {
  try {
    return readFileSync(filePath);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) return null;
    throw error;
  }
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Applies a plan root by root. Before anything under an output root is written, every planned
 * path there must stay inside the root's boundary (`outputBoundary`); a violation fails that
 * root with `acf.apply.outside-root` and leaves it, including its sidecar, untouched while other
 * roots still apply. Changes whose files moved on since planning are skipped by `applyDiffs`,
 * and their stale sidecar entries are kept so the next plan proposes them again.
 *
 * Claude install roots apply in two phases: every change without a gate, then host
 * reconciliation through the `claude` CLI (the plugin files must exist before Claude installs
 * them), then the gated changes whose host state allows them. A held-back change keeps its sidecar
 * entry, so the next apply retries it, and the root's inventory is rebuilt from the sidecar.
 */
export async function applyEmitPlan(plan: EmitPlan): Promise<ApplySummary> {
  const results: ApplyResult[] = [];
  const diagnostics: Diagnostic[] = [];
  const blockedRoots = new Set<string>();
  for (const item of plan.diffs) {
    if (blockedRoots.has(item.installRoot)) continue;
    const violation = await containmentViolation(
      resolveDiffPath(item.installRoot, item.diff.path),
      outputBoundary(item, plan.cwd),
    );
    if (violation === null) continue;
    blockedRoots.add(item.installRoot);
    const label = item.destination === "canonical" ? "canonical skills" : item.targetId;
    diagnostics.push({
      severity: "error",
      code: "acf.apply.outside-root",
      message: `nothing applied for ${label} (${item.scopeRoot.scope} scope): ${violation}`,
      path: item.diff.path,
      targetId: item.targetId,
      data: { installRoot: item.installRoot },
    });
  }
  const skipped = new Set<string>();
  const applyItems = async (items: readonly EmittedDiff[]) => {
    for (const group of groupByApplyTarget(items)) {
      if (blockedRoots.has(group.installRoot)) continue;
      const result = await applyDiffs(group.diffs, {
        installRoot: group.installRoot,
        capabilityName: group.capabilityName,
        sidecarPath: path.join(group.installRoot, ".acf-managed.json"),
        owner: group.owner,
      });
      results.push(result);
      diagnostics.push(...result.diagnostics);
      for (const skippedPath of result.skipped) {
        const relative = relativeSidecarPath(group.installRoot, skippedPath);
        skipped.add(`${group.installRoot}\u0000${relative}\u0000${group.capabilityName}`);
      }
    }
  };
  await applyItems(plan.diffs.filter((item) => item.gate === undefined));

  const claudeRoots = plan.claude.filter((root) => !blockedRoots.has(root.installRoot));
  let claude: ClaudeReport | undefined;
  const heldBackRoots = new Set<string>();
  const holdBack = (item: EmittedDiff) => {
    heldBackRoots.add(item.installRoot);
    const relative = relativeSidecarPath(
      item.installRoot,
      resolveDiffPath(item.installRoot, item.diff.path),
    );
    skipped.add(`${item.installRoot}\u0000${relative}\u0000${item.capabilityName}`);
  };
  const { releases, renames } = plan.migration;
  if (claudeRoots.length > 0) {
    claude = await reconcileClaude(claudeRoots, plan.cwd);
    diagnostics.push(...claude.diagnostics);
    const report = claude;
    const open: EmittedDiff[] = [];
    for (const item of plan.diffs) {
      if (item.gate === undefined) continue;
      if (gateOpen(item.gate, report)) open.push(item);
      else holdBack(item);
    }
    await applyItems(open);
    // A drifted artifact stays on disk; its sidecar entry goes with the stale entries below.
    for (const release of releases) {
      if (gateOpen(release.gate, report)) diagnostics.push(driftedWarning(release));
      else holdBack(release.item);
    }
    const shown = renames.filter((rename) => gateOpen(rename.gate, report));
    await recordRenameNotices(shown);
    claude.renames = shown;
  } else {
    for (const release of releases) holdBack(release.item);
  }
  await removeStaleSidecarEntries(
    plan.staleEntries.filter(
      (entry) =>
        !blockedRoots.has(entry.installRoot) &&
        !skipped.has(`${entry.installRoot}\u0000${entry.path}\u0000${entry.capability}`),
    ),
  );
  // The planned inventory assumed every delete; list what a held-back change left in place.
  for (const installRoot of heldBackRoots) {
    const sidecarPath = path.join(installRoot, ".acf-managed.json");
    const notice = await rootNoticeDiffFromSidecar(
      installRoot,
      await readSidecar(sidecarPath),
      diskReadOnlyFs(),
    );
    if (!fileDiffChanged(notice)) continue;
    const result = await applyDiffs([notice], {
      installRoot,
      capabilityName: ACF_SYSTEM_OWNER,
      sidecarPath,
      owner: { target: "claude", carrier: "loose" },
    });
    results.push(result);
    diagnostics.push(...result.diagnostics);
  }
  await recordClaudeMarketplaces(claudeRoots);
  return { results, diagnostics, claude };
}

/**
 * The declared output boundary of a plan item's target and scope: the canonical skills root,
 * or the target's install root plus its skills root and MCP file where those lie outside it
 * (Claude's project `.mcp.json` sits beside `.claude/`).
 */
export function outputBoundary(
  context: Pick<EmittedDiff, "scopeRoot" | "targetId" | "destination" | "installRoot">,
  cwd: string,
): OutputBoundary {
  if (context.destination === "canonical") {
    return { roots: [context.scopeRoot.agentsDir], files: [] };
  }
  const root = context.installRoot;
  const roots = [root];
  const skillsRoot = targetMap[context.targetId]?.skillInstallPaths?.[context.scopeRoot.scope];
  if (skillsRoot !== undefined && skillsRoot !== null) {
    const resolved = path.resolve(cwd, skillsRoot);
    if (!isInsideOrEqual(resolved, root)) roots.push(resolved);
  }
  const layoutMcp = layoutFor(context.targetId, root, context.scopeRoot.scope).mcpFile;
  const mcpFile = layoutMcp === undefined ? undefined : path.resolve(cwd, layoutMcp);
  return { roots, files: mcpFile === undefined || isInsideOrEqual(mcpFile, root) ? [] : [mcpFile] };
}

function isInsideOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function sidecarOwner(
  context: Pick<EmittedDiff, "targetId" | "destination" | "carrier">,
): SidecarOwner {
  return {
    target: context.destination === "canonical" ? "canonical" : context.targetId,
    carrier: context.carrier,
  };
}

async function removeStaleSidecarEntries(stale: readonly StaleSidecarEntry[]): Promise<void> {
  const byRoot = new Map<string, StaleSidecarEntry[]>();
  for (const entry of stale) {
    const bucket = byRoot.get(entry.installRoot) ?? [];
    bucket.push(entry);
    byRoot.set(entry.installRoot, bucket);
  }
  for (const [installRoot, removals] of byRoot) {
    const sidecarPath = path.join(installRoot, ".acf-managed.json");
    const sidecar = await readSidecar(sidecarPath);
    const before = sidecar.managed.length;
    const removed = new Set(removals.map(staleIdentity));
    sidecar.managed = sidecar.managed.filter((entry) => !removed.has(staleIdentity(entry)));
    if (sidecar.managed.length !== before) {
      await writeSidecar(sidecarPath, sidecar, removals[0]?.owner);
    }
  }
}

function staleIdentity(entry: Pick<ManagedEntry, "path" | "capability" | "owns">): string {
  const owns = entry.owns.map(ownershipKey).sort().join("|");
  return `${entry.path}\u0000${entry.capability}\u0000${owns}`;
}

function isCanonicalSkillPath(filePath: string, scopeRoot: ScopeRoot): boolean {
  const root = path.resolve(scopeRoot.agentsDir, "skills");
  const candidate = path.resolve(filePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function capabilitySummary(
  capability: AcfCapability,
  targets: readonly TargetId[],
): unknown {
  return {
    name: capability.manifest.name,
    version: capability.manifest.version,
    synthesized: capability.synthesized === true,
    scope: capability.scope,
    root: capability.root,
    facets: {
      skills: capability.skills.map((facet) => facet.name),
      agents: capability.agents.map((facet) => facet.name),
      commands: capability.commands.map((facet) => facet.name),
      instructions: capability.instructions.map((facet) => facet.name),
      hooks: Object.keys(capability.hooks?.buckets ?? {}),
      mcp: capability.mcp?.servers.map((server) => server.name) ?? [],
    },
    applicability: Object.fromEntries(
      targets.map((targetId) => [targetId, applyApplicability(capability, targetId) !== null]),
    ),
    diagnostics: capability.diagnostics,
  };
}

export function targetSelection(args: Record<string, unknown>, config: CapletConfig): TargetId[] {
  const requested = readOptionalString(args, "target");
  const values =
    requested === undefined ? (config.emit?.defaultTargets ?? [...targetIds]) : [requested];
  const out: TargetId[] = [];
  for (const value of values) {
    if (!targetIds.includes(value)) throw validationError(`unknown target: ${value}`);
    if (config.targets?.[value]?.disabled === true) continue;
    out.push(value);
  }
  return out;
}

export function installRootFor(
  targetId: TargetId,
  scopeRoot: ScopeRoot,
  config: CapletConfig,
  cwd: string,
): string | null {
  const configured = config.targets?.[targetId]?.out?.[scopeRoot.scope];
  const target = targetMap[targetId];
  const candidate = configured ?? target?.installPaths[scopeRoot.scope] ?? null;
  if (candidate === null) return null;
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function emitOptionsForTarget(
  targetId: TargetId,
  config: CapletConfig,
  canonicalSkillReaders: readonly TargetId[],
): EmitOptions {
  // Absent `targets.<t>.carrier` leaves the target's default carrier (`carriersOf`).
  const options: EmitOptions = { canonicalSkillReaders };
  const carrier = config.targets?.[targetId]?.carrier;
  if (carrier !== undefined) options.carrier = carrier;
  const skills = config.targets?.[targetId]?.skills;
  if (skills !== undefined) options.skills = skills;
  return options;
}

async function driftDiagnostics(installRoot: string): Promise<Diagnostic[]> {
  const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
  return detectDrift(sidecar, {
    readText(relativePath) {
      try {
        return readFileSync(path.resolve(installRoot, relativePath), "utf8");
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },
    readBytes(relativePath) {
      try {
        return readFileSync(path.resolve(installRoot, relativePath));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },
  });
}

function fileDiffChanged(diff: FileDiff): boolean {
  if (diff.beforeMode !== diff.afterMode) {
    const hasMode = diff.beforeMode !== undefined || diff.afterMode !== undefined;
    if (hasMode) return true;
  }
  return !contentEquals(diff.before, diff.after);
}

type ApplyGroup = {
  installRoot: string;
  capabilityName: string;
  owner: SidecarOwner;
  diffs: FileDiff[];
};

function groupByApplyTarget(items: readonly EmittedDiff[]): ApplyGroup[] {
  const groups = new Map<string, ApplyGroup>();
  for (const item of items) {
    // The owner is recorded on every entry a group writes, so it is part of the group key: the
    // reserved owner writes the loose inventory and the plugin-carrier marketplace in one root.
    const owner = sidecarOwner(item);
    const key = `${item.installRoot}\0${item.capabilityName}\0${owner.target}\0${owner.carrier}`;
    const group = groups.get(key) ?? {
      installRoot: item.installRoot,
      capabilityName: item.capabilityName,
      owner,
      diffs: [],
    };
    group.diffs.push(item.diff);
    groups.set(key, group);
  }
  const order = (group: ApplyGroup) =>
    `${group.installRoot}:${group.capabilityName}:${group.owner.target}:${group.owner.carrier}`;
  return [...groups.values()].sort((a, b) => order(a).localeCompare(order(b)));
}

export type Reach = {
  sources: Array<{ scope: string; source: string; capabilities: number }>;
  targets: Array<{ scope: string; destination: string; installRoot: string; files: number }>;
};

export type FootprintEntry = {
  scope: string;
  target: string;
  installRoot: string;
  path: string;
  kind: "dir" | "file" | "region";
  capability: string;
};

type ManagedRoot = {
  scope: string;
  destination: string;
  installRoot: string;
  entries: ManagedEntry[];
};

async function managedRoots(plan: EmitPlan): Promise<ManagedRoot[]> {
  const roots: ManagedRoot[] = [];
  const seen = new Set<string>();
  for (const scopeRoot of plan.scopes) {
    const candidates: Array<{ destination: string; installRoot: string }> = [
      { destination: "canonical", installRoot: scopeRoot.agentsDir },
    ];
    for (const targetId of targetIds) {
      const installRoot = installRootFor(targetId, scopeRoot, plan.config, process.cwd());
      if (installRoot !== null) candidates.push({ destination: targetId, installRoot });
    }
    for (const candidate of candidates) {
      const key = `${scopeRoot.scope}\u0000${candidate.destination}`;
      if (seen.has(key)) continue;
      const sidecar = await readSidecar(path.join(candidate.installRoot, ".acf-managed.json"));
      if (sidecar.managed.length === 0) continue;
      seen.add(key);
      roots.push({
        scope: scopeRoot.scope,
        destination: candidate.destination,
        installRoot: candidate.installRoot,
        entries: sidecar.managed,
      });
    }
  }
  return roots;
}

export async function collectReach(plan: EmitPlan): Promise<Reach> {
  const sources: Reach["sources"] = [];
  for (const scopeRoot of plan.scopes) {
    const lock = await readLockfile(scopeRoot.lockPath);
    for (const entry of lock?.entries ?? []) {
      sources.push({
        scope: scopeRoot.scope,
        source: entry.sourceId,
        capabilities: entry.capabilityNames.length,
      });
    }
  }
  const targets: Reach["targets"] = [];
  for (const root of await managedRoots(plan)) {
    targets.push({
      scope: root.scope,
      destination: root.destination,
      installRoot: root.installRoot,
      files: root.entries.length,
    });
  }
  return { sources, targets };
}

export async function collectFootprint(plan: EmitPlan): Promise<FootprintEntry[]> {
  const footprint: FootprintEntry[] = [];
  for (const root of await managedRoots(plan)) {
    const dirs = new Map<string, { capability: string; kind: "dir" }>();
    const files: Array<{ path: string; kind: "file" | "region"; capability: string }> = [];
    for (const entry of root.entries) {
      const facet = entry.facet;
      if (facet !== undefined && facet.family === "skill") {
        const dir = `skills/${facet.name}/`;
        if (!dirs.has(dir)) dirs.set(dir, { capability: entry.capability, kind: "dir" });
        continue;
      }
      const region = entry.owns.some((own) => own.kind !== "file");
      files.push({
        path: entry.path,
        kind: region ? "region" : "file",
        capability: entry.capability,
      });
    }
    for (const [dir, info] of [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      footprint.push({
        scope: root.scope,
        target: root.destination,
        installRoot: root.installRoot,
        path: dir,
        kind: info.kind,
        capability: info.capability,
      });
    }
    for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
      footprint.push({
        scope: root.scope,
        target: root.destination,
        installRoot: root.installRoot,
        path: file.path,
        kind: file.kind,
        capability: file.capability,
      });
    }
  }
  return footprint;
}
