# packages/core/

## Responsibility
Packages `@acf/core`, the canonical domain model and processing pipeline for ACF capabilities.

## Design and Data Flow
The package exports typed schemas, readers, validation, scope/repository resolution, applicability, target registration, asset collection, hashing, and emission orchestration through explicit subpath exports.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/runtime-taxonomy`; consumed by installer, adapters, SDK, and Caplet.
