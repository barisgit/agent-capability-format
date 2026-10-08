import "@caplet/adapters";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type AcfCapability,
  applyApplicability,
  type CapletConfig,
  type Diagnostic,
  type EmitOptions,
  type FileDiff,
  readCapletConfig,
  resolveScopeCapabilities,
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
import { type ApplyResult, applyDiffs, resolveDiffPath } from "../apply/apply-diffs.js";
import {
  detectDrift,
  hashOwnedRegions,
  type ManagedEntry,
  readSidecar,
  relativeSidecarPath,
  writeSidecar,
} from "../apply/sidecar.js";
import { type FetchMode, readCwd, readOptionalString, readScope, validationError } from "./args.js";
import { diskReadOnlyFs } from "./fs.js";
import { addManagementNotices } from "./managed-notices.js";
import { anchorPathSource } from "./manifest.js";
import { resolveScopeRoots } from "./scopes.js";

export type EmittedDiff = {
  scopeRoot: ScopeRoot;
  targetId: TargetId;
  destination: "canonical" | "native";
  installRoot: string;
  capabilityName: string;
  diff: FileDiff;
};

export type StaleSidecarEntry = { installRoot: string; path: string; capability: string };

export type EmitPlan = {
  config: CapletConfig;
  scopes: ScopeRoot[];
  targets: TargetId[];
  diagnostics: Diagnostic[];
  diffs: EmittedDiff[];
  staleEntries: StaleSidecarEntry[];
};

export type ApplySummary = { results: ApplyResult[]; diagnostics: Diagnostic[] };

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
  opts?: { locks?: ReadonlyMap<string, CapabilitiesLock> },
): Promise<EmitPlan> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const configResult = await readCapletConfig(cwd);
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const targets = targetSelection(args, configResult.config);
  const diagnostics: Diagnostic[] = [...configResult.diagnostics];
  const desiredDiffs: EmittedDiff[] = [];
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
    const resolved = await resolveScopeCapabilities(scopeRoot);
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
      for (const capability of resolved.capabilities) {
        const filtered = applyApplicability(capability, targetId);
        if (filtered === null) continue;
        const adapter = targetMap[targetId]?.adapter;
        if (adapter === undefined) {
          diagnostics.push({
            severity: "lossy",
            code: "acf.adapter.not-registered",
            message: `adapter not registered for target ${targetId}`,
            targetId,
          });
          continue;
        }
        const input = {
          capability: filtered,
          scope: scopeRoot.scope,
          installRoot,
          options: emitOptionsForTarget(targetId, configResult.config),
        };
        if (adapter.validate !== undefined) diagnostics.push(...(await adapter.validate(input)));
        const result = await adapter.emit(input, fs);
        diagnostics.push(...result.diagnostics);
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
            diff,
          });
        }
      }
    }
  }
  const sweep = await sweepStaleSidecarEntries(
    scopes,
    targets,
    configResult.config,
    cwd,
    desiredDiffs,
    resolvedNames,
    resolvedFacets,
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
  return {
    config: configResult.config,
    scopes,
    targets,
    diagnostics,
    diffs,
    staleEntries: sweep.staleEntries,
  };
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

async function sweepStaleSidecarEntries(
  scopes: readonly ScopeRoot[],
  targets: readonly TargetId[],
  config: CapletConfig,
  cwd: string,
  desired: readonly EmittedDiff[],
  resolvedNames: ReadonlyMap<string, ReadonlySet<string>>,
  resolvedFacets: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
): Promise<SweepResult> {
  const desiredKeys = new Set<string>();
  const desiredPaths = new Set<string>();
  for (const item of desired) {
    const key = diffPathKey(item);
    desiredPaths.add(key);
    desiredKeys.add(`${key}\u0000${item.capabilityName}`);
  }
  const deletes: EmittedDiff[] = [];
  const forcedPaths = new Set<string>();
  const staleByRoot = new Map<string, Set<string>>();
  const staleEntries: StaleSidecarEntry[] = [];
  const rootContexts = new Map<string, RootContext>();
  const addStale = (installRoot: string, entry: ManagedEntry): void => {
    const bucket = staleByRoot.get(installRoot) ?? new Set<string>();
    bucket.add(`${entry.capability}\u0000${entry.path}`);
    staleByRoot.set(installRoot, bucket);
  };
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
      rootContexts.set(candidate.installRoot, {
        scopeRoot,
        targetId: candidate.targetId,
        destination: candidate.destination,
      });
      const sidecar = await readSidecar(path.join(candidate.installRoot, ".acf-managed.json"));
      for (const entry of sidecar.managed) {
        if (entry.capability === ACF_SYSTEM_OWNER) continue;
        const pathKey = `${candidate.installRoot}\u0000${entry.path}`;
        const wholeFile = entry.owns.some((own) => own.kind === "file");
        if (desiredKeys.has(`${pathKey}\u0000${entry.capability}`)) {
          // Entry is still desired. If the recorded hash no longer matches the
          // owned regions on disk (stale sidecar metadata), force-apply so the
          // sidecar heals even when the file bytes are already up to date.
          const absolutePath = path.resolve(candidate.installRoot, entry.path);
          const current = wholeFile ? readBytesOrNull(absolutePath) : readTextOrNull(absolutePath);
          if (hashOwnedRegions(current, entry.owns) !== entry.hash) forcedPaths.add(pathKey);
          continue;
        }
        if (desiredPaths.has(pathKey) && wholeFile) {
          forcedPaths.add(pathKey);
          addStale(candidate.installRoot, entry);
          staleEntries.push({
            installRoot: candidate.installRoot,
            path: entry.path,
            capability: entry.capability,
          });
          continue;
        }
        if (names.has(entry.capability) && facetStillExists(entry, resolvedFacets, scopeRoot)) {
          continue;
        }
        const absolutePath = path.resolve(candidate.installRoot, entry.path);
        const before = wholeFile ? readBytesOrNull(absolutePath) : readTextOrNull(absolutePath);
        const diff: FileDiff = {
          path: absolutePath,
          before,
          after: null,
          owns: entry.owns,
        };
        if (entry.facet !== undefined) diff.facet = entry.facet;
        deletes.push({
          scopeRoot,
          targetId: candidate.targetId,
          destination: candidate.destination,
          installRoot: candidate.installRoot,
          capabilityName: entry.capability,
          diff,
        });
        addStale(candidate.installRoot, entry);
        staleEntries.push({
          installRoot: candidate.installRoot,
          path: entry.path,
          capability: entry.capability,
        });
      }
    }
  }
  return { deletes, forcedPaths, staleByRoot, staleEntries, rootContexts };
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

export async function applyEmitPlan(plan: EmitPlan): Promise<ApplySummary> {
  const results: ApplyResult[] = [];
  for (const group of groupByApplyTarget(plan.diffs)) {
    const result = await applyDiffs(group.diffs, {
      installRoot: group.installRoot,
      capabilityName: group.capabilityName,
      sidecarPath: path.join(group.installRoot, ".acf-managed.json"),
    });
    results.push(result);
  }
  await removeStaleSidecarEntries(plan.staleEntries);
  return { results, diagnostics: plan.diagnostics };
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
    sidecar.managed = sidecar.managed.filter(
      (entry) =>
        !removals.some(
          (removal) => removal.path === entry.path && removal.capability === entry.capability,
        ),
    );
    if (sidecar.managed.length !== before) await writeSidecar(sidecarPath, sidecar);
  }
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

function emitOptionsForTarget(targetId: TargetId, config: CapletConfig): EmitOptions {
  const options: EmitOptions = {};
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
  const { before, after } = diff;
  if (before === null || after === null) return before !== after;
  if (typeof before === "string" || typeof after === "string") return before !== after;
  return before.length !== after.length || before.some((byte, index) => byte !== after[index]);
}

type ApplyGroup = { installRoot: string; capabilityName: string; diffs: FileDiff[] };

function groupByApplyTarget(items: readonly EmittedDiff[]): ApplyGroup[] {
  const groups = new Map<string, ApplyGroup>();
  for (const item of items) {
    const key = `${item.installRoot}\0${item.capabilityName}`;
    const group = groups.get(key) ?? {
      installRoot: item.installRoot,
      capabilityName: item.capabilityName,
      diffs: [],
    };
    group.diffs.push(item.diff);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    `${a.installRoot}:${a.capabilityName}`.localeCompare(`${b.installRoot}:${b.capabilityName}`),
  );
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
