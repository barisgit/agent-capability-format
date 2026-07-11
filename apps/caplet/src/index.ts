export { type ApplyResult, applyDiffs } from "./apply/apply-diffs";
export {
  type DriftFs,
  detectDrift,
  hashOwnedRegions,
  type ManagedEntry,
  mergeSidecarEntry,
  type RemoveOwnedRegionsResult,
  readSidecar,
  relativeSidecarPath,
  removeOwnedRegions,
  writeSidecar,
} from "./apply/sidecar";
export { rootCommand } from "./cli";
