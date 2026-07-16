# packages/installer/

## Responsibility
Packages `@acf/installer`, which resolves declared path/Git sources into reproducible local capability trees, including ACF repositories and synthesized capabilities from unmanifested skills.

## Design and Data Flow
The package reads `capabilities.yml` and lock provenance, fetches or accepts prefetched sources, inventories source candidates, applies exact/`*`/`?`/`**` capability selectors, and stages verified snapshots before committing them. Lock entries preserve source/subpath identity, selector intent, installed names, content hashes, resolved Git revision/time, and whether the capability was synthesized.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/core`; consumed by Caplet and SDK.
