## Why

After `plugin-interop-foundation`, caplet reads Agent Plugins 1.0 packages and Claude plugins and emits a real Claude plugin, but Codex, Copilot, VS Code and Cursor still receive loose files even though each consumes Agent Plugins packages that can be enabled, disabled and updated as one unit. The user runs Codex daily, so Codex is the first client whose route must be verified; Copilot is second.

## What Changes

- Add an Agent Plugins 1.0 package writer with client profiles `generic`, `codex`, `copilot`, `vscode` and `cursor` (support column, placeholder dialect, extension namespaces, installation route), validated against the pinned 1.0 schemas.
- Add `copilot` and `vscode` targets and extend `targets.<id>.carrier: plugin | loose` beyond Claude.
- Write unchanged Agent Plugins sources byte-identically for their client (lossless same-format output), and translate ACF and Claude plugin sources through the profiles.
- Register packages only through routes recorded as `verified`: Codex first, then Copilot; VS Code and Cursor report `registration required` until verified. Report host state separately from file state and respect native disables.
- Add Agent Plugins columns to the skill and MCP support tables, including the refusal of `invocation.user: false` for VS Code (menu visibility only) and the Cursor placeholder rewrite.
- Pi keeps loose output (no Agent Plugins support). Lume, the user's own runtime, is not a caplet target; reading Agent Plugins natively in Lume and using it as a second conformance client is a separate follow-up idea outside this change.

## Capabilities

### New Capabilities

- `agent-plugins-output`: Agent Plugins package writer, client profiles, support columns, output locations, client registration and host state (amends SPEC.md §22.1, §22.2, §22.5).

### Modified Capabilities

None in `openspec/specs/`. Depends on `plugin-interop-foundation` (readers, registry cells, preserved snapshots, Claude host-state vocabulary).

## Impact

- `packages/core` target registry (new targets, profile columns, evidence), `packages/adapters` (Agent Plugins writer and profiles, vendored pinned schemas), `apps/caplet` (host ports for `codex` and `copilot`, status output), SPEC.md §22, README support tables.
- Users selecting Copilot or VS Code get packages instead of loose files; Codex and Cursor switch only after their route is verified.
