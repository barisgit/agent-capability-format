# apps/caplet/src/

## Responsibility
Composes the Caplet CLI, command handlers, filesystem application logic, and public exports.

## Design and Data Flow
`bin.ts` runs the Citty `rootCommand` from `cli.ts`; the root command dispatches to command modules. Commands share internal argument, scope, workflow, and reporting helpers, while apply helpers turn planned `FileDiff` values into managed filesystem changes.

## Integration
- Submaps: [`commands/`](commands/codemap.md), [`internal/`](internal/codemap.md), [`apply/`](apply/codemap.md)
- `index.ts` re-exports the CLI and managed-apply APIs.
