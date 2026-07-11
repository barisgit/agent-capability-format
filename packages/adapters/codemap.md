# packages/adapters/

## Responsibility
Packages `@acf/adapters`, the host-specific emitters that translate canonical capabilities into native file diffs.

## Design and Data Flow
The package exposes a default registry side-effect entry plus subpath exports for shared helpers and each target adapter. All adapters consume `@acf/core` target definitions and use common emission machinery with target-specific options. The common module generates per-skill `ACF-MANAGED.md` artifact notices.

## Integration
- Source map: [`src/`](src/codemap.md)
- Depends on `@acf/core` and `@acf/runtime-taxonomy`; imported by Caplet and SDK to register adapters.
