# packages/sdk/src/helpers/

## Responsibility
Provides ergonomic, typed queries over resolved ACF capabilities.

## Design and Data Flow
`loadApplicableCapabilities` normalizes options, validates the target, resolves selected user/project scopes (optionally fetching), deduplicates capabilities, applies target applicability, and emits or throws diagnostics. Family-specific getters select agents, commands, skills, instructions, hooks, or MCP servers; `views.ts` creates stable consumer views and trigger matching.

## Integration
- Uses `@acf/core` for resolution/applicability and `@acf/installer` for optional source resolution.
- Exported by `@acf/sdk` for application code.
