Depends on `plugin-interop-foundation`. Every task starts with a failing test and ends when it passes; goldens use the harness from that change.

## 1. Writer and profiles

- [ ] 1.1 Implement the Agent Plugins writer with the `generic` profile and validate output against vendored pinned 1.0 schemas; verify with a golden and a schema-validation test.
- [ ] 1.2 Add the `codex`, `copilot`, `vscode` and `cursor` profiles (columns, placeholders, namespaces) and the Agent Plugins support cells; verify with one golden per profile from the same fixture, including the Cursor placeholder rewrite, the omitted plugin-root `cwd`, and negative fixtures for every refusing restricting cell, a packaged Cursor `command` (no `mcp.json` entry with a placeholder in `command`) and Codex SSE.
- [ ] 1.3 Write foreign sources: unchanged Agent Plugins package byte-identical for Codex, excluded Agent Plugins skill, and a Claude plugin translated to Codex with an omitted agent and a refused guard hook; verify with one golden each.
- [ ] 1.4 Add `copilot` and `vscode` targets, carrier defaults and package locations (Cursor user scope under `~/.cursor/plugins/local/`, project-scope Cursor fallback to loose); verify with config and plan tests.
- [ ] 1.5 Cursor check against a locally installed Cursor: whether a `./x` `command` in an Agent Plugins package resolves against the plugin root and which working directory servers start in; record evidence and change the Cursor `command` and `cwd` cells only on `verified` results.

## 2. Codex route (first)

- [ ] 2.1 Verification spike against the locally installed Codex: local catalog entry, headless install or enablement, cache versus live loading, whether Codex reads `agents/openai.yaml` inside plugin skills, whether a plugin `mcp.json` server with `type: sse` connects, and policy-block output; record evidence in `research/plugin-interop/tools/codex.md` and capture transcripts as fake-CLI fixtures.
- [ ] 2.2 Implement the Codex host port and registration on the verified route, host state and native disable; verify with fake-CLI integration tests.
- [ ] 2.3 Add an opt-in real-host test (`CAPLET_HOST_TESTS=codex`) covering skill discovery, invocation, MCP start, update and native disable; record `verified` evidence.

## 3. Copilot route (second) and VS Code

- [ ] 3.1 Verification spike for Copilot: `copilot plugin install|enable|disable`, cache versus live loading, directory marketplaces in settings, policy-block output; implement the Copilot host port on the verified route; verify with fake-CLI integration tests.
- [ ] 3.2 Add an opt-in real-host test (`CAPLET_HOST_TESTS=copilot`); record `verified` evidence.
- [ ] 3.3 VS Code: reuse Copilot CLI installations when present and otherwise report the `chat.pluginLocations` entry without writing VS Code settings; verify with status tests.

## 4. Documentation and verification

- [ ] 4.1 Update SPEC.md §22 and the README support tables for the new targets, profiles and host states.
- [ ] 4.2 Run focused tests, `bun run ci`, `openspec validate agent-plugins-output --strict` and `git diff --check`; dogfood one public Agent Plugins package for Codex at user and project scope.
