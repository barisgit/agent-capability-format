# packages/core/src/diagnostics/

## Responsibility
Defines the stable ACF diagnostic code catalog and constructors.

## Design and Data Flow
`makeDiagnostic` creates typed diagnostics; `pushZodIssues` translates schema issue paths and messages into ACF diagnostics. Domain modules append these records instead of coupling to terminal output.

## Integration
- Consumes canonical `Diagnostic` types and Zod issues.
- Used across readers, config parsing, validation, adapters, installer, SDK, and CLI reporting.
