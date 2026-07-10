# packages/adapters/src/codex/

## Responsibility
Implements and registers the Codex target adapter.

## Design and Data Flow
`codexAdapter.emit` emits skills and standard target artifacts, marking command-family mappings as partially lossy where canonical semantics exceed Codex support.

## Integration
- Uses the Codex definition from the core target registry and shared emitter/skills helpers.
- Registered under target ID `codex` for core emission.
