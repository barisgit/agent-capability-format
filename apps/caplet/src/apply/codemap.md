# apps/caplet/src/apply/

## Responsibility
Applies adapter-generated file diffs and maintains ownership metadata for safe updates and removal.

## Design and Data Flow
`applyDiffs` materializes whole-file, marker-block, and JSON-pointer changes, then records hashes in `.acf-managed.json`. `sidecar.ts` detects drift and removes only owned regions; `json-pointer.ts` performs text-preserving JSON pointer lookup/deletion.

### Management Notice Safety
The apply module enforces notice path safety:
- `assertNoticePathOwnedOrAbsent` checks that notice paths are either already owned by ACF or don't exist
- Prevents overwriting unowned files at reserved `ACF-MANAGED.md` paths
- Throws clear errors if collision would occur (defensive check before write)

## Integration
- Consumes `FileDiff` and ownership types from `@acf/core` plus merge/marker helpers from `@acf/adapters/common`.
- Called by internal emit/apply workflows and the `remove` command.
