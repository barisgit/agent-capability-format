export { type ApplyResult, applyDiffs } from "./apply/apply-diffs.js";
export {
  type DriftFs,
  detectDrift,
  hashOwnedRegions,
  type ManagedEntry,
  mergeSidecarEntry,
  readSidecar,
  relativeSidecarPath,
  writeSidecar,
} from "./apply/sidecar.js";
export { rootCommand } from "./cli.js";
