# packages/installer/

## Responsibility
Packages `@acf/installer`, which resolves capability source declarations into local capability trees and lockfiles.

## Design and Data Flow
The package exposes source manifest parsing, Git/path fetching, cache management, content-hash drift checks, deterministic lockfile handling, and pruning through one entry point.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/core`; consumed by Caplet and SDK.
