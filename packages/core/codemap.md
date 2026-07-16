# packages/core/

## Responsibility
Packages `@acf/core`, the canonical domain model and processing pipeline for ACF capabilities, including synthesized imported skills.

## Design and Data Flow
The package exports typed schemas, marker-aware readers, validation, non-mutating scope/repository resolution, applicability, target registration, explicit and implicit asset collection, hashing, and emission orchestration through explicit subpath exports. Domain failures are returned as structured diagnostics; emit helpers also render managed artifact notices and root inventories.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/runtime-taxonomy`; consumed by installer, adapters, SDK, and Caplet.
