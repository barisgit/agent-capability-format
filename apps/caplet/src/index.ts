export { applyDiffs, type ApplyResult } from "./apply/apply-diffs";
export {
  detectDrift,
  hashOwnedRegions,
  mergeSidecarEntry,
  readSidecar,
  relativeSidecarPath,
  removeOwnedRegions,
  writeSidecar,
  type DriftFs,
  type ManagedEntry,
  type RemoveOwnedRegionsResult,
} from "./apply/sidecar";
export { rootCommand } from "./cli";
