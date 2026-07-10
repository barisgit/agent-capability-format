# packages/sdk/

## Responsibility
Packages `@acf/sdk`, the high-level consumer API for loading resolved, target-applicable capability facets.

## Design and Data Flow
The package re-exports core, installer, and adapter APIs and adds convenience queries for individual facet families with normalized scope/target options and diagnostic handling.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on core, installer, and adapters; consumed by applications embedding ACF.
