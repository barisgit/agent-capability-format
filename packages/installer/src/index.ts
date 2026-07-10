export { readCapabilitiesYml } from "./capabilities-yml";
export { detectLockDrift } from "./drift";
export type { FetchedCapability, FetchOptions } from "./fetch";
export { fetchCapability } from "./fetch";
export { cloneFull, cloneShallow, fetchRef, revParseHead } from "./git";
export type { CapabilitiesLock, LockEntry } from "./lockfile";
export {
  canonicalizeLock,
  canonicalizePathLocation,
  readLockfile,
  sortLockEntries,
  sourceId,
  sourceString,
  writeLockfile,
} from "./lockfile";
export type { PruneResult } from "./prune";
export { pruneCapabilities } from "./prune";
export type { CapabilityRecord, ResolveOptions, ResolveResult } from "./resolve";
export { resolveCapabilities } from "./resolve";
