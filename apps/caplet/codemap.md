# apps/caplet/

## Responsibility
Packages the `caplet` command-line application and its public managed-apply APIs.

## Design and Data Flow
`package.json` exposes `src/bin.ts` as the executable and `src/index.ts` as the library entry. The Bun CLI validates commands and flags, renders custom help, rewrites deprecated aliases, defaults bare invocation to `status`, and dispatches Citty commands over `@acf/core`, `@acf/installer`, `@acf/adapters`, and `@acf/sdk`.

## Integration
- Source map: [`src/`](src/codemap.md)
- Consumed through the root `caplet` script or the linked `caplet` binary.
