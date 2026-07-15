import { cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  computeContentHash,
  type Diagnostic,
  type ScopeRoot,
} from "@acf/core";
import { readCapabilitiesYml } from "./capabilities-yml";
import { detectLockDrift } from "./drift";
import { type FetchedCapability, type FetchOptions, fetchCapability } from "./fetch";
import { inspectSource, type SourceCapabilityCandidate, type SourceInventory } from "./inventory";
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
} from "./lockfile";

export type ResolveOptions = {
  scope: "user" | "project";
  scopeRoot: ScopeRoot;
  mode: "auto" | "never" | "force";
  sourceIds?: readonly string[] | undefined;
  updateLock?: boolean | undefined;
};

export type ResolveResult = {
  capabilities: CapabilityRecord[];
  lockfile: CapabilitiesLock;
  diagnostics: Diagnostic[];
};

export type CapabilityRecord = {
  entry: CapabilityEntry;
  name: string;
  root: string;
  commit: string | null;
  contentHash: string;
};

export async function resolveCapabilities(opts: ResolveOptions): Promise<ResolveResult> {
  await mkdir(opts.scopeRoot.agentsDir, { recursive: true });
  const stagingDir = await mkdtemp(path.join(opts.scopeRoot.agentsDir, ".acf-staging-"));
  try {
    return await resolveCapabilitiesStaged(opts, stagingDir);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function resolveCapabilitiesStaged(
  opts: ResolveOptions,
  stagingDir: string,
): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [];
  const manifest = await readCapabilitiesYml(opts.scopeRoot.manifestPath);
  diagnostics.push(...manifest.diagnostics);
  const yml = normalizeCapabilitiesYml(manifest.value, path.dirname(opts.scopeRoot.manifestPath));
  const existingLock = await readLockfile(opts.scopeRoot.lockPath);
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

    const fetchedCapability = await fetchCapability(entry, fetchOptions(yml, opts.scopeRoot));
    const sourceStagingDir = path.join(
      stagingDir,
      cacheKeyFor(fetchedCapability.sourceId, entry.ref),
    );
    const materialized = await materializeFetched(entry, fetchedCapability, sourceStagingDir);
    diagnostics.push(...materialized.diagnostics);
    if (!materialized.ok) {
      failed = true;
      if (locked !== undefined) {
        nextEntries.push(locked);
        records.push(...recordsFromLock(entry, locked, opts.scopeRoot.capabilitiesDir));
      }
      continue;
    }
    records.push(...materialized.records);
    if (materialized.lockEntry !== null) nextEntries.push(materialized.lockEntry);
    fetched = true;
  }

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

function selectCapabilities(
  entry: CapabilityEntry,
  sourceRoot: string,
  inventory: SourceInventory,
): { candidates: SourceCapabilityCandidate[]; diagnostics: Diagnostic[] } {
  if (entry.capabilities === undefined)
    return { candidates: inventory.candidates, diagnostics: [] };
  if (inventory.synthesized) {
    const selected = new Set<SourceCapabilityCandidate>();
    const diagnostics: Diagnostic[] = [];
    for (const selector of entry.capabilities) {
      const matches = inventory.candidates.filter((candidate) =>
        globMatches(selector, candidate.name),
      );
      if (matches.length === 0) {
        diagnostics.push({
          severity: "error",
          code: "acf.resolve.capability-selector-unmatched",
          message: `capability selector matched nothing: ${selector}`,
          path: sourceRoot,
          data: { selector, candidates: inventory.candidates.map((candidate) => candidate.name) },
        });
      }
      for (const match of matches) selected.add(match);
    }
    return { candidates: [...selected], diagnostics };
  }
  const collectionRoot = path.join(sourceRoot, "acf");
  const candidates = inventory.candidates
    .map((candidate) => ({
      candidate,
      relative: path.relative(collectionRoot, candidate.root).replaceAll(path.sep, "/"),
    }))
    .filter(
      (item) =>
        item.relative.length > 0 && item.relative !== ".." && !item.relative.startsWith("../"),
    );
  if (candidates.length === 0) {
    return {
      candidates: [],
      diagnostics: [
        {
          severity: "error",
          code: "acf.resolve.capability-selector-direct-source",
          message: "capabilities selectors require a source collection with an acf/ directory",
          path: sourceRoot,
        },
      ],
    };
  }
  const selected = new Set<SourceCapabilityCandidate>();
  const diagnostics: Diagnostic[] = [];
  for (const selector of entry.capabilities) {
    const matches = candidates.filter((item) => globMatches(selector, item.relative));
    if (matches.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "acf.resolve.capability-selector-unmatched",
        message: `capability selector matched nothing: ${selector}`,
        path: sourceRoot,
        data: { selector, candidates: candidates.map((item) => item.relative).sort() },
      });
    }
    for (const match of matches) selected.add(match.candidate);
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
  return lockEntry.capabilityNames.map((name) => ({
    entry,
    name,
    root: capabilityPath(capabilitiesDir, name),
    commit: lockEntry.resolvedSha ?? null,
    contentHash: lockEntry.capabilityHash,
  }));
}

async function materializeFetched(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  stagingDir: string,
): Promise<{
  ok: boolean;
  records: CapabilityRecord[];
  lockEntry: LockEntry | null;
  diagnostics: Diagnostic[];
}> {
  const inventory = await inspectSource(fetched.root);
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
    if (candidate.synthesized) {
      await materializeImportedSkill(candidate, destination, fetched.commit);
    } else {
      await copyRegularTree(candidate.root, destination);
    }
    const contentHash = await computeContentHash(destination);
    records.push({ entry, name, root: destination, commit: fetched.commit, contentHash });
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
  const first = records[0];
  const lockEntry: LockEntry = {
    capabilityHash: first?.contentHash ?? emptyTreeHash(),
    capabilityNames: records.map((record) => record.name).sort(),
    source: sourceString(entry.source),
    sourceId: fetched.sourceId,
  };
  if (entry.capabilities !== undefined) lockEntry.capabilities = entry.capabilities;
  if (entry.exclude !== undefined) lockEntry.exclude = entry.exclude;
  if (entry.include !== undefined) lockEntry.include = entry.include;
  if (entry.ref !== undefined) lockEntry.ref = entry.ref;
  if (entry.rename !== undefined) lockEntry.rename = entry.rename;
  if (synthesized) lockEntry.synthesized = true;
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
  await mkdir(path.join(destination, "skills", candidate.name), { recursive: true });
  await copyPortableSkillTree(candidate.root, path.join(destination, "skills", candidate.name));
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

async function copyPortableSkillTree(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    filter: async (candidate) => {
      const relative = path.relative(source, candidate);
      const segments = relative.split(path.sep).filter(Boolean);
      if (segments.some((segment) => segment.startsWith(".") || segment === "node_modules")) {
        return false;
      }
      if (path.basename(candidate) === "ACF-MANAGED.md") return false;
      const stat = await lstat(candidate);
      return stat.isDirectory() || stat.isFile();
    },
  });
}

async function copyRegularTree(source: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    filter: async (candidate) => {
      const stat = await lstat(candidate);
      return stat.isDirectory() || stat.isFile();
    },
  });
}

function finalCapabilityName(entry: CapabilityEntry, manifestName: string): string {
  if (typeof entry.rename === "string") return entry.rename;
  if (entry.rename !== undefined) return entry.rename[manifestName] ?? manifestName;
  return manifestName;
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
