# packages/installer/src/

## Responsibility
Implements reproducible acquisition and installation of declared capability sources.

## Design and Data Flow
`resolveCapabilities` reads `capabilities.yml` and the existing lockfile, resolves path or Git sources according to fetch mode, filters multi-capability collections by exact/`*`/`?`/`**` selectors, copies verified roots, and records both selector intent and final names. Unmatched or invalid selection preserves prior state; successful selector changes reconcile stale snapshots before writing a canonical lockfile. `fetch.ts`, `git.ts`, and `cache.ts` isolate acquisition; lockfile helpers canonicalize source identities and ordering.

## Integration
- Uses core source models, repository reading, hashing, diagnostics, and scope types.
- Called by Caplet fetch/update/check workflows and SDK facet loading.
