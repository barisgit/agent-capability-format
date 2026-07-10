# packages/sdk/src/

## Responsibility
Defines the SDK's public barrel and ensures built-in target adapters are registered for consumers.

## Design and Data Flow
`index.ts` side-effect imports `@acf/adapters`, re-exports lower-level packages, and exposes helper APIs for facets, typed views, options, and diagnostics.

## Integration
- Helper map: [`helpers/`](helpers/codemap.md)
- Presents `@acf/core`, `@acf/installer`, and adapter functionality through one package.
