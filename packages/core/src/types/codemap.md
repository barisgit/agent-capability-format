# packages/core/src/types/

## Responsibility
Defines the canonical TypeScript contracts for ACF source models, diagnostics, scope resolution, targets, emission, file diffs, and ownership sidecars.

## Design and Data Flow
`model.ts` models manifests, source entries with normalized capability selectors, and all facet families plus constants such as hook defaults/effect matrices. `emit.ts` defines target adapters, read-only filesystem boundaries, emit requests/results, install mappings, and managed ownership records.

### Management Notice Types
The emit types include:
- `FileDiff.managementNotice?: "root" | "artifact"`: Marks diffs as management notices to distinguish them from content diffs
- `RootInventoryArtifact`: Inventory entry type for root notices (capability, path, kind, ownership, facet)
- `AcfManagedSidecar`: Sidecar schema that tracks all managed files with their ownership and hashes

## Integration
- Imports canonical operation/hook/trigger names from `@acf/runtime-taxonomy`.
- Shared by every core module and all downstream packages.
