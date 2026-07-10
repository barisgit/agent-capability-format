# packages/runtime-taxonomy/

## Responsibility
Packages the provisional canonical runtime operation, hook-type, and trigger-name vocabulary.

## Design and Data Flow
The package is intentionally dependency-free and exports its taxonomy from a single source module.

## Integration
- Source map: [`src/`](src/codemap.md)
- Consumed by core models, schemas, validation, and adapter support declarations.
