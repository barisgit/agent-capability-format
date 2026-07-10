# packages/adapters/src/opencode/

## Responsibility
Implements and registers the OpenCode target adapter.

## Design and Data Flow
`opencodeAdapter.emit` emits skills and standard OpenCode artifacts, reporting command-family mappings as partially lossy.

## Integration
- Uses the OpenCode definition from the core target registry and shared emitter/skills helpers.
- Registered under target ID `opencode` for core emission.
