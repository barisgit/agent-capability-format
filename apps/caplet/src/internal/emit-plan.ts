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
  type CapletConfig,
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
  resolveFacetCollisions,
  type ScopeRoot,
  type TargetAdapter,
  type TargetId,
  targetMap,
} from "@caplet/core";
import { inspectFileOwnership } from "../apply/apply-diffs.js";
import { isInsideOrEqual } from "../apply/containment.js";
import { detectDrift, diskDriftFs, readSidecar, sidecarPath } from "../apply/sidecar.js";
import { readCwd, readScope } from "./args.js";
import { gateClaudeChanges } from "./claude-gates.js";
import { planClaudeMarketplaces } from "./claude-marketplace.js";
import { type ClaudeRetention, planClaudeRetention } from "./claude-retention.js";
import { diskReadOnlyFs } from "./fs.js";
import { addManagementNotices } from "./managed-notices.js";
import { withholdConflictingMcpServers } from "./mcp-conflicts.js";
import { type PlanOverrides, plannedCapabilities } from "./planned-capabilities.js";
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
  type ScopedComponentOutcome,
} from "./workflow.js";

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
  const scopes = await resolveScopeRoots(readScope(args), cwd, configResult.diagnostics);
  const targets = targetSelection(args, config);
  const context: PlanContext = { cwd, config, targets, fs: diskReadOnlyFs() };
  const state: PlanState = {
    diagnostics: [...configResult.diagnostics],
    desiredDiffs: [],
    plugins: [],
    blocked: [],
    heldClaude: [],
    pluginlessClaude: [],
    keptOutput: new Set(),
    outcomes: new Map(),
    executables: [],
    canonicalDiffs: new Set(),
    resolvedFacets: new Map(),
  };
  const resolved = new Map<ScopeRoot, AcfCapability[]>();
  for (const scopeRoot of scopes) {
    resolved.set(scopeRoot, await plannedCapabilities(scopeRoot, state.diagnostics, opts));
  }
  const applicable = applicableAcrossScopes(resolved, context, state.diagnostics);
  for (const [scopeRoot, capabilities] of resolved) {
    await planScope(scopeRoot, capabilities, applicable, context, state);
  }

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
    held: state.heldClaude,
    pluginless: state.pluginlessClaude,
  });
  diagnostics.push(...claude.diagnostics);
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
  const ownershipChanges = await checkPlannedOwnership(desiredWithNotices, diagnostics);
  const diffs = [
    ...desiredWithNotices.filter(
      (item) =>
        ownershipChanges.has(item) ||
        fileDiffChanged(item.diff) ||
        sweep.forcedPaths.has(diffPathKey(item)),
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

/** Marks conflicts and keeps identical unowned files in the plan so apply records adoption. */
async function checkPlannedOwnership(
  desiredWithNotices: EmittedDiff[],
  diagnostics: Diagnostic[],
): Promise<Set<EmittedDiff>> {
  const ownershipChanges = new Set<EmittedDiff>();
  const ownershipSidecars = new Map<string, Awaited<ReturnType<typeof readSidecar>>>();
  for (const item of desiredWithNotices) {
    let sidecar = ownershipSidecars.get(item.installRoot);
    if (sidecar === undefined) {
      sidecar = await readSidecar(sidecarPath(item.installRoot));
      ownershipSidecars.set(item.installRoot, sidecar);
    }
    const ownership = await inspectFileOwnership(
      [item.diff],
      {
        installRoot: item.installRoot,
        sidecarPath: sidecarPath(item.installRoot),
        capabilityName: item.capabilityName,
      },
      sidecar,
    );
    diagnostics.push(...ownership.diagnostics);
    if (ownership.diagnostics.length > 0) item.conflict = true;
    if (item.conflict || ownership.adoptions.size > 0) ownershipChanges.add(item);
  }
  return ownershipChanges;
}

/**
 * Applies target filters before resolving identity across scopes; unsupported scopes contribute
 * no facets and therefore cannot shadow or collide with supported output. Emits the per-scope
 * selections, not the project-merged effective view: a project's shadowing is not user deselection.
 */
function applicableAcrossScopes(
  resolved: ReadonlyMap<ScopeRoot, AcfCapability[]>,
  { targets, config, cwd }: PlanContext,
  diagnostics: Diagnostic[],
): Map<TargetId, AcfCapability[]> {
  const applicable = new Map<TargetId, AcfCapability[]>();
  for (const targetId of targets) {
    const selected = resolveFacetCollisions(
      [...resolved].flatMap(([root, capabilities]) =>
        installRootFor(targetId, root, config, cwd) === null
          ? []
          : capabilities.flatMap((cap) => applyApplicability(cap, targetId) ?? []),
      ),
      targetId,
    );
    diagnostics.push(...selected.diagnostics);
    applicable.set(targetId, selected.scopedCapabilities);
  }
  return applicable;
}

/** What every step of one plan reads. */
type PlanContext = {
  cwd: string;
  config: CapletConfig;
  targets: readonly TargetId[];
  fs: ReadOnlyFs;
};

/** What planning collects across scopes before the sweep and the notices settle the plan. */
type PlanState = ClaudeRetention & {
  diagnostics: Diagnostic[];
  desiredDiffs: EmittedDiff[];
  plugins: PlannedPlugin[];
  blocked: BlockedCapability[];
  /** The first outcome per scope, capability, target, family and component. */
  outcomes: Map<string, ScopedComponentOutcome>;
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
  capabilities: AcfCapability[],
  applicableCapabilities: ReadonlyMap<TargetId, AcfCapability[]>,
  context: PlanContext,
  state: PlanState,
): Promise<void> {
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
  const applicable = await applicableByTarget(scopeRoot, applicableCapabilities, context);
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
      await planCapability(
        scope,
        targetId,
        target.installRoot,
        emitted.get(capability.manifest.name),
      );
    }
  }
}

/**
 * Each target's applicable capabilities at the scope, conflicting MCP servers withheld; a target
 * without an install root at the scope is absent.
 */
async function applicableByTarget(
  scopeRoot: ScopeRoot,
  capabilities: ReadonlyMap<TargetId, AcfCapability[]>,
  context: PlanContext,
): Promise<Map<TargetId, ApplicableCapabilities>> {
  const applicable = new Map<TargetId, ApplicableCapabilities>();
  for (const targetId of context.targets) {
    const installRoot = installRootFor(targetId, scopeRoot, context.config, context.cwd);
    if (installRoot === null) continue;
    const withheld = await withholdConflictingMcpServers(
      (capabilities.get(targetId) ?? []).filter(
        (capability) => capability.scope === scopeRoot.scope,
      ),
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
 * refusal blocks it there, the output it keeps. `filtered` is the effective capability after
 * applicability, shadowing and MCP withholding, absent when nothing of it applies to the target.
 */
async function planCapability(
  scope: ScopePlanning,
  targetId: TargetId,
  installRoot: string,
  filtered: AcfCapability | undefined,
): Promise<void> {
  const { scopeRoot, context, state } = scope;
  if (filtered === undefined) return;
  const capabilityExecutables = await executableComponents(
    filtered,
    targetId,
    context.config.targets?.[targetId]?.carrier,
  );
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
  if (targetId === "claude") {
    planClaudeRetention(state, scopeRoot.scope, installRoot, filtered, result);
  }
}

/** Records the capability's component outcomes on the target, keeping each scope distinct. */
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
    const key = `${capability.scope}\u0000${outcome.capability}\u0000${outcome.target}\u0000${outcome.family}\u0000${outcome.component}`;
    if (!state.outcomes.has(key)) state.outcomes.set(key, { ...outcome, scope: capability.scope });
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
