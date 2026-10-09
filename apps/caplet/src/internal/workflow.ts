/**
 * The emit plan: the data model that planning (`emit-plan.ts`), apply (`apply-plan.ts`),
 * `caplet remove` (`removal.ts`) and the Claude flows exchange, and the primitives over plan items
 * and managed output roots they share.
 */
import path from "node:path";
import { layoutFor } from "@caplet/adapters/common";
import {
  type AcfOwnership,
  type CapletConfig,
  type Carrier,
  type ComponentOutcome,
  type Diagnostic,
  type EmittedPlugin,
  type ExecutableComponent,
  type FileDiff,
  type Scope,
  type ScopeRoot,
  type TargetId,
  targetIds,
  targetMap,
} from "@caplet/core";
import { readLockfile } from "@caplet/installer";
import { type ApplyResult, contentEquals } from "../apply/apply-diffs.js";
import { isInsideOrEqual, type OutputBoundary } from "../apply/containment.js";
import {
  diskDriftFs,
  hashOwnedRegions,
  type ManagedEntry,
  readSidecar,
  removeOwnedRegionsFromText,
  SIDECAR_FILENAME,
  type SidecarOwner,
} from "../apply/sidecar.js";
import { type ClaudeGate, claudeGate } from "./claude-gates.js";
import type { ClaudeReport } from "./claude-host-flow.js";
import type { ClaudeRootPlan } from "./claude-marketplace.js";
import type { ClaudeMigration } from "./claude-migration.js";
import { displayPath } from "./plan-view.js";

/** A planned file change with the scope, target, output root and capability it belongs to. */
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

/** Everything one plan holds for reporting and applying ({@link ApplicablePlan}). */
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
   * planned snapshots (or previews) exist; compare with `installedExecutables` through
   * `plannedExecutableChanges` (`fetch-scopes.ts`).
   */
  executables: ExecutableComponent[];
};

/** The parts of a plan `applyEmitPlan` carries out; `caplet remove` builds them without emitting. */
export type ApplicablePlan = Pick<
  EmitPlan,
  "cwd" | "diffs" | "claude" | "migration" | "staleEntries"
>;

/**
 * Outcome of applying a plan; `diagnostics` holds only what apply itself found. `claude` is the
 * host report of the plan's Claude install roots, absent when it has none.
 */
export type ApplySummary = {
  results: ApplyResult[];
  diagnostics: Diagnostic[];
  claude?: ClaudeReport | undefined;
};

/**
 * Who an output root's planned changes are attributed to: the canonical skills root is shared, so
 * its `targetId` is only the target its changes are reported under.
 */
export type RootContext = {
  scopeRoot: ScopeRoot;
  targetId: TargetId;
  destination: "canonical" | "native";
};

/** An output root of a scope with the context its changes are planned in. */
export type OutputRoot = { installRoot: string; context: RootContext };

/**
 * The output roots of `scopeRoot` for `targets`, in order: the canonical skills root, attributed
 * to the first target (`claude` when there is none), then each target's install root at that
 * scope. A target without an install root at the scope contributes none; a root two targets share
 * appears once per target.
 */
export function scopeOutputRoots(
  scopeRoot: ScopeRoot,
  targets: readonly TargetId[],
  config: CapletConfig,
  cwd: string,
): OutputRoot[] {
  const roots: OutputRoot[] = [
    {
      installRoot: scopeRoot.agentsDir,
      context: { scopeRoot, targetId: targets[0] ?? "claude", destination: "canonical" },
    },
  ];
  for (const targetId of targets) {
    const installRoot = installRootFor(targetId, scopeRoot, config, cwd);
    if (installRoot !== null) {
      roots.push({ installRoot, context: { scopeRoot, targetId, destination: "native" } });
    }
  }
  return roots;
}

/**
 * The directory `targetId` writes to at `scopeRoot`'s scope: `targets.<id>.out.<scope>` from
 * `caplet.yml`, else the target's default, resolved against `cwd`; `null` when the target has no
 * output at that scope.
 */
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

/** The sidecar owner of a plan item: its target, or `canonical`, and its carrier. */
export function sidecarOwner(
  context: Pick<EmittedDiff, "targetId" | "destination" | "carrier">,
): SidecarOwner {
  return {
    target: context.destination === "canonical" ? "canonical" : context.targetId,
    carrier: context.carrier,
  };
}

/** Whether applying `diff` changes its file: its content or its recorded mode differs. */
export function fileDiffChanged(diff: FileDiff): boolean {
  if (diff.beforeMode !== diff.afterMode) {
    const hasMode = diff.beforeMode !== undefined || diff.afterMode !== undefined;
    if (hasMode) return true;
  }
  return !contentEquals(diff.before, diff.after);
}

/**
 * Plans removing `owns`, regions of sidecar `entry` under `installRoot`, with the plan-time disk
 * content as its precondition. When the user edited those regions since caplet wrote them, the
 * removal is not planned and `kept` carries the `acf.apply.drift` warning instead; retiring loose
 * Claude output for a capability that became a plugin (a `registered` gate) is still planned,
 * flagged `drifted`, for the migration to release.
 */
export function plannedRemoval(input: {
  entry: ManagedEntry;
  owns: AcfOwnership[];
  installRoot: string;
  context: RootContext;
  claudeRoots: readonly ClaudeRootPlan[];
}): { removal: EmittedDiff } | { kept: Diagnostic } {
  const { entry, owns, installRoot } = input;
  const disk = diskDriftFs(installRoot);
  const before = owns.some((own) => own.kind === "file")
    ? disk.readBytes(entry.path)
    : disk.readText(entry.path);
  const diff: FileDiff = { path: path.resolve(installRoot, entry.path), before, after: null, owns };
  if (entry.facet !== undefined) diff.facet = entry.facet;
  const removal: EmittedDiff = {
    ...input.context,
    installRoot,
    capabilityName: entry.capability,
    carrier: entry.carrier ?? "loose",
    diff,
    drifted: removalChanges(before, owns) && ownedRegionsDrifted(before, entry),
  };
  if (removal.drifted && claudeGate(removal, input.claudeRoots)?.kind !== "registered") {
    return { kept: keptDriftedDiagnostic(removal) };
  }
  return { removal };
}

/**
 * Whether removing `owns` from `current` changes the file: false when the file or every owned
 * region is already gone, so there is nothing of the user's to keep.
 */
function removalChanges(current: FileDiff["before"], owns: readonly AcfOwnership[]): boolean {
  if (current === null) return false;
  if (owns.some((own) => own.kind === "file")) return true;
  if (typeof current !== "string") return true;
  try {
    return removeOwnedRegionsFromText(current, owns) !== current;
  } catch {
    // The file no longer parses as the structure the owned regions point into.
    return true;
  }
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

/** The `acf.apply.drift` warning for a removal the plan keeps because the user edited it. */
function keptDriftedDiagnostic(item: EmittedDiff): Diagnostic {
  const file = item.diff.path;
  const regions = item.diff.owns.flatMap((own) =>
    own.kind === "json-pointer" ? [own.pointer] : own.kind === "marker" ? [own.name] : [],
  );
  const what =
    regions.length === 0 ? displayPath(file) : `${regions.join(", ")} in ${displayPath(file)}`;
  return {
    severity: "warn",
    code: "acf.apply.drift",
    message: `kept ${what}: ${item.capabilityName} no longer writes it, but it was edited after caplet wrote it. ${regions.length === 0 ? "Delete the file" : "Remove it"} to finish the removal`,
    path: file,
    capability: { name: item.capabilityName },
    ...(item.destination === "native" ? { targetId: item.targetId } : {}),
  };
}

/** Where caplet output reaches: each scope's locked sources and its non-empty output roots. */
export type Reach = {
  sources: Array<{ scope: string; source: string; capabilities: number }>;
  targets: Array<{ scope: string; destination: string; installRoot: string; files: number }>;
};

/** One managed path of the verbose footprint: a skill directory, a whole file, or a region. */
export type FootprintEntry = {
  scope: string;
  target: string;
  installRoot: string;
  path: string;
  kind: "dir" | "file" | "region";
  capability: string;
};

/** Where caplet output reaches for the plan's scopes, read from lockfiles and sidecars. */
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

/**
 * Every path caplet manages in the plan's scopes, per output root: one entry per skill directory,
 * then each other managed file, both sorted by path.
 */
export async function collectFootprint(plan: EmitPlan): Promise<FootprintEntry[]> {
  const footprint: FootprintEntry[] = [];
  for (const root of await managedRoots(plan)) {
    const location = { scope: root.scope, target: root.destination, installRoot: root.installRoot };
    for (const item of rootFootprint(root.entries)) footprint.push({ ...location, ...item });
  }
  return footprint;
}

type FootprintItem = Pick<FootprintEntry, "path" | "kind" | "capability">;

/**
 * One item per skill directory, attributed to the first entry in it, then each other managed
 * file, both sorted by path.
 */
function rootFootprint(entries: readonly ManagedEntry[]): FootprintItem[] {
  const dirs = new Map<string, FootprintItem>();
  const files: FootprintItem[] = [];
  for (const entry of entries) {
    if (entry.facet?.family === "skill") {
      const dir = `skills/${entry.facet.name}/`;
      if (!dirs.has(dir)) dirs.set(dir, { path: dir, kind: "dir", capability: entry.capability });
      continue;
    }
    const region = entry.owns.some((own) => own.kind !== "file");
    files.push({
      path: entry.path,
      kind: region ? "region" : "file",
      capability: entry.capability,
    });
  }
  const byPath = (a: FootprintItem, b: FootprintItem) => a.path.localeCompare(b.path);
  return [...[...dirs.values()].sort(byPath), ...files.sort(byPath)];
}

type ManagedRoot = {
  scope: string;
  destination: string;
  installRoot: string;
  entries: ManagedEntry[];
};

/**
 * The output roots of the plan's scopes, for every target rather than the selected ones, whose
 * sidecar records managed entries; `destination` is `canonical` or the target id.
 */
async function managedRoots(plan: EmitPlan): Promise<ManagedRoot[]> {
  const roots: ManagedRoot[] = [];
  const seen = new Set<string>();
  for (const scopeRoot of plan.scopes) {
    for (const { installRoot, context } of scopeOutputRoots(
      scopeRoot,
      targetIds,
      plan.config,
      process.cwd(),
    )) {
      const destination = context.destination === "canonical" ? "canonical" : context.targetId;
      const key = `${scopeRoot.scope}\u0000${destination}`;
      if (seen.has(key)) continue;
      const sidecar = await readSidecar(path.join(installRoot, SIDECAR_FILENAME));
      if (sidecar.managed.length === 0) continue;
      seen.add(key);
      roots.push({ scope: scopeRoot.scope, destination, installRoot, entries: sidecar.managed });
    }
  }
  return roots;
}
