# packages/core/src/types/

## Responsibility
Defines canonical TypeScript contracts for capability models, diagnostics, source resolution, targets, emission, diffs, and ownership sidecars.

## Design and Data Flow
`model.ts` models all facet families, synthesized capabilities and lock entries, normalized capability selectors, and assets whose provenance can be frontmatter, Markdown, or implicit. `emit.ts` defines target adapters, read-only filesystem boundaries, canonical-skill discovery metadata, emit requests/results, facet/artifact/management-notice diff metadata, and managed ownership records.

## Integration
- Imports canonical operation, hook, and trigger names from `@acf/runtime-taxonomy`.
- Shared by every core module and downstream packages.
