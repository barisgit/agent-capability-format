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
- [ ] 4.2 Record final commits, backup paths, and verification evidence
