# packages/adapters/src/

## Responsibility
Registers and exports the supported Claude, Codex, Cursor, OpenCode, and Pi target adapters.

## Design and Data Flow
Importing `index.ts` loads each adapter module, which resolves its target definition and calls `registerAdapter`; the exported `adapters` map exposes the same implementations directly. On `emit`, a host collects diagnostics, emits canonical/native skills first, then appends standard agent, command, instruction, hook, and MCP diffs from `common/`. Target options constrain unsupported or lossy families; Cursor emits canonical skills and file-context rules without native skills or hooks.

## Integration
- Common machinery: [`common/`](common/codemap.md)
- Target maps: [`claude/`](claude/codemap.md), [`codex/`](codex/codemap.md), [`cursor/`](cursor/codemap.md), [`opencode/`](opencode/codemap.md), [`pi/`](pi/codemap.md)
