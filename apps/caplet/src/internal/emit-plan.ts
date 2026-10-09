/**
 * The planning stage of the caplet workflow: turning the installed capabilities of the selected
 * scopes and targets into an {@link EmitPlan} ({@link buildEmitPlan}).
 */
// Registers every target's adapter in `targetMap`, where planning looks writers up.
import "@caplet/adapters";
import path from "node:path";
import {
  type AcfCapability,
  applyApplicability,
  type CapabilityEntry,
  type CapletConfig,
  type ComponentOutcome,
  capabilityBlocked,
  componentOutcomes,
  type Diagnostic,
  type EmitInput,
  type EmitOptions,
  type EmitResult,
  type ExecutableComponent,
  executableComponents,
  type ReadOnlyFs,
  readCapletConfig,
  resolveScopeCapabilities,
  type ScopeRoot,
  type TargetAdapter,
  type TargetId,
  targetMap,
} from "@caplet/core";
import {
  type CapabilitiesLock,
  detectLockDrift,
  entrySourceId,
  readCapabilitiesYml,
  readLockfile,
  sourceString,
} from "@caplet/installer";
import { isInsideOrEqual } from "../apply/containment.js";
import { detectDrift, diskDriftFs, readSidecar, sidecarPath } from "../apply/sidecar.js";
import { readCwd, readScope } from "./args.js";
import { gateClaudeChanges } from "./claude-gates.js";
import { planClaudeMarketplaces } from "./claude-marketplace.js";
import { diskReadOnlyFs } from "./fs.js";
import { addManagementNotices } from "./managed-notices.js";
import { anchorPathSource } from "./manifest.js";
import { withholdConflictingMcpServers } from "./mcp-conflicts.js";
import { resolveScopeRoots } from "./scopes.js";
import {
  capabilityFacetKeys,
  diffPathKey,
  type ScopeFacets,
  sweepStaleSidecarEntries,
} from "./stale-sweep.js";
import { targetSelection } from "./target-selection.js";
import {
  type BlockedCapability,
  type EmitPlan,
  type EmittedDiff,
  fileDiffChanged,
  installRootFor,
  type PlannedPlugin,
} from "./workflow.js";

/** A resolution to plan against instead of the one on disk, keyed by scope (previews). */
type PlanOverrides = {
  locks?: ReadonlyMap<string, CapabilitiesLock>;
  /** Per-scope snapshot directories standing in for `capabilitiesDir`. */
  capabilitiesDirs?: ReadonlyMap<string, string>;
};

/**
 * Plans the selected scopes and targets (IMPLEMENTATION.md §12), after changing the process cwd
 * to `--cwd`: resolves each scope's capabilities and emits each applicable one through its
 * target's writer, then plans the Claude marketplaces, sweeps the sidecar entries the plan no
 * longer wants, adds the management notices, gates changes that wait on the Claude host, and
 * plans the migration of loose Claude output. Only changed files (and paths the sweep forces)
 * remain in `diffs`.
 */
export async function buildEmitPlan(
  args: Record<string, unknown>,
  opts?: PlanOverrides,
): Promise<EmitPlan> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const configResult = await readCapletConfig(cwd);
  const config = configResult.config;
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const targets = targetSelection(args, config);
  const context: PlanContext = { cwd, config, targets, fs: diskReadOnlyFs() };
  const state: PlanState = {
    diagnostics: [...configResult.diagnostics],
    desiredDiffs: [],
    plugins: [],
    blocked: [],
    keptOutput: new Set(),
    outcomes: new Map(),
    executables: [],
    canonicalDiffs: new Set(),
    resolvedFacets: new Map(),
  };
  for (const scopeRoot of scopes) await planScope(scopeRoot, context, state, opts);

  const { diagnostics, desiredDiffs, plugins, blocked } = state;
  const claude = await planClaudeMarketplaces({
    roots: targets.includes("claude")
      ? scopes.flatMap((scopeRoot) => {
          const installRoot = installRootFor("claude", scopeRoot, config, cwd);
          return installRoot === null ? [] : [{ scopeRoot, installRoot }];
        })
      : [],
    plugins,
    blocked,
  });
  desiredDiffs.push(...claude.diffs);
  const sweep = await sweepStaleSidecarEntries({
    scopes,
    targets,
    config,
    cwd,
    desired: desiredDiffs,
    resolvedFacets: state.resolvedFacets,
    keptOutput: state.keptOutput,
    claudeRoots: claude.roots,
  });
  diagnostics.push(...sweep.diagnostics);
  const desiredWithNotices = await addManagementNotices(desiredDiffs, context.fs, diagnostics, {
    staleByRoot: sweep.staleByRoot,
    rootContexts: sweep.rootContexts,
  });
  const diffs = [
    ...desiredWithNotices.filter(
      (item) => fileDiffChanged(item.diff) || sweep.forcedPaths.has(diffPathKey(item)),
    ),
    ...sweep.deletes.filter((item) => fileDiffChanged(item.diff)),
  ];
  const migration = gateClaudeChanges(diffs, claude.roots);
  return {
    cwd,
    config,
    scopes,
    targets,
    diagnostics,
    diffs: migration.diffs,
    migration: migration.migration,
    plugins,
    claude: claude.roots,
    staleEntries: sweep.staleEntries,
    blocked,
    outcomes: [...state.outcomes.values()],
    executables: state.executables,
  };
}

/** What every step of one plan reads. */
type PlanContext = {
  cwd: string;
  config: CapletConfig;
  targets: readonly TargetId[];
  fs: ReadOnlyFs;
};

/** What planning collects across scopes before the sweep and the notices settle the plan. */
type PlanState = {
  diagnostics: Diagnostic[];
  desiredDiffs: EmittedDiff[];
  plugins: PlannedPlugin[];
  blocked: BlockedCapability[];
  /** `<install root>\0<capability>` pairs whose sidecar entries a blocked capability keeps. */
  keptOutput: Set<string>;
  /** The first outcome per capability, target, family and component. */
  outcomes: Map<string, ComponentOutcome>;
  executables: ExecutableComponent[];
  /** `<scope>\0<capability>\0<path>` of the canonical skill files already planned. */
  canonicalDiffs: Set<string>;
  /** {@link ScopeFacets} by scope. */
  resolvedFacets: Map<string, ScopeFacets>;
};

/** What a writer reports for one capability: its validation and emit results. */
type CapabilityEmission = { validation: Diagnostic[]; result: EmitResult };

/** Emits a capability through one target's writer, given the shared-root readers it blocks. */
type Emitter = (
  targetId: TargetId,
  adapter: TargetAdapter,
  capability: AcfCapability,
  installRoot: string,
  blockedSkillReaders: readonly TargetId[],
) => Promise<CapabilityEmission>;

/** A target's capabilities at one scope after applicability, with what filtering reported. */
type ApplicableCapabilities = {
  installRoot: string;
  capabilities: AcfCapability[];
  diagnostics: Diagnostic[];
};

/** What planning one scope's targets shares. */
type ScopePlanning = {
  scopeRoot: ScopeRoot;
  context: PlanContext;
  state: PlanState;
  canonicalSkillReaders: readonly TargetId[];
  /** The shared-root readers a refusal blocks, by capability name. */
  blockedReaders: ReadonlyMap<string, readonly TargetId[]>;
  emit: Emitter;
};

async function planScope(
  scopeRoot: ScopeRoot,
  context: PlanContext,
  state: PlanState,
  overrides: PlanOverrides | undefined,
): Promise<void> {
  const capabilities = await plannedCapabilities(scopeRoot, state.diagnostics, overrides);
  state.resolvedFacets.set(
    scopeRoot.scope,
    new Map(
      capabilities.map((capability) => [capability.manifest.name, capabilityFacetKeys(capability)]),
    ),
  );
  state.diagnostics.push(...(await driftDiagnostics(scopeRoot.agentsDir)));
  const canonicalSkillReaders = context.targets.filter(
    (targetId) =>
      targetMap[targetId]?.discoversCanonicalSkills === true &&
      installRootFor(targetId, scopeRoot, context.config, context.cwd) !== null,
  );
  const applicable = await applicableByTarget(scopeRoot, capabilities, context);
  const emit = memoizedEmitter(scopeRoot, context, canonicalSkillReaders);
  const scope: ScopePlanning = {
    scopeRoot,
    context,
    state,
    canonicalSkillReaders,
    blockedReaders: await blockedSkillReaders(canonicalSkillReaders, applicable, emit),
    emit,
  };
  for (const targetId of context.targets) {
    const target = applicable.get(targetId);
    if (target === undefined) {
      state.diagnostics.push({
        severity: "lossy",
        code: "acf.adapter.scope-unsupported",
        message: `${targetId} does not support ${scopeRoot.scope} scope`,
        targetId,
      });
      continue;
    }
    state.diagnostics.push(...(await driftDiagnostics(target.installRoot)));
    state.diagnostics.push(...target.diagnostics);
    const emitted = new Map(
      target.capabilities.map((capability) => [capability.manifest.name, capability]),
    );
    for (const capability of capabilities) {
      await planCapability(scope, targetId, target.installRoot, {
        capability,
        filtered: emitted.get(capability.manifest.name),
      });
    }
  }
}

/**
 * The capabilities planned for one scope, adding to `diagnostics` the scope's manifest, lock-drift
 * and discovery diagnostics and each planned capability's own diagnostics.
 */
async function plannedCapabilities(
  scopeRoot: ScopeRoot,
  diagnostics: Diagnostic[],
  overrides: PlanOverrides | undefined,
): Promise<AcfCapability[]> {
  const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
  diagnostics.push(...manifest.diagnostics);
  const diskLock = await readLockfile(scopeRoot.lockPath);
  const lock = overrides?.locks?.get(scopeRoot.scope) ?? diskLock;
  // Sources are relative to the manifest directory, not the process cwd.
  const manifestDir = path.dirname(scopeRoot.manifestPath);
  const anchoredManifest = {
    ...manifest.value,
    capabilities: manifest.value.capabilities.map((entry) => anchorPathSource(entry, manifestDir)),
  };
  diagnostics.push(...detectLockDrift(anchoredManifest, lock));
  const capabilitiesDir = overrides?.capabilitiesDirs?.get(scopeRoot.scope);
  const resolved = await resolveScopeCapabilities(
    capabilitiesDir === undefined ? scopeRoot : { ...scopeRoot, capabilitiesDir },
    { lock },
  );
  diagnostics.push(...resolved.diagnostics);
  const capabilities =
    lock === null
      ? resolved.capabilities
      : resolved.capabilities.filter(
          manifestSelects(manifest.value.capabilities, manifestDir, lock, diskLock ?? lock),
        );
  // Each planned capability's own diagnostics reach the plan (SPEC.md §14.2): its errors gate
  // apply and its warnings are shown. Discovery diagnostics are the same objects on the scope
  // and on every capability it found, so each object is reported once.
  const reported = new Set(diagnostics);
  for (const capability of capabilities) {
    for (const item of capability.diagnostics) {
      if (reported.has(item)) continue;
      reported.add(item);
      diagnostics.push(item);
    }
  }
  return capabilities;
}

/**
 * Whether the manifest still selects a resolved capability: the source of a `lock` entry naming
 * it is listed in the manifest (in any form of its source id), or no entry of `installedLock` names
 * it. A capability whose source left the manifest is not planned, so the sweep removes its output.
 */
function manifestSelects(
  entries: readonly CapabilityEntry[],
  manifestDir: string,
  lock: CapabilitiesLock,
  installedLock: CapabilitiesLock,
): (capability: AcfCapability) => boolean {
  const manifestSources = new Set(
    entries.flatMap((entry) => [
      entrySourceId(entry),
      entrySourceId(entry, manifestDir),
      sourceString(entry.source),
      sourceString(entry.source, manifestDir),
    ]),
  );
  const selected = new Set(
    lock.entries
      .filter((entry) => manifestSources.has(entry.sourceId))
      .flatMap((entry) => entry.capabilityNames),
  );
  const lockedNames = new Set(installedLock.entries.flatMap((entry) => entry.capabilityNames));
  return (capability) =>
    selected.has(capability.manifest.name) || !lockedNames.has(capability.manifest.name);
}

/**
 * Each target's applicable capabilities at the scope, conflicting MCP servers withheld; a target
 * without an install root at the scope is absent.
 */
async function applicableByTarget(
  scopeRoot: ScopeRoot,
  capabilities: readonly AcfCapability[],
  context: PlanContext,
): Promise<Map<TargetId, ApplicableCapabilities>> {
  const applicable = new Map<TargetId, ApplicableCapabilities>();
  for (const targetId of context.targets) {
    const installRoot = installRootFor(targetId, scopeRoot, context.config, context.cwd);
    if (installRoot === null) continue;
    const withheld = await withholdConflictingMcpServers(
      capabilities.flatMap((capability) => applyApplicability(capability, targetId) ?? []),
      {
        target: targetId,
        scope: scopeRoot.scope,
        installRoot,
        carrier: context.config.targets?.[targetId]?.carrier,
        fs: context.fs,
      },
    );
    applicable.set(targetId, { installRoot, ...withheld });
  }
  return applicable;
}

/**
 * An {@link Emitter} that emits each target, capability and set of blocked shared-root readers
 * once, so a writer that has to learn about blocked readers re-emits while every other writer
 * emits once.
 */
function memoizedEmitter(
  scopeRoot: ScopeRoot,
  context: PlanContext,
  canonicalSkillReaders: readonly TargetId[],
): Emitter {
  const emissions = new Map<string, Promise<CapabilityEmission>>();
  return (targetId, adapter, capability, installRoot, blockedSkillReaders) => {
    const key = [targetId, capability.manifest.name, ...blockedSkillReaders].join("\0");
    let emission = emissions.get(key);
    if (emission === undefined) {
      emission = emitCapability(adapter, context.fs, {
        capability,
        scope: scopeRoot.scope,
        installRoot,
        options: emitOptionsForTarget(
          targetId,
          context.config,
          canonicalSkillReaders,
          blockedSkillReaders,
        ),
      });
      emissions.set(key, emission);
    }
    return emission;
  };
}

/**
 * The shared-root readers a refusal blocks, by capability. Such a refusal keeps the capability off
 * the shared skills root for every writer: each writer sees only the components that apply to its
 * own target, so it cannot tell that another reader refuses one.
 */
async function blockedSkillReaders(
  canonicalSkillReaders: readonly TargetId[],
  applicable: ReadonlyMap<TargetId, ApplicableCapabilities>,
  emit: Emitter,
): Promise<Map<string, TargetId[]>> {
  const blockedReaders = new Map<string, TargetId[]>();
  for (const reader of canonicalSkillReaders) {
    const adapter = targetMap[reader]?.adapter;
    const target = applicable.get(reader);
    if (adapter === undefined || target === undefined) continue;
    for (const capability of target.capabilities) {
      const { validation, result } = await emit(
        reader,
        adapter,
        capability,
        target.installRoot,
        [],
      );
      if (!capabilityBlocked([...validation, ...result.diagnostics], reader)) continue;
      const name = capability.manifest.name;
      blockedReaders.set(name, [...(blockedReaders.get(name) ?? []), reader]);
    }
  }
  return blockedReaders;
}

/**
 * Plans one resolved capability on one target: its executables, outcomes and diffs, or, when a
 * refusal blocks it there, the output it keeps. `filtered` is the capability after applicability
 * and MCP withholding, absent when nothing of it applies to the target.
 */
async function planCapability(
  scope: ScopePlanning,
  targetId: TargetId,
  installRoot: string,
  { capability, filtered }: { capability: AcfCapability; filtered: AcfCapability | undefined },
): Promise<void> {
  const { scopeRoot, context, state } = scope;
  const capabilityExecutables = await executableComponents(
    capability,
    targetId,
    context.config.targets?.[targetId]?.carrier,
  );
  if (filtered === undefined) {
    state.executables.push(...capabilityExecutables);
    return;
  }
  const adapter = targetMap[targetId]?.adapter;
  if (adapter === undefined) {
    state.diagnostics.push({
      severity: "lossy",
      code: "acf.adapter.not-registered",
      message: `adapter not registered for target ${targetId}`,
      targetId,
    });
    state.executables.push(...capabilityExecutables);
    return;
  }
  const name = filtered.manifest.name;
  const { validation, result } = await scope.emit(
    targetId,
    adapter,
    filtered,
    installRoot,
    scope.blockedReaders.get(name) ?? [],
  );
  state.diagnostics.push(...validation, ...result.diagnostics);
  recordOutcomes(state, filtered, targetId, { validation, result });
  if (capabilityBlocked([...validation, ...result.diagnostics], targetId)) {
    state.blocked.push({ scope: scopeRoot.scope, target: targetId, capability: name });
    state.keptOutput.add(`${installRoot}\u0000${name}`);
    // The shared skills root is this target's output too.
    if (scope.canonicalSkillReaders.includes(targetId)) {
      state.keptOutput.add(`${scopeRoot.agentsDir}\u0000${name}`);
    }
    return;
  }
  state.executables.push(...capabilityExecutables);
  planDiffs(scope, targetId, installRoot, name, result);
}

/** Records the capability's component outcomes on the target, keeping the first of each. */
function recordOutcomes(
  state: PlanState,
  capability: AcfCapability,
  targetId: TargetId,
  { validation, result }: CapabilityEmission,
): void {
  for (const outcome of componentOutcomes({
    capability,
    target: targetId,
    diagnostics: [...capability.diagnostics, ...validation, ...result.diagnostics],
    reported: result.outcomes,
  })) {
    const key = `${outcome.capability}\u0000${outcome.target}\u0000${outcome.family}\u0000${outcome.component}`;
    if (!state.outcomes.has(key)) state.outcomes.set(key, outcome);
  }
}

/**
 * Adds a writer's plugins and diffs to the plan. A file under the shared skills root is planned
 * once per scope and capability, by the first of its readers.
 */
function planDiffs(
  scope: ScopePlanning,
  targetId: TargetId,
  installRoot: string,
  name: string,
  result: EmitResult,
): void {
  const { scopeRoot, state } = scope;
  const pluginDirs = new Set<string>();
  for (const plugin of result.plugins ?? []) {
    state.plugins.push({ ...plugin, scopeRoot, installRoot });
    pluginDirs.add(plugin.dir);
  }
  for (const diff of result.diffs) {
    const canonical = isInsideOrEqual(diff.path, path.join(scopeRoot.agentsDir, "skills"));
    if (canonical) {
      // Every reader of the shared skills root emits the same files.
      const key = `${scopeRoot.scope}\0${name}\0${path.resolve(diff.path)}`;
      if (state.canonicalDiffs.has(key)) continue;
      state.canonicalDiffs.add(key);
    }
    state.desiredDiffs.push({
      scopeRoot,
      targetId,
      destination: canonical ? "canonical" : "native",
      installRoot: canonical ? scopeRoot.agentsDir : installRoot,
      capabilityName: name,
      carrier:
        diff.artifactRoot !== undefined && pluginDirs.has(diff.artifactRoot) ? "plugin" : "loose",
      diff,
    });
  }
}

function emitOptionsForTarget(
  targetId: TargetId,
  config: CapletConfig,
  canonicalSkillReaders: readonly TargetId[],
  blockedSkillReaders: readonly TargetId[],
): EmitOptions {
  // Absent `targets.<t>.carrier` leaves the target's default carrier (`carriersOf`).
  const options: EmitOptions = { canonicalSkillReaders };
  if (blockedSkillReaders.length > 0) options.blockedSkillReaders = blockedSkillReaders;
  const carrier = config.targets?.[targetId]?.carrier;
  if (carrier !== undefined) options.carrier = carrier;
  const skills = config.targets?.[targetId]?.skills;
  if (skills !== undefined) options.skills = skills;
  return options;
}

async function emitCapability(
  adapter: TargetAdapter,
  fs: ReadOnlyFs,
  input: EmitInput,
): Promise<CapabilityEmission> {
  const validation = adapter.validate === undefined ? [] : await adapter.validate(input);
  return { validation, result: await adapter.emit(input, fs) };
}

/** `acf.emit.drift` notes for the managed regions under `installRoot` changed since apply. */
async function driftDiagnostics(installRoot: string): Promise<Diagnostic[]> {
  const sidecar = await readSidecar(sidecarPath(installRoot));
  return detectDrift(sidecar, diskDriftFs(installRoot));
}
