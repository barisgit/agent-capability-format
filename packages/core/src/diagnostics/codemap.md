# packages/core/src/diagnostics/

## Responsibility
Defines the stable ACF diagnostic code catalog and constructors.

## Design and Data Flow
`makeDiagnostic` creates typed diagnostics; `pushZodIssues` translates Zod paths, issue kinds, and messages into domain codes with structured metadata. Coverage includes schema/unknown-key failures, capability-selector resolution, lock drift, adapter degradation, and managed-notice collisions; imported-skill reading may also append a missing-description fallback warning.

## Integration
- Consumes canonical `Diagnostic`, facet, and target types plus Zod issues.
- Used across readers, config parsing, validation, adapters, installer, SDK, and CLI reporting.
