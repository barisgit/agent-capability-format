# Advisor: core vs per-target extras (pre-research critique, 2026-10-01)

## Verdict

Keep the reader → canonical model → writer architecture, but narrow the portability promise, make losslessness conditional, and separate plugin generation from native installation.

## Ranked adjustments

### 1. Define portability by observable behavior—not by facet names  
**Blocker for the first slice.**

The two-layer approach is sound. The promotion rule is also sound **if “implemented by two tools” means equivalent behavior demonstrated by tests**, not similarly named features.

The current implementation illustrates the danger:

- `packages/core/src/targets/registry.ts` declares Claude hooks “full” and maps `permission_request` to `PreToolUse`.
- `packages/adapters/src/common/emitter.ts` emits canonical hook objects rather than Claude’s native matcher/handler structure.
- Triggered instructions become Markdown under `.acf/instructions/`; writing their activation metadata does not implement activation.
- `packages/adapters/tests/claude.test.ts` checks those emitted structures, not whether Claude executes them correctly.

Keep the six existing facet families, but distinguish **portable contracts**, **advanced ACF runtime contracts**, and **native-only features**.

| Area | Where translation breaks | Recommendation |
|---|---|---|
| Hooks | Event timing, input/output protocols, matcher semantics, ordering, cancellation and permission decisions differ. | Translate only proven event/effect combinations. Do not build a universal hook runtime in slice one. |
| Agents/commands | “Agent” can mean primary persona or subagent; tools, permissions, model selection, arguments and namespaced references differ. | Preserve native controls as extras. Rewrite references only when understood; never silently broaden permissions or model invocation. |
| Instructions | SPEC §12 promises initial-system placement, zero pre-trigger tokens and precise activation behavior. Native rules or skills do not generally provide that contract. | Mark unsupported semantics honestly. Claude does **not** load a plugin-root `CLAUDE.md`; converting it to a skill is not equivalent. |
| Settings | Plugin defaults are not consumer or organization settings. Current Claude plugin settings only apply `agent` and `subagentStatusLine`. | Keep settings native and package-local. Never interpret raw extras as permission to modify arbitrary user settings. |
| MCP | Transport names, working directory, variable expansion and persistent-data directories differ. | Translate configuration semantics field by field, not through global string replacement. |
| Scopes | ACF shadows per `(family, name)`; native plugins have package identities and different precedence. | Preserve ACF collision checks before emission; explicitly reject unsupported overlap cases rather than delegating semantics to the client. |

**Safety correction:** SPEC §§13.7/22.6’s blocking/deciding-hook degradation to observation is potentially fail-open. Missing enforcement should block activation by default, not merely produce a lossy warning.

### 2. Preserve an immutable native package alongside the typed projection  
**Blocker for foreign readers and lossless round trips.**

`AcfCapability` currently lacks source-format provenance and an original-package representation. `TargetExtensions` is already `Partial<Record<string, unknown>>`, while `targets/extensions.ts` paradoxically restricts every target to the same schemas—including canonical hook/MCP schemas.

Do not solve this by expanding that record indefinitely.

Use a small, typed envelope:

- **Source format:** discriminated identifier/version, separate from target identity.
- **Original package:** immutable snapshot reference with validated relative file paths, bytes and executable modes.
- **Typed projection:** the existing facets that the reader actually understands.
- **Native remainder:** namespace/format identifier, package- or facet-level attachment, and references into the preserved snapshot.
- **Known native fields:** decoded into format-specific types inside their reader/writer; unknown data stays opaque.

A bounded opaque remainder is appropriate here. It becomes an unmaintainable blob only when generic code starts interpreting or merging it.

Important rules:

1. **Unchanged, same-format package:** copy original payload without Markdown/JSON reserialization.
2. **Translated package:** emit the typed projection plus compatible native extras.
3. **Modified package:** explicitly regenerate understood portions; reject transformations that cannot safely update opaque references.
4. **One owner per output field/path:** overlapping generated content and raw extras are errors—not recursive merge rules.
5. **Preserved does not mean activated:** unknown native code/configuration still crosses a trust boundary.

“Same-format round trips are lossless” must exclude transformations such as renaming, filtering, applicability changes and scope composition unless their native references are understood. Otherwise, copying raw files can resurrect an excluded hook or leave broken command references.

Also distinguish **format compatibility from target compatibility**: Agent Plugins is shared by several targets. Unknown extension namespaces should survive an unchanged Agent Plugins round trip, even when the selected client ignores them.

#### Source pipeline consequences

Changes must cover:

- `packages/installer/src/inventory.ts` / `inspectSource`
- `packages/installer/src/resolve.ts` / `materializeFetched`
- `packages/core/src/reader/index.ts`
- `packages/core/src/resolver/index.ts` / repository discovery

A foreign plugin must remain one package, not become one synthesized capability per skill. Recognized-but-invalid manifests must not fall through to bare-skill discovery. Format detection must work after installation and offline.

Preserve hidden manifests and referenced resources. Current bare-skill copying excludes hidden files; regular-tree copying silently omits symlinks. Explicitly reject unsupported links rather than claiming losslessness. Executable modes also matter, while SPEC §19’s content hash currently covers paths and bytes, not modes.

### 3. Make Agent Plugins compatibility a generated distribution shape  
**Decision needed now; mandatory dual-format authoring should be deferred.**

I disagree with requiring every existing native ACF source tree to immediately become an Agent Plugins package.

It adds more than `plugin.json`:

- ACF currently owns metadata in `acf.yml`.
- MCP currently lives in canonical YAML, whereas Agent Plugins requires root `mcp.json`.
- ACF-specific files need the extension namespace/layout.
- Skill frontmatter must be checked against Agent Skills rather than assuming existing canonical frontmatter is portable.

**Simplest shape:**

- Authors maintain existing ACF sources.
- One Agent Plugins writer produces `plugin.json`, standard `skills/`, root `mcp.json`, and eventually a project-owned reverse-domain extension directory.
- `plugin.json` and `mcp.json` are derived artifacts, never independently editable authorities.
- Native ACF source repositories need not contain that distribution tree.

This preserves one source of truth and requires no immediate repository-layout migration.

If the user insists that the checked-in root itself be consumable, generated files can be committed and checked for freshness. They must still have one-way derivation from ACF—not bidirectional reconciliation.

A controlled namespace is necessary before publishing the ACF extension. It is **not** a blocker for foreign readers or portable-only Agent Plugins output.

### 4. Use a local Claude marketplace as the initial installation backend  
**Blocker before claiming “installed and managed by Claude.”**

The user’s choice of a real Claude plugin is compatible with the architecture. But writing plugin files plus `enabledPlugins` is not a complete installation contract.

Recommended sequence:

1. Generate and validate a self-contained Claude plugin in a caplet-owned local marketplace.
2. Register the marketplace through Claude’s supported CLI.
3. Install the plugin through Claude’s CLI with an explicit scope.
4. Verify registration and report whether reload, configuration or approval remains necessary.

Illustrative commands:

```sh
claude plugin validate <plugin-directory>
claude plugin marketplace add <managed-marketplace> --scope project
claude plugin install <plugin>@<marketplace> --scope project
claude plugin list --json
```

The locally installed Claude is **2.1.97**; its help confirms marketplace-add scopes and install scopes `user`, `project`, `local`. No installation was performed.

Keep writers pure. Native registration belongs in the CLI host, after file generation, with observable, retryable operations. Do not directly manufacture Claude’s private cache or `installed_plugins.json`.

#### A simpler alternative exists—but has material limitations

Current official docs describe real, `/plugin`-visible plugins under:

- `~/.claude/skills/<plugin>/.claude-plugin/plugin.json`
- `.claude/skills/<plugin>/.claude-plugin/plugin.json`

These load without marketplace registration. However:

- User skills-directory plugins override same-named project plugins—the opposite of ACF’s intended precedence.
- Project discovery depends on the session’s primary working directory.
- Project plugins require workspace trust and have additional component restrictions.
- Compatibility with the locally installed 2.1.97 was not established.

Therefore, use the marketplace backend first rather than introducing a version-sensitive second backend.

#### Risks that need explicit handling

- **Trust/configuration:** installation is not approval of every MCP server; shell installation does not complete interactive `userConfig`. Never bypass trust or managed-policy restrictions.
- **Caching:** current docs say relative-path plugins from local marketplaces load in place; other marketplace origins are cached. Do not assume this behavior across untested versions. Verify the loaded path and require reload/restart where needed.
- **Scopes:** map ACF user/project explicitly. Claude `local` is project-private configuration, not an alias for ACF user. Plugin-level precedence still does not implement facet-level shadowing.
- **Dependencies:** preserving Claude plugin dependencies can cause native resolution outside `capabilities.lock`. Preserve the declaration, but block activation when it would introduce unpinned dependencies until an explicit policy exists.
- **Ownership:** caplet owns generated packages; Claude owns native installation records and runtime data. Decide how an explicit `/plugin disable` is reported, rather than silently undoing it.

### 5. Treat migration and drift as installation-state problems  
**Blocker when replacing existing Claude output.**

Today’s `.claude` files cannot simply remain beside the plugin:

- Hooks present both in settings and the plugin execute twice.
- Skills/commands change invocation names when namespaced.
- Existing instructions in `.claude/CLAUDE.md` would remain active even when the plugin is disabled.
- SPEC §22’s canonical/native skill dual emission can introduce duplicate discovery.

There is also a concrete cleanup trap:  
`apps/caplet/src/internal/workflow.ts` / `sweepStaleSidecarEntries` retains an old entry when its capability and facet still exist. Moving that facet into a plugin therefore does **not necessarily remove its loose output**.

Add an explicit ownership-aware migration: validate the replacement first, then retire only caplet-owned old artifacts, preserving unrelated content and reporting drift.

Current `apps/caplet/src/apply/sidecar.ts` detects file/owned-region drift. It cannot establish that Claude has fetched, enabled or loaded a plugin. Status must distinguish:

- Generated package current/drifted.
- Native registration present/missing/disabled.
- Activation pending reload, trust or configuration.

Do not report “Everything up to date” solely because generated bytes match.

### 6. Keep the support registry, but make it granular and test-backed  
**Small registry correction now; comprehensive coverage later.**

One support table is a good decision. A family-level `full/partial/none` matrix is insufficient.

Record concrete contracts such as:

- Skill user/model invocation.
- Agent execution mode.
- Hook event **and effect**.
- Instruction activation mode.
- MCP transport, working directory and variable support.
- Plugin packaging, scope and minimum tested client version.

Derive docs and diagnostics from these declarations, but keep translation code in readers/writers. Reuse **one Agent Plugins format writer** across compatible targets; target adapters should supply installation and extension differences.

Golden files are useful, but insufficient: today’s tests already preserve incorrect Claude structures. Add native validation and a small number of behavioral tests at the risky boundaries.

## Recommended first slice

1. Establish source provenance and immutable native-package preservation.
2. Add Agent Plugins and Claude readers, initially projecting only skills and supported MCP configurations.
3. Add one shared Agent Plugins package writer and one Claude plugin writer.
4. Implement the Claude local-marketplace registration lifecycle, including safe loose-file migration.
5. Reject unsupported filtering, scope overlap, enforcement loss and dependency activation explicitly.
6. Leave transitive imports, marketplace-source collections, legacy Codex/Cursor manifests and mandatory dual-format authoring for later.

For MCP, the first slice must respect the actual Agent Plugins contract: `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expand only in supported stdio fields; `command` and HTTP URLs/headers do not permit that expansion. Cursor’s native `${CURSOR_PLUGIN_ROOT}` belongs to its native dialect, not a universal replacement rule. Current `common/placeholders.ts` cannot provide these semantics.

## Verification

Before accepting that slice:

- Byte-and-mode round-trip fixtures with hidden files, unknown fields and bundled scripts.
- Invalid recognized manifest → diagnostic, never bare-skill fallback.
- Excluded executable facet → cannot reappear through raw passthrough.
- Native validation plus `/plugin` discovery, a skill invocation and an MCP connection.
- Upgrade at unchanged source version → correct payload actually loads.
- Migration → no duplicate hooks; unrelated settings survive.
- User/project overlaps and plugin disable → explicit, correct status.

Run repository gates with `bun run ci`, but do not treat them as native-client conformance.

## Evidence and limits

Read-only inspection; no repository files changed and no runtime installation tests performed. An untracked `openspec/changes/plugin-interop-foundation/` appeared during inspection and was left untouched.

The design requires updates to SPEC §§7, 13–16, 20 and 22, plus `IMPLEMENTATION.md` and `CONTEXT.md`; changing canonical layout or existing semantics must respect SPEC §15’s versioning rules.

Official references checked:

- [Agent Plugins specification](https://agent-plugins.org/specification)
- [Agent Skills specification](https://agentskills.io/specification)
- [Claude plugin loading, precedence and caching](https://code.claude.com/docs/en/plugins/loading)
- [Claude plugin creation and migration](https://code.claude.com/docs/en/plugins/create)
- [Claude manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference)

**Bottom line:** the maintainable abstraction is a small typed semantic projection plus preserved native packages—not a universal schema that promises every native behavior.
