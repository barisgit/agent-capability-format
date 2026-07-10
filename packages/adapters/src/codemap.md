# packages/adapters/src/

## Responsibility
Registers and exports the supported Claude, Codex, Cursor, OpenCode, and Pi target adapters.

## Design and Data Flow
Importing `index.ts` loads each adapter, whose module calls `registerAdapter`; the exported `adapters` map then exposes the registered implementations. Host modules delegate most transformation work to `common/`.

## Integration
- Common machinery: [`common/`](common/codemap.md)
- Target maps: [`claude/`](claude/codemap.md), [`codex/`](codex/codemap.md), [`cursor/`](cursor/codemap.md), [`opencode/`](opencode/codemap.md), [`pi/`](pi/codemap.md)
