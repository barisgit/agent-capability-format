# packages/core/src/hash/

## Responsibility
Computes deterministic content hashes for capability directory trees.

## Design and Data Flow
`computeContentHash` enumerates regular files, normalizes relative paths, sorts them bytewise, and hashes NUL-delimited path/content records with SHA-256.

## Integration
- Uses filesystem traversal utilities.
- Consumed by installer resolution and lockfile drift detection.
