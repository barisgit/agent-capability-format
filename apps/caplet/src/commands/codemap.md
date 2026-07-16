# apps/caplet/src/commands/

## Responsibility
Defines the user-facing commands: `init`, `add`, `remove`, `update`, `apply`, `status`, `list`, `show`, `check`, `doctor`, and `completion`.

## Design and Data Flow
Each Citty command derives arguments from the centralized command spec, runs through `runCommandSafely`, and uses shared reporters and exit-code policy. `add` parses source syntax, inventories the source before mutation, applies exact GitHub `@selector`, automatic all-selection, or interactive numbered selection, reports selected capabilities, stores narrowed selectors when needed, reuses the prefetched inspection during resolution, and applies the resulting plan. `show` labels synthesized unmanifested imports and reports facets and target support.

Mutating commands edit manifests or lockfiles and reconcile managed output; `remove` also regenerates root inventory notices. Inspection commands resolve capabilities, drift, plans, and environment state into aligned human output or stable JSON where supported. Deprecated `ls`, `inspect`, `diff`, `emit`, and `fetch` forms are rewritten in `../cli.ts` rather than implemented as command modules.

## Integration
- Registered by `../cli.ts`; usage and flags come from `../internal/spec.ts`.
- Uses `@acf/core`, `@acf/installer`, `../internal/`, and ownership helpers in `../apply/`.
