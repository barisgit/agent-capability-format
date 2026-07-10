# packages/installer/src/

## Responsibility
Implements reproducible acquisition and installation of declared capability sources.

## Design and Data Flow
`resolveCapabilities` reads `capabilities.yml` and the existing lockfile, resolves path or Git sources according to fetch mode, copies verified capability roots into the scope tree, computes content hashes, diagnoses drift, prunes stale installs, and writes a canonical lockfile. `fetch.ts`, `git.ts`, and `cache.ts` isolate acquisition; lockfile helpers canonicalize source identities and ordering.

## Integration
- Uses core source models, repository reading, hashing, diagnostics, and scope types.
- Called by Caplet fetch/update/check workflows and SDK facet loading.
