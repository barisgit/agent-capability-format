import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  type Diagnostic,
  isErrno,
  type ScopeRoot,
} from "@caplet/core";
import { readCapabilitiesYml } from "./capabilities-yml.js";
import { detectLockDrift, sameResolution, sameSelection } from "./drift.js";
import {
  type FetchedCapability,
  type FetchOptions,
  fetchCapability,
  SourcePathError,
} from "./fetch.js";
import type { SourceInventory } from "./inventory.js";
import {
  missingSnapshots,
  recordsFromLock,
  restoreMismatches,
  restoreOnlyMissing,
  unusableSnapshots,
} from "./locked-snapshots.js";
import {
  type CapabilitiesLock,
  cacheKeyFor,
  canonicalizeLock,
  canonicalizePathLocation,
  entrySourceId,
  type LockEntry,
  readLockfile,
  sourceString,
  writeLockfile,
} from "./lockfile.js";
import { type CapabilityRecord, capabilityPath, materializeFetched } from "./materialize.js";
import { commitStagedRecords, unownedSnapshotDiagnostics } from "./snapshot-transaction.js";

/** What {@link resolveCapabilities} reconciles and how far it may go. */
export type ResolveOptions = {
  scopeRoot: ScopeRoot;
  /**
   * `auto` fetches entries that are new, changed in intent, locked under a legacy key or
   * missing a snapshot; `force` refetches every selected entry; `never` fetches nothing, reports all drift and
   * leaves the lock unwritten.
   */
  mode: "auto" | "never" | "force";
  /** Source ids that may be fetched; other entries keep their lock entries. All when absent. */
  sourceIds?: readonly string[] | undefined;
  /**
   * `false` previews resolution: neither the lock nor the installed snapshots change, and
   * the result's `preview` holds the snapshots the resolution would install.
   */
  updateLock?: boolean | undefined;
  /** Sources the caller already fetched and inspected, by source id, used instead of fetching. */
  prefetchedSources?: ReadonlyMap<string, PrefetchedSource> | undefined;
  /**
   * A frozen resolution (SPEC.md §19.7): any disagreement between capabilities.yml and the
   * lock is an error and nothing is fetched or written; a missing snapshot is still restored
   * from its lock entry. Every fetch it makes, including one `force` asks for, is such a
   * restore that must reproduce the locked commit, names and digests.
   */
  frozen?: boolean | undefined;
};

/** A fetched source and its inventory, as `caplet add` prepared them before resolving. */
export type PrefetchedSource = {
  fetched: FetchedCapability;
  inventory: SourceInventory;
};

/** The outcome of {@link resolveCapabilities}. */
export type ResolveResult = {
  /** Installed capabilities by name; on failure, those the prior lock records. */
  capabilities: CapabilityRecord[];
  lockfile: CapabilitiesLock;
  diagnostics: Diagnostic[];
  /** Present when `updateLock` was `false`; the caller must `dispose` it. */
  preview?: ResolvePreview | undefined;
};

/** Snapshots a previewing resolution would install, matching the returned `lockfile`. */
export type ResolvePreview = {
  /** Temporary stand-in for `scopeRoot.capabilitiesDir`. */
  capabilitiesDir: string;
  dispose(): Promise<void>;
};

/**
 * Reconciles a scope's `capabilities.yml` with its lock and installed snapshots (SPEC.md
 * §19-§20): fetches what `mode` and drift require, stages every selected capability, and
 * only when every entry succeeded and no final names collide replaces the snapshots and
 * writes the lock. On any error diagnostic the prior lock and snapshots stay. Invalid
 * manifests, sources and selections are reported as diagnostics; fetch and file-system
 * failures throw.
 */
export async function resolveCapabilities(opts: ResolveOptions): Promise<ResolveResult> {
  const manifest = await readCapabilitiesYml(opts.scopeRoot.manifestPath);
  const existingLock = await readLockfile(opts.scopeRoot.lockPath);
  // A scope that declares nothing and was never locked has nothing to reconcile.
  // Leave it untouched so running caplet does not create an empty lock or directory.
  if (manifest.value.capabilities.length === 0 && existingLock === null) {
    return {
      capabilities: [],
      lockfile: { acf: 1, entries: [] },
      diagnostics: manifest.diagnostics,
    };
  }
  await mkdir(opts.scopeRoot.agentsDir, { recursive: true });
  const preview = opts.updateLock === false ? await createPreview(opts.scopeRoot) : undefined;
  const stagingDir = await mkdtemp(path.join(opts.scopeRoot.agentsDir, ".acf-staging-"));
  try {
    const scopeRoot =
      preview === undefined
        ? opts.scopeRoot
        : { ...opts.scopeRoot, capabilitiesDir: preview.capabilitiesDir };
    const result = await resolveCapabilitiesStaged(
      { ...opts, scopeRoot },
      stagingDir,
      manifest,
      existingLock,
      opts.scopeRoot.capabilitiesDir,
    );
    return preview === undefined ? result : { ...result, preview };
  } catch (error) {
    await preview?.dispose();
    throw error;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

/** Copies the installed snapshots aside so a preview can change them freely. */
async function createPreview(scopeRoot: ScopeRoot): Promise<ResolvePreview> {
  const root = await mkdtemp(path.join(scopeRoot.agentsDir, ".acf-preview-"));
  const capabilitiesDir = path.join(root, "capabilities");
  try {
    await cp(scopeRoot.capabilitiesDir, capabilitiesDir, { recursive: true, errorOnExist: true });
  } catch (error) {
    if (!isErrno(error, "ENOENT")) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  }
  return {
    capabilitiesDir,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}

/** What one resolution shares across its entries. */
type ResolveContext = {
  opts: ResolveOptions;
  yml: CapabilitiesYml;
  stagingDir: string;
  /** A frozen resolution found drift: nothing may be fetched. */
  frozenDrift: boolean;
  selectedSourceIds: ReadonlySet<string> | null;
};

/** A `capabilities.yml` entry with its source ids and the lock entry they paired it with. */
type PairedEntry = {
  entry: CapabilityEntry;
  id: string;
  /** Source id without `path`, which lockfiles written before `#path=` ids keyed by. */
  legacyId: string;
  locked: LockEntry | undefined;
};

/** One entry's contribution to the next lock and installed snapshots. */
type EntryOutcome = {
  records: CapabilityRecord[];
  lockEntry: LockEntry | undefined;
  diagnostics: Diagnostic[];
  fetched: boolean;
  failed: boolean;
};

async function resolveCapabilitiesStaged(
  opts: ResolveOptions,
  stagingDir: string,
  manifest: Awaited<ReturnType<typeof readCapabilitiesYml>>,
  existingLock: Awaited<ReturnType<typeof readLockfile>>,
  reportedCapabilitiesDir: string,
): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [...manifest.diagnostics];
  const yml = normalizeCapabilitiesYml(manifest.value, path.dirname(opts.scopeRoot.manifestPath));
  const usableLock = existingLock !== null && existingLock.acf === 1 ? existingLock : null;
  const drift = detectLockDrift(yml, existingLock);
  const frozenDrift = opts.frozen === true && drift.length > 0;
  diagnostics.push(...unresolvedDrift(opts, drift));

  await mkdir(opts.scopeRoot.capabilitiesDir, { recursive: true });
  const context: ResolveContext = {
    opts,
    yml,
    stagingDir,
    frozenDrift,
    selectedSourceIds: opts.sourceIds === undefined ? null : new Set(opts.sourceIds),
  };
  const records: CapabilityRecord[] = [];
  const priorRecords: CapabilityRecord[] = [];
  const nextEntries: LockEntry[] = [];
  let fetched = false;
  let failed =
    frozenDrift ||
    manifest.diagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    diagnostics.some((diagnostic) => diagnostic.code === "acf.lock.unsupported-version");
  const lockedBySource = new Map(
    (usableLock?.entries ?? []).map((entry) => [entry.sourceId, entry]),
  );

  for (const entry of yml.capabilities) {
    const id = entrySourceId(entry);
    const legacyId = sourceString(entry.source);
    const locked = lockedBySource.get(id) ?? lockedBySource.get(legacyId);
    if (locked !== undefined) {
      priorRecords.push(...recordsFromLock(entry, locked, opts.scopeRoot.capabilitiesDir));
    }
    const outcome = await resolveEntry(context, { entry, id, legacyId, locked });
    records.push(...outcome.records);
    if (outcome.lockEntry !== undefined) nextEntries.push(outcome.lockEntry);
    diagnostics.push(...outcome.diagnostics);
    fetched ||= outcome.fetched;
    failed ||= outcome.failed;
  }

  const conflicts = await snapshotDestinationDiagnostics(
    records,
    usableLock,
    opts.scopeRoot.capabilitiesDir,
    reportedCapabilitiesDir,
  );
  diagnostics.push(...conflicts);
  failed ||= conflicts.length > 0;
  const lockfile = canonicalizeLock({ acf: 1, entries: nextEntries });
  if (failed) {
    return {
      capabilities: priorRecords.sort(byRecordName),
      lockfile: canonicalizeLock(usableLock ?? { acf: 1, entries: [] }),
      diagnostics,
    };
  }

  const committedRecords = await commitResolution(context, records, lockfile, usableLock, fetched);
  return { capabilities: committedRecords.sort(byRecordName), lockfile, diagnostics };
}

/**
 * Resolves one entry: keeps its lock entry when nothing calls for a fetch, otherwise fetches
 * and stages it. A failed entry keeps its old lock entry so the rest of the lock is intact.
 */
async function resolveEntry(context: ResolveContext, paired: PairedEntry): Promise<EntryOutcome> {
  const { entry, id, locked } = paired;
  const { capabilitiesDir } = context.opts.scopeRoot;
  if (requiresRef(entry) && entry.ref === undefined) {
    return {
      records: [],
      lockEntry: locked,
      diagnostics: [refRequiredDiagnostic(entry, id)],
      fetched: false,
      failed: true,
    };
  }
  if (!(await fetchNeeded(context, paired))) {
    const missing =
      locked !== undefined ? await unusableSnapshots(locked, capabilitiesDir) : new Set<string>();
    const diagnostics: Diagnostic[] = [...missing].map((name) => ({
      severity: "error",
      code: "acf.lock.snapshot-missing",
      capability: { name },
      path: capabilityPath(capabilitiesDir, name),
      message: `capability ${name}: locked snapshot is missing, unreadable or unusable; delete an unusable snapshot and run \`caplet apply\` to restore it; existing outputs are preserved`,
    }));
    return {
      records: locked === undefined ? [] : recordsFromLock(entry, locked, capabilitiesDir),
      lockEntry: locked === undefined ? undefined : withSelection(locked, entry),
      diagnostics,
      fetched: false,
      failed: diagnostics.length > 0,
    };
  }
  try {
    return await fetchEntry(context, paired);
  } catch (error) {
    if (!(error instanceof SourcePathError)) throw error;
    return {
      records: [],
      lockEntry: locked,
      diagnostics: [
        { severity: "error", code: error.code, message: error.message, path: error.path },
      ],
      fetched: false,
      failed: true,
    };
  }
}

/**
 * Whether a selected entry must be fetched: a lock keyed by its legacy id, `mode` or a
 * changed resolution calls for it, or (`auto` only) a locked snapshot is missing.
 */
async function fetchNeeded(context: ResolveContext, paired: PairedEntry): Promise<boolean> {
  const { opts, frozenDrift, selectedSourceIds } = context;
  const { entry, id, legacyId, locked } = paired;
  const selected =
    selectedSourceIds === null || selectedSourceIds.has(id) || selectedSourceIds.has(legacyId);
  if (frozenDrift || !selected) return false;
  const legacyLock = locked !== undefined && locked.sourceId !== id;
  return (
    (legacyLock && opts.mode !== "never") ||
    shouldFetch(opts.mode, entry, locked) ||
    (opts.mode === "auto" &&
      locked !== undefined &&
      (locked.capabilityNames.length === 0 ||
        (await missingSnapshots(locked, opts.scopeRoot.capabilitiesDir)).size > 0))
  );
}

/** Fetches and stages one entry; a restore must reproduce the locked digests exactly. */
async function fetchEntry(context: ResolveContext, paired: PairedEntry): Promise<EntryOutcome> {
  const { opts } = context;
  const { entry, id, locked } = paired;
  const legacyLock = locked !== undefined && locked.sourceId !== id;
  // A frozen resolution, or a fetch only a missing snapshot triggered, restores the locked
  // content from the locked commit rather than wherever the moving ref points now.
  const restoring =
    locked !== undefined &&
    (opts.frozen === true || (!legacyLock && !shouldFetch(opts.mode, entry, locked)));
  const materialized = await stageFetchedSource(context, paired, restoring ? locked : undefined);
  const mismatches =
    restoring && materialized.ok ? restoreMismatches(locked, materialized.records) : [];
  const diagnostics = [...materialized.diagnostics, ...mismatches];
  if (!materialized.ok || mismatches.length > 0) {
    return {
      records:
        locked === undefined ? [] : recordsFromLock(entry, locked, opts.scopeRoot.capabilitiesDir),
      lockEntry: locked,
      diagnostics,
      fetched: false,
      failed: true,
    };
  }
  // A verified restore leaves its entry exactly as locked; one predating per-capability
  // records takes the fresh entry so it gains them.
  const lockEntry =
    restoring && locked?.resolvedCapabilities !== undefined
      ? withSelection(locked, entry)
      : (materialized.lockEntry ?? undefined);
  return {
    records: restoring
      ? await restoreOnlyMissing(
          entry,
          locked,
          materialized.records,
          opts.scopeRoot.capabilitiesDir,
        )
      : materialized.records,
    lockEntry,
    diagnostics,
    fetched: true,
    failed: false,
  };
}

function nameCollisionDiagnostics(records: CapabilityRecord[]): Diagnostic[] {
  const byName = new Map<string, CapabilityRecord[]>();
  for (const record of records) {
    byName.set(record.name, [...(byName.get(record.name) ?? []), record]);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [name, colliding] of byName) {
    if (colliding.length < 2) continue;
    diagnostics.push({
      severity: "error",
      code: "acf.capability.name-collision",
      message: `capability name collision: ${name} (resolve with rename or a narrower capabilities selection)`,
      data: {
        name,
        sources: colliding.map((record) => entrySourceId(record.entry)),
        selectors: colliding.map((record) => record.selector),
      },
    });
  }
  return diagnostics;
}

function normalizeCapabilitiesYml(value: CapabilitiesYml, manifestDir: string): CapabilitiesYml {
  const normalized: CapabilitiesYml = {
    acf: 1,
    capabilities: value.capabilities.map((entry) => normalizeEntry(entry, manifestDir)),
  };
  if (value.defaults !== undefined) normalized.defaults = value.defaults;
  return normalized;
}

function normalizeEntry(entry: CapabilityEntry, manifestDir: string): CapabilityEntry {
  if (entry.source.kind !== "path") return entry;
  return {
    ...entry,
    source: {
      kind: "path",
      location: canonicalizePathLocation(entry.source.location, manifestDir),
    },
  };
}

/**
 * Drift this resolution cannot reconcile. Offline and frozen modes report every disagreement;
 * fetching modes reconcile missing/changed entries. Skipped or failed entries keep their old
 * lock entries, so subsequent emission planning still reports their drift.
 */
function unresolvedDrift(opts: ResolveOptions, drift: Diagnostic[]): Diagnostic[] {
  if (opts.mode === "never" || opts.frozen === true) return drift;
  return drift.filter(
    (item) => item.code !== "acf.lock.missing-entry" && item.code !== "acf.lock.drift",
  );
}

/**
 * `locked` with the entry's current include, exclude, only and except. Selection is applied when snapshots are
 * read, so a changed selection needs no fetch; the lock mirror carries it to emission.
 */
function withSelection(locked: LockEntry, entry: CapabilityEntry): LockEntry {
  if (sameSelection(locked, entry)) return locked;
  const next: LockEntry = { ...locked };
  delete next.include;
  delete next.exclude;
  delete next.only;
  delete next.except;
  if (entry.include !== undefined) next.include = entry.include;
  if (entry.exclude !== undefined) next.exclude = entry.exclude;
  if (entry.only !== undefined) next.only = entry.only;
  if (entry.except !== undefined) next.except = entry.except;
  return next;
}

function shouldFetch(
  mode: ResolveOptions["mode"],
  entry: CapabilityEntry,
  locked: LockEntry | undefined,
): boolean {
  if (mode === "never") return false;
  if (mode === "force") return true;
  return locked === undefined || !sameResolution(entry, locked);
}

function requiresRef(entry: CapabilityEntry): boolean {
  return entry.source.kind === "github" || entry.source.kind === "git";
}

function fetchOptions(yml: CapabilitiesYml, scopeRoot: ScopeRoot): FetchOptions {
  return {
    cacheDir: path.join(scopeRoot.agentsDir, ".cache", "acf-installer"),
    shallow: yml.defaults?.fetch?.shallow ?? true,
    blobless: yml.defaults?.fetch?.blobless ?? true,
  };
}

function refRequiredDiagnostic(entry: CapabilityEntry, id: string): Diagnostic {
  return {
    severity: "error",
    code: "acf.resolve.ref-required",
    message: `${entry.source.kind} source requires ref`,
    data: { sourceId: id },
  };
}

function byRecordName(a: CapabilityRecord, b: CapabilityRecord): number {
  return a.name.localeCompare(b.name);
}

/** Commits staged snapshots; only a persisting resolution prunes stale snapshots and writes the lock. */
async function commitResolution(
  context: ResolveContext,
  records: CapabilityRecord[],
  lockfile: CapabilitiesLock,
  usableLock: CapabilitiesLock | null,
  fetched: boolean,
): Promise<CapabilityRecord[]> {
  const { opts, stagingDir } = context;
  const lockChanged =
    usableLock === null ||
    JSON.stringify(canonicalizeLock(usableLock)) !== JSON.stringify(lockfile);
  const persist = opts.mode !== "never" && opts.updateLock !== false && (fetched || lockChanged);
  const stale = persist
    ? (usableLock?.entries.flatMap((entry) => entry.capabilityNames) ?? []).filter(
        (name) => !lockfile.entries.some((entry) => entry.capabilityNames.includes(name)),
      )
    : [];
  const committedRecords = await commitStagedRecords(
    records,
    stagingDir,
    opts.scopeRoot.capabilitiesDir,
    stale,
    async () => {
      if (persist) await writeLockfile(opts.scopeRoot.lockPath, lockfile);
    },
  );
  return committedRecords;
}

/** Validates final names and ownership across fetched and retained records before any replacement. */
async function snapshotDestinationDiagnostics(
  records: CapabilityRecord[],
  previous: CapabilitiesLock | null,
  capabilitiesDir: string,
  reportedCapabilitiesDir: string,
): Promise<Diagnostic[]> {
  return [
    ...nameCollisionDiagnostics(records),
    ...(await unownedSnapshotDiagnostics(
      records,
      previous,
      capabilitiesDir,
      reportedCapabilitiesDir,
    )),
  ];
}

/** Pins restores to their locked commit and stages either a reused inventory or a fresh fetch. */
async function stageFetchedSource(
  context: ResolveContext,
  paired: PairedEntry,
  restoring: LockEntry | undefined,
): ReturnType<typeof materializeFetched> {
  const { opts, yml, stagingDir } = context;
  const { entry, id, legacyId } = paired;
  const prefetched = restoring
    ? undefined
    : (opts.prefetchedSources?.get(id) ?? opts.prefetchedSources?.get(legacyId));
  const requested =
    restoring?.resolvedSha !== undefined ? { ...entry, ref: restoring.resolvedSha } : entry;
  const fetchedCapability =
    prefetched?.fetched ?? (await fetchCapability(requested, fetchOptions(yml, opts.scopeRoot)));
  const sourceStagingDir = path.join(
    stagingDir,
    cacheKeyFor(fetchedCapability.sourceId, entry.ref),
  );
  return await materializeFetched(
    entry,
    fetchedCapability,
    sourceStagingDir,
    prefetched?.inventory,
    restoring?.resolvedCapabilities,
  );
}
