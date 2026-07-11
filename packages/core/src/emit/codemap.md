# packages/core/src/emit/

## Responsibility
Orchestrates target-specific emission for resolved capabilities.

## Design and Data Flow
`emit` resolves capabilities per scope, selects requested targets, applies capability/facet applicability, resolves install roots, and invokes each registered target adapter. It aggregates sorted `FileDiff` values and diagnostics by scope/target. `applyApplicability` filters a capability without mutating its source model.

### Management Notice Rendering
The managed-notices module exports:
- `MANAGEMENT_NOTICE_FILENAME` (`ACF-MANAGED.md`): Reserved filename for all management notices
- `ACF_SYSTEM_OWNER` (`acf-system`): Synthetic capability name for system-owned notices
- `RootInventoryArtifact`: Type describing inventory entries (capability, path, kind, ownership, facet)
- `renderArtifactNotice(capability)`: Generates per-skill notices identifying the owning capability
- `renderRootInventory(artifacts)`: Generates root-level inventory listing all managed artifacts grouped by capability, with deduplication and human-readable labels for ownership kinds and facet families

The root inventory uses stable deduplication via composite keys and sorted output for deterministic file content.

## Integration
- Depends on resolver, applicability, target registry, and emit/model types.
- Called by Caplet/SDK consumers after adapters register themselves.
- Consumed by caplet internal managed-notices for root inventory generation.
