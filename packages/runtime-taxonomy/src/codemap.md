# packages/runtime-taxonomy/src/

## Responsibility
Defines canonical string-literal sets and type guards for runtime operations, hook types, and trigger names.

## Design and Data Flow
Readonly tuples are the source of both union types and membership predicates (`isProvisionalOperation`, `isCanonicalHookType`, and `isCanonicalTriggerName`).

## Integration
- Dependency-free public API of `@acf/runtime-taxonomy`.
- Imported by `@acf/core` and `@acf/adapters` to keep runtime vocabulary consistent.
