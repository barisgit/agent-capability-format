# packages/core/src/validator/

## Responsibility
Provides the validator compatibility entry point.

## Design and Data Flow
The module re-exports `validateCapability` from the reader validation implementation, keeping semantic validation colocated with read-time model checks.

## Integration
- Publicly exposed as `@acf/core/validator`.
- Depends solely on `../reader`.
