# packages/core/src/diagnostics/

## Responsibility
Defines the stable ACF diagnostic code catalog and constructors.

## Design and Data Flow
`makeDiagnostic` creates typed diagnostics; `pushZodIssues` translates schema issue paths and messages into ACF diagnostics. Domain modules append these records instead of coupling to terminal output.

### Management Notice Diagnostics
The catalog includes two notice-specific diagnostic codes:
- `acf.emit.managed-notice-reserved-path`: Error when a capability declares an asset at the reserved `ACF-MANAGED.md` path
- `acf.emit.managed-notice-destination-collision`: Error when an unowned file exists at a notice path that would be overwritten

## Integration
- Consumes canonical `Diagnostic` types and Zod issues.
- Used across readers, config parsing, validation, adapters, installer, SDK, and CLI reporting.
