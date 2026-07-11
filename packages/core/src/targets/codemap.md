# packages/core/src/targets/

## Responsibility
Defines supported host targets, their install layouts and support matrices, extension schemas, and adapter registration.

## Design and Data Flow
`registry.ts` builds immutable target definitions for Claude, Codex, Cursor, OpenCode, and Pi, including whether each host discovers canonical `.agents/skills`, then exposes ID/maps and registration functions. `extensions.ts` assigns per-target Zod schemas for native fields. Adapters register implementations onto the corresponding definitions at module load.

## Integration
- Consumed by applicability, validation, emit orchestration, adapters, SDK option checks, and Caplet target selection.
- Depends on canonical types and schemas.
