import { cp, lstat, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  computeContentHash,
  type Diagnostic,
  readRepositoryCapabilities,
  type ScopeRoot,
} from "@acf/core";
import { readCapabilitiesYml } from "./capabilities-yml";
import { detectLockDrift } from "./drift";
import { type FetchedCapability, type FetchOptions, fetchCapability } from "./fetch";
import {
  type CapabilitiesLock,
  canonicalizeLock,
  canonicalizePathLocation,
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
  const diagnostics: Diagnostic[] = [];
  const manifest = await readCapabilitiesYml(opts.scopeRoot.manifestPath);
  diagnostics.push(...manifest.diagnostics);
  const yml = normalizeCapabilitiesYml(manifest.value, path.dirname(opts.scopeRoot.manifestPath));
  const existingLock = await readLockfile(opts.scopeRoot.lockPath);
  const usableLock = existingLock !== null && lockVersion(existingLock) === 1 ? existingLock : null;
  diagnostics.push(...driftDiagnosticsForMode(yml, existingLock, opts.mode));

  await mkdir(opts.scopeRoot.capabilitiesDir, { recursive: true });
  const records: CapabilityRecord[] = [];
  const nextEntries: LockEntry[] = [];
  let fetched = false;
  const lockedBySource = new Map(
    (usableLock?.entries ?? []).map((entry) => [entry.sourceId, entry]),
  );

  for (const entry of yml.capabilities) {
    const id = sourceId(entry.source);
    const locked = lockedBySource.get(id);
    if (requiresRef(entry) && entry.ref === undefined) {
      diagnostics.push(refRequiredDiagnostic(entry, id));
      continue;
    }
    const fetchNeeded =
      shouldFetch(opts.mode, entry, locked) ||
      (opts.mode === "auto" &&
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
    const materialized = await materializeFetched(entry, fetchedCapability, opts);
    diagnostics.push(...materialized.diagnostics);
    records.push(...materialized.records);
    if (materialized.lockEntry !== null) nextEntries.push(materialized.lockEntry);
    fetched = true;
  }

  const lockfile = canonicalizeLock({ acf: 1, entries: nextEntries });
  if (opts.mode !== "never" && opts.updateLock !== false && (fetched || existingLock === null)) {
    await writeLockfile(opts.scopeRoot.lockPath, lockfile);
  }
  return { capabilities: records.sort(byRecordName), lockfile, diagnostics };
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
  return diagnostics.filter((diagnostic) => diagnostic.code !== "acf.lock.missing-entry");
}

function shouldFetch(
  mode: ResolveOptions["mode"],
  entry: CapabilityEntry,
  locked: LockEntry | undefined,
): boolean {
  if (mode === "never") return false;
  if (mode === "force") return true;
  if (locked === undefined) return true;
  return (entry.ref ?? null) !== (locked.ref ?? null);
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
    root: path.join(capabilitiesDir, name),
    commit: lockEntry.resolvedSha ?? null,
    contentHash: lockEntry.capabilityHash,
  }));
}

async function materializeFetched(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  opts: ResolveOptions,
): Promise<{
  records: CapabilityRecord[];
  lockEntry: LockEntry | null;
  diagnostics: Diagnostic[];
}> {
  const repository = await readRepositoryCapabilities(fetched.root, opts.scope);
  const diagnostics = [...repository.diagnostics];
  const records: CapabilityRecord[] = [];

  for (const capability of repository.capabilities) {
    const name = finalCapabilityName(entry, capability.manifest.name);
    const destination = path.join(opts.scopeRoot.capabilitiesDir, name);
    await copyRegularTree(capability.root, destination);
    const contentHash = await computeContentHash(destination);
    records.push({ entry, name, root: destination, commit: fetched.commit, contentHash });
  }

  if (records.length === 0) return { records, lockEntry: null, diagnostics };
  const lockEntry = lockEntryFor(entry, fetched, records);
  return { records, lockEntry, diagnostics };
}

function lockEntryFor(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  records: CapabilityRecord[],
): LockEntry {
  const first = records[0];
  const lockEntry: LockEntry = {
    capabilityHash: first?.contentHash ?? emptyTreeHash(),
    capabilityNames: records.map((record) => record.name).sort(),
    source: sourceString(entry.source),
    sourceId: fetched.sourceId,
  };
  if (entry.exclude !== undefined) lockEntry.exclude = entry.exclude;
  if (entry.include !== undefined) lockEntry.include = entry.include;
  if (entry.ref !== undefined) lockEntry.ref = entry.ref;
  if (entry.rename !== undefined) lockEntry.rename = entry.rename;
  lockEntry.resolvedAt = new Date().toISOString();
  if (fetched.commit !== null) lockEntry.resolvedSha = fetched.commit;
  return lockEntry;
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
