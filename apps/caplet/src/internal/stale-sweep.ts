/**
 * The stale sweep of planning: the sidecar entries a plan no longer wants, and the removals,
 * kept drifted files and forced re-records that follow from them.
 */
import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type AcfCapability,
  type CapletConfig,
  type Diagnostic,
  type ScopeRoot,
  type TargetId,
} from "@caplet/core";
import { resolveDiffPath } from "../apply/apply-diffs.js";
import {
  diskDriftFs,
  hashOwnedRegions,
  type ManagedEntry,
  ownershipKey,
  readSidecar,
  relativeSidecarPath,
  SIDECAR_FILENAME,
} from "../apply/sidecar.js";
import type { ClaudeRootPlan } from "./claude-marketplace.js";
import {
  type EmittedDiff,
  type OutputRoot,
  plannedRemoval,
  type RootContext,
  type StaleSidecarEntry,
  scopeOutputRoots,
  sidecarOwner,
} from "./workflow.js";

/** The facet keys of each capability planned in one scope, from {@link capabilityFacetKeys}. */
export type ScopeFacets = ReadonlyMap<string, ReadonlySet<string>>;

/** The plan's scopes, targets and desired diffs the sweep compares the sidecars against. */
export type SweepInput = {
  scopes: readonly ScopeRoot[];
  targets: readonly TargetId[];
  config: CapletConfig;
  cwd: string;
  desired: readonly EmittedDiff[];
  /** {@link ScopeFacets} by scope. */
  resolvedFacets: ReadonlyMap<string, ScopeFacets>;
  /** `<install root>\0<capability>` pairs a blocked capability keeps. */
  keptOutput: ReadonlySet<string>;
  /** Claude install roots of the plan, which decide whether a removal is a migration. */
  claudeRoots: readonly ClaudeRootPlan[];
};

/** The removals and bookkeeping the sweep adds to the plan. */
export type SweepResult = {
  deletes: EmittedDiff[];
  /** `acf.apply.drift` for each removal kept because the user changed its owned regions. */
  diagnostics: Diagnostic[];
  /** {@link diffPathKey}s of paths to apply even when their bytes are already as planned. */
  forcedPaths: ReadonlySet<string>;
  /** `<capability>\0<path>` of each stale entry, by install root. */
  staleByRoot: Map<string, Set<string>>;
  staleEntries: StaleSidecarEntry[];
  /** The context of every output root the sweep read, by install root. */
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
 * Entries of a capability blocked on the root's target (`keptOutput`) are never stale: a refusal
 * keeps the earlier install.
 *
 * A removal whose owned regions no longer hash to the sidecar's record was edited by the user, so
 * it is not planned: the file and its entry stay and `acf.apply.drift` says why, on every plan
 * until the user deletes or restores the content. The exception is the retirement of loose
 * Claude output for a capability that became a plugin (a `registered` gate), which keeps the
 * removal flagged `drifted` for the migration to release.
 */
export async function sweepStaleSidecarEntries(input: SweepInput): Promise<SweepResult> {
  const desired = desiredOwnership(input.desired);
  const result: SweepAccumulator = {
    deletes: [],
    diagnostics: [],
    forcedPaths: new Set(),
    staleByRoot: new Map(),
    staleEntries: [],
    rootContexts: new Map(),
  };
  for (const scopeRoot of input.scopes) {
    const scopeFacets = input.resolvedFacets.get(scopeRoot.scope);
    for (const root of scopeOutputRoots(scopeRoot, input.targets, input.config, input.cwd)) {
      if (result.rootContexts.has(root.installRoot)) continue;
      result.rootContexts.set(root.installRoot, root.context);
      const sidecar = await readSidecar(path.join(root.installRoot, SIDECAR_FILENAME));
      for (const entry of sidecar.managed) {
        if (entry.capability === ACF_SYSTEM_OWNER) continue;
        sweepEntry(entry, { root, desired, scopeFacets, input, result });
      }
    }
  }
  return result;
}

/**
 * The key of the file a plan item writes, `<install root>\0<sidecar path>`, as
 * {@link SweepResult.forcedPaths} holds it.
 */
export function diffPathKey(item: EmittedDiff): string {
  const relative = relativeSidecarPath(
    item.installRoot,
    resolveDiffPath(item.installRoot, item.diff.path),
  );
  return `${item.installRoot}\u0000${relative}`;
}

/** The facet keys (`<family>\0<name>`) of `capability`, matched against sidecar entry facets. */
export function capabilityFacetKeys(capability: AcfCapability): ReadonlySet<string> {
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

type SweepAccumulator = SweepResult & { forcedPaths: Set<string> };

/** The owned regions and facets the desired diffs claim, keyed for lookup by sidecar entry. */
type DesiredOwnership = {
  /** `<path key>\0<capability>\0<ownership key>` */
  owns: ReadonlySet<string>;
  /** `<path key>\0<ownership key>`, whichever capability owns it. */
  ownsAnyCapability: ReadonlySet<string>;
  /** `<install root>\0<capability>\0<family>\0<name>` */
  facets: ReadonlySet<string>;
};

function desiredOwnership(desired: readonly EmittedDiff[]): DesiredOwnership {
  const owns = new Set<string>();
  const ownsAnyCapability = new Set<string>();
  const facets = new Set<string>();
  for (const item of desired) {
    const key = diffPathKey(item);
    for (const own of item.diff.owns) {
      owns.add(`${key}\u0000${item.capabilityName}\u0000${ownershipKey(own)}`);
      ownsAnyCapability.add(`${key}\u0000${ownershipKey(own)}`);
    }
    const facet = item.diff.facet;
    if (facet !== undefined) {
      facets.add(
        `${item.installRoot}\u0000${item.capabilityName}\u0000${facet.family}\u0000${facet.name}`,
      );
    }
  }
  return { owns, ownsAnyCapability, facets };
}

/** Sweeps one sidecar entry of `root` into `result`, as {@link sweepStaleSidecarEntries} describes. */
function sweepEntry(
  entry: ManagedEntry,
  sweep: {
    root: OutputRoot;
    desired: DesiredOwnership;
    scopeFacets: ScopeFacets | undefined;
    input: SweepInput;
    result: SweepAccumulator;
  },
): void {
  const { root, desired, input, result } = sweep;
  const { installRoot, context } = root;
  const pathKey = `${installRoot}\u0000${entry.path}`;
  const stale = entry.owns.filter(
    (own) => !desired.owns.has(`${pathKey}\u0000${entry.capability}\u0000${ownershipKey(own)}`),
  );
  if (stale.length === 0) {
    // Still desired. A recorded hash that no longer matches the owned regions on disk is stale
    // sidecar metadata: force the path so the sidecar heals even when the bytes are up to date.
    const disk = diskDriftFs(installRoot);
    const wholeFile = entry.owns.some((own) => own.kind === "file");
    const current = wholeFile ? disk.readBytes(entry.path) : disk.readText(entry.path);
    if (hashOwnedRegions(current, entry.owns) !== entry.hash) result.forcedPaths.add(pathKey);
    return;
  }
  if (input.keptOutput.has(`${installRoot}\u0000${entry.capability}`)) return;
  if (
    context.destination === "canonical" &&
    keptInCanonicalRoot(entry, installRoot, sweep.scopeFacets, desired.facets)
  ) {
    return;
  }
  const orphaned = stale.filter(
    (own) => !desired.ownsAnyCapability.has(`${pathKey}\u0000${ownershipKey(own)}`),
  );
  let removal: EmittedDiff | undefined;
  if (orphaned.length > 0) {
    const planned = plannedRemoval({
      entry,
      owns: orphaned,
      installRoot,
      context,
      claudeRoots: input.claudeRoots,
    });
    if ("kept" in planned) {
      result.diagnostics.push(planned.kept);
      return;
    }
    removal = planned.removal;
  }
  const bucket = result.staleByRoot.get(installRoot) ?? new Set<string>();
  bucket.add(`${entry.capability}\u0000${entry.path}`);
  result.staleByRoot.set(installRoot, bucket);
  result.staleEntries.push({
    installRoot,
    path: entry.path,
    capability: entry.capability,
    owns: entry.owns,
    owner: sidecarOwner({ ...context, carrier: entry.carrier ?? "loose" }),
  });
  // Regions the entry keeps, or that another capability now owns, are re-recorded at the path.
  if (orphaned.length < entry.owns.length) result.forcedPaths.add(pathKey);
  if (removal !== undefined) result.deletes.push(removal);
}

/**
 * Whether the shared canonical root keeps `entry` although this plan does not write it: its
 * capability and facet still exist in the scope and this run did not plan that facet there.
 */
function keptInCanonicalRoot(
  entry: ManagedEntry,
  installRoot: string,
  scopeFacets: ScopeFacets | undefined,
  plannedFacets: ReadonlySet<string>,
): boolean {
  const facets = scopeFacets?.get(entry.capability);
  if (facets === undefined) return false;
  const facet = entry.facet;
  if (facet === undefined) return true;
  return (
    facets.has(`${facet.family}\u0000${facet.name}`) &&
    !plannedFacets.has(
      `${installRoot}\u0000${entry.capability}\u0000${facet.family}\u0000${facet.name}`,
    )
  );
}
