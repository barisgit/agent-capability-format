Every task starts with a failing test and ends when it passes. "Golden" means a fixture under the package's `tests/golden/<case>/` with an `input/` tree and an `expected/` tree compared by relative path, bytes and executable bit through the harness from task 1.1.

## 1. Harness, registry and plan report

- [x] 1.1 Add a golden-tree harness (in-memory and on-disk) that diffs emitted trees against `expected/` by path, bytes and executable bit, prints a readable diff, and regenerates with `UPDATE_GOLDEN=1`; verify with a self-test whose golden fails on a byte, path and mode change.
- [x] 1.2 Replace family-level skill and MCP `support` in `packages/core/src/targets/registry.ts` with per-field, per-carrier cells (native with value-domain conditions, translated, degraded, refused), safety classes and evidence levels for the fields of this change; verify with a registry self-check that fails when a `restricting` or `functional` cell is degradable, a known native key lacks a class, or a refusing restricting cell lacks a negative fixture.
- [x] 1.3 Derive diagnostics (`acf.support.*`, `acf.extras.dropped`, `acf.core.pending`) from registry cells and add the behavior-first compatibility report to `caplet apply` and `--dry-run` human and `--json` output; verify with output goldens for native, translated, omitted and blocked components.

## 2. Integrity and preservation

- [x] 2.1 Unify the core and installer lock schemas into one module and record per-capability `name`, `format`, `formatVersion`, source path and `payloadDigest`; verify existing lockfile fixtures round-trip and a multi-capability lock golden.
- [x] 2.2 Implement the `acf-tree-2` payload digest; verify with fixtures for mode-only changes, ambiguous v1 encodings and a pinned digest value.
- [x] 2.3 Verify digests before emission and in installed checks, and make frozen restores fetch `resolvedSha`; verify with a tampered-cache test and a local git fixture whose branch moves after locking.
- [x] 2.4 Preserve complete snapshots (hidden files, executable bits) and reject links, special files and normalization collisions; verify with snapshot fixtures for each case and an offline re-read test.
- [x] 2.5 Extend sidecar entries with `target`, `carrier` and mode, add expected-hash preconditions to apply, fix stale-entry sweeping for renamed paths, and enforce output containment through resolved parents; verify with plan/apply race, renamed-skill and symlinked `.claude/skills` integration tests.
- [x] 2.6 Reject credential-bearing source URLs and redact them in messages; verify with `caplet add` tests asserting no file or output contains the credential.
- [x] 2.7 List executable components added, changed or removed per capability and target in `add`, `update` and `apply` output (human and `--json`), without prompting or blocking, and write no host trust or approval state; verify with output goldens for a new MCP stdio server, a changed Claude plugin hook, an executable file and an unchanged update.

## 3. Source format readers

- [x] 3.1 Detect formats with precedence, `format:` override, `acf.source.format-selected`, no fallback on invalid recognized manifests, and `acf.source.marketplace-unsupported` with suggested `path:` entries; verify with polyglot, override, broken-manifest and Claude marketplace fixtures.
- [x] 3.2 Implement the Agent Plugins 1.0 reader (skills, `mcp.json`, placeholder mapping, `cwd: ${ACF_CAPABILITY_DIR}` for servers that omit `cwd`, preserved extension namespaces, the standard's loading rules); verify with fixtures for one invalid skill, invalid `mcp.json`, an unknown author key, an omitted `cwd` and a 1.1 schema.
- [x] 3.3 Implement the Claude plugin reader for manifest, skills (including manifest skill paths) and MCP (`.mcp.json`, inline and path `mcpServers`), classifying remainder components, reading pending keys as Claude extras and out-of-domain manifest values as `targets.claude.package` values; verify with a full Claude plugin fixture, an environment-reference server kept whole, a `timeout` kept as an extra and a non-SemVer `version`.
- [x] 3.4 Map packages to one capability each with name and version rules and `rename`; verify with a three-skill package and an out-of-slug name fixture.

## 4. Canonical fields, extras and native serialization

- [x] 4.1 Add skill `license`, `compatibility`, `metadata`, `argument-hint` and MCP `cwd`, the URL rule and `${ACF_DATA_DIR}`, and reject top-level `paths` with the extras guidance; verify with validation tests including the redacted credential URL.
- [x] 4.2 Add package-, skill- and server-level `targets.<t>.native` extras, package-level `targets.<t>.package` values, with classification, unknown-key `info`, `acf.extras.conflict` and `acf.core.pending`, and `native/<target>/` file extras with containment and collision errors; verify with validation tests, an emitted Codex `required = true` golden, a Claude `allowed-tools` golden, a `dependencies` manifest golden and a Claude output-style golden.
- [x] 4.3 Serialize skill frontmatter natively per the skill table for Claude (both carriers), Codex (with `agents/openai.yaml` for `invocation.model: false`), Cursor, OpenCode and Pi, removing canonical passthrough, with refusals, the shared-root rule and canonical-root emission only for discovering targets; verify with one golden per target and a Claude-only project with no `.agents/skills`.
- [x] 4.4 Serialize MCP servers natively per the MCP table with refusals and loose data-directory creation; verify with one golden per target and an Agent Plugins server with `cwd` refused for Claude.
- [x] 4.5 Add the negative fixtures for data-only restrictions: manual-only skill to OpenCode, user-only skill to Codex, Cursor, OpenCode and Pi, Claude `paths` extra to Codex, a shared root with a refusing reader, and a Claude plugin guard hook to Codex; each asserts no component file, no shared-root copy, no substitute artifact and a reported refusal. Add the functional negative fixture for an Agent Plugins server with omitted `cwd` and a relative argument planned for Claude (no `.mcp.json` entry in the plugin or project, no wrapper, refusal naming the working directory).
- [x] 4.6 Keep legacy `authors` strings: add a fixture of an existing-style `acf.yml` with `"Name <email>"` and free-form author strings; verify that validation output and the v1 `capabilityHash` are unchanged from the pre-change code, and add a Claude `plugin.json` golden for the decoding rule (decoded, verbatim-name and dropped entries).
- [x] 4.7 Add a foreign/native parity test: for a Claude plugin source transformed with `rename` and a native ACF capability that authors the same content through core fields, `targets.claude.native`, `targets.claude.package` (non-SemVer version) and `native/claude/` files, assert identical Claude plugin trees apart from digest-derived values; extend the registry self-check to fail when a datum the Claude reader preserves has no native authoring form.

## 5. Claude plugin carrier

- [x] 5.1 Verification spike against the locally installed `claude` (2.1.97) in a throwaway `HOME` and project: pin `marketplace add`, `install`, update, `uninstall` and `list --json` flags and output, in-place loading versus version caching, whether marketplace names are global, policy-block output, and the working directory Claude starts plugin stdio MCP servers in; record evidence in `research/plugin-interop/tools/claude-code.md` and registry evidence; capture transcripts as fake-CLI fixtures.
- [x] 5.2 Runtime check for open question 7: register a project-scope marketplace with the local `claude` and record exactly what Claude writes into `.claude/settings.json` and other committed or user files (absolute paths, marketplace record, enablement); add the result to the open question for the user and gate default project registration on it.
- [x] 5.3 Add `targets.claude.carrier` with the `plugin` default and the configuration error for other targets, and write Claude plugins for native ACF capabilities (layout, `+acf.<digest>` version including the `targets.claude.package.version` base and the `.acf.` separator for bases with build metadata, package-local `.mcp.json`, package-level Claude extras, `native/claude/` files, no `ACF-MANAGED.md` inside the package); verify with a golden and an inventory golden.
- [x] 5.4 Write Claude plugins for foreign sources: unchanged Claude plugin byte-identical, excluded and renamed Claude plugin, an Agent Plugins package translated to Claude, and refusal of a Claude plugin with remainder under `carrier: loose`; verify with one golden each.
- [x] 5.5 Apply carrier eligibility and `acf.claude.legacy-carrier` for native ACF capabilities with agents, commands, hooks or instructions; verify with a skill-plus-hook fixture.
- [x] 5.6 Generate the per-scope local marketplace directory and record its name and scope in the sidecar; verify with a golden of `marketplace.json` after add and remove.
- [x] 5.7 Add a Claude host port (CLI implementation plus fake) and apply sequencing, host state, missing CLI, policy block, native disable and local-scope reporting; verify with integration tests driven by the 5.1 fake-CLI fixtures.
- [x] 5.8 Migrate loose Claude output per capability after successful registration, retiring only owned undrifted paths and owned `.mcp.json` keys, keeping `.agents/skills` copies other targets discover, and showing the one-time rename notice; verify with integration goldens for clean, drifted and failed-registration migrations and a second apply without the notice.
- [x] 5.9 Add an opt-in real-host test (`CAPLET_HOST_TESTS=claude`) that installs a fixture plugin, invokes a skill and an MCP tool, updates it and uninstalls it; record the result as `verified` evidence. Partly deferred: install, plugin MCP server start and connection, update, uninstall and marketplace removal are verified against claude 2.1.97 (`apps/caplet/tests/hosts/claude/real-host.test.ts`, `research/plugin-interop/tools/claude-code.md`); invoking the skill and calling the MCP tool through a model need an authenticated session and remain UNKNOWN.

## 6. Documentation

- [x] 6.1 Update SPEC.md §§4.2, 7, 9, 13a, 14.3, 14.4, 14.7, 18, 19, 20, 22.1, 22.2 and 22.5 to match the capability specs.
- [x] 6.2 Revise CONTEXT.md Axioms 4 and 12, update IMPLEMENTATION.md §§3, 4, 7, 8.2, and document carriers, host states, migration, executable change reports and the known loose Claude hook defect in the README.

## 7. Verification

- [ ] 7.1 Run focused package tests and `bun run ci`.
- [ ] 7.2 Run `openspec validate plugin-interop-foundation --strict` and `git diff --check`.
- [x] 7.3 Dogfood: install one public Claude plugin and one public Agent Plugins package for Claude at user and project scope and for Codex loose; migrate a loose Claude install; record results. Recorded in `research/plugin-interop/dogfood-7.3.md`; Codex loading and model invocation remain UNKNOWN (Codex not installed; no authenticated Claude session).
- [ ] 7.4 Run an independent review of the branch against this change and the code-review standards.
