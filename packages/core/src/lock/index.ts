/**
 * The one `capabilities.lock` schema shared by core, the installer and caplet
 * (SPEC.md §19; install-integrity, One lock schema with per-capability provenance).
 *
 * Parsing is strict for the fields integrity depends on (names become snapshot
 * directories, digests gate emission) and lenient for optional bookkeeping, so
 * lockfiles written before a field existed keep reading. Writing is canonical:
 * entries sorted by `sourceId`, keys alphabetical, selector values sorted.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PAYLOAD_DIGEST_PATTERN } from "../hash/payload-digest.js";
import { type SourceFormat, sourceFormats } from "../types/interop.js";
import { type CapabilityEntry, type Diagnostic, selectorKeys } from "../types/model.js";

/** Provenance and integrity of one capability a lock entry produced. */
export type LockedCapability = {
  /** Final capability name, after `rename`. */
  name: string;
  format: SourceFormat;
  /** Version of the source format, absent when the format has none. */
  formatVersion?: string | undefined;
  /** Selected package root relative to the source root, POSIX separators, `.` for the root. */
  path: string;
  /** `acf-tree-2:sha256:<hex>` of the materialized snapshot (SPEC.md §19.6). */
  payloadDigest: string;
  /** v1 `sha256-<hex>` of the materialized snapshot (SPEC.md §19.5). */
  capabilityHash: string;
};

/** One resolved `capabilities.yml` entry. */
export type LockEntry = {
  /**
   * v1 hash kept for `acf: 1` readers. With several capabilities it is the hash of the
   * first by name; `resolvedCapabilities` holds every capability's own hash.
   */
  capabilityHash: string;
  capabilityNames: string[];
  capabilities?: string[] | undefined;
  selectorsByCapability?: Record<string, string> | undefined;
  except?: CapabilityEntry["except"] | undefined;
  exclude?: CapabilityEntry["exclude"] | undefined;
  /**
   * The entry's requested `format:`; absent when the format was detected. The format each
   * capability was read as is `resolvedCapabilities[].format`.
   */
  format?: SourceFormat | undefined;
  include?: CapabilityEntry["include"] | undefined;
  only?: CapabilityEntry["only"] | undefined;
  ref?: string | undefined;
  rename?: CapabilityEntry["rename"] | undefined;
  resolvedAt?: string | undefined;
  /** One record per name in `capabilityNames`; absent in lockfiles written before it existed. */
  resolvedCapabilities?: LockedCapability[] | undefined;
  resolvedSha?: string | undefined;
  source: string;
  sourceId: string;
  synthesized?: true | undefined;
};

export type CapabilitiesLock = { acf: 1; entries: LockEntry[] };

type MutableLockEntry = { [K in keyof LockEntry]?: LockEntry[K] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const V1_HASH = /^sha256-[a-f0-9]{64}$/;

/** Reads and parses a lockfile; `null` when it does not exist. Throws on malformed content. */
export async function readLockfile(lockPath: string): Promise<CapabilitiesLock | null> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
  return parseLock(JSON.parse(raw) as unknown, lockPath);
}

/** Writes the canonical form of `lock`, creating the parent directory. */
export async function writeLockfile(lockPath: string, lock: CapabilitiesLock): Promise<void> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, serializeLock(lock), "utf8");
}

/** The exact bytes {@link writeLockfile} writes. */
export function serializeLock(lock: CapabilitiesLock): string {
  return `${JSON.stringify(canonicalizeLock(lock), null, 2)}\n`;
}

/** Returns `lock` with sorted entries and canonical key order. */
export function canonicalizeLock(lock: CapabilitiesLock): CapabilitiesLock {
  return { acf: 1, entries: sortLockEntries(lock.entries) };
}

/** Sorts entries by `sourceId` and canonicalizes each one. */
export function sortLockEntries(entries: LockEntry[]): LockEntry[] {
  return [...entries].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(canonicalizeEntry);
}

/** Finds the lock record of an installed capability by its final name. */
export function findLockedCapability(
  lock: CapabilitiesLock,
  name: string,
): { entry: LockEntry; capability: LockedCapability | undefined } | undefined {
  for (const entry of lock.entries) {
    if (!entry.capabilityNames.includes(name)) continue;
    return { entry, capability: entry.resolvedCapabilities?.find((item) => item.name === name) };
  }
  return undefined;
}

/**
 * Narrows an entry to the capabilities in `names`, keeping its selectors and records
 * consistent and recomputing the entry-level v1 hash from the remaining records.
 */
export function retainLockedCapabilities(entry: LockEntry, names: readonly string[]): LockEntry {
  const keep = new Set(names);
  const next: LockEntry = {
    ...entry,
    capabilityNames: entry.capabilityNames.filter((name) => keep.has(name)),
  };
  if (entry.selectorsByCapability !== undefined) {
    next.selectorsByCapability = Object.fromEntries(
      Object.entries(entry.selectorsByCapability).filter(([name]) => keep.has(name)),
    );
  }
  if (entry.resolvedCapabilities !== undefined) {
    const records = entry.resolvedCapabilities.filter((record) => keep.has(record.name));
    next.resolvedCapabilities = records;
    next.capabilityHash = entryCapabilityHash(records) ?? entry.capabilityHash;
  }
  return next;
}

/**
 * Where a payload digest stopped matching its lock record: an installed snapshot that was
 * modified after locking, or a locked restore whose source no longer yields the locked bytes.
 */
export type DigestMismatchSite = "snapshot" | "restore";

/**
 * The `acf.lock.digest-mismatch` error for capability `name` (install-integrity, Verify
 * before emission and frozen restore). `actual` is the recomputed digest, or why none
 * could be computed. The message names the capability and how to recover.
 */
export function digestMismatchDiagnostic(
  name: string,
  site: DigestMismatchSite,
  expected: string,
  actual: string,
): Diagnostic {
  const problem =
    site === "snapshot"
      ? "installed snapshot was modified after locking"
      : "source no longer provides the locked content";
  const recovery =
    site === "snapshot"
      ? "delete the snapshot directory to restore the locked content, or run `caplet update` to re-resolve"
      : "run `caplet update` to accept the new content";
  return {
    severity: "error",
    code: "acf.lock.digest-mismatch",
    capability: { name },
    message: `capability ${name}: ${problem} (expected ${expected}, found ${actual}); ${recovery}`,
    data: { name, site, expected, actual },
  };
}

/** The entry-level v1 hash for a set of records: the first record's by name. */
export function entryCapabilityHash(records: readonly LockedCapability[]): string | undefined {
  return [...records].sort(byName)[0]?.capabilityHash;
}

function canonicalizeEntry(entry: LockEntry): LockEntry {
  const ordered: MutableLockEntry = {};
  ordered.capabilityHash = entry.capabilityHash;
  ordered.capabilityNames = [...entry.capabilityNames].sort();
  if (entry.capabilities !== undefined) ordered.capabilities = [...entry.capabilities].sort();
  if (entry.selectorsByCapability !== undefined) {
    ordered.selectorsByCapability = sortStringRecord(entry.selectorsByCapability);
  }
  if (entry.except !== undefined) ordered.except = [...entry.except].sort();
  if (entry.exclude !== undefined) ordered.exclude = sortSelector(entry.exclude);
  if (entry.format !== undefined) ordered.format = entry.format;
  if (entry.include !== undefined) ordered.include = sortSelector(entry.include);
  if (entry.only !== undefined) ordered.only = [...entry.only].sort();
  if (entry.ref !== undefined) ordered.ref = entry.ref;
  if (entry.rename !== undefined) ordered.rename = sortRename(entry.rename);
  if (entry.resolvedAt !== undefined) ordered.resolvedAt = entry.resolvedAt;
  if (entry.resolvedCapabilities !== undefined) {
    ordered.resolvedCapabilities = [...entry.resolvedCapabilities]
      .sort(byName)
      .map(canonicalizeRecord);
  }
  if (entry.resolvedSha !== undefined && !entry.source.startsWith("path:")) {
    ordered.resolvedSha = entry.resolvedSha;
  }
  if (entry.synthesized === true) ordered.synthesized = true;
  ordered.source = entry.source;
  ordered.sourceId = entry.sourceId;
  return ordered as LockEntry;
}

function canonicalizeRecord(record: LockedCapability): LockedCapability {
  return {
    capabilityHash: record.capabilityHash,
    format: record.format,
    ...(record.formatVersion === undefined ? {} : { formatVersion: record.formatVersion }),
    name: record.name,
    path: record.path,
    payloadDigest: record.payloadDigest,
  };
}

function byName(a: LockedCapability, b: LockedCapability): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function sortSelector(
  selector: NonNullable<CapabilityEntry["include"]>,
): CapabilityEntry["include"] {
  const sorted: Record<string, string[]> = {};
  const record = selector as Record<string, string[] | undefined>;
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) sorted[key] = [...value].sort();
  }
  return sorted as CapabilityEntry["include"];
}

function sortRename(rename: NonNullable<CapabilityEntry["rename"]>): CapabilityEntry["rename"] {
  if (typeof rename === "string") return rename;
  return sortStringRecord(rename);
}

function sortStringRecord(record: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) sorted[key] = value;
  }
  return sorted;
}

/** Validates parsed JSON as a lockfile; `lockPath` only labels errors. */
export function parseLock(value: unknown, lockPath: string): CapabilitiesLock {
  if (!isRecord(value)) throw new Error(`invalid capabilities.lock at ${lockPath}`);
  if (typeof value.acf !== "number") {
    throw new Error(`invalid capabilities.lock acf at ${lockPath}`);
  }
  if (!Array.isArray(value.entries)) {
    throw new Error(`invalid capabilities.lock entries at ${lockPath}`);
  }
  const entries = value.entries.map((entry) => parseLockEntry(entry, lockPath));
  // A future version is reported by drift detection (`acf.lock.unsupported-version`).
  return { acf: value.acf as 1, entries };
}

function parseLockEntry(value: unknown, lockPath: string): LockEntry {
  if (!isRecord(value)) throw new Error(`invalid capabilities.lock entry at ${lockPath}`);
  const { capabilityHash, capabilityNames, source, sourceId } = value;
  if (typeof capabilityHash !== "string") throw new Error("invalid lock capabilityHash");
  if (!isCapabilityNameArray(capabilityNames)) throw new Error("invalid lock capabilityNames");
  if (typeof source !== "string") throw new Error("invalid lock source");
  if (typeof sourceId !== "string") throw new Error("invalid lock sourceId");
  const entry: MutableLockEntry = { capabilityHash, capabilityNames, source, sourceId };
  if (isStringArray(value.capabilities) && value.capabilities.length > 0) {
    entry.capabilities = value.capabilities;
  }
  if (isCapabilitySelectorMap(value.selectorsByCapability)) {
    entry.selectorsByCapability = value.selectorsByCapability;
  }
  if (isStringArray(value.except)) entry.except = value.except;
  if (isSelector(value.exclude)) entry.exclude = value.exclude;
  if (isSourceFormat(value.format)) entry.format = value.format;
  if (isSelector(value.include)) entry.include = value.include;
  if (isStringArray(value.only)) entry.only = value.only;
  if (typeof value.ref === "string") entry.ref = value.ref;
  if (isRename(value.rename)) entry.rename = value.rename;
  if (typeof value.resolvedAt === "string") entry.resolvedAt = value.resolvedAt;
  if (value.resolvedCapabilities !== undefined) {
    entry.resolvedCapabilities = parseLockedCapabilities(
      value.resolvedCapabilities,
      capabilityNames,
    );
  }
  if (typeof value.resolvedSha === "string") entry.resolvedSha = value.resolvedSha;
  if (value.synthesized === true) entry.synthesized = true;
  return entry as LockEntry;
}

// Records gate emission, so a malformed record fails the read instead of being dropped.
function parseLockedCapabilities(value: unknown, names: readonly string[]): LockedCapability[] {
  if (!Array.isArray(value)) throw new Error("invalid lock resolvedCapabilities");
  const records = value.map(parseLockedCapability);
  const recorded = records.map((record) => record.name).sort();
  const expected = [...names].sort();
  if (recorded.join("\0") !== expected.join("\0")) {
    throw new Error("invalid lock resolvedCapabilities: names differ from capabilityNames");
  }
  return records;
}

function parseLockedCapability(value: unknown): LockedCapability {
  if (!isRecord(value)) throw new Error("invalid lock resolvedCapabilities entry");
  const { name, format, formatVersion, path: sourcePath, payloadDigest, capabilityHash } = value;
  if (typeof name !== "string" || !SLUG.test(name)) throw new Error("invalid lock capability name");
  if (!isSourceFormat(format)) throw new Error(`invalid lock capability format for ${name}`);
  if (formatVersion !== undefined && typeof formatVersion !== "string") {
    throw new Error(`invalid lock capability formatVersion for ${name}`);
  }
  if (typeof sourcePath !== "string") throw new Error(`invalid lock capability path for ${name}`);
  if (typeof payloadDigest !== "string" || !PAYLOAD_DIGEST_PATTERN.test(payloadDigest)) {
    throw new Error(`invalid lock payloadDigest for ${name}`);
  }
  if (typeof capabilityHash !== "string" || !V1_HASH.test(capabilityHash)) {
    throw new Error(`invalid lock capabilityHash for ${name}`);
  }
  const record: LockedCapability = {
    name,
    format,
    path: sourcePath,
    payloadDigest,
    capabilityHash,
  };
  if (formatVersion !== undefined) record.formatVersion = formatVersion;
  return record;
}

function isSourceFormat(value: unknown): value is SourceFormat {
  return typeof value === "string" && (sourceFormats as readonly string[]).includes(value);
}

function isSelector(value: unknown): value is NonNullable<CapabilityEntry["include"]> {
  if (!isRecord(value)) return false;
  const keys: readonly string[] = Object.values(selectorKeys);
  return Object.entries(value).every(([key, names]) => keys.includes(key) && isStringArray(names));
}

function isRename(value: unknown): value is NonNullable<CapabilityEntry["rename"]> {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCapabilityNameArray(value: unknown): value is string[] {
  return isStringArray(value) && value.every((item) => SLUG.test(item));
}

function isCapabilitySelectorMap(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([name, selector]) => SLUG.test(name) && typeof selector === "string" && selector.length > 0,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return isRecord(error) && error.code === code;
}
