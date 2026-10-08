## Context

Caplet resolves native ACF capabilities and bare skill repositories (SPEC.md §18, §20.3) and emits loose native files per target (SPEC.md §22). The plugin-interop research (`research/plugin-interop/`) inventories fifteen tools and two package standards field by field (`tools/*.md`), derives a canonical model per facet (`facets/*.md`), and records five advisor reviews (`advice.md`) plus an earlier critique of the core-versus-extras idea (`advice-core-vs-extras.md`).

The user's decisions frame this change and its follow-ups:

- Caplet accepts native ACF, bare skills, Agent Plugins 1.0 and Claude plugins, and later other plugin formats, marketplaces and transitive imports, all mapped into one canonical model.
- Output is a real Claude plugin for Claude, Agent Plugins packages for Codex, Copilot, VS Code and Cursor, and loose files for tools without a plugin system (OpenCode, Pi). This change delivers the Claude part; Agent Plugins output is the follow-up `agent-plugins-output`.
- Native ACF is the most capable format through a two-layer model: a portable core that is the union of meanings at least two tools share with proved equivalence (sacrificing nothing; one meaning per field; every writer maps natively or declares a per-field degradation or refusal), plus per-target raw extras emitted verbatim to the matching tool and dropped with a diagnostic elsewhere.
- Same-format round trips are lossless.
- Caplet does not own approval of executable content: adding or updating a source is the approval; caplet only reports what executable content changed.

Current code constraints that shape the design (from the code survey): `AcfCapability` has no source format or snapshot; the core and installer define competing lock types and the lock records only the first capability's hash; `computeContentHash` frames entries ambiguously and ignores modes; the registry declares support per facet family (`full`/`partial`); `inspectSource` ignores plugin manifests; materialization drops hidden files and links in skill trees; Claude output is loose (`.claude/skills`, `.agents/skills`, `.claude/agents`, `.claude/commands`, `CLAUDE.md` blocks, `.claude/hooks` plus `settings.json`, `.mcp.json`); skills are emitted with canonical frontmatter passed through; sidecar sweeping keeps stale paths while their capability and facet exist; `applyOneDiff` has no precondition on current content; tests are Bun assertion tests with no golden-tree harness.

Known defect, out of scope here: loose Claude hook output is not loadable. `hookSettingsEntry` (`packages/adapters/src/common/emitter.ts:549-574`) writes caplet's canonical hook object (`acfMarker`, `name`, `type`, `event`, `effect`, `timeoutMs`, `run`) into `.claude/settings.json`, but Claude reads `{"hooks": {"<Event>": [{"matcher": ..., "hooks": [{"type": "command", "command": ...}]}]}}` with `timeout` in seconds (`research/plugin-interop/tools/claude-code.md`, Hooks). `packages/core/src/targets/registry.ts:83` maps `permission_request` to `PreToolUse` for Claude, although Claude has a separate `PermissionRequest` event. Mixed capabilities stay on loose Claude output (D9), so the defect remains reachable after this change; the follow-up `claude-loose-hooks-repair` fixes it and is independent of this change.

Host facts rest on documentation evidence recorded in the research inventories (Claude Code docs as of 2026-10-08, local Claude 2.1.97; Agent Plugins 1.0 pinned at `ff8ab5e392cc87bd88d87c060815a87490e51003`). The exact flags of `claude plugin update|uninstall|list` and what Claude writes for a project-scope marketplace are not verified; the design gates each on a verification task.

## Goals / Non-Goals

**Goals:**

- Make the two-layer model, the promotion rule, safety classes and the field-level support table normative for skills and MCP.
- Read Agent Plugins 1.0 packages and Claude plugins as one capability each, preserve them completely, and write Claude plugins back losslessly.
- Translate skills and basic MCP servers between formats with native serialization for Claude, Codex, Cursor, OpenCode and Pi; refuse what a target cannot honor safely, with a negative fixture for every refusing restriction.
- Emit a real Claude plugin registered through a caplet-owned local marketplace, with scope mapping, host state and a safe migration from loose output.
- Close the integrity gaps that foreign packages expose (digest, lock, verification, frozen restore, ownership, containment, credentials) and report executable changes.

**Non-Goals (each is a follow-up; see Follow-up changes):**

- Agent Plugins writers, client profiles and the `copilot` and `vscode` targets.
- A native ACF repository root as an Agent Plugins package.
- Core display names, MCP enablement, MCP tool filters, MCP timeouts and path-scoped activation as core fields.
- Hooks in any form, including the loose Claude hook defect.
- Marketplace and catalog inputs; `.codex-plugin`, `.cursor-plugin` and Gemini readers; Agent Plugins 1.1; transitive imports and plugin dependencies.
- Translating agents, commands, instructions, permissions, LSP servers, output styles, themes, monitors or model and effort settings across formats; a portable hook runner, permission language or template and argument dialect.
- Publishing an ACF extension namespace; `caplet convert`.

## Decisions

### D1. First milestone: four readers, one plugin writer

All four source formats are read; the only new writer is the Claude plugin carrier with automated registration through the `claude` CLI, pinned against the locally installed Claude by a verification spike before it ships. Agent Plugins sources reach Claude as translated Claude plugins and every other target as loose files. Codex, Cursor, OpenCode and Pi keep loose output with native skill and MCP serialization. Tasks run in seven groups: harness and registry, integrity, readers, canonical fields and serialization, Claude carrier, documentation, verification.

Alternative: four readers and two plugin writers (the earlier draft). Rejected because every Agent Plugins route is unverified, the user wants Codex verified first and Copilot second, and the Agent Plugins writer adds five profiles, two targets and three host ports that do not block the Claude outcome. It moves to `agent-plugins-output` unchanged in intent.

Alternative: skills and MCP only, with Claude plugins later (simplicity lens). Rejected because the user decided that Claude gets a real plugin and that Agent Plugins and Claude plugins are inputs now; the preservation layer makes the extra readers cheap.

### D2. Stay on `acf: 1`; additive source, adapter-contract emitter changes

New source fields (skill and MCP fields, `targets.<t>.native`, `native/<t>/`, `${ACF_DATA_DIR}`, `format:` on entries, `targets.claude.carrier`) are optional and additive under SPEC.md §1.3. Emitter changes (plugin carrier, refusals instead of degradations, canonical-root rule) change adapter contracts, which SPEC.md §22 already lets evolve, and are announced as breaking output changes. The lock adds fields; the v1 `capabilityHash` stays.

Alternative: `acf: 2` (implementation lens). Rejected because no existing valid `acf: 1` source becomes invalid or changes meaning; only outputs change.

### D3. Polyglot sources: precedence plus override, never merge

Detection precedence is ACF, Agent Plugins, Claude plugin, bare skills; an `info` diagnostic names the selection and ignored manifests; `format:` on the entry overrides. Ignored manifests stay in the snapshot.

Alternative: merge all recognized manifests (facet research). Rejected because merging lets one dialect's permissive data widen another's restrictions, and nothing guarantees the manifests agree. Per-target views of polyglot packages are a follow-up.

### D4. Unknown extras are dropped visibly; known restricting extras block

An extra the registry does not classify is dropped with `acf.extras.dropped` (`lossy`); `failOnLossy` and strict mode fail on it. An extra classified `restricting` without a carried core equivalent blocks the component for every target that does not receive it.

Alternative: fail closed on every unknown extra (security lens). Rejected because unknown native keys are overwhelmingly presentation and host tuning; failing on them would make most foreign packages uninstallable for any second target. The registry classifies every native key the research inventories list.

### D5. Restrictions are never degraded

Fields classed `restricting` (manual-only and user-only invocation, path-scoped activation extras, MCP tool filter extras) are native, translated with equal meaning, or refused. The research's degradations (description text for manual-only skills, description hints for path scoping, Claude `permissions.deny` for MCP denylists) are not used. Every refusing restricting cell has a negative fixture asserting that no component file, shared-root copy or substitute artifact is written (capability-model-layers, Negative fixtures for data-only restrictions). Hook effects follow the same rule in `claude-loose-hooks-repair`.

Alternative: degrade with a `lossy` warning, as SPEC.md §14.3 does today. Rejected because dropping a restriction widens what the agent may do while the author believes it is narrowed; a warning in a plan the consumer may never read is not consent.

### D6. Selection and rename on foreign packages are allowed with a warning

`include`, `exclude` and `rename` apply to foreign packages; the writer regenerates understood carriers, copies everything else, never resurrects excluded files, and warns that preserved components may reference renamed or excluded items.

Alternative: refuse transformations on packages with native remainder (standards lens). Rejected because users already rely on `exclude` and `rename` to resolve collisions (SPEC.md §18).

### D7. Runtimes and languages stay out

No portable hook runner, permission expression language or skill template dialect is designed here. Imported uses survive same-format output, and native ACF authors reach them through per-target extras (D17).

Alternative: define them now so hooks and permissions can translate. Rejected because each needs its own contract and host verification, and none blocks the readers or the Claude writer.

### D8. Claude: caplet-owned local marketplace driven through the `claude` CLI

Each scope gets one marketplace directory at `<claude-install-root>/.acf/marketplace/` that lists caplet's generated plugins by relative path. Caplet drives the CLI with flags and exit codes pinned by task 5.1 (verified, Claude 2.1.97): an unconditional, idempotent `claude plugin marketplace add <dir> --scope <s>`, then `install` for new plugins, `update` for plugins whose version changed, `uninstall` for removed ones, always with `--scope`, and `claude plugin list --json` for host state. Claude copies each installed plugin into a cache keyed by version and `update` ignores a content change under an unchanged version, so every generated plugin version carries `+acf.<digest>`, including foreign Claude plugins whose declared version caplet rewrites in place (the one byte change of a same-format round trip). Caplet never runs `install` on an installed plugin, because it re-enables a user-disabled plugin (D15). Marketplace names are global per user, so the user marketplace is `acf-user` and each project's is `acf-project-<hash of the project root>`. ACF `user` maps to Claude `user`; ACF `project` maps to Claude `local` (D25).

Alternative: edit `enabledPlugins` and `extraKnownMarketplaces` directly. Rejected because Claude also keeps private install records and caches, and going through the host's own path keeps its policy checks in force.

### D9. Mixed Claude capabilities stay whole on the loose carrier (decided 2026-10-08)

A native ACF capability that selects agents, commands, hooks or instructions for Claude stays whole on today's loose Claude output with `acf.claude.legacy-carrier`. Foreign Claude plugins are unaffected: their agents, commands and hooks are native remainder and go into the plugin unchanged; a foreign Claude plugin with remainder under `carrier: loose` is refused for Claude.

Alternative: split such a capability (skills in the plugin, the rest loose). Rejected because one capability would have two lifecycles, and disabling the plugin would leave its hooks active. Alternative: hard switch, dropping those families for Claude until their follow-ups land. Rejected as default because it removes working behavior on upgrade.

### D10. Adding or updating a source is the approval; caplet reports executable changes

Caplet keeps no acceptance state and never prompts or blocks on executable content. The consumer's `caplet add` or `caplet update`, which pins the resolved revision and payload digest in `capabilities.lock`, is the approval. `add`, `update` and `apply` list executable components (MCP stdio servers, hooks, LSP servers, executable files and code modules) added, changed or removed per capability and target, in human and `--json` output, so a change is never silent. Caplet writes no host trust or approval state, so host trust prompts and enterprise policy still apply (install-integrity, Executable change report).

Alternative: per-user re-acceptance whenever executable content changes (earlier draft). Rejected by the user: it duplicates the act of updating, blocks headless use, and competes with hosts' own trust prompts. Alternative: acceptance recorded in the committed lock. Rejected because one teammate's acceptance would approve code for everyone.

### D11. No default grants

Caplet writes no tool pre-approvals, permission rules or MCP auto-approval for any host; imported `allowed-tools` stays in its source format or travels only as a per-target extra to the same host.

Alternative: translate `allowed-tools` between hosts. Rejected because tool names, matcher syntax and grant duration differ, so a translation can widen a grant.

### D12. New payload digest beside the v1 hash

`acf-tree-2` frames lengths, includes executable bits and is computed per capability; `capabilityHash` stays.

Alternative: fix `capabilityHash` in place. Rejected because SPEC.md §19.5 defines it and every existing lock would appear changed.

### D13. No notices inside packages

`ACF-MANAGED.md` is never written into plugin packages or preserved payloads; the install-root inventory lists them.

Alternative: per-artifact notices (SPEC.md §14.7). Rejected because a notice inside a package breaks byte-identical round trips and becomes content hosts load.

### D14. Canonical `.agents/skills` only for targets that discover it

The canonical copy is written when a selected target discovers `.agents/skills` (Codex, Cursor, OpenCode, Pi); Claude does not. A skill refused for any selected reader of a shared root is not written to that root.

Alternative: always emit the canonical copy (SPEC.md §22.2). Rejected because Claude-only users would get an unused tree and plugin-carrier skills would exist twice.

### D15. Native disable wins

When the user disables a caplet-installed plugin in the host, caplet keeps updating files and never re-enables it.

Alternative: re-enable on apply. Rejected because host enablement is the consumer's runtime choice.

### D16. Promotion needs proved equivalence of meaning, value domain and effect

A meaning joins the core only when documented value domain, default, effect and scope agree after a declared lossless encoding. A same-named key with a weaker effect on a different surface is not the same meaning (VS Code `user-invocable` hides a menu entry; Claude's refuses typed invocation). Each cell records `documented` or `verified` evidence; where documentation leaves equivalence unproved (glob grammar, activation scope), the meaning stays a per-target extra until `verified` tests prove it (capability-model-layers, Union-without-sacrifice promotion rule and Recorded equivalence evidence).

Alternative: promote on matching names (facet drafts). Rejected because the research found same-named fields with different meanings (`effort`, iteration limits, LSP `languageId`, `user-invocable`).

### D17. Pending shared meanings travel as per-target extras

Shared meanings whose core contract is deferred (skill display name, path-scoped activation, `allowed-tools`, `arguments` and body placeholders, `context`, `agent`, `requires.mcp`; MCP enablement, tool filters, timeouts, `envFile`, sockets, `headersHelper`, OAuth, auto-approval, loading hints, watch, value references; package `displayName`, `dependencies`, `userConfig`) are authorable in native ACF as per-target extras with the target's own spelling, so anything a preserved foreign package carries to a target a native ACF capability can also carry (capability-model-layers, Pending core meanings travel as extras and Native ACF expressiveness parity). The registry lists them as pending; an extra for a pending meaning gets `acf.core.pending` (`info`) naming the future core field, and restricting pending extras block other targets (D4). When a meaning is promoted, `caplet check --fix` rewrites the extras into the core field (`canonical-skill-mcp-extensions`, task 4.1).

Alternative: reserve the core names and forbid extras until the contract exists (earlier draft D18). Rejected because native ACF would then be less capable than a preserved foreign package for the same target, contradicting the most-capable-format goal. The cost is one mechanical migration per promoted meaning.

### D18. `invocation.user: false` means explicit invocation is refused

The core field means the user cannot invoke the skill explicitly, not that it is hidden from a menu. Claude `user-invocable: false` (typed invocation refused) is native for both Claude carriers. Codex, Cursor, OpenCode and Pi have no documented equivalent and refuse. VS Code, whose key only hides the menu entry, refuses in `agent-plugins-output`; Copilot CLI, whose key disables `/SKILL-NAME`, is native there (canonical-skills, Canonical skill fields and Per-target skill support).

Alternative: map to every key named `user-invocable`. Rejected by D16.

### D19. MCP enablement, tool filters and timeouts are deferred with corrected cells

This change reads them as extras of their source host and preserves them in same-format output. `canonical-skill-mcp-extensions` promotes them with cells that the review showed the draft got wrong: `enabled: false` keeps its restricting part by omitting the server where no native disable exists and declares the lost dormant definition as a `lossy` degradation; tool filters refuse on Claude and on every Agent Plugins carrier, because the closed 1.0 `mcp.json` schema invalidates a server with unknown keys, while the Copilot loose carrier carries `tools`; timeouts state each native unit and value domain (Claude `timeout` is the per-server tool timeout in milliseconds with a 1000 ms minimum, so smaller values are dropped, never clamped).

Alternative: keep the draft core fields in this change. Rejected because their cells were wrong and correcting them needs the Agent Plugins columns, which are not in this milestone.

### D20. `when_to_use` stays a Claude extra

Only Claude documents it; appending it to `description` elsewhere is not a shared meaning and changes description budgets.

### D21. Skill `metadata` stays an unrestricted string map

The Agent Skills definition is used unchanged; ACF reserves no keys inside it, because nested ACF data in `metadata` is invisible to consumers and turns a string map into a second schema.

### D22. Foreign default working directories are made explicit on read

Agent Plugins 1.0 defines an omitted stdio `cwd` as the plugin root, so the Agent Plugins reader writes `cwd: ${ACF_CAPABILITY_DIR}` into the canonical server; relative arguments such as `./dist/index.js` then keep their meaning on every target, and targets that cannot set a working directory refuse the server instead of starting it elsewhere. Claude starts plugin stdio servers in the directory it was launched from and ignores `cwd` (verified, task 5.1), so a Claude plugin author cannot rely on a working directory and the Claude reader leaves `cwd` omitted, which keeps the existing ACF meaning (no assumption) (canonical-mcp, Effective working directory on read).

Alternative: leave `cwd` omitted and let each host apply its default. Rejected because hosts start servers in different directories (project, plugin root, or undocumented), so a relative argument would silently point elsewhere. Alternative: emit a `cd` wrapper for Claude. Rejected for the D5 reason that it changes the executed command, and it fails on Windows.

### D23. Per-target package values keep manifest parity

Native manifest values can be wider than the core value domain (Claude and Agent Plugins accept any `version` string; authors are objects). `targets.<target>.package` sets the value of a generated manifest key for one target in that target's own domain, and readers record foreign out-of-domain values there, so a transformed foreign package and a native ACF capability reach the same output through the same path (canonical-package-metadata, Per-target package values; task 4.7 tests the parity). The capability's own `version` stays SemVer because the lock, update ordering and SPEC.md §4.2 depend on it.

Alternative: let package-level `native` extras override generated keys. Rejected because it breaks the rule that extras never override core fields, which keeps conflicts detectable everywhere else. Alternative: relax `version` to any string. Rejected because it changes an `acf: 1` source contract.

### D24. Legacy author strings stay valid and unchanged

`acf: 1` defines `authors` as free-form strings, and existing manifests use them. The canonical model keeps a string entry as it is, so hashes, the lock and validation are unaffected, and writers decode `Name <email>` only when re-encoding reproduces the string exactly (canonical-package-metadata, Legacy author strings).

Alternative: parse every string into `{name, email, url}`. Rejected because free-form strings have no grammar, and a wrong parse would rewrite an author's identity.

### D25. Project scope registers at Claude `local` scope (decided 2026-10-08 from task 5.2 evidence)

Claude records a directory marketplace as an absolute path in the scope's settings file; at Claude `project` scope that file is the committed `.claude/settings.json`, so one teammate's machine path would be committed and a teammate's clone would see an unknown marketplace and fail to install. Caplet therefore registers the project marketplace and installs project plugins at Claude `local` scope (`.claude/settings.local.json`); each teammate's `caplet apply` registers them from the committed `capabilities.yml` and lock. Claude itself appends `**/.claude/settings.local.json` to the user's global git ignore on the first local-scope write; the README notes it.

Alternative: Claude `project` scope (the earlier mapping). Rejected because it commits a machine-specific path and churns between teammates. Alternative: no automatic project registration (`registration required`). Rejected because new project installs would not load until each user ran manual commands, and loose installs would never migrate.

### Moved decisions

The earlier draft's native-ACF-root decision moved to `acf-root-agent-plugins-package`; its Copilot-and-VS-Code-as-separate-targets and Cursor-placeholder decisions moved to `agent-plugins-output`, where they are requirements.

### Advisor disagreements resolved

| Disagreement | Decision |
|---|---|
| Slice breadth: skills and MCP only (simplicity) vs four readers and two plugin writers (earlier draft) | D1: four readers, Claude writer only |
| `acf: 1` additive vs `acf: 2` successor contract (implementation) | D2 |
| Polyglot union (facets) vs precedence with override (product, security) | D3 |
| Unknown extras fail closed (security) vs drop with diagnostic (simplicity, user rule) | D4 |
| Restrictions degrade with warning (SPEC.md today, facet research) vs refuse (all lenses) | D5 |
| Transformations on foreign packages refused (standards) vs allowed (product) | D6 |
| Claude install through settings writes vs CLI and local marketplace | D8 |
| Split, legacy or hard switch for mixed Claude capabilities | D9 (open question 2) |
| Acceptance in lock (implementation) vs consumer acceptance state (security) vs no caplet approval (user) | D10 |
| Deferred shared meanings reserved (earlier draft) vs per-target extras (review) | D17 |
| "Every core field writable by every writer" (skills facet) vs union with declared refusal (user rule) | Layers spec: promotion rule plus refusal cells |

### Follow-up changes

With a change directory, each validated with `openspec validate <id> --strict`:

- `agent-plugins-output`: Agent Plugins writer with `generic`, `codex`, `copilot`, `vscode` and `cursor` profiles; `copilot` and `vscode` targets; lossless Agent Plugins round trip; Agent Plugins skill and MCP columns; registration verified Codex first, Copilot second. Pi stays loose (no Agent Plugins support).
- `acf-root-agent-plugins-package`: `caplet pack --agent-plugins` and a native ACF root that is also an Agent Plugins package; holds the deferred open question 6.
- `canonical-skill-mcp-extensions`: display names, MCP enablement, tool filters and timeouts with corrected cells, the path-scope promotion gate, and migration from extras.
- `claude-loose-hooks-repair`: Claude settings hook shape, `PermissionRequest` mapping, refusal instead of degradation of restricting hook effects.

Without a directory yet: marketplace and catalog inputs; `.codex-plugin`, `.cursor-plugin` and Gemini extension readers; transitive imports and plugin dependencies; per-target views of polyglot packages; agents and commands interop; hooks in the Claude plugin carrier and hooks interop with a runner contract; instructions interop (needs a CONTEXT.md Axiom 10 revision); permissions language; MCP variables, references and authentication; skill argument and placeholder dialect; ACF extension namespace publication; `caplet convert`; LSP servers; a native `.cursor-plugin` writer; remaining Codex sidecar fields.

Idea outside caplet: Lume (`/home/blaz/code/lume`, the user's own agent runtime, not a caplet target) could read Agent Plugins packages natively and serve as a second conformance client for packages caplet writes. Not part of any change here.

## Implementation contracts

Shared boundaries between the readers, the registry, the writers and caplet. Changing one is a cross-lane decision recorded here.

- **Types.** `packages/core/src/types/interop.ts` defines `SourceFormat`, `SafetyClass`, `Carrier`, `SupportCell`, `FieldSupport`, `NativeKeyInfo`, `CapabilitySource` and `NativeRemainderComponent`. `AcfCapability` gains optional `source` (format, format version, selected path, snapshot root), `remainder` (preserved, unprojected foreign components with safety class and an executable flag) and `nativeFiles` (`NativeFileExtra[]`: `{target, path, executable}` for each regular file under `native/<target>/`, sorted by target then path; bytes are read from `<root>/native/<target>/<path>` at write time). `Manifest.authors` entries are `string | PackageAuthor` (`{name, email?, url?}`; strings stay verbatim and are decoded only by writers). Skill frontmatter gains `license`, `compatibility`, `metadata` and `argument-hint`; stdio MCP servers gain `cwd`; `CapabilityEntry` gains `format`.
- **Registry API** (`packages/core/src/targets/`): `fieldSupport` (all `FieldSupport` declarations for skills, MCP and package fields), `supportCell(field, target, carrier)`, `nativeKeyInfo(target, family, key)`, and per-target carriers (`claude`: `plugin` and `loose`, default `plugin`; every other target: `loose`). Field ids are `<family>.<path>` with `=<value>` for value conditions (`skill.invocation.model=false`, `mcp.cwd`). Family-level `support` stays only for the facet families this change does not cover (agents, commands, instructions, hooks) until their follow-ups.
- **Extras authoring.** Every extension attachment point (`acf.yml` package level, skill frontmatter, MCP server) accepts `targets.<t>.native: {<native key>: <value>}`; `acf.yml` alone accepts `targets.<t>.package: {<manifest key>: <value>}`. File extras live under `native/<target>/` in the capability tree. Readers record foreign native keys in the same places, so writers have one input path. Extras are keyed by dialect (`ExtrasDialect` in `packages/core/src/extras/`): a target id, or `agent-plugins` for Agent Plugins 1.0 keys that have no target in this change; readers may write the `agent-plugins` dialect, native ACF authors may not. All code reads extras through `nativeExtras`, `packageValues`, `extrasDialects`, `nativeFiles(cap, target)` and `nativeFileTargets(cap)` from that module. `packages/core/src/targets/plugin-layout.ts` owns the paths a plugin writer generates (`generatedPluginPaths(target, {skills, mcp})`, `generatedPathCollision`), so validation and the Claude writer agree on collisions; `packages/core/src/targets/package-values.ts` owns the per-target package value schemas (`packageValueSchemas`, `packageValueProblem`).
- **Diagnostics.** `acf.support.refused` (error), `acf.support.degraded` (the cell's severity), `acf.support.component-omitted` (lossy), `acf.extras.dropped` (lossy), `acf.extras.conflict` (error), `acf.core.pending` (info), `acf.source.format-selected` (info), `acf.source.marketplace-unsupported` (error), `acf.source.format-version-unsupported` (error), `acf.lock.digest-mismatch` (error), `acf.source.snapshot-rejected` (error), `acf.source.credential-in-url` (error), `acf.extras.unclassified` (info, a native key the registry does not know), `acf.extras.package-value-invalid` (error), `acf.native.unknown-target`, `acf.native.unsupported-entry` and `acf.native.collision` (errors for `native/<target>/`), `acf.skill.paths-not-core` (error), `acf.mcp.cwd.invalid`, `acf.mcp.url.insecure`, `acf.mcp.url.credential-in-url` and `acf.mcp.placeholder.unsupported` (errors), `acf.apply.drift` (warn), `acf.apply.outside-root` (error), `acf.claude.legacy-carrier` (info). URL credential detection (`findUrlCredentials`, `sourceUrlCredentialProblem`) lives in `packages/core/src/credentials/` and is shared by source and MCP URL validation. A present snapshot whose digest fails is excluded and reported, never silently re-fetched; a missing snapshot is restored from the locked `resolvedSha` and must match the lock. Support diagnostics take code, severity and message text from registry cells.
- **Lock.** One schema shared by core and installer. Each capability a source provides records `name`, `format`, `formatVersion` (when the format has one), selected `path`, `payloadDigest` (`acf-tree-2:sha256:<hex>`) and its v1 `capabilityHash`; old lockfiles read and are upgraded on the next write.
- **Format readers** live in `packages/core/src/formats/` (native ACF reading stays in `packages/core/src/reader/`). They return `AcfCapability` values with `source` and, where a format has unprojected components, `remainder` set, and record foreign native keys and package values only through the extras module. The resolver picks the reader from the lock record's `format`; detection runs at add and resolve time.
- **Fake Claude CLI.** Transcripts from task 5.1 live in `apps/caplet/tests/fixtures/claude-cli/<scenario>.json` as `{argv, exitCode, stdout, stderr, notes}`; the host port's fake replays them.

## Risks / Trade-offs

- [Claude CLI behavior can change between versions] -> Flags, exit codes and JSON shapes are pinned by verified transcripts of 2.1.97 replayed by the fake CLI; the opt-in real-host test (task 5.9) re-checks them against the installed Claude.
- [Policy-block output is not runtime-verified] -> Caplet recognizes the policy messages found in the 2.1.97 binary; an unrecognized failure is reported as `unknown` host state with Claude's message, never as a loose fallback.
- [Plugin-qualified invocation names break user habits and scripts] -> One-time rename notice on migration (decided 2026-10-08).
- [Refusals make some packages uninstallable for some targets] -> Behavior-first plan output names the recovery (`exclude`, `except`, carrier), and refusals are per component and target.
- [Dropping an unclassified restricting key (D4)] -> The registry classifies every native key in the research inventories; the registry self-check fails if a known key lacks a class.
- [Per-target extras for pending meanings need migration on promotion (D17)] -> `acf.core.pending` names the follow-up at authoring time, and `caplet check --fix` performs the rewrite.
- [Executable changes are reported, not gated (D10)] -> A consumer may not read the report; the lock pins exact content, the report is in `--json` for CI review, and host trust prompts and policy remain in force because caplet writes no trust state.
- [Loose Claude hooks stay broken until `claude-loose-hooks-repair` lands] -> Recorded as a known defect in the README (task 6.2); the repair is independent of this change.
- [Agent Plugins stdio servers are refused for Claude (D22)] -> Agent Plugins servers carry the plugin root as their working directory, which Claude cannot be told; task 5.1 verified that Claude starts plugin MCP servers in the launch directory and ignores `cwd`, so these servers are refused for Claude with a recovery, and the dogfood run in task 7.3 records which public packages are affected. Skills of the same package still install.
- [Lossless output depends on complete snapshots] -> Snapshot tests cover hidden files, modes, links and normalization collisions; links fail loudly instead of being dropped.

## Migration Plan

1. Ship integrity and preservation first (digest, lock fields, snapshot, sidecar fields, preconditions, containment, executable change report); old locks and sidecars are read and upgraded on the next write.
2. Ship canonical schema additions, extras and native serialization; existing ACF sources stay valid. Skills or servers that relied on restriction degradation now fail for the affected targets with a recovery action; release notes list the refused combinations.
3. Ship readers; existing `capabilities.yml` entries resolve as before because ACF and bare skills keep their layouts. A bare-skill source that also contains a plugin manifest is now read as that plugin; the plan shows `acf.source.format-selected`, and `format: skills` restores the old reading.
4. Ship the Claude plugin carrier. On the first apply, each eligible Claude capability migrates per the Claude migration requirement and the one-time rename notice is shown; failures leave loose output in place. Rollback: `targets.claude.carrier: loose` returns to loose output; caplet uninstalls its plugins and re-emits loose files through the same ownership rules.

## Open Questions

### Open questions for the user

1. **ACF extension namespace.** Open. Agent Plugins extension namespaces are reverse-domain names the publisher controls. Which domain should ACF own (for example a domain registered for the project, or `io.github.barisgit.acf`)? Until answered, no ACF namespace is emitted. This change emits no Agent Plugins packages, so the question blocks only the follow-ups.
2. **Mixed Claude capabilities.** Decided (user delegated, 2026-10-08): a native ACF capability with agents, commands, hooks or instructions for Claude stays whole on loose output (D9). Rejected: hard switch to the plugin, because it would silently remove working features until their follow-ups land.
3. **Executable content on updates.** Answered: caplet keeps no acceptance gate or state; adding or updating a source is the approval, and caplet lists executable additions and changes without prompting or blocking (D10).
4. **Claude invocation rename.** Decided (user delegated, 2026-10-08): migrate existing installs to `/capability:skill` on upgrade, with a one-time notice listing old and new names. Rejected: opt-in per capability, because it keeps two Claude carriers alive indefinitely for a small pilot user base.
5. **First Agent Plugins client.** Answered: Codex first (the user's daily tool), Copilot second; Pi and Lume have no Agent Plugins support and stay loose or out of scope. Recorded in `agent-plugins-output`.
6. **Which ACF repositories may also be Agent Plugins packages at their root.** Deferred to `acf-root-agent-plugins-package`, whose proposal states the choice in plain words: only repositories whose skills use plain Agent Skills frontmatter, or also those with a per-skill ACF side file.
7. **Team sharing of the project Claude marketplace.** Decided (user delegated, 2026-10-08) from task 5.2 evidence: Claude writes the marketplace's absolute path into the committed `.claude/settings.json` at project scope, so caplet keeps Claude registration out of committed settings entirely and registers per machine at Claude `local` scope (D25). Rejected: committed project registration, and leaving project registration off by default.

### Open technical questions (resolved by tasks)

- Resolved by task 5.1 (`research/plugin-interop/tools/claude-code.md`, Runtime verification): CLI flags, exit codes and JSON shapes; plugins are cached by version, not loaded in place (D8); plugin stdio servers start in the launch directory and `cwd` is ignored (D22 refusal confirmed).
- Resolved by task 5.2: project-scope marketplaces record an absolute path in committed settings (D25).
- Still unknown: the policy-block exit code and output at runtime (needs root or a managed account; caplet matches the policy messages found in the 2.1.97 binary), the interactive trust prompt for project-declared marketplaces, and skill-body reload in a model session after update (needs an authenticated session; task 5.9).
- Whether Cursor resolves a `./` command and the default working directory of an Agent Plugins package against the plugin root, and whether Codex connects plugin SSE servers (`agent-plugins-output` tasks 1.5 and 2.1); both are refused until verified.
- Codex headless plugin install and `agents/openai.yaml` handling inside plugin skills, and Copilot directory-marketplace live loading (`agent-plugins-output` tasks 2.1 and 3.1).
