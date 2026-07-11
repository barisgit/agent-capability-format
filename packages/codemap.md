# packages/

## Responsibility
Contains the reusable ACF libraries: canonical model/core processing, target adapters, source installation, consumer SDK, and runtime taxonomy.

## Design and Data Flow
Packages form a dependency pipeline: runtime taxonomy supplies canonical names; core reads and validates capabilities; installer resolves declared sources; adapters emit host-native diffs including management notices; SDK exposes high-level facet queries.

## Integration
- Maps: [`core/`](core/codemap.md), [`installer/`](installer/codemap.md), [`adapters/`](adapters/codemap.md), [`sdk/`](sdk/codemap.md), [`runtime-taxonomy/`](runtime-taxonomy/codemap.md)
- Built as Bun workspaces through Turborepo.
