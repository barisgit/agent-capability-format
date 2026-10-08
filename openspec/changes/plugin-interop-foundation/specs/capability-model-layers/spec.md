## Purpose

Defines how ACF represents every agent capability feature without sacrificing any tool's expressiveness: a portable core built as the union of meanings shared by at least two tools, plus per-target raw extras, governed by one field-level support table and a safety class per field. Amends SPEC.md §7, §14.3 and §22.1 and CONTEXT.md Axioms 4 and 12.

## ADDED Requirements

### Requirement: Two-layer capability model
Every capability SHALL be represented as (a) a portable core of typed canonical fields that writers translate into each target's native spelling, and (b) per-target extras holding native data in the target's own spelling, which writers emit verbatim to the matching target and nowhere else. A meaning promoted to the core SHALL be expressed only through its core field; a native key that the writer also generates from a core field SHALL NOT be accepted as an extra. A meaning that is not in the core (single-tool, conflicting, or pending promotion) SHALL be expressed through extras.

#### Scenario: Core field reaches every target that can carry it
- **WHEN** a skill declares `license: MIT` and is emitted for Claude and for Codex
- **THEN** both native skill files carry the license in their own native spelling

#### Scenario: Extra reaches only its own target
- **WHEN** a skill declares `targets.claude.native.when_to_use` and is emitted for Claude and for Codex
- **THEN** the Claude skill file contains `when_to_use` verbatim and the Codex output omits it with an `acf.extras.dropped` diagnostic naming the field and target

### Requirement: Union-without-sacrifice promotion rule
A meaning SHALL belong to the portable core when at least two tools in the research inventories implement it with equivalent semantics, regardless of differences in spelling, nesting, value encoding or file placement. Semantics are equivalent only when the documented value domain, default, effect and scope of application agree after a declared lossless encoding mapping; a shared label alone SHALL NOT establish equivalence, and a weaker effect on a different surface (for example hiding an entry from a menu versus refusing the invocation) SHALL NOT be counted as the same meaning. Every core field SHALL have exactly one meaning, no two core fields SHALL share a meaning, and no core field SHALL contradict another. A meaning SHALL NOT be excluded from the core because some targets cannot represent it; those targets declare a degradation or refusal instead. Where tools agree on part of a meaning and conflict on the rest, the agreed part SHALL become the core field and each conflicting part SHALL remain a per-target extra.

#### Scenario: Different spellings, same meaning
- **WHEN** Claude spells manual-only skill invocation `disable-model-invocation: true` and Codex spells it `policy.allow_implicit_invocation: false` with the same documented effect
- **THEN** the meaning is the single core field `invocation.model: false`, and each writer emits its own spelling

#### Scenario: Shared label, different meaning
- **WHEN** two tools both expose an agent `effort` field but their documented value scales do not form one order
- **THEN** `effort` is not promoted to the core and stays a per-target extra for each tool

#### Scenario: Same key, weaker effect
- **WHEN** Claude documents `user-invocable: false` as refusing typed `/name` invocation and VS Code documents the same key as hiding the skill from the slash menu
- **THEN** the VS Code key is not support for the core `invocation.user: false`, and any VS Code cell for that field is a refusal until a `verified` test shows typed invocation is refused

#### Scenario: Single-tool meaning
- **WHEN** only Claude documents a skill `when_to_use` field
- **THEN** it remains a Claude extra until a second tool implements the same meaning

### Requirement: Recorded equivalence evidence
Each core field and each support-table cell SHALL cite the documented contract it relies on and SHALL carry an evidence level of `documented` or `verified` with the host version tested. A target cell for a restricting or functional field SHALL NOT claim native support when the target's behavior for that field is unknown; such a cell SHALL be a refusal until evidence exists. A host and carrier advertised as supported in release notes or the README SHALL have at least one `verified` discovery-and-invocation test. A field whose cross-tool equivalence is not proved by documentation or a `verified` test SHALL stay out of the core.

#### Scenario: Unknown behavior is refused
- **WHEN** the research records Claude's handling of an MCP server `cwd` as unknown
- **THEN** the Claude cell for `cwd` is a refusal with the evidence gap as its reason

### Requirement: Pending core meanings travel as extras
A meaning that satisfies or may satisfy the promotion rule but whose core contract this change defers (permission expressions, argument and body placeholder dialects, agent coupling, path-scoped activation, MCP authentication and host-environment references, and the meanings listed in the skill and MCP capabilities) SHALL be listed as pending core. Native ACF SHALL be able to author a pending meaning for each target through that target's inline or file extras, with the same native spelling a foreign package would use; validation SHALL report `acf.core.pending` as `info` naming the future core field. When a later change promotes the meaning, that change SHALL define the migration from the per-target extras to the core field, and an extra that then duplicates a promoted core field SHALL be `acf.extras.conflict`.

#### Scenario: Author uses a pending meaning as an extra
- **WHEN** an ACF skill declares `targets.claude.native.allowed-tools: "Bash(git status *)"` and is emitted for Claude and Codex
- **THEN** validation reports `acf.core.pending` as `info`, the Claude SKILL.md contains the same `allowed-tools` value, and the Codex skill omits it with `acf.extras.dropped`

#### Scenario: Imported pending meaning survives same-format output
- **WHEN** an unchanged Claude plugin whose skill declares `allowed-tools` is installed for Claude
- **THEN** the emitted skill file is byte-identical to the source file

### Requirement: Native ACF expressiveness parity
Native ACF SHALL be able to express everything a foreign package of a supported format carries to that format's target. Each datum that a reader preserves for same-format output SHALL have an authoring form in `acf.yml`, the facet files or the capability tree: a core field, a component-level or package-level `targets.<target>.native` extra, a per-target package value (`targets.<target>.package`, for manifest values outside the core value domain such as a non-SemVer version), or a file under `native/<target>/`. A native key or file SHALL be rejected in native ACF only when the reader of the same format also refuses it, so that no foreign package can produce output that native ACF cannot.

#### Scenario: Claude plugin dependencies authored in ACF
- **WHEN** `acf.yml` declares `targets.claude.native.dependencies` and the capability is applied with the Claude plugin carrier
- **THEN** the generated `.claude-plugin/plugin.json` contains the same `dependencies` value that a Claude plugin source with that value would produce, and other targets report it under dropped extras

#### Scenario: Foreign and native sources produce the same plugin
- **WHEN** a Claude plugin with version `2024.10`, one skill and one server is transformed with `rename`, and a native ACF capability authors the same name, skill, server and `targets.claude.package.version: "2024.10"`
- **THEN** both generated Claude plugin trees are identical except paths and values derived from the payload digest

### Requirement: Safety classes
Every core field, every value condition with a distinct effect, and every native field known to the target registry SHALL carry exactly one safety class: `restricting` (narrows invocation, activation, availability or authority), `granting` (pre-approves or widens authority), `functional` (required for the component to work as declared), or `descriptive` (presentation, metadata and advisory tuning hints whose absence leaves the component working with host defaults). Native fields the registry does not know SHALL be `unclassified`.

#### Scenario: Classes decide degradation
- **WHEN** the registry lists `invocation.model: false` as `restricting` and `argument-hint` as `descriptive`
- **THEN** a target lacking both refuses a skill that declares the first and drops the second with a diagnostic

### Requirement: Field-level support table
The target registry SHALL declare support per core field or value condition, per target, per carrier (`plugin`, `loose`), with one of: native (with the native spelling, location and any value-domain condition), translated (with the deterministic rule), degraded (with the declared loss and diagnostic severity), or refused (with the reason). A cell whose native field has a narrower value domain or a different unit than the core field SHALL state the condition under which the mapping is exact and the cell that applies outside it. Family-level support levels such as `full` or `partial` SHALL NOT be used to decide emission. Documentation tables and lossiness diagnostics SHALL be derived from these declarations. A `descriptive` or `granting` field MAY be degraded; a `restricting` or `functional` field SHALL be native, translated, or refused.

#### Scenario: Diagnostic text comes from the table
- **WHEN** a writer drops `argument-hint` for Codex
- **THEN** the diagnostic code, severity and message match the Codex cell for `argument-hint` in the registry

#### Scenario: Restricting field cannot be declared degradable
- **WHEN** a registry entry declares a degradation for `invocation.model: false` on any target
- **THEN** the registry self-check test fails

### Requirement: Writers honor the table or refuse
A writer SHALL, for each core field present on a component, apply exactly the cell declared for its target and carrier. When the cell is a refusal, the writer SHALL omit that component for that target and emit an `error` diagnostic `acf.support.refused` that names the field, component, target, consequence and recovery (exclude the component for that target, or change the declaration). A refusal SHALL block `apply` for that capability on the affected target regardless of strict mode until the user excludes the component for that target: apply writes, updates and deletes nothing of that capability for that target, applies other capabilities and other targets, and exits non-zero.

#### Scenario: Manual-only skill to a target that cannot honor it
- **WHEN** a skill with `invocation.model: false` is planned for OpenCode
- **THEN** the plan shows the skill as blocked for OpenCode with the recovery `exclude: { skills: [<name>] }` or `except: [opencode]`, and apply makes no OpenCode changes for that capability

#### Scenario: Explicit exclusion unblocks the rest
- **WHEN** the user adds `except: [opencode]` to that skill and re-plans
- **THEN** the remaining components install for OpenCode without the refused skill

### Requirement: Negative fixtures for data-only restrictions
A restriction that exists only as data a host may or may not read (skill frontmatter such as `disable-model-invocation`, `user-invocable` and `paths`, MCP filter keys, and restricting native extras) SHALL have, for every refusing cell, a negative test fixture that asserts all of: no file for the refused component is written for that target; no shared-root copy that the refusing target discovers is written; no substitute artifact is written in place of the restriction (no description hint such as "Use when working with files matching", no permission rule such as Claude `permissions.deny`, no menu-visibility key offered as an invocation prohibition, no observing hook in place of a blocking one); and the plan reports `acf.support.refused` with a recovery. The registry self-check SHALL fail when a refusing cell for a restricting field has no such fixture.

#### Scenario: Manual-only Claude skill to OpenCode
- **WHEN** an imported Claude plugin skill with `disable-model-invocation: true` is planned for OpenCode
- **THEN** the fixture asserts that no `.opencode/skills/<name>/` and no `.agents/skills/<name>/` file is written, the description is unchanged in every emitted file, and the plan reports the refusal

#### Scenario: Path-scoped Claude skill to Codex
- **WHEN** an imported Claude plugin skill with `paths: ["src/**"]` is planned for Codex
- **THEN** the fixture asserts that no Codex skill file and no `agents/openai.yaml` is written and no text derived from `paths` appears in any emitted file

#### Scenario: User-only skill to a menu-hiding host
- **WHEN** a skill with `invocation.user: false` is planned for a target whose registry cell for that field is a refusal
- **THEN** the fixture asserts that no SKILL.md containing `user-invocable: false` is written for that target

### Requirement: Component omission
When a target has no carrier for a whole component type (for example a Claude plugin's agents emitted to Codex loose files), the writer SHALL omit the component with a `lossy` diagnostic `acf.support.component-omitted`, unless the component is `restricting` (such as a hook with a blocking or deciding effect, or a native policy file), in which case the whole package SHALL be refused for that target.

#### Scenario: Agent omitted
- **WHEN** a Claude plugin with one skill and one agent is installed for Codex
- **THEN** Codex receives the skill and the plan lists the agent as omitted for Codex

#### Scenario: Guard hook omitted
- **WHEN** a Claude plugin with a `PreToolUse` hook that can block tool calls is installed for Codex
- **THEN** the package is refused for Codex with `acf.support.refused` naming the hook

### Requirement: Shared discovery roots
When one emitted artifact is discovered by several selected targets (such as `.agents/skills/<name>/`), its rendering SHALL satisfy the support cells of every selected target that discovers that location, and any extra rendered into it SHALL count as emitted to every such target; if any such target refuses the component or a restricting extra in it, the shared artifact SHALL NOT be emitted and the refusal SHALL be reported for that target.

#### Scenario: Shared skill root with a target that cannot restrict
- **WHEN** a manual-only skill is selected for Pi and OpenCode, which both discover `.agents/skills`
- **THEN** the shared copy is not written and the plan reports the OpenCode refusal

### Requirement: Inline native extras
The extension data at every location listed in SPEC.md §7.2, and the package level of `acf.yml`, SHALL accept a `native` mapping (`targets.<target>.native`) whose keys and values are the target's native spelling and are merged verbatim into the native object that the attachment point maps to (skill frontmatter, MCP server entry, or plugin manifest). Registry-typed extension options outside `native` keep their existing validation. Keys inside `native` that the registry knows SHALL be validated and classified; unknown keys SHALL be accepted with an `info` diagnostic. A `native` key that the writer also generates from a core field SHALL be an `error` (`acf.extras.conflict`); extras SHALL NOT override core fields. A target-specific value for a manifest key generated from package metadata is declared through `targets.<target>.package` instead (canonical-package-metadata, Per-target package values).

#### Scenario: Verbatim native key
- **WHEN** an MCP server declares `targets.codex.native.required: true`
- **THEN** the Codex server entry for that server contains `required = true`, and no other target's entry contains `required`

#### Scenario: Extra conflicts with a core field
- **WHEN** a skill declares `description` and `targets.claude.native.description`
- **THEN** validation fails with `acf.extras.conflict`

### Requirement: File-level native extras
A capability MAY contain `native/<target>/`; for a plugin carrier of that target, its files SHALL be copied byte- and mode-exact to the same relative paths inside the generated package. Paths SHALL stay inside the package after normalization. A path that collides with a generated file SHALL be an `error`; manifest values are set through package-level `native` extras and `targets.<target>.package`, never through a file under `native/<target>/`. For other targets, and for loose carriers in this change, the tree SHALL be dropped with an `acf.extras.dropped` diagnostic. Files under `native/` SHALL NOT be read as ACF source facets.

#### Scenario: Claude-only output style
- **WHEN** a capability contains `native/claude/output-styles/terse.md`
- **THEN** the generated Claude plugin contains `output-styles/terse.md` with identical bytes, and other targets report the tree as dropped

#### Scenario: Collision with generated output
- **WHEN** a capability contains `native/claude/.claude-plugin/plugin.json`
- **THEN** emission fails with an error naming the colliding path

### Requirement: Dropping extras elsewhere
When a component is emitted to a target other than an extra's target, the extra SHALL be dropped with `acf.extras.dropped` (severity `lossy`). If the registry classifies the dropped extra as `restricting` and has no core equivalent the target carries, the component SHALL instead be refused for that target. Unclassified extras SHALL be dropped with the `lossy` diagnostic; `diagnostics.failOnLossy` and strict mode turn that into a failure.

#### Scenario: Restricting native extra blocks cross-target emission
- **WHEN** an imported Claude skill carries `paths`, which the registry classifies as a `restricting` Claude extra, and the skill is planned for Codex
- **THEN** the skill is refused for Codex

#### Scenario: Unclassified extra is dropped visibly
- **WHEN** an imported Agent Plugins skill carries an unknown frontmatter key and is planned for Claude
- **THEN** the Claude skill omits that key and the plan lists it under dropped extras

### Requirement: Behavior-first compatibility report
The plan SHALL summarize, per selected target, each component as one of: native, translated, changed behavior, omitted, or blocked, before listing files. Each non-native outcome SHALL name the source field or component, the target, the consequence and a recovery action. Descriptive-field drops SHALL be grouped into one line per target. JSON output SHALL carry the same outcomes as structured data.

#### Scenario: Plan explains a block
- **WHEN** a plan contains a refused skill for Pi
- **THEN** the human output shows `review / pi - blocked: ...` with the recovery action before the file list, and `--json` contains an equivalent outcome object
