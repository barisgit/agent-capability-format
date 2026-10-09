import { cp, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  type Diagnostic,
  digestMismatchDiagnostic,
  isErrno,
  type ScopeRoot,
} from "@caplet/core";
import { readCapabilitiesYml } from "./capabilities-yml.js";
import { detectLockDrift, sameResolution, sameSelection } from "./drift.js";
import { type FetchedCapability, type FetchOptions, fetchCapability } from "./fetch.js";
import type { SourceInventory } from "./inventory.js";
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
   * from its lock entry.
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
): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [...manifest.diagnostics];
  const yml = normalizeCapabilitiesYml(manifest.value, path.dirname(opts.scopeRoot.manifestPath));
  const usableLock = existingLock !== null && existingLock.acf === 1 ? existingLock : null;
  const drift = detectLockDrift(yml, existingLock);
  const frozenDrift = opts.frozen === true && drift.length > 0;
  diagnostics.push(
    ...(opts.mode === "never" || opts.frozen === true
      ? drift
      : drift.filter((item) => !reconciledByFetch(item))),
  );

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

  // Validate final destinations across fetched and retained records before any
  // snapshot is replaced. SPEC §17.6: no implicit winner within a scope.
  const collisions = nameCollisionDiagnostics(records);
  diagnostics.push(...collisions);
  if (collisions.length > 0) failed = true;

  const lockfile = canonicalizeLock({ acf: 1, entries: nextEntries });
  if (failed) {
    return {
      capabilities: priorRecords.sort(byRecordName),
      lockfile: canonicalizeLock(usableLock ?? { acf: 1, entries: [] }),
      diagnostics,
    };
  }

  const committedRecords = await commitStagedRecords(
    records,
    stagingDir,
    opts.scopeRoot.capabilitiesDir,
  );
  const lockChanged =
    usableLock === null ||
    JSON.stringify(canonicalizeLock(usableLock)) !== JSON.stringify(lockfile);
  if (opts.mode !== "never" && opts.updateLock !== false && (fetched || lockChanged)) {
    await removeStaleSnapshots(usableLock, lockfile, opts.scopeRoot.capabilitiesDir);
    await writeLockfile(opts.scopeRoot.lockPath, lockfile);
  }
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
    return {
      records: locked === undefined ? [] : recordsFromLock(entry, locked, capabilitiesDir),
      lockEntry: locked === undefined ? undefined : withSelection(locked, entry),
      diagnostics: [],
      fetched: false,
      failed: false,
    };
  }
  return await fetchEntry(context, paired);
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
  const { opts, yml, stagingDir } = context;
  const { entry, id, legacyId, locked } = paired;
  const legacyLock = locked !== undefined && locked.sourceId !== id;
  // Only a missing snapshot triggered this fetch: restore the locked content from the
  // locked commit rather than wherever the moving ref points now.
  const restoring = locked !== undefined && !legacyLock && !shouldFetch(opts.mode, entry, locked);
  const prefetched = restoring
    ? undefined
    : (opts.prefetchedSources?.get(id) ?? opts.prefetchedSources?.get(legacyId));
  const requested =
    restoring && locked?.resolvedSha !== undefined ? { ...entry, ref: locked.resolvedSha } : entry;
  const fetchedCapability =
    prefetched?.fetched ?? (await fetchCapability(requested, fetchOptions(yml, opts.scopeRoot)));
  const sourceStagingDir = path.join(
    stagingDir,
    cacheKeyFor(fetchedCapability.sourceId, entry.ref),
  );
  const materialized = await materializeFetched(
    entry,
    fetchedCapability,
    sourceStagingDir,
    prefetched?.inventory,
  );
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

/**
 * Moves staged snapshots into `capabilitiesDir`, replacing any installed copy. Records not
 * inside staging (read from an installed lock) already live at their final root and pass through.
 */
async function commitStagedRecords(
  records: CapabilityRecord[],
  stagingDir: string,
  capabilitiesDir: string,
): Promise<CapabilityRecord[]> {
  const committed: CapabilityRecord[] = [];
  for (const record of records) {
    const relative = path.relative(stagingDir, record.root);
    if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      committed.push(record);
      continue;
    }
    const destination = capabilityPath(capabilitiesDir, record.name);
    await rm(destination, { recursive: true, force: true });
    await rename(record.root, destination);
    committed.push({ ...record, root: destination });
  }
  return committed;
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

/** Deletes installed snapshots the previous lock owned and the next lock no longer names. */
async function removeStaleSnapshots(
  previous: CapabilitiesLock | null,
  next: CapabilitiesLock,
  capabilitiesDir: string,
): Promise<void> {
  if (previous === null) return;
  const keep = new Set(next.entries.flatMap((entry) => entry.capabilityNames));
  for (const name of previous.entries.flatMap((entry) => entry.capabilityNames)) {
    if (!keep.has(name)) {
      await rm(capabilityPath(capabilitiesDir, name), { recursive: true, force: true });
    }
  }
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
 * Drift a fetching resolution reconciles, so it is no error there: a missing entry and a
 * changed ref, capability selectors, rename or format fetch, and a changed selection rewrites
 * the lock. An entry this resolution skips (`sourceIds`) or fails to fetch keeps its old lock
 * entry, so planning against the lock reports its drift.
 */
function reconciledByFetch(diagnostic: Diagnostic): boolean {
  return diagnostic.code === "acf.lock.missing-entry" || diagnostic.code === "acf.lock.drift";
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

/**
 * How restored records differ from the lock entry they must reproduce: the same capability
 * names exactly, and each name's locked payload digest when the entry records one. A name the
 * lock does not record is a mismatch too, since committing it would install a snapshot no lock
 * record verifies.
 */
function restoreMismatches(locked: LockEntry, restored: CapabilityRecord[]): Diagnostic[] {
  const absent = "no such capability";
  const actual = new Map(
    restored.map((record) => [record.name, record.lockRecord?.payloadDigest ?? "nothing"]),
  );
  const expected = new Map(
    locked.resolvedCapabilities?.map((record) => [record.name, record.payloadDigest]),
  );
  const lockedNames = new Set(locked.capabilityNames);
  const missingOrChanged = locked.capabilityNames.flatMap((name) => {
    const digest = actual.get(name) ?? absent;
    const want = expected.get(name);
    const same = digest !== absent && (want === undefined || want === digest);
    return same
      ? []
      : [digestMismatchDiagnostic(name, "restore", want ?? "a locked capability", digest)];
  });
  const unlocked = restored
    .filter((record) => !lockedNames.has(record.name))
    .map((record) =>
      digestMismatchDiagnostic(record.name, "restore", absent, actual.get(record.name) ?? absent),
    );
  return [...missingOrChanged, ...unlocked];
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

/**
 * The locked capabilities whose snapshot directory is absent, deciding only whether a restore
 * is due and what it installs. Whether a present snapshot still matches its lock is verified
 * where snapshots are read (core `resolveScopeCapabilities`); a modified one is reported there,
 * never silently replaced.
 */
async function missingSnapshots(
  lockEntry: LockEntry,
  capabilitiesDir: string,
): Promise<Set<string>> {
  const missing = new Set<string>();
  for (const name of lockEntry.capabilityNames) {
    try {
      const stat = await lstat(path.join(capabilitiesDir, name));
      if (!stat.isDirectory()) missing.add(name);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      missing.add(name);
    }
  }
  return missing;
}

/**
 * The records a verified restore commits: the staged snapshot of each capability that is
 * missing, and the installed one of each that is present, so restoring one snapshot never
 * replaces a present sibling, modified or not.
 */
async function restoreOnlyMissing(
  entry: CapabilityEntry,
  locked: LockEntry,
  staged: CapabilityRecord[],
  capabilitiesDir: string,
): Promise<CapabilityRecord[]> {
  const missing = await missingSnapshots(locked, capabilitiesDir);
  return [
    ...staged.filter((record) => missing.has(record.name)),
    ...recordsFromLock(entry, locked, capabilitiesDir).filter(
      (record) => !missing.has(record.name),
    ),
  ];
}

function fetchOptions(yml: CapabilitiesYml, scopeRoot: ScopeRoot): FetchOptions {
  return {
    cacheDir: path.join(scopeRoot.agentsDir, ".cache", "acf-installer"),
    shallow: yml.defaults?.fetch?.shallow ?? true,
    blobless: yml.defaults?.fetch?.blobless ?? true,
  };
}

function recordsFromLock(
  entry: CapabilityEntry,
  lockEntry: LockEntry,
  capabilitiesDir: string,
): CapabilityRecord[] {
  return lockEntry.capabilityNames.map((name) => {
    const lockRecord = lockEntry.resolvedCapabilities?.find((record) => record.name === name);
    return {
      entry,
      name,
      selector: lockEntry.selectorsByCapability?.[name] ?? name,
      root: capabilityPath(capabilitiesDir, name),
      commit: lockEntry.resolvedSha ?? null,
      contentHash: lockRecord?.capabilityHash ?? lockEntry.capabilityHash,
      lockRecord,
    };
  });
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
