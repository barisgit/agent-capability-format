# packages/core/src/types/

## Responsibility
Defines the canonical TypeScript contracts for ACF source models, diagnostics, scope resolution, targets, emission, file diffs, and ownership sidecars.

## Design and Data Flow
`model.ts` models manifests and all facet families plus constants such as hook defaults/effect matrices. `emit.ts` defines target adapters, read-only filesystem boundaries, emit requests/results, install mappings, and managed ownership records. `index.ts` re-exports both sets.

## Integration
- Imports canonical operation/hook/trigger names from `@acf/runtime-taxonomy`.
- Shared by every core module and all downstream packages.
