import { cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  computeCapabilityDigests,
  type Diagnostic,
  digestMismatchDiagnostic,
  entryCapabilityHash,
  type LockedCapability,
  type ScopeRoot,
} from "@caplet/core";
import { readCapabilitiesYml } from "./capabilities-yml.js";
import { detectLockDrift } from "./drift.js";
import { type FetchedCapability, type FetchOptions, fetchCapability } from "./fetch.js";
import {
  inspectSource,
  type SourceCapabilityCandidate,
  type SourceInventory,
} from "./inventory.js";
import {
  type CapabilitiesLock,
  cacheKeyFor,
  canonicalizeLock,
  canonicalizePathLocation,
  entrySourceId,
  type LockEntry,
  readLockfile,
  sourceId,
  sourceString,
  writeLockfile,
} from "./lockfile.js";
import { copySnapshot, SnapshotRejectedError } from "./snapshot.js";

export type ResolveOptions = {
  scope: "user" | "project";
  scopeRoot: ScopeRoot;
  mode: "auto" | "never" | "force";
  sourceIds?: readonly string[] | undefined;
  /**
   * `false` previews resolution: neither the lock nor the installed snapshots change, and
   * the result's `preview` holds the snapshots the resolution would install.
   */
  updateLock?: boolean | undefined;
  prefetchedSources?: ReadonlyMap<string, PrefetchedSource> | undefined;
};

export type PrefetchedSource = {
  fetched: FetchedCapability;
  inventory: SourceInventory;
};

export type ResolveResult = {
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

export type CapabilityRecord = {
  entry: CapabilityEntry;
  name: string;
  selector: string;
  root: string;
  commit: string | null;
  /** v1 `capabilityHash` of the snapshot at `root`. */
  contentHash: string;
  /** Per-capability lock record; absent for capabilities locked before records existed. */
  lockRecord?: LockedCapability | undefined;
};

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

async function resolveCapabilitiesStaged(
  opts: ResolveOptions,
  stagingDir: string,
  manifest: Awaited<ReturnType<typeof readCapabilitiesYml>>,
  existingLock: Awaited<ReturnType<typeof readLockfile>>,
): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [...manifest.diagnostics];
  const yml = normalizeCapabilitiesYml(manifest.value, path.dirname(opts.scopeRoot.manifestPath));
  const usableLock = existingLock !== null && lockVersion(existingLock) === 1 ? existingLock : null;
  diagnostics.push(...driftDiagnosticsForMode(yml, existingLock, opts.mode));

  await mkdir(opts.scopeRoot.capabilitiesDir, { recursive: true });
  const records: CapabilityRecord[] = [];
  const priorRecords: CapabilityRecord[] = [];
  const nextEntries: LockEntry[] = [];
  let fetched = false;
  let failed =
    manifest.diagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    diagnostics.some((diagnostic) => diagnostic.code === "acf.lock.unsupported-version");
  const lockedBySource = new Map(
    (usableLock?.entries ?? []).map((entry) => [entry.sourceId, entry]),
  );
  const selectedSourceIds = opts.sourceIds === undefined ? null : new Set(opts.sourceIds);

  for (const entry of yml.capabilities) {
    const id = entrySourceId(entry);
    const legacyId = sourceId(entry.source);
    const locked = lockedBySource.get(id) ?? lockedBySource.get(legacyId);
    if (locked !== undefined) {
      priorRecords.push(...recordsFromLock(entry, locked, opts.scopeRoot.capabilitiesDir));
    }
    const legacyLock = locked !== undefined && locked.sourceId !== id;
    if (requiresRef(entry) && entry.ref === undefined) {
      diagnostics.push(refRequiredDiagnostic(entry, id));
      failed = true;
      if (locked !== undefined) nextEntries.push(locked);
      continue;
    }
    const selected =
      selectedSourceIds === null || selectedSourceIds.has(id) || selectedSourceIds.has(legacyId);
    const fetchNeeded =
      (selected &&
        ((legacyLock && opts.mode !== "never") || shouldFetch(opts.mode, entry, locked))) ||
      (opts.mode === "auto" &&
        selected &&
        locked !== undefined &&
        !(await lockInstalled(locked, opts.scopeRoot.capabilitiesDir)));
    if (!fetchNeeded) {
      if (locked !== undefined) {
        nextEntries.push(locked);
        records.push(...recordsFromLock(entry, locked, opts.scopeRoot.capabilitiesDir));
      }
      continue;
    }

    // Only a missing snapshot triggered this fetch: restore the locked content from the
    // locked commit rather than wherever the moving ref points now.
    const restoring = locked !== undefined && !legacyLock && !shouldFetch(opts.mode, entry, locked);
    const prefetched = restoring
      ? undefined
      : (opts.prefetchedSources?.get(id) ?? opts.prefetchedSources?.get(legacyId));
    const fetchEntry =
      restoring && locked?.resolvedSha !== undefined
        ? { ...entry, ref: locked.resolvedSha }
        : entry;
    const fetchedCapability =
      prefetched?.fetched ?? (await fetchCapability(fetchEntry, fetchOptions(yml, opts.scopeRoot)));
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
    diagnostics.push(...materialized.diagnostics, ...mismatches);
    if (!materialized.ok || mismatches.length > 0) {
      failed = true;
      if (locked !== undefined) {
        nextEntries.push(locked);
        records.push(...recordsFromLock(entry, locked, opts.scopeRoot.capabilitiesDir));
      }
      continue;
    }
    records.push(...materialized.records);
    // A verified restore leaves its entry exactly as locked; one predating per-capability
    // records takes the fresh entry so it gains them.
    if (restoring && locked?.resolvedCapabilities !== undefined) nextEntries.push(locked);
    else if (materialized.lockEntry !== null) nextEntries.push(materialized.lockEntry);
    fetched = true;
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

function selectCapabilities(
  entry: CapabilityEntry,
  sourceRoot: string,
  inventory: SourceInventory,
): { candidates: SourceCapabilityCandidate[]; diagnostics: Diagnostic[] } {
  if (entry.capabilities === undefined)
    return { candidates: inventory.candidates, diagnostics: [] };
  const selected = new Set<SourceCapabilityCandidate>();
  const diagnostics: Diagnostic[] = [];
  for (const selector of entry.capabilities) {
    const matches = inventory.candidates.filter((candidate) =>
      globMatches(selector, candidate.selector),
    );
    if (matches.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "acf.resolve.capability-selector-unmatched",
        message: `capability selector matched nothing: ${selector}`,
        path: sourceRoot,
        data: { selector, candidates: inventory.candidates.map((item) => item.selector).sort() },
      });
    }
    for (const match of matches) selected.add(match);
  }
  return { candidates: [...selected], diagnostics };
}

function globMatches(pattern: string, candidate: string): boolean {
  return matchSegments(pattern.split("/"), candidate.split("/"), 0, 0);
}

function matchSegments(
  pattern: string[],
  candidate: string[],
  patternIndex: number,
  candidateIndex: number,
): boolean {
  if (patternIndex === pattern.length) return candidateIndex === candidate.length;
  const segment = pattern[patternIndex];
  if (segment === "**") {
    if (matchSegments(pattern, candidate, patternIndex + 1, candidateIndex)) return true;
    return (
      candidateIndex < candidate.length &&
      matchSegments(pattern, candidate, patternIndex, candidateIndex + 1)
    );
  }
  if (candidateIndex >= candidate.length || segment === undefined) return false;
  return (
    matchSegment(segment, candidate[candidateIndex] ?? "") &&
    matchSegments(pattern, candidate, patternIndex + 1, candidateIndex + 1)
  );
}

function matchSegment(pattern: string, candidate: string): boolean {
  let expression = "^";
  for (const char of pattern) {
    if (char === "*") expression += ".*";
    else if (char === "?") expression += ".";
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${expression}$`).test(candidate);
}

function sameStrings(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

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

function capabilityPath(capabilitiesDir: string, name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`invalid capability destination name: ${name}`);
  }
  return path.join(capabilitiesDir, name);
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

function driftDiagnosticsForMode(
  yml: CapabilitiesYml,
  lock: CapabilitiesLock | null,
  mode: ResolveOptions["mode"],
): Diagnostic[] {
  const diagnostics = detectLockDrift(yml, lock);
  if (mode === "never") return diagnostics;
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.code !== "acf.lock.missing-entry" && !isCapabilitySelectorDrift(diagnostic),
  );
}

function isCapabilitySelectorDrift(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.code === "acf.lock.drift" &&
    diagnostic.data !== undefined &&
    "ymlCapabilities" in diagnostic.data
  );
}

/** Digest mismatches between restored records and the lock records they must reproduce. */
function restoreMismatches(locked: LockEntry, restored: CapabilityRecord[]): Diagnostic[] {
  if (locked.resolvedCapabilities === undefined) return [];
  const actual = new Map(
    restored.map((record) => [record.name, record.lockRecord?.payloadDigest ?? "nothing"]),
  );
  return locked.resolvedCapabilities.flatMap((expected) => {
    const digest = actual.get(expected.name) ?? "no such capability";
    return digest === expected.payloadDigest
      ? []
      : [digestMismatchDiagnostic(expected.name, "restore", expected.payloadDigest, digest)];
  });
}

function shouldFetch(
  mode: ResolveOptions["mode"],
  entry: CapabilityEntry,
  locked: LockEntry | undefined,
): boolean {
  if (mode === "never") return false;
  if (mode === "force") return true;
  if (locked === undefined) return true;
  return (
    (entry.ref ?? null) !== (locked.ref ?? null) ||
    !sameStrings(entry.capabilities, locked.capabilities)
  );
}

function requiresRef(entry: CapabilityEntry): boolean {
  return entry.source.kind === "github" || entry.source.kind === "git";
}

/**
 * Whether every locked snapshot directory exists, deciding only whether a restore is due.
 * Whether a present snapshot still matches its lock is verified where snapshots are read
 * (core `resolveScopeCapabilities`); a modified one is reported, never silently replaced.
 */
async function lockInstalled(lockEntry: LockEntry, capabilitiesDir: string): Promise<boolean> {
  if (lockEntry.capabilityNames.length === 0) return false;
  for (const name of lockEntry.capabilityNames) {
    try {
      const stat = await lstat(path.join(capabilitiesDir, name));
      if (!stat.isDirectory()) return false;
    } catch (error) {
      if (isErrno(error, "ENOENT")) return false;
      throw error;
    }
  }
  return true;
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

async function materializeFetched(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  stagingDir: string,
  inspectedInventory?: SourceInventory,
): Promise<{
  ok: boolean;
  records: CapabilityRecord[];
  lockEntry: LockEntry | null;
  diagnostics: Diagnostic[];
}> {
  const inventory = inspectedInventory ?? (await inspectSource(fetched.root));
  const diagnostics = [...inventory.diagnostics];
  const records: CapabilityRecord[] = [];
  const selected = selectCapabilities(entry, fetched.root, inventory);
  diagnostics.push(...selected.diagnostics);
  if (diagnostics.some((item) => item.severity === "error")) {
    return { ok: false, records, lockEntry: null, diagnostics };
  }

  for (const candidate of selected.candidates) {
    const name = finalCapabilityName(entry, candidate.name);
    const destination = capabilityPath(stagingDir, name);
    try {
      if (candidate.synthesized) {
        await materializeImportedSkill(candidate, destination, fetched.commit);
      } else {
        await copySnapshot(candidate.root, destination);
      }
    } catch (error) {
      if (!(error instanceof SnapshotRejectedError)) throw error;
      diagnostics.push(snapshotRejectedDiagnostic(name, error));
      return { ok: false, records: [], lockEntry: null, diagnostics };
    }
    const digests = await computeCapabilityDigests(destination);
    records.push({
      entry,
      name,
      selector: candidate.selector,
      root: destination,
      commit: fetched.commit,
      contentHash: digests.capabilityHash,
      lockRecord: {
        name,
        format: candidate.synthesized ? "skills" : "acf",
        path: selectedSourcePath(entry, candidate),
        ...digests,
      },
    });
  }

  if (records.length === 0) return { ok: true, records, lockEntry: null, diagnostics };
  const lockEntry = lockEntryFor(entry, fetched, records, inventory.synthesized);
  return { ok: true, records, lockEntry, diagnostics };
}

function lockEntryFor(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  records: CapabilityRecord[],
  synthesized: boolean,
): LockEntry {
  const lockRecords = records.flatMap((record) =>
    record.lockRecord === undefined ? [] : [record.lockRecord],
  );
  const lockEntry: LockEntry = {
    capabilityHash: entryCapabilityHash(lockRecords) ?? emptyTreeHash(),
    capabilityNames: records.map((record) => record.name).sort(),
    selectorsByCapability: Object.fromEntries(
      records.map((record) => [record.name, record.selector]),
    ),
    source: sourceString(entry.source),
    sourceId: fetched.sourceId,
  };
  if (entry.capabilities !== undefined) lockEntry.capabilities = entry.capabilities;
  if (entry.exclude !== undefined) lockEntry.exclude = entry.exclude;
  if (entry.include !== undefined) lockEntry.include = entry.include;
  if (entry.ref !== undefined) lockEntry.ref = entry.ref;
  if (entry.rename !== undefined) lockEntry.rename = entry.rename;
  if (synthesized) lockEntry.synthesized = true;
  lockEntry.resolvedCapabilities = lockRecords;
  lockEntry.resolvedAt = new Date().toISOString();
  if (fetched.commit !== null) lockEntry.resolvedSha = fetched.commit;
  return lockEntry;
}

async function materializeImportedSkill(
  candidate: SourceCapabilityCandidate,
  destination: string,
  revision: string | null,
): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  // Leave out notices caplet itself emitted, so a target directory read back as a source
  // does not carry them into the snapshot.
  await copySnapshot(candidate.root, path.join(destination, "skills", candidate.name), {
    exclude: (relativePath) => path.posix.basename(relativePath) === "ACF-MANAGED.md",
  });
  const version = `0.0.0-unmanifested+${revision ?? "local"}`;
  await writeFile(
    path.join(destination, "acf.yml"),
    `acf: 1\nname: ${candidate.name}\nversion: ${version}\n`,
    "utf8",
  );
  await writeFile(
    path.join(destination, ".acf-import.json"),
    `${JSON.stringify({ acf: 1, synthesized: true, sourcePath: candidate.sourcePath })}\n`,
    "utf8",
  );
}

/** Package root of `candidate` relative to the source root (before `path:`), POSIX. */
function selectedSourcePath(entry: CapabilityEntry, candidate: SourceCapabilityCandidate): string {
  const entryPath = path.posix.normalize((entry.path ?? ".").replaceAll("\\", "/"));
  return path.posix.join(entryPath, candidate.sourcePath);
}

function finalCapabilityName(entry: CapabilityEntry, manifestName: string): string {
  if (typeof entry.rename === "string") return entry.rename;
  if (entry.rename !== undefined) return entry.rename[manifestName] ?? manifestName;
  return manifestName;
}

function snapshotRejectedDiagnostic(name: string, error: SnapshotRejectedError): Diagnostic {
  return {
    severity: "error",
    code: "acf.source.snapshot-rejected",
    message: `capability ${name}: ${error.message}`,
    data: { name, path: error.relativePath, reason: error.reason },
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

function emptyTreeHash(): string {
  return "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
}

function lockVersion(lock: CapabilitiesLock): number {
  return (lock as { acf: number }).acf;
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
