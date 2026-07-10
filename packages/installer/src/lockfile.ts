import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { CapabilityEntry, SourceSpec } from "@acf/core";

export type LockEntry = {
  capabilityHash: string;
  capabilityNames: string[];
  exclude?: CapabilityEntry["exclude"] | undefined;
  include?: CapabilityEntry["include"] | undefined;
  ref?: string | undefined;
  rename?: CapabilityEntry["rename"] | undefined;
  resolvedAt?: string | undefined;
  resolvedSha?: string | undefined;
  source: string;
  sourceId: string;
};

export type CapabilitiesLock = { acf: 1; entries: LockEntry[] };

type MutableLockEntry = { [K in keyof LockEntry]?: LockEntry[K] };

export function canonicalizePathLocation(location: string, baseDir = process.cwd()): string {
  if (location === "~") return homedir();
  if (location.startsWith("~/")) return path.resolve(homedir(), location.slice(2));
  if (path.isAbsolute(location)) return path.normalize(location);
  return path.resolve(baseDir, location);
}

export function sourceId(spec: SourceSpec, baseDir = process.cwd()): string {
  return sourceString(spec, baseDir);
}

export function entrySourceId(entry: CapabilityEntry, baseDir = process.cwd()): string {
  const source = sourceId(entry.source, baseDir);
  if (entry.path === undefined) return source;
  const normalizedPath = path.posix.normalize(entry.path.replaceAll("\\", "/"));
  return `${source}#path=${encodeURIComponent(normalizedPath)}`;
}

export function sourceString(spec: SourceSpec, baseDir = process.cwd()): string {
  switch (spec.kind) {
    case "github":
      return `github:${spec.repo}`;
    case "git":
      return `git:${spec.url}`;
    case "path":
      return `path:${canonicalizePathLocation(spec.location, baseDir)}`;
  }
}

export function cacheKeyFor(sourceIdValue: string, ref: string | undefined): string {
  return createHash("sha256")
    .update(sourceIdValue)
    .update("\0")
    .update(ref ?? "")
    .digest("hex");
}

export async function readLockfile(lockPath: string): Promise<CapabilitiesLock | null> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
  const parsed: unknown = JSON.parse(raw) as unknown;
  return parseLock(parsed, lockPath);
}

export async function writeLockfile(lockPath: string, lock: CapabilitiesLock): Promise<void> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const canonical = canonicalizeLock(lock);
  await writeFile(lockPath, `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
}

export function canonicalizeLock(lock: CapabilitiesLock): CapabilitiesLock {
  return { acf: 1, entries: sortLockEntries(lock.entries) };
}

export function sortLockEntries(entries: LockEntry[]): LockEntry[] {
  return [...entries].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(canonicalizeEntry);
}

function canonicalizeEntry(entry: LockEntry): LockEntry {
  const ordered: MutableLockEntry = {};
  ordered.capabilityHash = entry.capabilityHash;
  ordered.capabilityNames = [...entry.capabilityNames].sort();
  if (entry.exclude !== undefined) ordered.exclude = sortSelector(entry.exclude);
  if (entry.include !== undefined) ordered.include = sortSelector(entry.include);
  if (entry.ref !== undefined) ordered.ref = entry.ref;
  if (entry.rename !== undefined) ordered.rename = sortRename(entry.rename);
  if (entry.resolvedAt !== undefined) ordered.resolvedAt = entry.resolvedAt;
  if (entry.resolvedSha !== undefined && !entry.source.startsWith("path:")) {
    ordered.resolvedSha = entry.resolvedSha;
  }
  ordered.source = entry.source;
  ordered.sourceId = entry.sourceId;
  return ordered as LockEntry;
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
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(rename).sort()) {
    const value = rename[key];
    if (value !== undefined) sorted[key] = value;
  }
  return sorted;
}

function parseLock(value: unknown, lockPath: string): CapabilitiesLock {
  if (!isRecord(value)) throw new Error(`invalid capabilities.lock at ${lockPath}`);
  if (typeof value.acf !== "number") {
    throw new Error(`invalid capabilities.lock acf at ${lockPath}`);
  }
  if (!Array.isArray(value.entries)) {
    throw new Error(`invalid capabilities.lock entries at ${lockPath}`);
  }
  const entries = value.entries.map((entry) => parseLockEntry(entry, lockPath));
  return { acf: value.acf as 1, entries };
}

function parseLockEntry(value: unknown, lockPath: string): LockEntry {
  if (!isRecord(value)) throw new Error(`invalid capabilities.lock entry at ${lockPath}`);
  const required = {
    capabilityHash: value.capabilityHash,
    capabilityNames: value.capabilityNames,
    source: value.source,
    sourceId: value.sourceId,
  };
  if (typeof required.capabilityHash !== "string") throw new Error("invalid lock capabilityHash");
  if (!isStringArray(required.capabilityNames)) throw new Error("invalid lock capabilityNames");
  if (typeof required.source !== "string") throw new Error("invalid lock source");
  if (typeof required.sourceId !== "string") throw new Error("invalid lock sourceId");
  const entry: MutableLockEntry = {
    capabilityHash: required.capabilityHash,
    capabilityNames: required.capabilityNames,
    source: required.source,
    sourceId: required.sourceId,
  };
  if (isSelector(value.exclude)) entry.exclude = value.exclude;
  if (isSelector(value.include)) entry.include = value.include;
  if (typeof value.ref === "string") entry.ref = value.ref;
  if (isRename(value.rename)) entry.rename = value.rename;
  if (typeof value.resolvedAt === "string") entry.resolvedAt = value.resolvedAt;
  if (typeof value.resolvedSha === "string") entry.resolvedSha = value.resolvedSha;
  return entry as LockEntry;
}

function isSelector(value: unknown): value is NonNullable<CapabilityEntry["include"]> {
  if (!isRecord(value)) return false;
  for (const item of Object.values(value)) {
    if (!isStringArray(item)) return false;
  }
  return true;
}

function isRename(value: unknown): value is NonNullable<CapabilityEntry["rename"]> {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return isRecord(error) && error.code === code;
}
