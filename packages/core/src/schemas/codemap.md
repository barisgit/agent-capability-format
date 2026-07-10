# packages/core/src/schemas/

## Responsibility
Defines runtime Zod schemas for ACF manifests, facets, hooks, MCP servers, source manifests, lockfiles, and Caplet config.

## Design and Data Flow
Schemas validate syntax and structural constraints while preserving typed inputs for semantic validation in the reader. Shared slug, target, and `only`/`except` schemas compose the higher-level documents.

## Integration
- Uses canonical runtime taxonomy enums.
- Consumed by readers, config parsing, installer manifest/lockfile handling, and target extension schemas.
