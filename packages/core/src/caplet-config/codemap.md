# packages/core/src/caplet-config/

## Responsibility
Discovers, parses, validates, and merges user and project Caplet configuration.

## Design and Data Flow
`capletConfigLocations` identifies layered config paths. `readCapletConfig` parses YAML through the Zod schema and emits diagnostics; `mergeCapletConfig` combines layers with project values taking precedence.

## Integration
- Uses core schemas, diagnostics, YAML, and read-only filesystem abstractions.
- Consumed by Caplet workflow planning.
