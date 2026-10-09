import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { CapabilityEntry, SourceSpec } from "@caplet/core";

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
 * Absolute, normalized form of a `path:` location: `~` expands to the home directory and a
 * relative location resolves against `baseDir`.
 */
export function canonicalizePathLocation(location: string, baseDir = process.cwd()): string {
  if (location === "~") return homedir();
  if (location.startsWith("~/")) return path.resolve(homedir(), location.slice(2));
  if (path.isAbsolute(location)) return path.normalize(location);
  return path.resolve(baseDir, location);
}

/**
 * Lock key of an entry: its {@link sourceString} plus a normalized, URI-encoded `#path=` when
 * the entry selects a subdirectory. `ref` is not part of it, so a new ref updates the entry.
 */
export function entrySourceId(entry: CapabilityEntry, baseDir = process.cwd()): string {
  const source = sourceString(entry.source, baseDir);
  if (entry.path === undefined) return source;
  const normalizedPath = path.posix.normalize(entry.path.replaceAll("\\", "/"));
  return `${source}#path=${encodeURIComponent(normalizedPath)}`;
}

/**
 * The lock entry's `source`: `github:`, `git:` or `path:` with the location made absolute. It
 * identifies the repository or directory without an entry's `path:`, and lockfiles written before
 * `#path=` ids keyed entries by it.
 */
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

/** Hex SHA-256 of a source id and ref, naming its fetch cache and staging directories. */
export function cacheKeyFor(sourceIdValue: string, ref: string | undefined): string {
  return createHash("sha256")
    .update(sourceIdValue)
    .update("\0")
    .update(ref ?? "")
    .digest("hex");
}
