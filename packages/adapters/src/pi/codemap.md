# packages/adapters/src/pi/

## Responsibility
Implements and registers the Pi target adapter.

## Design and Data Flow
`piAdapter.emit` emits skills plus the shared standard artifact families according to Pi's target layout and support matrix.

## Integration
- Uses the Pi definition from the core target registry and shared emitter/skills helpers.
- Registered under target ID `pi` for core emission.
