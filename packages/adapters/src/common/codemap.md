# packages/adapters/src/common/

## Responsibility
Implements shared transformations used by all target adapters.

## Design and Data Flow
`emitStandardAdapter` renders agents, commands, instructions, hooks, and MCP config into sorted `FileDiff` values. Supporting modules emit skills and route cross-skill referenced assets to their owning skill paths, merge JSON by pointer, replace owned marker blocks, substitute ACF placeholders, render Markdown, and report lossy mappings. Layout functions derive target/scope paths without writing disk state.

### Artifact Notice Emission
The skills module generates per-skill `ACF-MANAGED.md` notices:
- Each skill directory receives a notice file identifying the owning capability
- Notices are marked with `managementNotice: "artifact"` in the FileDiff
- Asset files named `ACF-MANAGED.md` are rejected with `acf.emit.managed-notice-reserved-path` diagnostics
- Notices use the canonical skills root path (not target-specific paths) for shared ecosystem visibility

## Integration
- Consumes canonical models, target definitions, and read-only filesystem interfaces from `@acf/core`.
- Used by each target adapter and by Caplet's managed diff application.
