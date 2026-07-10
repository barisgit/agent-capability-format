# apps/caplet/src/apply/

## Responsibility
Applies adapter-generated file diffs and maintains ownership metadata for safe updates and removal.

## Design and Data Flow
`applyDiffs` materializes whole-file, marker-block, and JSON-pointer changes, then records hashes in `.acf-managed.json`. `sidecar.ts` detects drift and removes only owned regions; `json-pointer.ts` performs text-preserving JSON pointer lookup/deletion.

## Integration
- Consumes `FileDiff` and ownership types from `@acf/core` plus merge/marker helpers from `@acf/adapters/common`.
- Called by internal emit/apply workflows and the `remove` command.
