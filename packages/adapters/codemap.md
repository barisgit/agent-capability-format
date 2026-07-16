# packages/adapters/

## Responsibility
Packages `@acf/adapters`, the host-specific emitters that translate canonical capabilities into native file diffs.

## Design and Data Flow
The package exposes a default registry side-effect entry plus subpath exports for shared helpers and each target adapter. Each adapter resolves its `@acf/core` target definition, emits skills, runs the shared standard emitter with target-specific options, and returns the combined file diffs plus diagnostics. Synthesized imported skills preserve their primary bytes and carry core-discovered recursive implicit assets; every emitted skill root also receives an `ACF-MANAGED.md` artifact notice.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/core` and `@acf/runtime-taxonomy`; imported by Caplet and SDK to register adapters.
