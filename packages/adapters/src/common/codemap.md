# packages/adapters/src/common/

## Responsibility
Implements shared transformations used by all target adapters.

## Design and Data Flow
`emitStandardAdapter` renders agents, commands, instructions, hooks, and MCP config into sorted `FileDiff` values. `emitSkills` selects canonical and optional native roots, emits each skill, its notice, and assets, then sorts and deduplicates paths. Authored skills are rendered from parsed Markdown; synthesized imported skills copy `SKILL.md` bytes and mode unchanged. Core-provided recursive implicit assets under `skills/<name>/` retain their relative tree, while facet-owned assets outside that tree retain their root-relative paths. Other helpers merge JSON by pointer, replace owned marker blocks, substitute ACF placeholders, render Markdown, and report lossy mappings. Layout functions derive target/scope paths without writing disk state.

### Artifact Notice Emission
The skills module generates per-skill `ACF-MANAGED.md` notices:
- Each skill directory receives a notice file identifying the owning capability
- Notices are marked with `managementNotice: "artifact"` in the FileDiff
- Asset files named `ACF-MANAGED.md` are rejected with `acf.emit.managed-notice-reserved-path` diagnostics
- Notices are emitted at every selected canonical or native skill destination

## Integration
- Consumes canonical models, target definitions, and read-only filesystem interfaces from `@acf/core`.
- Used by each target adapter and by Caplet's managed diff application.
