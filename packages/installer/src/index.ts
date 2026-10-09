export { readCapabilitiesYml } from "./capabilities-yml.js";
export { detectLockDrift } from "./drift.js";
export type { FetchedCapability, FetchOptions } from "./fetch.js";
export { fetchCapability } from "./fetch.js";
export { cloneFull, cloneShallow, fetchRef, revParseHead } from "./git.js";
export type { SourceCapabilityCandidate, SourceInventory } from "./inventory.js";
export { inspectSource } from "./inventory.js";
export type { CapabilitiesLock, LockEntry, LockedCapability } from "./lockfile.js";
export {
  canonicalizeLock,
  canonicalizePathLocation,
  entrySourceId,
  readLockfile,
  sortLockEntries,
  sourceString,
  writeLockfile,
} from "./lockfile.js";
export type { CapabilityRecord } from "./materialize.js";
export type { PruneResult } from "./prune.js";
export { pruneCapabilities } from "./prune.js";
export type {
  PrefetchedSource,
  ResolveOptions,
  ResolveResult,
} from "./resolve.js";
export { resolveCapabilities } from "./resolve.js";
