# apps/

## Responsibility
Holds runnable end-user applications. The current application is the `caplet` reference CLI.

## Design and Data Flow
This workspace layer separates executable composition from reusable libraries. `caplet` parses user commands, invokes the core/installer/adapter pipeline, and presents diagnostics and file changes including management notice generation.

## Integration
- Contains: [`caplet/`](caplet/codemap.md)
- Managed by the root Bun workspace and Turborepo tasks.
