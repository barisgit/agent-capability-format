# packages/adapters/src/claude/

## Responsibility
Implements and registers the Claude Code target adapter.

## Design and Data Flow
`claudeAdapter.emit` emits skills plus standard agents, commands, instructions, hooks, and MCP artifacts using the Claude target layout, returning diffs and mapping diagnostics.

## Integration
- Uses the Claude definition from the core target registry and shared emitter/skills helpers.
- Registered under target ID `claude` for core emission.
