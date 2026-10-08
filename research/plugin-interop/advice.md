# Advisor critiques of the plugin-interop design

Five independent read-only reviews of the [tool inventories](README.md#tool-inventories) and [facet syntheses](README.md#facets), one per lens (simplicity, standards, implementation, security, product), recorded verbatim. The decisions taken on their disagreements live in `openspec/changes/plugin-interop-foundation/design.md`.

## Lens: simplicity
## Verdict

ACF can remain tractable and more expressive than any single native format—but not if every shared-looking field becomes a new runtime abstraction.

## Ranked recommendations

“Blocks first slice” means required before shipping the initial interoperability implementation, not before further research.

### 1. Separate complete representation from complete implementation

**Recommendation:** Keep the semantic union as the specification’s destination; implement it incrementally. Native ACF’s expressive power comes from **portable core plus native extras**, not from making every feature portable immediately.

For the first slice:
- Read ACF, bare skills, Agent Plugins 1.0 and Claude plugins.
- Preserve complete source packages.
- Translate skills and basic MCP definitions.
- Preserve other components for matching native output; diagnose unavailable cross-target translation.
- Defer marketplaces, transitive resolution and runtime emulation.

A shared field with genuinely identical meaning still belongs in the eventual core. An implementation delay should appear in the support table, not become a permanent competing spelling in extras.

**Reason:** Otherwise this becomes several simultaneous projects: package manager, template interpreter, permission compiler, hook runtime and configuration manager. Conversely, permanently excluding genuinely shared fields would contradict your union requirement.

**Evidence:** `CONTEXT.md`, Axioms 2–3; `research/plugin-interop/facets/{hooks,mcp,extras,distribution}.md`.

**Blocks first slice:** **Yes—agree the implementation boundary.**

### 2. Make lossless preservation independent of normalization

**Recommendation:** Extend `AcfCapability` with source provenance and a preserved package-file inventory: format/version, relative paths, bytes and executable modes. Readers produce a canonical projection without destroying that source.

Define two distinct guarantees:
- **Unchanged same-format export:** preserves package paths, bytes and relevant modes.
- **Edited export:** regenerates affected native documents; preserves untouched files, and rejects unresolved canonical/native conflicts.

Do not initially promise byte-preserving edits to JSON, YAML, TOML and Markdown. That requires concrete-syntax editing and substantially more machinery.

Keep ownership notices and installer bookkeeping outside the exported source payload where possible.

**Reason:** Semantic schemas cannot preserve comments, unknown fields, scripts or original spellings. Conversely, allowing independently editable raw and canonical copies creates two authorities.

**Evidence:** `packages/core/src/types/model.ts`; `packages/adapters/src/common/skills.ts` already preserves imported primary-file bytes but adds management artifacts; `packages/core/src/hash/index.ts` hashes paths/content, not executable modes; `research/plugin-interop/facets/distribution.md` §2.2.

**Blocks first slice:** **Yes.**

### 3. Use format readers and host writers—not pairwise converters or one universal serializer

**Recommendation:** Keep this pipeline:

```text
source detection → format reader → canonical model + preserved source
                                      ↓
                          host/carrier writer → owned diff plan
                                      ↓
                              installer applies
```

- Extend `packages/installer/src/inventory.ts` / `inspectSource` with explicit format detection; ambiguous manifests require a deterministic rule or explicit selection.
- Add reader modules beside `packages/core/src/reader/index.ts`.
- Put native semantic mappings in target modules under `packages/adapters/src/`.
- Share byte copying, serialization, ownership and diff utilities—not native frontmatter semantics.

**Reason:** This scales approximately with readers plus writers rather than source/target pairs. The existing common emitter shares the wrong responsibility: agents/commands receive canonical frontmatter, and MCP output assumes a common JSON shape.

**Evidence:** `packages/adapters/src/common/emitter.ts` / `emitProseFiles`, `emitMcp`; `packages/core/src/types/emit.ts` / `TargetAdapter`, `EmitResult`, `FileDiff`; `packages/installer/src/resolve.ts`.

**Blocks first slice:** **Yes.** Preserve the existing resolver/emitter separation and diff ownership.

### 4. Make support conditional on host, carrier and field value

**Recommendation:** Replace family-level `"full"` claims with a small typed support description that records:
- target and supported host-version range;
- carrier: plugin, loose project files or user settings;
- relevant field/value condition;
- exact translation, declared loss or rejection;
- evidence status and test reference.

Derive summary tables from these declarations. Keep complicated translation logic in ordinary TypeScript; do not build a mapping DSL.

**Reason:** “Supports MCP” says nothing about plugin tool restrictions or variable expansion. An Agent Plugins serializer can be shared, but an Agent Plugins package is not proof of identical client behavior.

**Evidence:** `packages/core/src/targets/registry.ts`; `packages/core/src/types/emit.ts` / `TargetDefinition`; `research/plugin-interop/tools/agent-plugins.md` defines only skills and MCP as portable components; `research/plugin-interop/tools/cursor.md` records the `${PLUGIN_ROOT}` expansion conflict.

**Blocks first slice:** **Yes, for shipped features.** A comprehensive matrix for every inventoried tool does not block it.

### 5. Define extras composition once, and reject unsafe omission

**Recommendation:** Use these rules:
- Canonical fields own their meanings.
- Authored native extras cannot silently override a mapped canonical field.
- Untouched imported native artifacts can be replayed without reconstructing them.
- Cross-target omission is allowed only when its consequence is understood.
- If dropping an extra could remove a restriction, widen activation or change executable behavior, reject the enclosing facet—or package when necessary—instead of emitting an unsafe approximation.
- Unknown opaque behavior remains target-bound until classified.

Validate the raw envelope, containment and collisions. Do not require caplet to completely reimplement every host’s evolving native schema.

**Reason:** “Drop extras with a diagnostic” is insufficient for permissions and activation. Strict complete native schemas, meanwhile, would make forward-compatible lossless imports impossible.

**Evidence:** `SPEC.md` §7.1–7.4 currently constrain overrides and require known target schemas; `packages/core/src/targets/extensions.ts` aliases the same schema across targets; `research/plugin-interop/facets/{permissions,instructions,agents}.md`.

**Blocks first slice:** **Yes.** This requires an explicit specification change.

### 6. Defer the universal runtime, permission language and executable template language

**Recommendation:** First ship native replay and verified static translations. Defer:
- the four-handler hook runner and generated SDK bridges;
- portable shell/file interpolation with prescribed expansion order;
- broad permission-rule compilation;
- automatic model/effort equivalence;
- automatic host-configuration management for providers.

Reject unsupported required behavior rather than inventing emulation.

**Reason:** These features carry disproportionate maintenance obligations: process lifecycle, quoting, shell semantics, tool taxonomies, policy precedence, timeouts and host-version compatibility. A static package format should not acquire these obligations merely to populate more support cells.

**Evidence:** `CONTEXT.md` Axiom 3; `research/plugin-interop/facets/hooks.md` §2; `commands.md` §2.2; `permissions.md` §2; `agents.md` §2.

**Blocks first slice:** **No implementation needed; yes to declaring them deferred.** Existing behavior must not continue claiming exact support where it is ineffective.

### 7. Treat installation lifecycle as a separate contract from packaging

**Recommendation:** Default plugin output to components the host actually loads and disables with that plugin. Do not silently supplement missing plugin features through persistent loose settings or instructions.

Where supplemental files are supported later, make them explicit in the install plan and include their ownership/removal lifecycle. Retain one authoritative lock schema before adding plugin provenance.

**Reason:** A plugin that is “disabled” while its loose instructions remain active is not a coherent installation. Host auto-updates and dependency resolution also cannot silently bypass `capabilities.lock`.

**Evidence:** `research/plugin-interop/facets/{instructions,distribution}.md`; `research/plugin-interop/tools/claude-code.md` documents no general plugin instruction component; competing lock contracts in `packages/core/src/types/model.ts` and `packages/installer/src/lockfile.ts`.

**Blocks first slice:** **Yes for emitted installation paths and lock state.** Marketplaces and dependency resolution remain deferred.

### 8. Replace permissive output snapshots with a small interoperability fixture suite

**Recommendation:** Add:
1. One representative package per input format, including unknown fields, an unreferenced executable asset and nontrivial formatting.
2. Same-format preservation checks.
3. Golden native trees for supported host/carrier combinations, including diagnostics.
4. Negative cases for manual-only activation, unavailable restrictions, namespace collisions and path escape.
5. Pinned native schema/parser checks plus a real discovery/invocation smoke test for each advertised first-slice host/carrier.

Avoid the full Cartesian product. Readers can be tested independently; writers can share canonical fixtures.

**Reason:** Current tests establish diff shape and ownership, not host interpretation. Some Claude assertions encode duplicate skill output and incorrect event mapping.

**Evidence:** `packages/adapters/tests/contract.test.ts`; `packages/adapters/tests/claude.test.ts`; `packages/core/src/targets/registry.ts`.

**Blocks first slice:** **Yes.** Run `bun run ci` alongside the native checks; passing repository tests alone is insufficient.

## Disagreements with the facet syntheses

1. **Two tools sharing a label does not establish one meaning.**  
   Agent `effort` is not demonstrably one total order across providers; iteration limits have different counting/stopping behavior; LSP extension selection does not necessarily specify the protocol `languageId`. Keep conflicting parts native until equivalence is established.  
   Evidence: `facets/agents.md` §2; `facets/extras.md` §2.1.

2. **The facet schemas are not yet composable.**  
   Skills propose canonical `allowed-tools`; permissions explicitly forbid it. Agents use `tools.allow/deny`; permissions use `include/exclude`. Options appear as `config`, `options`, `${config.KEY}`, `${ACF_OPTION:...}` and other placeholders. Resolve these shared contracts once before adding fields.  
   Evidence: `facets/{skills,agents,permissions,extras,distribution,mcp}.md`.

3. **Do not adopt themes, providers and expanded listing metadata in the first implementation.**  
   LSP is a plausible subsequent addition because its useful shared subset is small. Themes introduce fallback/token semantics; providers are consumer configuration; catalogs are explicitly later scope. Preserve them natively now. This is sequencing, not permission to permanently exclude genuinely shared meanings.

4. **The hook proposal is a runtime product, not a small schema extension.**  
   Aggregation, continuation counters, payload translation and failure enforcement cannot be supplied reliably by field renaming. It needs a separate decision and validation effort.

5. **`ToolFilter.enforcement: best_effort` should not be the default.**  
   Silently dropping an explicit availability restriction is unsafe and makes behavior unpredictable. Likewise, hoisting an agent restriction to session scope may be stricter but is not harmless—it changes unrelated work. Prefer rejection over automatic scope changes.  
   Evidence: `facets/permissions.md` §2.

6. **“Same-format output uses preserved bytes” needs an edit boundary.**  
   Otherwise raw bytes either overwrite canonical edits or cease to be lossless. The syntheses identify preservation but do not collectively settle authority after edits.

7. **Model-decided instructions need an explicit doctrine change.**  
   Their advertised descriptions consume context before activation, contradicting `CONTEXT.md` Axiom 10. Do not quietly fit them into the existing zero-token contract.

## Open questions for you

1. **May the first implementation translate skills/basic MCP while preserving other components natively and explicitly rejecting unsupported conversions?** If every qualifying union field must work immediately, this is not a small first slice.

2. **Does “lossless round trip” mean unchanged package bytes, paths and executable modes, or also byte-preserving edits to native documents?** I recommend the former, with explicit edited-export semantics.

3. **When a plugin cannot carry a feature, should caplet reject/omit it, or offer separately managed loose supplements?** I recommend no implicit supplements.

4. **Must dropping a restrictive native extra block emission?** I recommend yes; a warning alone cannot preserve the stated safety contract.

**Review status:** Read-only inspection of code, specification and supplied research. No files changed or tests run. Host behavior cited from inventories remains documentation evidence unless those inventories explicitly report runtime verification.

## Lens: standards
## Ranked recommendations

**Verdict:** Keep ACF’s richer semantic model, but make Agent Plugins a standards-conformant distribution format—not a second editable authority or a promise of universal runtime behavior.

*First-slice assumption: Agent Plugins/Claude import, original-package preservation, and skills/MCP output; broader facet translation follows.*

### 1. Separate package conformance from behavioral portability

**Blocks first slice: Yes.**

An Agent Plugins-valid package is not necessarily an equivalent rendering of ACF. Agent Plugins 1.0 standardizes skills and MCP; clients ignore unknown extension namespaces.

Consequently, putting a manual-only skill in root `skills/` and its invocation restriction in an ACF extension is unsafe: an ordinary consumer can load the skill while ignoring the restriction. The same problem applies to MCP tool restrictions and target applicability.

**Recommendation:** Root portable components must work safely without understanding ACF extensions. Components requiring unsupported restrictions stay outside portable discovery or are refused for that output. An ignored extension must never be necessary to make an emitted component safe.

This preserves the union model without confusing “representable in ACF” with “executable everywhere.”

**Evidence:** `research/plugin-interop/tools/agent-plugins.md`, sections “Skills,” “Client extensions,” and “Permissions”; `research/plugin-interop/facets/skills.md`, C12; `SPEC.md` §9.3.

### 2. Generate Agent Plugins packages first; do not maintain two manifests by hand

**Blocks first slice: Yes—the authority rule does. A source-layout migration does not.**

I converge with the earlier advisor’s generated-distribution recommendation.

For the first slice:

- `acf.yml` and canonical facet files remain authored sources.
- The Agent Plugins writer derives `plugin.json`, `skills/`, and `mcp.json`.
- Generated files are not reconciled bidirectionally with ACF.
- Separate output directories avoid ambiguous polyglot discovery.

Agent Plugins §5.1 explicitly says no other file may replace, supplement, or override core fields in root `plugin.json`. Build-time derivation is compatible with that rule; a runtime loader consulting `acf.yml` to override AP identity is not.

**If directly installable native ACF roots are mandatory**, adopt an AP-based authoring profile deliberately: root `plugin.json` owns standard metadata; ACF-specific declarations live under its namespace and do not restate those fields. That is a source-format migration, not “just add plugin.json.”

**Evidence:** `SPEC.md` §§4.1, 14.4; `CONTEXT.md`, Axioms 7/12; `packages/core/src/reader/index.ts` / `readManifest`; pinned AP specification §5.1; `research/plugin-interop/advice-core-vs-extras.md`, recommendation 3.

### 3. Publish one stable ACF extension namespace, with explicit ownership rules

**Blocks first slice: Only before publishing ACF-bearing AP extensions.**

Use a reverse-domain namespace based on a domain the project controls. Do not invent an unowned `org.acf` or use another vendor’s namespace for ACF semantics.

Define:

- An independently versioned ACF extension contract.
- Its manifest data and exact matching top-level directory.
- Which declarations are authoritative and which are derived.
- No overrides of AP core fields.
- Separate handling of ACF semantics, vendor-native extras, and opaque imported material.

Do not serialize nested ACF structures into Agent Skills’ `metadata` merely because it is extensible: its values are strings, and metadata does not acquire standardized execution semantics.

Vendor namespaces such as `com.github.copilot` remain vendor contracts, even when caplet generates their contents.

**Evidence:** `research/plugin-interop/tools/agent-plugins.md`, “Escape hatch”; pinned AP §8; `research/plugin-interop/tools/agent-skills.md`, frontmatter; `packages/core/src/targets/extensions.ts`.

### 4. Separate format versions, extension dialects, and target clients now

**Blocks first slice: Yes, for the model distinction—not a comprehensive registry rewrite.**

Use one AP format reader/writer, with client-specific support and installation profiles. A format is not a target: Copilot and VS Code can consume the same namespace; Cursor’s documented AP behavior differs from the portable expansion contract.

Keep distinct:

- **Format/version:** Agent Plugins 1.0, Claude plugin.
- **Extension dialect:** for example, `com.github.copilot`.
- **Target/version:** the consuming host and tested release.

This is also the hedge against **Claude adopting Agent Plugins**: change its supported carrier/profile rather than rewriting the canonical model.

If AP later standardizes hooks or agents, map the existing semantic fields into the new standard carrier. Emit each component through one selected carrier, not simultaneously through a new core location and an old extension.

**Evidence:** `packages/core/src/types/model.ts` / `TargetExtensions`, `AcfCapability`; `packages/core/src/targets/registry.ts`; `research/plugin-interop/tools/{codex,copilot,vscode,cursor}.md`.

### 5. Preserve standards extensions losslessly without treating preservation as activation approval

**Blocks first slice: Yes.**

Retain original package bytes, paths, executable modes, schema identifiers, and unknown namespaces alongside the typed projection.

For unchanged AP → model → AP round trips, preserve **all** namespaces, regardless of the selected target. Otherwise “per-target extras are dropped elsewhere” destroys a multi-client AP package.

But do not infer that forwarding unknown namespaces is universally safe. The destination may understand—and execute—what caplet does not. Filtering or renaming a package can also invalidate opaque references.

**Recommendation:** Distinguish unchanged round-trip output from transformed deployment output. Preserve originals in both cases; reject transformations whose opaque content could defeat filtering or enforcement. Do not silently merge opaque material over generated fields.

**Evidence:** `research/plugin-interop/facets/distribution.md` §5; `research/plugin-interop/facets/extras.md` §5; `packages/core/src/types/model.ts` / `AcfCapability`; `packages/installer/src/inventory.ts` / `inspectSource`.

### 6. Make standards versions and conformance fixtures explicit

**Blocks first slice: Yes, for supported inputs and outputs.**

Pin AP 1.0’s recognized schemas locally. Capture the Agent Skills revision used by the implementation because AP references a live, unversioned document. Treat AP 1.1 as a separate, unimplemented contract until researched—not “close enough to 1.0.”

Separate three checks:

1. **Generated-package conformance:** strict standard-compliant output.
2. **Importer behavior:** required nonfatal boundaries, such as AP’s unknown-root-field handling and per-server MCP failures.
3. **Actual client behavior:** version-specific loading and execution.

A strict schema validator alone cannot implement AP’s prescribed loading behavior.

Also honor ACF’s own version promise. Changing YAML authority, hook wire contracts, or existing meanings is not automatically additive under `acf: 1`.

**Evidence:** `research/plugin-interop/tools/agent-plugins.md`, “Validation pitfalls” and “Notable gaps”; `research/plugin-interop/tools/agent-skills.md`, evidence limitations; `SPEC.md` §§1.3, 15; `packages/core/src/schemas/index.ts`.

### 7. Propose narrow interoperability contracts upstream—not the entire ACF union

**Blocks first slice: No.**

Prioritize upstream work in this order:

1. **Conformance fixtures and ambiguity fixes:** extension handling, component failure isolation, package-root expansion, and a pinned Agent Skills dependency.
2. **Activation and required-feature semantics:** manual/model invocation and a way to prevent loading components whose required restrictions cannot be honored.
3. **Agents and hooks:** contribute small, demonstrated contracts with precise defaults, timing, payloads, effects, and failure behavior—not merely common field names.
4. **Later:** dependency/provenance requirements informed by `capabilities.lock`; do not present caplet’s installer as an already portable AP contract.

The strategic risk is building a competing packaging standard while AP absorbs its components. ACF’s durable value should be semantic translation, preservation, diagnostics, and reproducible installation—not permanent ownership of the largest schema.

**Evidence:** `research/plugin-interop/tools/agent-plugins.md`, standard scope and future considerations; `research/plugin-interop/facets/{agents,hooks,distribution}.md`; `CONTEXT.md`, Axioms 1–5.

## Disagreements with the facet syntheses

- **Skills:** Keeping standard field names does not make the proposed `SKILL.md` an Agent Skill. In particular, proposed `allowed-tools` is a list of canonical expressions; Agent Skills specifies a space-separated string. Keep those representations distinct. Globally forbidding arbitrary metadata keys because Goose interprets them also unnecessarily narrows the standard contract.  
  **Evidence:** `research/plugin-interop/facets/skills.md` §2.2, C11.

- **Distribution:** “Unknown AP namespaces can be emitted everywhere safely because clients ignore them” is incorrect. Clients ignore namespaces **they do not implement**. Preserve them for lossless round trips; assess transformed deployment separately.  
  **Evidence:** `research/plugin-interop/facets/distribution.md` §5, rule 5.

- **Across facets:** Two equivalent implementations justify an **ACF core candidate**, not an Agent Plugins-standard field or proof of every client’s support. The union should remain richer than AP without putting speculative semantics in AP root fields.

- **Hooks and permissions:** A universal hook runner and new permission language are major ACF contracts, not prerequisites for standards-aligned packaging. Preserve native forms in the first slice; do not make their full standardization a dependency.  
  **Evidence:** `research/plugin-interop/facets/{hooks,permissions}.md`; `SPEC.md` §§1.4, 15.

## Open questions for the user

1. **Must the authored repository root itself load in ordinary Agent Plugins clients without a build?** Recommendation: accept generated AP distributions initially. Requiring direct loading changes metadata authority and source layout, and still cannot guarantee full ACF semantics in unaware clients.

2. **Which project-controlled domain should own the published ACF namespace?** Recommendation: choose a durable format-level identity before publishing extensions; portable-only AP output need not wait.

**Verification:** Read-only repository inspection and direct verification of AP 1.0 §§5/8 at commit `ff8ab5e392cc87bd88d87c060815a87490e51003`. No repository files changed; no client-runtime conformance tests performed.

## Lens: implementation
## Verdict

The architecture fits, but the first slice should prove lossless package preservation and safe Claude plugin installation—not implement the combined facet schemas wholesale.

## Ranked recommendations

“First slice” below means **skills-only native ACF, bare-skill, Agent Plugins and Claude-plugin input → a managed Claude plugin**, including migration of existing skill output. Other content must be preserved or explicitly rejected, never silently discarded.

### 1. Settle the versioned contracts before extending schemas

**Blocks first slice: Yes.**

Several proposals intentionally contradict today’s normative specification:

- §7 forbids native replacements and unknown extension fields.
- §14.7 requires management notices inside fully owned artifact directories.
- §15 reserves several proposed core fields.
- §19.5 explicitly excludes modes from the stable `acf: 1` hash.
- §22.2 mandates canonical/native skill emission.
- §22.6 mandates potentially fail-open hook degradation.

Do not implement these as ordinary additive fields under unchanged semantics. Recommend a versioned successor contract with continued v1 reading. Separately version lock and sidecar migrations.

**Evidence:** `SPEC.md` §§7, 14.7, 15, 19.5, 22.2–22.6; `CONTEXT.md` axioms 10–16.

### 2. Represent native preservation once, with explicit ownership

**Blocks first slice: Yes.**

Extend `AcfCapability` with a bounded envelope:

| Part | Representation |
|---|---|
| Source identity | Format/version discriminator, distinct from target/client identity |
| Original payload | Immutable snapshot reference; validated relative paths, exact bytes, executable modes |
| Portable meaning | Typed canonical facets |
| Native extras | Format/target namespace, package-or-facet attachment, native carrier location, bounded payload or snapshot reference |
| Ownership | Which native fields/files were projected, preserved, or regenerated |

Known native fields should have format-specific types and validation. Unknown data can remain opaque at this boundary; generic code must not recursively merge or interpret it.

Native ACF authors also need an authored extras representation: import-only provenance would make foreign packages more expressive than ACF.

For unchanged same-format output, copy original payload. After edits, regenerate understood carriers; reject transformations whose opaque references cannot safely be updated. Generated fields and raw overrides must have one explicit owner—not competing merge precedence.

**Evidence:** `packages/core/src/types/model.ts` / `AcfCapability`, `TargetExtensions`; `packages/core/src/targets/extensions.ts`; `research/plugin-interop/facets/distribution.md` §2.2.

### 3. Upgrade source discovery and materialization together

**Blocks first slice: Yes.**

Replace the `synthesized` special case with format-aware reader results. Preserve a plugin as one package rather than synthesizing one capability per contained skill.

Changes must span:

- `packages/installer/src/inventory.ts` / `inspectSource`
- `packages/installer/src/resolve.ts` / `materializeFetched`
- `packages/core/src/reader/index.ts`
- `packages/core/src/resolver/index.ts` / discovery and offline rereading

Recognized-but-invalid manifests must not fall through to bare-skill import. Ambiguous polyglot repositories should require a format choice rather than automatically unioning manifests.

Preserve hidden payload files and executable modes. Reject unsupported symlinks/special files explicitly. Current copying silently omits some files, so it cannot underpin losslessness.

**Evidence:** those implementation paths; `research/plugin-interop/tools/agent-plugins.md` / containment and discovery contracts.

### 4. Keep writers pure; separate package format from installation backend

**Blocks first slice: Yes.**

Preserve the existing `emit(input, ReadOnlyFs) → diffs + diagnostics` seam. Replace target-switching serialization with native serializers and package assembly:

- One Claude plugin writer.
- One Agent Plugins writer, with explicit client compatibility profiles.
- Loose-file writers only where appropriate.
- CLI-owned registration and activation operations.

Do not reuse `emitProseFiles` unchanged: it serializes canonical frontmatter directly. `layoutFor` also assumes common Markdown/config layouts that do not match the hosts.

For Claude, use a caplet-owned local marketplace and supported native registration commands, after validation. Do not manufacture Claude’s private installation database. Confirm command/version support before selecting this backend.

Agent Plugins conformance does **not** establish how Codex, Cursor, Copilot or VS Code install or activate a package.

**Evidence:** `packages/adapters/src/common/emitter.ts`; `packages/adapters/src/claude/`; `apps/caplet/src/internal/workflow.ts`; `research/plugin-interop/tools/{agent-plugins,claude-code,codex,cursor}.md`.

### 5. Make loose-to-plugin migration an explicit recoverable operation

**Blocks first slice: Yes, for existing installations.**

Today’s stale sweep retains old files when their capability/facet still exists. Moving a skill into a plugin therefore leaves its loose copy behind.

Implement migration around an explicit old/new ownership inventory:

1. Generate and validate the replacement without activating it.
2. Check old owned regions and modes for drift.
3. Retire only those owned regions, preserving unrelated content.
4. Register/activate the replacement.
5. Record success; retain enough prior state for retry or recovery after failure.

Do not claim transactionality across an external host CLI. Make interruption states observable and retry-safe, and avoid deliberate simultaneous activation of old and new hooks.

Persist artifact roots, target/carrier ownership and relevant modes in `.acf-managed.json`. Legacy entries without sufficient ownership detail need conservative migration—not directory-wide deletion.

Add apply-time preconditions: current `applyOneDiff` rereads the file but does not enforce the planned `before` value.

**Evidence:** `apps/caplet/src/internal/workflow.ts` / `sweepStaleSidecarEntries`, `facetStillExists`, `applyEmitPlan`; `apps/caplet/src/apply/{apply-diffs,sidecar}.ts`; `apps/caplet/src/internal/managed-notices.ts`.

### 6. Keep management metadata outside preserved native payloads

**Blocks first slice: Yes, for literal losslessness.**

An added `ACF-MANAGED.md` changes the original tree; rejecting a source-owned file at that name also prevents universal native round trips.

Recommended distinction:

- Original snapshot: untouched.
- Native payload: untouched on the preservation path.
- Caplet ownership, notices and registration records: enclosing managed location or external inventory.

Generated ACF-derived packages can have an explicitly specified notice policy. Never put incidental Markdown in directories whose children become agents or commands.

Update notice tests: they currently assume every artifact-local notice lives inside a skill directory.

**Evidence:** `SPEC.md` §14.7; `packages/adapters/src/common/skills.ts`; `packages/adapters/tests/{claude,contract}.test.ts`; `apps/caplet/src/internal/managed-notices.ts`.

### 7. Repair lock integrity before promising reproducible foreign installs

**Blocks first slice: Yes.**

Use one canonical lock schema rather than the incompatible core and installer definitions.

Record source format and preserved-payload identity; represent each selected package’s integrity correctly. Currently `lockEntryFor` stores the first record’s hash while listing multiple capability names, and `lockInstalled` only checks directory existence.

Keep three authorities separate:

- `capabilities.lock`: resolved source/payload identity.
- `.acf-managed.json`: generated artifact ownership and drift.
- Native host state: registered, enabled and actually loaded package.

Introduce a versioned mode-aware snapshot digest rather than silently changing v1 `capabilityHash`. Preserve native dependency declarations, but block activation that would resolve dependencies outside the lock until dependency support exists.

**Evidence:** `packages/core/src/types/model.ts` / `LockEntry`; `packages/installer/src/lockfile.ts`; `packages/installer/src/resolve.ts` / `lockEntryFor`, `lockInstalled`; `packages/core/src/hash/index.ts`; `SPEC.md` §19.5.

### 8. Make registry declarations feature-, carrier- and safety-specific

**Blocks first slice: Yes for exercised features; complete matrix: No.**

A useful support key includes **feature + target profile + carrier + scope**. Claude loose agents and Claude plugin agents demonstrably differ.

Record native translation, declared degradation or refusal, together with tested client version/evidence. Unknown enforcement must not be advertised as supported.

Dropping a restricting native extra requires more than a diagnostic: block the affected emission when dropping it would broaden authority or invocation. Preserve the user’s union criterion; do not require every target to support a core field.

Shared `.agents/skills` output also needs plan-level coordination. The current first-target-wins deduplication cannot decide whether different target renderings are compatible.

**Evidence:** `packages/core/src/targets/registry.ts`; `packages/adapters/src/common/{emitter,skills}.ts`; `apps/caplet/src/internal/workflow.ts` / `buildEmitPlan`; `research/plugin-interop/facets/{permissions,skills}.md`.

### 9. Use small feature-by-target goldens, plus independent conformance checks

**Blocks first slice: Yes for its contract; exhaustive coverage: No.**

Golden cases should include expected files, modes, diagnostics and explicit non-emission. Prefer focused fixtures over one enormous package snapshot.

Required first-slice tests:

- Same-format bytes/modes, hidden resources and unknown extras survive.
- Invalid recognized manifest does not become bare skills.
- Foreign package identity survives offline rereading.
- Migration removes the owned loose copy but preserves unrelated files.
- Drift, interruption and registration failure are recoverable.
- Repeated apply is idempotent; target-filtered apply preserves other ownership.
- Excluded content cannot reappear through snapshot passthrough.
- Native validation and one actual Claude skill invocation succeed.

Current Claude tests assert malformed hook output and duplicate skill destinations; they are regression evidence, not native conformance.

**Evidence:** `packages/adapters/tests/{claude,contract}.test.ts`; `packages/installer/tests/`; `apps/caplet/tests/{managed-notices,sidecar}.test.ts`; `apps/caplet/tests/integration/`.

Run focused package tests, then `bun run ci`. Add native validation and runtime checks separately; CI alone cannot prove host loading.

### 10. Sequence vertical slices by risk, not facet-document size

**Blocks first slice: No beyond steps 1–2 below.**

1. **Preservation + Claude skills:** contracts, source readers, snapshot/lock, pure package writer, registration, safe skill migration.
2. **Agent Plugins output:** same skill fixtures, then one verified client installation backend; export-only where installation remains unknown.
3. **MCP:** start with proven transports and variable semantics; test actual connection and package-relative resources.
4. **Agents/commands:** permissions, invocation and reference rewriting together.
5. **Hooks/instructions:** native protocols, enforcement and activation lifecycle before advertising support.
6. **Later:** remaining native features, marketplace inputs and transitive dependencies.

Unsupported content must be diagnosed or block unsafe activation during early slices. Deferral is not silent loss.

## Disagreements with the facet syntheses

- **Distribution’s mode-hash “bug” is a contract limitation.** Current hashing follows SPEC §19.5. Fix it through versioning, not an unannounced algorithm change.
- **Skills’ “no diagnostic” claim is too broad.** `readSkills` calls `pushUnknownFields` before schema parsing; unsupported fields receive `acf.markdown.unknown-frontmatter-field`. They are nevertheless stripped from the typed projection, and there is no adequate semantic-loss diagnostic.
- **Skills’ “a core field must be writable by every writer” contradicts the requested union.** Two equivalent implementations qualify; other writers declare degradation/refusal. Target-owned value vocabularies need careful typing, not automatic exclusion from the core.
- **Distribution’s automatic polyglot union is unsafe.** Native manifest precedence and component discovery differ. Select a reader interpretation; preserve alternative manifests without merging their executable contents.
- **Distribution’s expanded scopes and universal source union should wait.** Package sources, catalog sources and policy selectors are different contracts. The first slice needs neither new consumer scopes nor a universal catalog model.
- **Hooks’ universal runner is premature.** It adds runtime installation, protocol and failure dependencies before native package lifecycle works. Preserve native hooks first; translate proven event/effect combinations incrementally.
- **“Drop extras elsewhere” is insufficient for restrictions.** A diagnostic cannot compensate for enabling an agent, server or skill after removing its limiting policy.
- **Same-format losslessness needs a transformation boundary.** Unchanged packages can be byte-identical. Renaming, filtering or combining packages with opaque references cannot always be lossless; those operations must sometimes be refused.

## Open questions for the user

1. **Losslessness:** Does the guarantee mean unchanged native payload bytes/modes, with caplet metadata outside it—and permission to reject unsafe transformations? Recommended: yes.
2. **Versioning:** Are you willing to introduce the successor ACF contract while retaining v1 readers? The proposed semantics are not wholly backward-compatible.
3. **Plugin lifecycle:** May instructions and consumer-only restrictions remain separately managed loose artifacts, explicitly unaffected by plugin disable? Recommended: require explicit acceptance; otherwise refuse that package/target combination.
4. **First acceptance target:** Is skills-only Claude installation/migration acceptable as the first slice, followed by Agent Plugins client installation? Recommended: yes.
5. **Native user actions:** Should caplet report a manually disabled plugin rather than silently re-enable it on ordinary apply? Recommended: preserve the native disable until explicitly requested otherwise.

**Inspection status:** Read-only; no files changed and no tests or native installations run. The research includes rolling-document claims and unverified client behavior, including material beyond the requested October 1 cutoff; treat those as evidence to validate, not shipped-support guarantees.

## Lens: security
## Verdict

The two-layer model is viable, but lossless preservation must be separate from permission to activate: neither portable fields nor raw extras may silently weaken restrictions, grant authority, or bypass native policy.

“Blocks first slice” below means the first release that **activates third-party plugins**, not an inert import/export prototype. Evidence is repository code and the supplied 2026-10-01 inventories; native trust flows were not runtime-tested.

## Ranked recommendations

### 1. Treat activation as a security boundary, not merely writing files

**Recommendation:** Separate fetch/inspect, generate, and activate. Before activation, show executable components, requested grants, network destinations, target, scope, and effective installation carrier. Include hooks, MCP/LSP processes, code modules, shell substitutions, and credential helpers. Validation must never import modules or execute package commands, lifecycle scripts, helpers, or “health checks.”

Use native installation/review flows where documented; do not fabricate their acceptance records. If a host auto-loads files, placing them in that location **is activation**. Noninteractive activation needs explicit consumer authorization, not an implicit default.

**Reason:** A generated file can execute on the next session without another meaningful prompt. Native prompts differ substantially: VS Code implicitly trusts plugin MCP at installation; Claude headless settings hooks bypass the interactive workspace dialog; Pi extensions run with user privileges.

**Evidence:** `apps/caplet/src/commands/apply.ts` currently confirms deletions, not executable activation; `research/plugin-interop/tools/{vscode,claude-code,pi}.md`, security sections.

**Blocks first slice:** **Yes.**

### 2. Make security-preserving translation mandatory—including raw extras

**Recommendation:** Distinguish restrictions, grants, and descriptive metadata in the model. Unsupported restrictions must prevent activation of the affected component; removing a grant is safe, removing a restriction is not. Apply this rule equally to raw extras. An uninterpreted security-bearing native block cannot simply disappear on another target with a warning.

Evaluate dependent components together: omitting a guard while activating the component it protects is not fail-closed.

**Reason:** “Extras emitted verbatim here, dropped elsewhere” is unsafe for native deny rules, manual-only activation, tool filters, sandbox settings, and restrictive agent modes. Being native does not make a field consumer-authorized.

**Evidence:** `packages/core/src/types/model.ts` (`TargetExtensions`); `packages/adapters/src/common/emitter.ts` (`emitProseFiles` writes frontmatter unchanged); `research/plugin-interop/facets/{permissions,agents,commands,instructions}.md`.

**Blocks first slice:** **Yes.**

### 3. Repair lock integrity before using it as a trust foundation

**Recommendation:** Verify materialized content before emission; restore missing installations from `resolvedSha`, not the original moving ref. Make frozen mode reject drift without changing the lock. Record hashes for every selected capability, and introduce a versioned, unambiguous digest format covering executable semantics.

**Verified defects:**

- `lockInstalled()` checks directory existence, not content.
- `recordsFromLock()` copies the recorded digest without recomputing it.
- Missing installations can be refetched through `fetchCapability(entry, …)`, which uses `entry.ref`, not the locked SHA.
- `lockEntryFor()` records only `records[0].contentHash` for a source producing multiple capabilities.
- `apply --frozen` still invokes ordinary fetching before evaluating lock diagnostics.
- The hash encoding is structurally ambiguous: files `a="X", b="Y"` and one file `a="X\0b\0Y"` produce identical encoded bytes and hashes. A read-only Node probe confirmed this.

Use length-framed records and reject normalized-path collisions. Cover executable bits with a new digest contract; **do not silently change the existing algorithm**, because SPEC §19.5 explicitly excludes modes and promises stability.

**Evidence:** `packages/installer/src/{resolve,fetch,drift,lockfile}.ts`; `packages/core/src/hash/index.ts`; `apps/caplet/src/commands/apply.ts`; `SPEC.md` §19.5.

**Blocks first slice:** **Yes.**

### 4. Keep consumer acceptance outside repository-controlled authority

**Recommendation:** The lockfile should describe resolved content and requested privileges—not prove that the current consumer approved them. Store remembered acceptance in consumer-controlled state, bound to source identity, content digest, target, scope, carrier, and requested grants. Include generated runner/bridge identity where relevant.

Reauthorization should cover changed executable content, not only changed grant strings. Support an explicit update policy rather than implicitly trusting all future revisions.

**Reason:** A cloned repository can supply both `capabilities.yml` and `capabilities.lock`. An attacker can author an “accepted” digest there. Furthermore, unchanged `command: ./hook.sh` can execute completely different code after an update.

**Evidence:** `research/plugin-interop/facets/permissions.md` §2.5 proposes acceptance in the lock; `packages/installer/src/lockfile.ts` loads project JSON without an independent approval authority.

**Blocks first slice:** **Yes.**

### 5. Preserve native policy identity; never fall back around a block

**Recommendation:** Respect enterprise source restrictions, required/disabled packages, managed-only hooks, and plugin-only customization. Never convert a blocked marketplace installation into a local marketplace, loose files, another scope, or a differently named package to make it load.

Report distinct states: **generated**, **registered**, **pending native review**, **blocked**, and **activation unknown**. Do not infer “active” from successful writes. Unknown policy visibility must remain unknown; do not reproduce each host’s entire policy engine.

**Reason:** Repackaging can erase the identity on which native policy depends. A caplet-owned marketplace is not equivalent to the original approved marketplace.

**Evidence:** `research/plugin-interop/tools/cursor.md`—Enterprise local imports default off; `tools/vscode.md`—`strictPluginOnlyCustomization`; `tools/codex.md`—requirements and hash-bound hook review; `tools/claude-code.md`—managed marketplace controls.

**Blocks first slice:** **Yes for each supported activation route.** Unsupported routes may remain export-only.

### 6. Do not claim a wrapper makes fail-open hosts fail-closed

**Recommendation:** Distinguish handler-failure handling from end-to-end enforcement. A shorter internal timer can handle a child timeout, but cannot guarantee denial if the runner is absent, killed, cannot start, or reaches the host’s outer timeout. Refuse required enforcement unless the native execution path supports the necessary failure behavior.

Pin the runner and bridge; avoid a mutable `caplet` executable resolved from arbitrary runtime `PATH`.

**Reason:** The proposed runner is itself part of the security boundary. Protocol normalization cannot repair every host-level failure mode.

**Evidence:** `research/plugin-interop/facets/hooks.md` §2.6 and `failure: closed` tables; `tools/copilot.md` documents timeout fail-open; `tools/claude-code.md` documents hook execution outside assumptions about tool sandboxing.

**Blocks first slice:** **If enforcing hooks are included.** Otherwise preserve them inertly and report unsupported activation.

### 7. Enforce containment at reads, writes, and removal—not just hashing

**Recommendation:** Check package paths and approved output roots using actual filesystem containment, including symlinked ancestors. Reject traversal, special files, unsafe links, and destination redirection. Stage complete outputs and publish only after validation; track companion files so failed installs and disable/uninstall do not leave executable or permission-bearing residue.

**Reason:** Package-root containment does not sandbox subprocesses, and safe input paths do not guarantee safe output paths.

**Evidence:** `fetch.ts::resolveEntryPath` performs lexical containment; `resolve.ts::copyRegularTree` filters links rather than rejecting them; `apps/caplet/src/apply/apply-diffs.ts::resolveDiffPath` accepts absolute paths without enforcing an installation boundary, while `writeContent` follows ordinary filesystem paths. Agent Plugins containment requirements are documented in `tools/agent-plugins.md`.

**Blocks first slice:** **Yes.**

### 8. Keep secrets symbolic and credential acquisition explicit

**Recommendation:** Never resolve package-authored environment/file references during import or rendering. Preserve supported native references; otherwise refuse that component. Do not launch OAuth, header helpers, or file-reading substitutions as validation. Keep secret values out of generated shared files, locks, snapshots intended for redistribution, diagnostics, and command arguments.

Reject or sanitize credential-bearing source URLs at ingestion, not only when invoking Git.

**Reason:** A package can turn interpolation into credential exfiltration. Literal-secret detection alone is insufficient.

**Evidence:** `research/plugin-interop/facets/mcp.md` proposes `${file:…}`, headers and credential helpers; `tools/agent-plugins.md` forbids embedded secrets and arbitrary environment expansion. `packages/installer/src/git.ts` already strips HTTP userinfo for Git, but `lockfile.ts::sourceString` preserves the original Git URL in source identity.

**Blocks first slice:** **Yes for currently supported source/MCP paths.** New secret mechanisms can be deferred.

### 9. State the limits of pinning and provenance honestly

**Recommendation:** Record original source, resolved revision, package/subdirectory selection, source format, transformations, and emitted artifact identity. Do not present imported publisher/review metadata as verified provenance. Preserve original signed artifacts separately; transformed output does not inherit their signatures or marketplace review.

For later dependencies, lock the complete graph and prevent host auto-update from silently replacing caplet-managed content. Mark dynamic launchers and remote services as outside the package’s reproducibility guarantee.

**Reason:** A commit pin does not pin `npx package@latest`, a PATH executable, downloaded binaries, or a remote MCP service. A checksum proves byte agreement—not publisher identity or safety.

**Evidence:** `research/plugin-interop/facets/distribution.md`; `tools/{agent-plugins,copilot,pi}.md`; `packages/installer/src/{fetch,lockfile}.ts`.

**Blocks first slice:** **Basic provenance and honest guarantees: yes.** Transitive resolution and signature verification can wait until supported.

### 10. Gate security support claims with negative runtime tests

**Recommendation:** Test exact host version, surface, scope, and carrier before marking a security feature supported. Prioritize:

- restriction loss prevents activation;
- changed hook code requires renewed acceptance;
- moved tags cannot alter frozen restoration;
- modified installed content fails integrity verification;
- symlinked output paths cannot redirect writes;
- policy-blocked plugins never become loose files;
- missing/crashed runners cannot silently satisfy required enforcement;
- disable/uninstall removes caplet-owned companion activation.

**Reason:** Schema acceptance and generated-file snapshots do not establish enforcement.

**Evidence:** `packages/core/src/targets/registry.ts` currently advertises broad `"full"` support; inventories explicitly distinguish documented behavior from runtime verification.

**Blocks first slice:** **Yes for claimed security guarantees**, not for every future target.

## Disagreements with the facet syntheses

- **Lockfile acceptance is not consumer consent.** Keep requested grants in reproducible metadata, but do not trust a repository-authored acceptance record.
- **Default `grants: scoped` is too permissive for third-party activation.** Scoped preapproval still grants authority. Default to no additional grants unless explicitly accepted through a documented consumer/native flow.
- **`ToolFilter.enforcement: best_effort` must not silently authorize widening.** Separate advisory focus from mandatory restrictions; package-authored “best effort” cannot waive consumer security requirements.
- **The hook runner does not establish unconditional fail-closed behavior.** Its own failure and the host timeout remain outside its control.
- **Lossless round trips do not imply unconditional installation.** Preserve raw material losslessly in inert storage; refuse unsafe activation rather than silently rewriting or activating it.
- **“Missing executable bits in the hash” is a specification problem, not merely an implementation bug.** SPEC §19.5 requires their exclusion. The ambiguous record encoding is an additional defect.
- **Trust summaries need reconciliation.** `facets/permissions.md` says Cursor workspace trust is undocumented, while `tools/cursor.md` explicitly says project hooks require trusted workspaces.
- **Claude loose permission settings are not a transparent plugin substitute.** They have a different scope and lifecycle and may survive native plugin disablement.

## Open questions for the user

1. **May the first slice stage/export components it cannot safely activate?** Recommended: yes; report partial support rather than weakening restrictions to achieve installation.
2. **What authorization should carry across updates?** Recommended: remember consent for exact reviewed content by default, with an explicit consumer-selected update policy; always reconsider new grants, carriers, scopes, and dependencies.
3. **Who owns updates after installation: caplet or the host?** Recommended: caplet owns caplet-managed artifacts. Where host-managed updates cannot be prevented, label the installation outside frozen reproducibility guarantees.

**Verification:** Read-only code/document inspection plus an in-memory Node reproduction of the hash-encoding ambiguity. No files changed; no native installation, trust-dialog, or enforcement tests run.

## Lens: product
## Ranked recommendations

**Recommendation: sell caplet as reproducible, cross-tool capability installation—not another plugin marketplace—and release a narrow, verified installation workflow before expanding the translation surface.**

Paths below are relative to `/home/blaz/code/agent-capability-format`. Findings are from code and document inspection; no files changed or runtime tests performed.

### 1. Choose the user who gains something native managers cannot provide

**Recommendation:** Prioritize developers using multiple agent tools and teams checking a shared capability set into a repository. Secondary audience: authors maintaining equivalent packages for several tools.

A single-tool user installing that tool’s native plugins should usually stay with its native manager. Caplet earns its place through a shared source list, pinned revisions, explicit compatibility reporting, and repeatable installation—not simply another `install` command.

**Reason:** Importing a Claude plugin into Claude alone adds management overhead. Installing that source across Claude and another host, with understandable differences, creates distinct value.

**Evidence:** `README.md`; `packages/installer/src/resolve.ts`; `apps/caplet/src/cli.ts`.

**Blocks first slice:** **Yes**—this determines the success criterion.

### 2. Define the first slice as one complete cross-tool journey

**Recommendation:** Demonstrate:

1. Add a source without rewriting its repository.
2. Inspect its contents and target-specific consequences.
3. Install a real Claude plugin and a real package for one verified Agent Plugins client.
4. Invoke the skill and use its bundled resources.
5. Update from a pinned revision, reapply without duplication, and remove cleanly.

Across the first release, accept the four requested input formats: ACF, bare skills, Agent Plugins 1.0, and Claude plugins. Start cross-target translation with skills and a bounded MCP subset; preserve other native content for matching-format output and explicitly report unsupported translations.

Do not require every proposed canonical field to have working translations before releasing. Keep the intended union model distinct from the implementation’s supported subset.

**Reason:** Four readers and many writers are not valuable if the host never discovers their output. Two functioning hosts prove the product better than fifteen nominal targets.

**Evidence:** `packages/installer/src/inventory.ts` currently recognizes ACF and shallow bare-skill layouts; `packages/core/src/targets/registry.ts` overstates support; `research/plugin-interop/facets/distribution.md` identifies unresolved native registration.

**Blocks first slice:** **Yes**. Additional launch targets do not.

### 3. Treat “installed,” “registered,” and “usable” as different outcomes

**Recommendation:** Extend existing plan/status output to report each target’s state:

- Package generated.
- Registered with host, or manual registration required.
- Approval/configuration/reload pending.
- Activation verified, unknown, or blocked.

Specify the native-manager boundary: caplet owns its generated package and pinned source; the host owns its runtime, authentication, and approvals. Do not silently overwrite a user’s host-side disable action on the next apply.

For a managed package, updates must not silently escape the lock through host auto-update. Where that cannot be established, label the integration accordingly rather than promising reproducibility.

**Reason:** “Applied 12 files” is not evidence that a capability works. Competing update or enable-state owners make both managers unpredictable.

**Evidence:** `apps/caplet/src/commands/apply.ts` reports file writes; `research/plugin-interop/facets/distribution.md` §§1.4, 4; `research/plugin-interop/tools/cursor.md` documents unknown registration internals.

**Blocks first slice:** **Yes**, for advertised installation targets.

### 4. Make the plan explain behavior before it explains files

**Recommendation:** Add a concise per-target compatibility summary to the existing plan:

> Illustrative: `review / Pi — blocked: manual-only invocation cannot be preserved by this carrier. No skill emitted. Choose another target or explicitly exclude this skill.`

Each actionable diagnostic needs the source field, affected component, target, actual consequence, and recovery action. Distinguish:

- Represented natively.
- Translated with equivalent behavior.
- Changed behavior.
- Omitted component.
- Blocked installation.

Group cosmetic metadata losses; foreground invocation changes, missing functionality, executable content, and restrictions. Preserve structured details in JSON. Warn only about selected destinations.

**Reason:** A field-union model will otherwise produce warning fatigue. Users need to know what they will experience, not merely which schema field disappeared.

**Evidence:** `apps/caplet/src/internal/plan-view.ts` models file changes; `apps/caplet/src/internal/output.ts` renders code/path/target but not structured consequence or remediation; `SPEC.md` §14.3.

**Blocks first slice:** **Yes**.

### 5. Make unsafe degradation impossible by default

**Recommendation:** Refuse emission when translation would broaden execution, invocation, or access. This must not depend on `--strict`. Blocking a required component should block the requested installation until the user explicitly excludes it or changes its declaration; do not silently call the remainder a successful install.

Separate permission-grant acceptance from generic `--yes`. Show executable components before activation, without executing them during inspection. Preserve host approval gates.

Apply the same rule to raw extras: dropping an extra that restricts behavior can be unsafe. Unknown behavior is not evidence that dropping it is harmless.

**Reason:** Users will reasonably interpret “read-only,” “manual-only,” and “deny” as promises. A warning cannot compensate for breaking those promises.

**Evidence:** `SPEC.md` §13.7 currently permits degrading an effect to observation; `packages/adapters/src/common/emitter.ts` calls `degradeEffectIfNeeded`; `apps/caplet/src/internal/output.ts` allows lossy diagnostics unless strict; `research/plugin-interop/facets/permissions.md`.

**Blocks first slice:** **Yes**.

### 6. Give consumers and authors separate, simple workflows

**Recommendation:**

- **Consumer:** `add` detects the format, retains provenance, and installs without demanding an ACF conversion.
- **Native ACF author:** starts with a minimal manifest and familiar Markdown, then adds portable fields and target extras as needed.
- **Migrating author:** explicitly exports/converts into an editable ACF project; generated installation output is never presented as the authoring location.

Explain this distinction in onboarding. Current `init` creates a consumer source list, not an author’s package; keep that meaning clear. A guided authoring command can follow later, but a minimal authoring example is needed immediately.

When several manifests coexist, show the selected interpretation and provide an explicit override rather than guessing silently.

**Reason:** Requiring migration before installation increases adoption cost. Hiding conversion inside `add` creates confusion about which files the user should edit.

**Evidence:** `apps/caplet/src/commands/init.ts`; `packages/installer/src/inventory.ts::inspectSource`; `packages/core/src/types/model.ts`; `CONTEXT.md` Axioms 9 and 17.

**Blocks first slice:** **Yes** for source-of-truth clarity; **No** for a conversion wizard.

### 7. Preserve native packages without promising impossible round trips

**Recommendation:** Publish separate guarantees:

- **Unchanged same-format package:** preserve original package bytes, resources, paths, and executable modes.
- **Edited canonical projection:** apply edits with defined conflict handling while retaining unrelated native content.
- **Cross-target installation:** report semantic compatibility; byte identity is not the goal.

Never let an old raw snapshot silently override an author’s canonical edit. If edited round trips are not ready, explicitly reject that operation rather than returning stale content.

Clarify that package preservation does not mean exporting host credentials, caches, or user configuration.

**Reason:** Consumers need fidelity; authors need edits to take effect. “Lossless” alone does not tell either audience what is guaranteed.

**Evidence:** `research/plugin-interop/facets/skills.md` §5.4; `research/plugin-interop/facets/distribution.md` §§2.2, 5; `SPEC.md` §7.3 makes canonical fields authoritative.

**Blocks first slice:** **Yes** for unchanged imports and the contract; edited conversion can follow.

### 8. Keep plugin lifecycle boundaries honest

**Recommendation:** Do not silently supplement a plugin with loose instructions or global settings. For the first slice, either omit unsupported companions with a clear blocking/partial outcome or require explicit acceptance of their separate lifecycle.

If companions are supported, status must identify them, and caplet removal must clean them up. Native plugin disable must never be described as disabling the whole capability when companions remain active.

Also prevent duplicate discovery through shared and target-specific directories.

**Reason:** A user disabling a plugin expects its effects to stop. Invisible residual instructions undermine trust even if removal is technically correct.

**Evidence:** `research/plugin-interop/facets/instructions.md` conflict C17; `research/plugin-interop/facets/skills.md` §5.2; `apps/caplet/src/commands/remove.ts`.

**Blocks first slice:** **Yes** for truthful lifecycle behavior; companion support itself does not.

### 9. Defer features that turn the installer into a runtime platform

**Recommendation:** Leave out of v1:

- General portable hook runner and generated extension bridges.
- Marketplace aggregation/publishing and transitive dependency resolution.
- Portable themes, providers, LSP configuration, and broad host-settings management.
- Automatic runtime/dependency installation and elaborate option-prompting systems.
- Unverified target/scope combinations.

Preserve native payloads where appropriate; explicitly reject unsupported dependency-bearing installations rather than quietly omitting dependencies.

Release-gate supported combinations with real-host discovery, invocation, update, disable, and removal checks. Include same-format tree comparison and a regression proving restrictions never disappear silently.

**Reason:** These features add operational obligations before the core installation promise is established.

**Evidence:** `research/plugin-interop/facets/hooks.md` §2.6; `research/plugin-interop/facets/extras.md` §2; `research/plugin-interop/facets/distribution.md`; `research/plugin-interop/tools/agent-plugins.md` explicitly distinguishes compatibility listings from verified conformance.

**Blocks first slice:** **No** for deferred features; **Yes** for verification of advertised support.

## Disagreements with the facet syntheses

- **Schema eligibility is not release priority.** I agree with the two-layer union direction, but “shared by two tools” establishes a candidate semantic field—not a reason to implement its entire authoring, consent, and installation experience in v1. The extras and distribution proposals substantially exceed the first useful product.

- **Some suggested degradations contradict the desired safety story.** Skills §3 permits replacing path restrictions with descriptive text; permissions §2 defaults tool-filter enforcement to `best_effort`. Neither is an acceptable default when users understand those declarations as constraints. Descriptive advice is not enforcement.

- **A hook runner is not automatically the next step.** Hooks §2.6 makes it necessary for broad normalized hook execution, not for a useful interoperability release. Native preservation and explicit cross-target refusal let the product launch without requiring caplet on PATH during every agent session.

- **Loose instructions should not be the invisible default plugin companion.** The instructions synthesis recognizes the disable mismatch, but reporting it only as informational is too weak for an installation advertised as one plugin.

- **Agent Plugins support is client-specific in practice.** The MCP synthesis’s Cursor variable incompatibility contradicts treating one AP artifact as universally functional. Keep target-qualified outputs and support claims even when their outer packaging format is identical.

- **Research dates do not establish shipped compatibility.** `research/plugin-interop/tools/claude-code.md` explicitly includes rolling documentation with post-2026-10-01 material; the instructions synthesis also flags post-cutoff Kiro documentation. Use pinned runtime evidence before making release promises.

## Open questions for the user

1. **Primary launch audience:** I recommend multi-tool developers and repository maintainers, with plugin authors secondary. Is that the intended priority, rather than single-tool marketplace users?

2. **Launch breadth:** I recommend all four requested input formats, but only two runtime-verified installation targets initially—Claude and one AP client—rather than all listed hosts. Is that acceptable?

3. **Native disable behavior:** I recommend caplet respect host-side disable decisions and avoid loose companions by default. Should a later explicit reconcile operation be allowed to re-enable them?

4. **Edited round trips:** I recommend byte-identical guarantees for unchanged imports in the first slice, with edited conversion either explicitly supported or refused—not silently normalized. Do you need editable, lossless native-to-ACF-to-native conversion at launch?
