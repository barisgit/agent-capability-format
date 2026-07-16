export { readCapabilitiesYml } from "./capabilities-yml";
export { detectLockDrift } from "./drift";
export type { FetchedCapability, FetchOptions } from "./fetch";
export { fetchCapability } from "./fetch";
export { cloneFull, cloneShallow, fetchRef, revParseHead } from "./git";
export type { SourceCapabilityCandidate, SourceInventory } from "./inventory";
export { inspectSource } from "./inventory";
export type { CapabilitiesLock, LockEntry } from "./lockfile";
export {
  canonicalizeLock,
  canonicalizePathLocation,
  entrySourceId,
  readLockfile,
  sortLockEntries,
  sourceId,
  sourceString,
  writeLockfile,
} from "./lockfile";
export type { PruneResult } from "./prune";
export { pruneCapabilities } from "./prune";
export type { CapabilityRecord, PrefetchedSource, ResolveOptions, ResolveResult } from "./resolve";
export { resolveCapabilities } from "./resolve";
