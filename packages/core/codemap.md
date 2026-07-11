# packages/core/

## Responsibility
Packages `@acf/core`, the canonical domain model and processing pipeline for ACF capabilities.

## Design and Data Flow
The package exports typed schemas, readers, validation, scope/repository resolution, applicability, target registration, asset collection, hashing, and emission orchestration through explicit subpath exports. The emit module includes management notice rendering for per-skill artifact notices and root-level inventory manifests.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/runtime-taxonomy`; consumed by installer, adapters, SDK, and Caplet.
