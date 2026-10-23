## 1. Contract and Parsing

- [x] 1.1 Add normalized capability selector types, schema validation, and diagnostics
- [x] 1.2 Parse scalar/list YAML forms and serialize concise human-facing manifests
- [x] 1.3 Extend lock entries, canonicalization, parsing, and drift checks with selectors

## 2. Resolution and Reconciliation

- [x] 2.1 Derive collection-relative capability paths and implement exact/glob matching
- [x] 2.2 Reject unmatched, invalid, and direct-capability selector combinations without mutation
- [x] 2.3 Materialize selected capabilities once and reconcile stale snapshots safely
- [x] 2.4 Add unit and integration coverage for selection, globbing, locking, and reconciliation

## 3. Documentation and Migration

- [x] 3.1 Update SPEC.md, IMPLEMENTATION.md, README, and affected codemaps
- [x] 3.2 Rename the canonical repository collection from capabilities/ to acf/ and commit it
- [x] 3.3 Update the live user manifest to root source plus selector and back up prior state
- [x] 3.4 Fetch, check, diff, apply, and verify snapshots, outputs, sidecars, and clean state

## 4. Verification

- [x] 4.1 Run focused tests, workspace CI, formatting/diff checks, and live Caplet validation
- [x] 4.2 Record final commits, backup paths, and verification evidence

## Verification Evidence

- ACF implementation commit: `e3b1425` (`Add source capability selectors`).
- Canonical repository migration commit: `3178577` (`Adopt standard ACF collection layout`).
- Live-state backup: `~/.agents/backups/capability-selector-migration-20260711/`.
- Live manifest: root `path:/Users/blaz/Programming_local/Capatibilities` with `capabilities: engineering-workflows`.
- Source, snapshot, and lock hash: `sha256-6f2d0c1b44a7dc8363458d36d7cdbf099409116c9d4015a2b2c463e2f2ca192b`.
- `bun run ci`, focused installer/Caplet tests, `openspec validate select-source-capabilities --strict`, `git diff --check`, live `caplet check --scope user`, and live `caplet apply --dry-run --scope user` passed.
- Canonical and Claude sidecars each retain 48 entries owned by `engineering-workflows`; post-apply diff is empty.
- Independent follow-up review approved with zero critical or important findings after cross-entry staging and ref-error reconciliation fixes.
