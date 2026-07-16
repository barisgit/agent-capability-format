# apps/caplet/src/internal/

## Responsibility
Provides shared CLI infrastructure for argument normalization, scope discovery, source and manifest handling, terminal/JSON presentation, planning, managed notices, and end-to-end workflows.

## Design and Data Flow
`spec.ts` is the command/flag schema used by Citty argument generation, help, completion, and unknown-flag suggestions. `manifest.ts` parses exact GitHub `@selector` syntax, builds and persists selected capability entries, and uses lockfile name-to-selector mappings to keep manifest/lock removal consistent for nested collections and globs. `source-selection.ts` validates inventories and chooses exact, automatic, or interactive selection; `picker.ts` parses numbers/ranges/all/cancel input and reads lines through Node readline.

`workflow.ts` loads configuration and scopes, fetches or reuses prefetched source inspections, resolves locks, emits target and canonical diffs, deduplicates shared skill output, adds management notices, diagnoses drift, sweeps ownership whose capability or facet disappeared, and applies grouped plans. `plan-view.ts` derives rollups, reach, and footprint views. `output.ts`, `render.ts`, and `json.ts` provide quiet/verbose-aware reporting, ANSI-safe aligned columns and glyphs, diagnostic exit codes, and structured envelopes.

## Integration
- Bridges command handlers to `@acf/core`, `@acf/installer`, `@acf/adapters`, and `../apply/`.
- `managed-notices.ts` merges desired output with retained sidecar ownership and regenerates per-root `ACF-MANAGED.md` inventories.
- `args.ts`, `command.ts`, `fs.ts`, and `scopes.ts` normalize process inputs and filesystem boundaries.
