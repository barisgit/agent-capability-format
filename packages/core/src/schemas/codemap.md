# packages/core/src/schemas/

## Responsibility
Defines runtime Zod schemas for ACF manifests, facets, hooks, MCP servers, source manifests, lockfiles, and Caplet config.

## Design and Data Flow
Composable slug, target, and `only`/`except` schemas validate capability syntax before semantic reader checks. `capabilities.yml` uses strict objects, normalizes scalar/list capability selectors, rejects unsafe collection-relative paths and globs, constrains rename values to slugs, and accepts full semver prerelease/build forms.

## Integration
- Uses canonical runtime taxonomy enums.
- Consumed by readers, config parsing, installer manifest/lockfile handling, and target extension schemas.
