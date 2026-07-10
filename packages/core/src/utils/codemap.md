# packages/core/src/utils/

## Responsibility
Provides small asynchronous filesystem primitives used by core processing.

## Design and Data Flow
Helpers test existence, read text/bytes, list directory entries, and recursively enumerate regular files in deterministic order while ignoring non-files.

## Integration
- Wraps Node filesystem/path APIs.
- Used by readers, assets, hashing, resolver, and Caplet config loading.
