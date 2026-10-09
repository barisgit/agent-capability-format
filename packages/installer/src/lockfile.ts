import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { CapabilitiesLock, CapabilityEntry, SourceSpec } from "@caplet/core";

// The lock schema lives in @caplet/core so core, the installer and caplet share one
// definition; these re-exports keep the installer's public surface unchanged.
export type { CapabilitiesLock, LockEntry, LockedCapability } from "@caplet/core";
export {
  canonicalizeLock,
  readLockfile,
  sortLockEntries,
  writeLockfile,
} from "@caplet/core";

/**
 * The `acf` version a lockfile declares. `readLockfile` types it as `1` but passes a
 * future version through so drift detection can report `acf.lock.unsupported-version`.
 */
export function lockVersion(lock: CapabilitiesLock): number {
  return (lock as { acf: number }).acf;
}

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
