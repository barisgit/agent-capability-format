# apps/caplet/src/commands/

## Responsibility
Defines the user-facing Caplet command handlers: `add`, `apply`, `check`, `diff`, `doctor`, `emit`, `fetch`, `inspect`, `ls`, `remove`, and `update`.

## Design and Data Flow
Each Citty command parses shared arguments, runs through `runCommandSafely`, delegates resolution/emission or manifest work to internal helpers, reports diagnostics, and sets an exit code. Read-only commands inspect resolved capabilities; mutating commands fetch sources, apply diffs, or update manifests/lockfiles.

## Integration
- Registered by `../cli.ts`.
- Uses `@acf/core`, `@acf/installer`, `../internal/`, and managed ownership helpers in `../apply/`.
