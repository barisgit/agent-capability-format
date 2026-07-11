# apps/caplet/src/internal/

## Responsibility
Provides shared CLI infrastructure for argument normalization, scope discovery, manifests, reporting, filesystem access, and end-to-end workflows.

## Design and Data Flow
Commands normalize flags in `args.ts`, resolve user/project roots in `scopes.ts` without mistaking the user root for project scope, and call `workflow.ts`. The workflow loads Caplet config, optionally resolves/fetches sources, reads capabilities, applies target applicability, asks registered adapters for diffs, deduplicates canonical skill output across targets, detects sidecar drift, and either describes or applies the plan. `output.ts` converts diagnostics and changes into stable terminal output and exit codes.

### Management Notice System
The managed-notices module orchestrates two kinds of `ACF-MANAGED.md` notices:
- **Root inventory notices**: Generated per install root, listing all managed artifacts grouped by capability with ownership and facet metadata. Uses `renderRootInventory` from core to produce a human-readable catalog.
- **Artifact notices**: Per-skill notices emitted by adapters (see adapters/common) that identify the owning capability.

The system:
1. Groups desired diffs by install root to collect artifact metadata
2. Overlays the selected plan on retained sidecar ownership so target-filtered applies preserve artifacts managed through unselected targets at shared roots
3. Generates root inventory diffs that replace the entire notice file
4. Diagnoses collisions where an unowned file exists at a reserved notice path
5. Provides `rootNoticeDiffFromSidecar` for the remove command to regenerate inventory after capability removal

## Integration
- Bridges command handlers to `@acf/core`, `@acf/installer`, `@acf/adapters`, and `../apply/`.
- `manifest.ts` reads and writes `.agents/capabilities.yml`.
- `managed-notices.ts` consumes sidecar data and core rendering functions.
