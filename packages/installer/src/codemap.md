# packages/installer/src/

## Responsibility
Implements reproducible acquisition, inventory, selection, synthesis, and installation of declared capability sources.

## Design and Data Flow
`resolveCapabilities` reads and normalizes `capabilities.yml`, checks the existing lock, decides which selected sources need fetching, and reuses caller-provided `PrefetchedSource` fetch results and inventories when available. `fetch.ts`, `git.ts`, and `cache.ts` resolve path sources or cached Git revisions; `inventory.ts` then enumerates manifest-backed ACF capabilities or shallow bare `SKILL.md` layouts.

Manifest-backed candidates retain their collection-relative selector paths. Unmanifested skills are discovered at the source root, under `skills/`, or in immediate child directories, validated by skill frontmatter, and synthesized into capability trees with generated `acf.yml` and `.acf-import.json` provenance. Exact and segment-aware `*`/`?`/`**` selectors choose inventory candidates before rename and materialization; include/exclude intent is retained in the lock.

Resolution stages selected trees, hashes their final content, and commits snapshots only after all sources succeed; errors preserve prior installed records and lock state. `lockfile.ts` canonicalizes source/subpath IDs and records selector intent, exact selectors by final capability name, content hash, resolved Git SHA/time, and the synthesis marker; successful changes remove stale snapshots and write deterministic lock ordering.

## Integration
- `capabilities-yml.ts` parses source declarations; `drift.ts` compares refs and selectors with lock state.
- `prune.ts` removes unmanaged capability directories.
- `index.ts` exports fetching, inventory, lock, pruning, and resolution APIs to Caplet and SDK.
