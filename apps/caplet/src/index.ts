export { type ApplyResult, applyDiffs } from "./apply/apply-diffs.js";
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
} from "./apply/sidecar.js";
export { rootCommand } from "./cli.js";
