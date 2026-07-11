# apps/caplet/src/

## Responsibility
Composes the Caplet CLI, command handlers, filesystem application logic, and public exports.

## Design and Data Flow
`bin.ts` runs the Citty `rootCommand` from `cli.ts`; the root command dispatches to command modules. Commands share internal argument, scope, workflow, and reporting helpers, while apply helpers turn planned `FileDiff` values into managed filesystem changes.

### Management Notice Pipeline
The workflow module orchestrates notice generation:
1. Collects all emitted diffs from adapters
2. Groups diffs by install root to build artifact inventories
3. Generates root inventory notices listing all managed artifacts per capability
4. Diagnoses collisions where unowned files would be overwritten
5. Filters unchanged diffs to avoid unnecessary writes

## Integration
- Submaps: [`commands/`](commands/codemap.md), [`internal/`](internal/codemap.md), [`apply/`](apply/codemap.md)
- `index.ts` re-exports the CLI and managed-apply APIs.
