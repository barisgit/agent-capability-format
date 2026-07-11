# apps/caplet/src/internal/

## Responsibility
Provides shared CLI infrastructure for argument normalization, scope discovery, manifests, reporting, filesystem access, and end-to-end workflows.

## Design and Data Flow
Commands normalize flags in `args.ts`, resolve user/project roots in `scopes.ts` without mistaking the user root for project scope, and call `workflow.ts`. The workflow loads Caplet config, optionally resolves/fetches sources, reads capabilities, applies target applicability, asks registered adapters for diffs, deduplicates canonical skill output across targets, detects sidecar drift, and either describes or applies the plan. `output.ts` converts diagnostics and changes into stable terminal output and exit codes.

## Integration
- Bridges command handlers to `@acf/core`, `@acf/installer`, `@acf/adapters`, and `../apply/`.
- `manifest.ts` reads and writes `.agents/capabilities.yml`.
