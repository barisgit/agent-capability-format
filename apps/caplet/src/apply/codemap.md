# apps/caplet/src/apply/

## Responsibility
Applies adapter-generated file diffs and maintains ownership metadata for safe reconciliation and removal.

## Design and Data Flow
`applyDiffs` resolves paths inside an install root, applies whole-file, marker-block, and JSON-pointer changes, preserves file modes, prunes empty directories, and records owned-region hashes in `.acf-managed.json`. Reserved management-notice paths must be absent or already ACF-owned before writes occur.

`sidecar.ts` reads, canonicalizes, and writes ownership state, detects drift, and removes only owned files or regions. `json-pointer.ts` provides pointer lookup and text-preserving deletion without reformatting the surrounding JSON document.

## Integration
- Consumes `FileDiff`, content, and ownership types from `@acf/core` plus marker/merge helpers from `@acf/adapters/common`.
- Called by `internal/workflow.ts` and removal flows; public managed-apply APIs are re-exported from `../index.ts`.
