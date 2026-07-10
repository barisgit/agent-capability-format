# packages/core/src/

## Responsibility
Implements the public `@acf/core` API.

## Design and Data Flow
`index.ts` re-exports cohesive modules; `yaml.ts` centralizes YAML parsing/stringifying. Capability data flows from schemas and readers through validation/resolution/applicability into target adapter emission, with diagnostics accumulated rather than thrown for domain errors.

## Integration
- Submaps: [`types/`](types/codemap.md), [`schemas/`](schemas/codemap.md), [`reader/`](reader/codemap.md), [`validator/`](validator/codemap.md), [`resolver/`](resolver/codemap.md), [`applicability/`](applicability/codemap.md), [`targets/`](targets/codemap.md), [`emit/`](emit/codemap.md), [`assets/`](assets/codemap.md), [`hash/`](hash/codemap.md), [`diagnostics/`](diagnostics/codemap.md), [`caplet-config/`](caplet-config/codemap.md), [`utils/`](utils/codemap.md)
