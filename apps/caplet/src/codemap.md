# apps/caplet/src/

## Responsibility
Composes the Caplet CLI, command handlers, terminal presentation, filesystem application logic, and public exports.

## Design and Data Flow
`bin.ts` handles version/help, alias rewriting, unknown-command and unknown-flag validation before running the Citty `rootCommand` from `cli.ts`. Commands share internal argument, scope, manifest, source-selection, workflow, plan-view, and reporting helpers. `add` can inspect a source, resolve an exact GitHub `@selector`, or prompt for numbered capability selection before persisting and applying it. Apply helpers turn planned `FileDiff` values into managed filesystem changes and ownership sidecars.

The workflow fetches and resolves manifests, emits target and canonical diffs, adds management notices, diagnoses drift, sweeps stale ownership, and exposes reach/footprint data for human and JSON output. `help.ts`, `internal/output.ts`, `internal/render.ts`, and `internal/plan-view.ts` keep terminal output and structured output stable.

## Integration
- Submaps: [`commands/`](commands/codemap.md), [`internal/`](internal/codemap.md), [`apply/`](apply/codemap.md)
- `index.ts` re-exports the root command and managed-apply APIs.
