# packages/adapters/src/cursor/

## Responsibility
Implements and registers the Cursor target adapter.

## Design and Data Flow
`cursorAdapter.emit` forces non-native skill emission, maps prose to Cursor rules, and skips unsupported hooks while still emitting supported MCP/config artifacts and diagnostics.

## Integration
- Uses the Cursor definition from the core target registry and shared emitter/skills helpers.
- Registered under target ID `cursor` for core emission.
