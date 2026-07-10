# apps/caplet/

## Responsibility
Packages the `caplet` command-line application and its public programmatic exports.

## Design and Data Flow
`package.json` exposes `src/bin.ts` as the executable and `src/index.ts` as the library entry. The CLI composes Citty commands over `@acf/core`, `@acf/installer`, `@acf/adapters`, and `@acf/sdk`.

## Integration
- Source map: [`src/`](src/codemap.md)
- Consumed through the root `caplet` script or the linked `caplet` binary.
