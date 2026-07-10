# packages/core/src/assets/

## Responsibility
Resolves asset references declared by capabilities and facets into validated source files.

## Design and Data Flow
`collectReferencedAssets` gathers explicit and body-derived references, resolves them relative to capability roots, verifies regular files, deduplicates paths, and returns sorted asset inputs plus diagnostics.

## Integration
- Uses canonical facet/asset types and filesystem utilities.
- Called by the capability reader; adapters later read resolved assets for emission.
