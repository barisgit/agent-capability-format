Depends on `plugin-interop-foundation`; Agent Plugins cells depend on `agent-plugins-output`.

## 1. Display names

- [ ] 1.1 Add package and skill `display-name`, release the SPEC.md §15 reservation, map to Claude `displayName` and Codex `interface.display_name`; verify with validation tests and goldens.

## 2. MCP enablement, filters and timeouts

- [ ] 2.1 Add `enabled` with native cells and the declared omission loss; verify with goldens for Codex and OpenCode native disable and a `lossy` omission diagnostic for Claude.
- [ ] 2.2 Add `tools.enabled` and `tools.disabled` with refusals for carriers whose schema cannot carry them (Claude, the closed Agent Plugins `mcp.json`); verify with negative fixtures for Claude and the Copilot plugin carrier and a Copilot loose golden.
- [ ] 2.3 Add `timeouts.startupMs` and `timeouts.toolMs` with unit conversion and value-domain conditions; verify with Claude goldens for 30000 and 500 ms and Codex second conversion.

## 3. Path-scoped activation

- [ ] 3.1 Add `verified` tests against Claude and Cursor for the glob constructs `*`, `**`, `?`, `{a,b}` and for when each host activates a path-scoped skill; record evidence. Promote `paths` only if both agree; otherwise record the result and keep the extras.

## 4. Migration, documentation and verification

- [ ] 4.1 Report per-target extras that duplicate a newly promoted field with a migration warning and an automatic fix in `caplet check --fix`; verify with fixtures.
- [ ] 4.2 Update SPEC.md and README tables; run `bun run ci`, `openspec validate canonical-skill-mcp-extensions --strict` and `git diff --check`.
