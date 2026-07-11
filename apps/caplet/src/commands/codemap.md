# apps/caplet/src/commands/

## Responsibility
Defines the user-facing Caplet command handlers: `add`, `apply`, `check`, `diff`, `doctor`, `emit`, `fetch`, `inspect`, `ls`, `remove`, and `update`.

## Design and Data Flow
Each Citty command parses shared arguments, runs through `runCommandSafely`, delegates resolution/emission or manifest work to internal helpers, reports diagnostics, and sets an exit code. Read-only commands inspect resolved capabilities; mutating commands fetch sources, apply diffs, update manifests/lockfiles, or remove both target-native and canonical sidecar ownership.

### Management Notice Integration
- The `remove` command regenerates root inventory notices after capability removal by reading the updated sidecar and generating a new root notice diff via `rootNoticeDiffFromSidecar`.
- The `emit` and `apply` commands trigger the full notice generation pipeline through the workflow module.

## Integration
- Registered by `../cli.ts`.
- Uses `@acf/core`, `@acf/installer`, `../internal/`, and managed ownership helpers in `../apply/`.
