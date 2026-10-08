# Facet: instructions and rules

Cross-tool comparison and canonical-model proposal for ambient instructions: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/rules`, Cursor `.mdc` rules, Copilot/VS Code `.instructions.md`, Windsurf/Devin rules, Kiro steering, Cline/Roo rules, Goose hints; activation modes, nesting and precedence, imports/includes.

Snapshot 2026-10-01. Inputs: every inventory in `../tools/*.md`, `SPEC.md` §§6, 7, 12, 14, 15, 17, 22, 22b, 24, 25, `CONTEXT.md` Axiom 10, `packages/core/src/types/model.ts`, `packages/core/src/schemas/index.ts`, `packages/core/src/targets/registry.ts`, `packages/core/src/targets/extensions.ts`, `packages/adapters/src/common/emitter.ts` and the five adapters.

One claim was re-verified against the live official doc ([Claude memory](https://code.claude.com/docs/en/memory), rolling, fetched 2026-10-01, documents versions up to v2.1.28x):

- `.claude/rules/` files (and `~/.claude/CLAUDE.md`, managed `CLAUDE.md`) do **not** suppress Claude's `AGENTS.md` fallback; a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the working directory or above **does**.
- `paths` is the only rule frontmatter key Claude reads; other keys are ignored without error. `paths` accepts a YAML list or a comma-separated string; brace expansion is supported with a 1,000-pattern / 4 MiB budget.
- Unparseable rule frontmatter makes Claude load the rule **as if it had no `paths`** (fail-open to unconditional).
- Path-scoped rules fire when Claude uses Read, Write or Edit on a matching file, not on every tool use.
- Imports: relative or absolute `@path`, relative to the containing file, maximum depth **four hops** (the inventory's "five levels" counts the root file; same limit). Code spans/fences are skipped.
- Project-root `CLAUDE.md` is re-read and re-injected after `/compact`; nested files and path rules reload on demand.

Notation used below: **N** native (spelling) - **T** translated (how) - **D** degraded (how; diagnostic) - **U** unsupported - **?** contract UNKNOWN in the inventories (writers treat as U until verified).

---

## 1. Concept map

Each row is one meaning. Spellings differ; rows group tools only where the meaning is the same.

### 1.1 Shared meanings

| # | Meaning | Tools and spellings |
|---|---|---|
| M1 | **Always-on ambient instructions**: Markdown included in every request from session start | Claude: `CLAUDE.md`, `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md`, rule without `paths`. Codex: `AGENTS.md`/`AGENTS.override.md` chain. Copilot CLI: `copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`. VS Code: `.github/copilot-instructions.md`, root `AGENTS.md`, Claude files (setting-gated). Cursor: `alwaysApply: true`, `AGENTS.md`. Gemini: `GEMINI.md` / `context.fileName` / extension `contextFileName`. OpenCode: `AGENTS.md`, `instructions[]`. Pi: `AGENTS.md` candidates. Amp: `AGENTS.md`. Windsurf: `trigger: always_on`, `global_rules.md`, root `AGENTS.md`. Devin Local: `always_on`, `AGENTS.md`. Cline: rule file without frontmatter. Roo: `.roo/rules/`. Goose: `.goosehints`, `AGENTS.md`. Kiro: `inclusion: always` (default), `AGENTS.md`. Lume: `AGENTS.md` candidates. AGENTS.md standard: `AGENTS.md`. |
| M2 | **File-scoped activation**: include when a file matching globs is part of the work | Claude rule `paths` (string \| string[]). Copilot `applyTo` (string, comma-separated). VS Code `applyTo` (string); also reads Claude `paths`. Cursor `globs` (string \| string[]) with `alwaysApply: false`. Windsurf/Devin `trigger: glob` + `globs`. Kiro `inclusion: fileMatch` + `fileMatchPattern` (string \| string[]). Cline `paths` (string[]). Amp: `globs` in the frontmatter of an `@`-mentioned file. ACF: `activation.when.file_context.paths`. |
| M3 | **Model-decided activation**: description is visible; body loads when the model judges it relevant | Cursor (`description`, no `globs`, `alwaysApply: false`, "Apply Intelligently"). Windsurf/Devin `trigger: model_decision` + `description` (Devin also lists `agent`, distinction UNKNOWN). Kiro `inclusion: auto` + required `name` + `description`. VS Code `.instructions.md` with `description`, no `applyTo`. Same observable contract as a model-invocable Agent Skill. |
| M4 | **Manual activation**: zero cost until the user attaches it by name | Cursor (no `description`, no `globs`; `@rule-name`). Windsurf/Devin `trigger: manual` (`@rule-name`). Kiro `inclusion: manual` (`#name`, `/name`). VS Code `.instructions.md` without `description`/`applyTo` (Add Context). Same observable contract as a user-only skill or a prompt template. |
| M5 | **Directory-scoped nested files**: a file in a subdirectory applies to that subtree | Nested `AGENTS.md` (Codex chain to cwd, Cursor, Copilot, Amp, Windsurf "auto-glob-scoped", Devin lazy, Kiro, VS Code behind `chat.useNestedAgentsMdFiles`, Claude on Read). Nested `CLAUDE.md` (Claude), `GEMINI.md` (Gemini JIT), `.goosehints` (Goose). Pi and Lume load ancestors of the session cwd only. Package content never needs this; it is expressible as M2 with `<dir>/**`. |
| M6 | **Eager include**: another file's content is pulled in at load time | Claude `@path` (relative/absolute/`~`, four hops). Amp `@path`, `@~/`, glob mentions. Copilot `@relative` in `copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` only, repository-contained. Gemini `@file.md` (relative and absolute). Goose `@relative-file`. Kiro `#[[file:path]]` (plus line, range, folder forms). VS Code: Markdown links when `chat.includeReferencedInstructions` is on. |
| M7 | **Per-directory file selection** (which filename wins in one directory) | Codex `AGENTS.override.md` > `AGENTS.md` > `project_doc_fallback_filenames`. Pi `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`. Lume override > `AGENTS.md` > `CLAUDE.md`. Claude `CLAUDE.md` family first, `AGENTS.md` only as fallback (default `instructionFiles: claude-md-or-agents-md`). OpenCode `AGENTS.md` first, `CLAUDE.md` fallback. Amp `AGENTS.md`, fallback `AGENT.md`/`CLAUDE.md`. Roo `AGENTS.md` > `AGENT.md`. Gemini/Goose: configured filename list. |
| M8 | **Install scope** | User/global and project in almost every tool. Local/private: `CLAUDE.local.md`, Devin `AGENTS.local.md`. Organization/managed/system: Claude managed `CLAUDE.md`, Amp `/etc/ampcode/AGENTS.md`, Windsurf/Devin system `rules/`, Cursor Team Rules, Copilot organization instructions, Amp workspace setting. |
| M9 | **Package vehicle** (instructions shipped inside a plugin/extension) | Gemini extension `contextFileName`. Devin plugin root `AGENTS.md` + `rules/*.md`. Cursor-native plugin `rules/` (`.md`, `.mdc`, `.markdown`). Kiro legacy power `steering/*.md`; Agent Plugins `dev.kiro/` (schema UNKNOWN). Copilot/VS Code Agent Plugins `com.github.copilot/rules/` (schema UNKNOWN). Cline code plugins `rules` API. None in Claude plugins, Codex plugins, Agent Plugins portable core, Pi packages, OpenCode plugins (JS only), Amp plugins (JS only). |
| M10 | **Combination and conflict policy** | Additive everywhere. Explicit "no precedence": Copilot CLI, VS Code. Earlier source wins: Cursor (Team > Project > User). Workspace/project wins over global: Kiro, Cline, Roo, Goose. Concatenate outer-to-inner, deeper later: Codex, Pi, Lume, Gemini. "May pick one arbitrarily": Claude. |
| M11 | **Size budgets** | Codex 32 KiB combined (`project_doc_max_bytes`). Windsurf 12,000 chars per workspace rule, 6,000 for `global_rules.md`. Lume 65,536 bytes, whole-file omission. Claude guidance <200 lines, no hard cap. Others UNKNOWN. |
| M12 | **Runtime-content triggers** (inject on assistant output, operation input or result) | ACF only (`assistant_output`, `operation_input`, `operation_result`). No tool ships these as instruction metadata; the nearest native vehicles are context-injecting hooks (`additionalContext` on pre/post tool events; Gemini `AfterModel` per chunk). |

### 1.2 Tool-only meanings (single tool; not core)

| Meaning | Tool and spelling |
|---|---|
| Mode/persona-scoped rules | Roo `.roo/rules-{modeSlug}/` |
| Product-surface exclusion | Copilot `excludeAgent: code-review \| cloud-agent` |
| Subagent inclusion opt-in | Copilot agent `include-custom-instructions`; Claude agent `omitClaudeMd` (agents facet) |
| Tool-availability gating | Cline code-plugin rule `whenToolAvailable` |
| Remote instruction URLs | OpenCode `instructions[]` URL entries (5 s fetch timeout) |
| Display name distinct from identifier | VS Code `name` |
| Include of line, range, folder listing | Kiro `#[[file:path:line]]`, `#[[file:path:a-b]]`, `#[[folder:path]]` |
| Glob mentions inside includes | Amp `@docs/*.md` |
| Instruction-file selection policy | Claude `pluginConfigs.cc-plugin-agents-md@builtin.options.instructionFiles` (user/managed settings only) |
| Exclusion lists | Claude `claudeMdExcludes`; Amp `AMP_IGNORE_GUIDANCE_FILES` |
| "Never" rule | Cline `paths: []` |

### 1.3 Homonyms that are not instructions

These share the word "rules" or "instructions" but carry no instruction semantics and must not be read into or written from this facet.

| Spelling | Real meaning | Belongs to |
|---|---|---|
| Codex `rules/*.rules` (`prefix_rule`, `decision: allow\|prompt\|forbidden`) | Execution policy (Starlark) | permissions |
| Gemini `policies/*.toml` | Tool policy engine | permissions |
| Claude `output-styles/*.md` | System-prompt style replacement, `keep-coding-instructions` | other native types |
| Pi `SYSTEM.md` / `APPEND_SYSTEM.md` | System-prompt replacement / single-file append, trust-gated, project shadows global | other native types (see open question Q12) |
| Goose `~/.config/goose/prompts/system.md` etc. | System templates | other native types |
| Cursor `autoRun.allow_instructions` / `block_instructions` | Auto-run classifier steering | permissions |
| VS Code `github.copilot.chat.*.instructions` settings | Per-feature generation prompts in settings | settings, not packages |
| Agent `developer_instructions` (Codex), `instructions` (Amp, Goose recipes), Cline `customInstructions` | Agent/recipe prompt | agents/commands |
| Claude `InstructionsLoaded` hook | Observability event | hooks |

---

## 2. Proposed canonical core schema

Two tiers inside the canonical model:

- **Portable core**: union of meanings shared by at least two tools (M1-M4, M6) plus identity. Every value has a native or declared translated/degraded mapping in every writer.
- **ACF runtime tier**: ACF-native triggers (M12) that no tool spells natively. They stay canonical because ACF originates them, but they are realizable only through hook translation and are marked as such in the registry. They are not "tool extras" (§5) because no tool owns them.

Source shape is unchanged: `instructions/<name>.md` or `instructions/<name>/INSTRUCTION.md`.

### 2.1 Field table

| Canonical field | Type | Meaning | Origin tools (spelling) | Tier |
|---|---|---|---|---|
| `name` | slug, MUST equal basename | Stable identifier; native filename stem and manual-mention handle | ACF; Cursor/Windsurf/Devin/Kiro filename; Kiro `name`; Cline plugin `id` | core |
| `description` | string, **optional**; REQUIRED when `activation: model` | Summary of when the instruction applies. Never injected with the body. Exposed to the model only when `activation: model` | ACF; Cursor, Windsurf/Devin, Kiro, VS Code `description` | core |
| `activation` | `"always"` \| `"model"` \| `"manual"` \| `{ when: ActivationWhen }` | Exactly one activation mode; see enum below | see enum | core |
| `activation.when.file_context.paths` | non-empty string[] | Workspace-root-relative globs; activates when a matching file is part of the host's working context | Claude `paths`, Cursor `globs`, Copilot/VS Code `applyTo`, Windsurf/Devin `globs`, Kiro `fileMatchPattern`, Cline `paths`, Amp mentioned-file `globs` | core |
| body | Markdown | Injected verbatim on activation | all | core |
| include directive | body line `<!-- acf:include path="<relative path>" -->` | Eager, positional inclusion of another capability-local file at activation | Claude/Amp/Copilot/Gemini/Goose `@path`, Kiro `#[[file:path]]`, VS Code Markdown links (setting) | core |
| `assets` | list | Unchanged (SPEC §16); include targets are implicit assets | ACF | core |
| `only` / `except` | list | Unchanged (SPEC §6) | ACF | core |
| `targets.<target>` | typed per-target extras (§5) | Tool-only fields | per tool | extras |
| `activation.when.operation_input` / `operation_result` / `assistant_output` | trigger block with `conditions: string[]` | ACF runtime triggers (SPEC §12.6) | ACF only; nearest native vehicle is hooks | runtime |
| `scope`, `interrupt`, `repeat`, `debounce` (any trigger block) | as SPEC §12.9-12.11 | ACF trigger knobs | ACF only | runtime |

### 2.2 `activation` enum

| Canonical value | Meaning | Native spellings |
|---|---|---|
| `always` | Included from session start in every request, content stable for the session. Host decides role/placement (system prompt, system reminder, first turn). | §1.1 M1 |
| `{ when: { file_context: { paths } } }` | Included once a matching file is part of the host's working context. What counts as "working context" is host-defined (§4 C11). Retention after activation is host-defined unless the block sets non-default knobs. | §1.1 M2 |
| `model` | `description` advertised to the model; body included when the model selects it. Description costs tokens before activation. | Cursor "Apply Intelligently", Windsurf/Devin `model_decision`, Kiro `auto`, VS Code description-only |
| `manual` | Zero cost until the user attaches it by name; never model-selected. | Cursor "Apply Manually", Windsurf/Devin `manual`, Kiro `manual`, VS Code no-description/no-applyTo |
| `{ when: { operation_input \| operation_result \| assistant_output: ... } }` | ACF runtime triggers, unchanged from SPEC §12.5-12.12 | none native |

Rules:

1. Modes are exclusive; no tool combines model-decided with globs (Cursor's description on a glob rule is metadata, not a second trigger). Only `when` blocks may be ORed with each other, as today.
2. `file_context` is **native-eligible** only when its block contains `paths` alone (no `scope`, `repeat: once` default, no `debounce`, `interrupt` default `never`). Non-default knobs force hook translation or a declared degradation (§3 row R14).
3. Writers never broaden activation (manual/model/when to always, or dropping a restricting extra). Narrowing (skipping, or emitting only the `file_context` part of an OR) is allowed with a `lossy` diagnostic. This replaces SPEC §22.4's "MAY fall back to always-on".

### 2.3 Glob dialect (pinned)

Forward-slash globs relative to the workspace root, case-sensitive (unchanged §12.8). Supported syntax: `*`, `**`, `?`, `[...]`, `{a,b}`. No negation. Writers rewrite per host:

- Expand `{a,b}` into separate patterns before comma-joining (Copilot `applyTo`, Cursor comma string), because a comma inside braces is ambiguous in comma-separated spellings; also expand for any host whose brace support is undocumented.
- Amp: rewrite to `./`- or `../`-prefixed patterns relative to the mentioned file, or rely on Amp's implicit `**/` prefix only when the canonical glob already starts with `**/`.
- Claude: native list; keep the brace budget (1,000 expansions) as a validation diagnostic.

### 2.4 Include directive

- Canonical spelling is an explicit, block-level directive on its own line: `<!-- acf:include path="references/style.md" -->`. It cannot be confused with any tool's syntax, and an unprocessed directive is invisible rather than misleading.
- Path relative to the containing file; MUST resolve inside the capability (§16); absolute, `~`, and escaping paths are `error` (`acf.instruction.include-outside-capability`). Directives inside code spans or fences are text. Recursion limit four hops (Claude's limit, the smallest documented); cycles are `error`.
- Writers emit native include syntax where the host's contract is eager import and the carrier file supports it (Claude `CLAUDE.md`, Gemini, Goose, Amp, Copilot `copilot-instructions.md`/`AGENTS.md`, Kiro `#[[file:]]` rewritten to workspace-root-relative), transporting the target file; everywhere else they **inline** the content at the directive position (exact for static content; `info` diagnostic only when the host would have re-read the file live).
- Readers convert a foreign include into the canonical directive only when the source file's host contract is eager import and the include occupies its own line and resolves inside the package; otherwise the text stays literal in the body (§4 C7).

### 2.5 Example (illustrative)

```md
---
name: api-validation
description: Input validation rules for API handlers.
activation:
  when:
    file_context:
      paths: ["src/api/**/*.{ts,tsx}"]
---

Validate every request body with the shared schema helpers.

<!-- acf:include path="references/error-format.md" -->
```

Cursor writer: `.cursor/rules/acf__<cap>__api-validation.mdc` with `description`, `globs: "src/api/**/*.ts,src/api/**/*.tsx"`, `alwaysApply: false`, include inlined. Claude writer: `.claude/rules/acf/<cap>__api-validation.md` with `paths: ["src/api/**/*.{ts,tsx}"]`, `description` kept (ignored by Claude), include inlined. Codex writer: no native vehicle; skipped with `lossy` unless the hook shim is enabled.

### 2.6 Size of the core

Portable core: one identity field, one optional metadata field, a four-value activation enum (`always`, `files` via `file_context.paths`, `model`, `manual`), one glob list, one include directive, plus the existing `assets`/`only`/`except`. The ACF runtime tier keeps three triggers and five knobs. Nothing else met the two-tool rule.

---

## 3. Field-level support tables

Carrier rule used in every cell: a writer emits into a file the host already selects and never creates a file that would shadow an existing one (§4 C3). "Marker" means an ACF-owned marked region in a shared file (SPEC §22.7 named-region ownership). `<f>` is `<capability>__<instruction>`.

### 3.1 Primary targets and formats

| Row | Claude | Codex | Copilot CLI | VS Code (Local) | Cursor | Gemini CLI | OpenCode | Pi | Agent Plugins 1.0 |
|---|---|---|---|---|---|---|---|---|---|
| R1 `always`, user scope | N `~/.claude/rules/acf/<f>.md`, no `paths` | N marker in selected `$CODEX_HOME/AGENTS.override.md` or `AGENTS.md` | N marker in `~/.copilot/copilot-instructions.md` | D personal files live in profile storage (path UNKNOWN); Agent Host shares Copilot's file [a] | U User Rules are UI-only; T only via user-installed Cursor-native plugin | N marker in `~/.gemini/<context.fileName>` (default `GEMINI.md`) [b] | N `~/.config/opencode/opencode.json` `instructions[]` entry to caplet-owned file | N marker in selected `~/.pi/agent` candidate | n/a (no scopes) |
| R2 `always`, project scope | N `.claude/rules/acf/<f>.md`; never `.claude/CLAUDE.md` [c] | N marker in project-root selected file (outside `.codex/`) [d] | N marker in `.github/copilot-instructions.md` | N same file (setting-gated) or root `AGENTS.md` | N `.cursor/rules/acf__<f>.mdc`, `alwaysApply: true` | N marker in root `GEMINI.md` (or configured name) | N project config `instructions[]` entry to `.opencode/acf/instructions/<f>.md` | N marker in project-root selected candidate; loads without trust | U |
| R3 `always` inside the plugin/package | U plugin-root `CLAUDE.md` is not loaded; T opt-in plugin `SessionStart` hook `additionalContext`; default loose R1/R2 + `info` [e] | U, loose R1/R2 | ? `com.github.copilot/rules/` schema UNKNOWN; loose until verified | ? same namespace | N Cursor-native plugin `rules/`; U in Agent Plugins format (skills + MCP only) | N extension `contextFileName: [..]` | U (JS plugins only), loose | U (packages: extensions, skills, prompts, themes), loose | U; reverse-domain namespace only |
| R4 `file_context.paths` | N rule `paths`; fires on Read/Write/Edit | U; T opt-in tool-hook shim on file-path arguments; default D skip, `lossy` | N `.github/instructions/acf/<f>.instructions.md` `applyTo`; user `~/.copilot/instructions/` | N `.instructions.md` `applyTo`; fires on create/modify, D `info` (narrower) | N `globs` + `alwaysApply: false` | U (directory JIT only); T opt-in `BeforeTool`/`AfterTool` shim; default D skip | U (`instructions` globs select files, not activation); T opt-in plugin shim; default D skip | U; T only via an ACF Pi extension (not shipped); default D skip | U |
| R5 glob dialect | N list, braces native (budget) | shim evaluates canonical | T expand braces, comma-join | T expand; multi-glob grammar UNKNOWN [f] | T expand braces; comma string in project `.mdc` [g] | shim | shim | shim | n/a |
| R6 `model` | T skill, `user-invocable: false` | T skill (implicit allowed); D `info`: also `$skill`-invocable | T skill, `user-invocable: false` | N `description`, no `applyTo` | N `description`, no `globs`, `alwaysApply: false` | T skill | T skill | T skill; D `info`: also `/skill:name` | T skill in portable `skills/` (only carrier AP has) |
| R7 `manual` | T skill, `disable-model-invocation: true` | T skill + `agents/openai.yaml` `policy.allow_implicit_invocation: false` | T skill, `disable-model-invocation: true` | N no `description`, no `applyTo` | N no `description`, no `globs`, `alwaysApply: false` | T command (prompt = body); skill invocation controls UNKNOWN | T command template | T skill `disable-model-invocation: true` or prompt template | D client-dependent; skip unless client honors `disable-model-invocation` |
| R8 `description` when mode is not `model` | N kept as frontmatter; Claude ignores it | D dropped (marker has no metadata), `info` | ? unknown-key handling; omitted, `info` | D omitted (effect alongside `applyTo` UNKNOWN), `info` | N kept for `always`/files; MUST be omitted for `manual` | D dropped | D dropped (file content is injected raw, frontmatter stripped) | D dropped | n/a |
| R9 `name` | N filename | N marker id `<cap>.<name>` | N filename | N filename (`name` key is display-only; omitted) | N filename; D `info`: mention becomes `@acf__<f>` | N marker id | N filename | N marker id | N skill name when T |
| R10 include directive | N `@path` in `CLAUDE.md`; in `.claude/rules` files UNKNOWN, so T inline | T inline | N `@relative` in `copilot-instructions.md`; T inline in `.instructions.md` | T inline | T inline (`@file` is a reference, not an include) | N `@file.md` | T inline (`@` not parsed) | T inline | n/a |
| R11 `operation_input` | T `PreToolUse` shim: `additionalContext` (interrupt `never`) or `permissionDecision: deny` + reason (interrupt `always`) | T `PreToolUse` shim: context or deny + reason | T `preToolUse` shim (decision contract per hooks facet) | T `PreToolUse` shim | T `preToolUse` shim: `permission: deny` + `agent_message` (no pre-tool context) | T `BeforeTool` shim: deny reason becomes tool error | T `tool.execute.before` plugin shim | T only via ACF Pi extension | U |
| R12 `operation_result` | T `PostToolUse` `additionalContext` | T `PostToolUse` context | T `postToolUse` `additionalContext` (10 KB cap) | T `PostToolUse` `additionalContext` | T `postToolUse` `additional_context` | T `AfterTool` `additionalContext` | T `tool.execute.after` plugin shim | T only via ACF Pi extension | U |
| R13 `assistant_output` | D `Stop` hook `decision: block` + reason on the final message only; no mid-stream interrupt, `lossy` | D `Stop` continuation, `lossy` | ? | D `Stop`, `lossy` | U (response hook observational) | T partial `AfterModel` per-chunk deny/replace | ? | T only via ACF Pi extension | U |
| R14 knobs (`scope`, non-default `repeat`/`debounce`/`interrupt`) on `file_context` | D host retention (loaded once, re-loaded on demand after compaction); T via shim | shim | D host-defined | D host-defined | D re-attached per request while in context | shim | shim | shim | n/a |
| R15 ordering/precedence | additive; contradictions resolved arbitrarily | concatenated root-to-cwd | combined, explicitly no precedence | additive, explicitly no precedence | Team > Project > User, earlier wins | concatenated | combined | global, outer-to-inner | n/a |
| R16 size budget | none (guidance <200 lines) | 32 KiB combined; `warn` | hook context caps | ? | ? | ? | ? | ? | n/a |

All shim cells ("T ... shim") depend on an ACF-shipped hook runner script (SPEC §25 open question). Without it, those cells are U and the instruction is skipped with `lossy`.

### 3.2 Other inventoried tools

| Row | Amp | Windsurf Cascade | Devin Local | Cline | Roo Code | Goose | Kiro | Lume | AGENTS.md standard |
|---|---|---|---|---|---|---|---|---|---|
| R1 `always`, user | N marker `~/.config/amp/AGENTS.md` | N marker `~/.codeium/windsurf/memories/global_rules.md` (no frontmatter, 6,000 chars) | N `~/.devin/rules/<f>.md` `trigger: always_on` | N `~/.cline/rules/<f>.md`, no frontmatter | N `~/.roo/rules/<f>.md` | N marker `~/.config/goose/.goosehints` (Developer extension required) | N `~/.kiro/steering/<f>.md` `inclusion: always` | N marker `<config>/AGENTS.md` | n/a |
| R2 `always`, project | N marker in selected root file (`AGENTS.md`, fallback `AGENT.md`/`CLAUDE.md`) | N `.devin/rules/<f>.md` `trigger: always_on` (`.windsurf/rules` legacy) | N `.devin/rules/<f>.md` | N `.clinerules/<f>.md` | N `.roo/rules/<f>.md` | N marker project `AGENTS.md` or `.goosehints` | N `.kiro/steering/<f>.md` | N marker selected candidate | N root `AGENTS.md` |
| R3 in package | U (JS plugins) | U (no plugins) | N plugin `rules/*.md` and root `AGENTS.md` | T code-plugin `rules` API only | U | ? | ? `dev.kiro/` UNKNOWN; legacy power `steering/*.md` | U | U |
| R4 `file_context` | T `@` mention from root `AGENTS.md` to caplet file with `globs:`; read-triggered | N `trigger: glob` + `globs` | N `trigger: glob` | N `paths` (mentions, open tabs, visible, edited) | U; D skip | U (nested hints only); D skip | N `inclusion: fileMatch` + `fileMatchPattern` | U; D skip | U |
| R5 glob dialect | T anchoring rewrite | ? multi-glob and anchoring UNKNOWN; `warn` | ? | N braces, classes | n/a | n/a | N string or list; braces ? | n/a | n/a |
| R6 `model` | T skill | N `trigger: model_decision` + `description` | N `model_decision` | T skill | T skill | T skill | N `inclusion: auto` + `name` + `description`; D `info`: also slash-invocable | T skill | U |
| R7 `manual` | U (skills not user-invocable since 2026-05-06); D skip | N `trigger: manual` (`@name`) | N `manual` | T skill; model-invocation control UNKNOWN, D | T skill; D | T recipe/skill; D | N `inclusion: manual` (`#name`, `/name`); CLI V1/V2 manual-only D | T skill `disable-model-invocation: true` | U |
| R8 `description` non-model | D dropped | N kept | N kept | ? | ? | D dropped | N kept | D dropped | U |
| R9 `name` | N filename | N filename | N filename | N filename | N filename (case-insensitive sort) | N marker id | N filename (`name` only required for `auto`) | N marker id | U |
| R10 include | N `@path` | ? T inline | ? T inline | T inline | T inline | N `@relative-file` | N `#[[file:path]]`, workspace-root-relative | T inline | T inline |
| R11/R12 operation triggers | ? (JS plugin hooks) | T hooks `additionalContext` (exit 2 blocks) | T hooks | T hooks `contextModification` (50,000 chars) | U | D `PreToolUse` block only; other events observational | D exit-0 context only on session/prompt events; block on `PreToolUse` | U (observer hooks) | U |
| R13 `assistant_output` | ? | U | U | ? | U | D `Stop` block | ? | U | U |
| R15 ordering | workspace setting before personal/repository | UNKNOWN | additive | workspace over global | basename sort; project over global | local over global | workspace over global | global, outer-to-inner | closest file wins |
| R16 size | ? | 12,000 per rule, 6,000 global; `error` above | ? | 50,000 context modification | ? | ? | ? | 65,536 bytes, whole files dropped; `warn` | n/a |

### 3.3 Footnotes

- [a] VS Code Local personal instructions are profile storage (directory UNKNOWN); Copilot Agent Host reads `~/.copilot/copilot-instructions.md`. Emitting the Copilot carrier covers Agent Host only.
- [b] Gemini reads only the names configured in `context.fileName`; the writer must read settings to choose the carrier and must not write `settings.json`.
- [c] `.claude/CLAUDE.md` counts as a project `CLAUDE.md` and stops Claude from reading the repository's `AGENTS.md` under the default `instructionFiles` setting. `.claude/rules/` files do not (verified). Rules also give one whole-file artifact per instruction instead of a marker.
- [d] Codex loads one file per directory from project root to cwd; `.codex/AGENTS.md` is not in that chain, so the current project install root is the wrong carrier.
- [e] A Claude plugin has no instruction component. The `SessionStart` carrier keeps instructions under the plugin's enable/disable lifecycle but changes placement (injected context, not memory files) and requires hook trust; the loose-file default keeps memory placement but survives `/plugin disable` (§4 C17).
- [f] VS Code documents `applyTo` as a glob string; whether it accepts comma-separated lists like Copilot CLI is not stated.
- [g] Cursor documents comma-separated `globs` for project rules and arrays for plugin rules; the current writer emits a YAML array into project `.mdc` (unverified).

---

## 4. Conflicts that must not be unioned

| # | Conflict | Evidence | Handling |
|---|---|---|---|
| C1 | **Model-decided rules versus ACF Axiom 10.** ACF says inactive instructions cost zero tokens and are not rulebook entries; four tools natively advertise rule descriptions. | `CONTEXT.md` Axiom 10, SPEC §12.4; Cursor, Windsurf/Devin, Kiro, VS Code | Explicit canonical choice: add `activation: model` as a separate value whose contract states the description cost; amend Axiom 10 so the zero-token guarantee covers `manual` and `when` only. Do not fold `model` rules into skills on import: the round trip would change family. |
| C2 | **`description` changes activation in Cursor, is pure metadata in ACF and Claude, is mandatory for Kiro `auto`.** Emitting ACF's required description into a Cursor manual rule turns it into "Apply Intelligently". | Cursor rule anatomy; Claude ignores non-`paths` keys | Activation is explicit in `activation`; `description` becomes optional metadata. Cursor/VS Code writers derive presence from the mode; readers derive the mode from the native combination. |
| C3 | **Inverted file-selection precedence.** Claude reads `CLAUDE.md` before `AGENTS.md`; OpenCode reads `AGENTS.md` before `CLAUDE.md`; Codex, Pi and Lume let `AGENTS.override.md` shadow `AGENTS.md`. Creating a new file can silently disable the user's existing instructions for another host. | §1.1 M7 | Writers never create a carrier that shadows an existing file for any selected target; they write into the host-selected file, or into non-shadowing carriers (`.claude/rules/`, OpenCode `instructions[]`, Cursor `.mdc`). `warn` `acf.adapter.instruction-carrier-shadowed` when the only native carrier would shadow. |
| C4 | **Conflict precedence between instructions** is earlier-wins (Cursor), workspace-wins (Kiro, Cline, Roo, Goose), deeper-later (Codex, Pi), or explicitly none (Copilot, VS Code). | §1.1 M10 | No canonical precedence. `priority`/`before`/`after` stay reserved (SPEC §15). Emission order is deterministic (scope, capability, instruction) and documented as non-semantic. |
| C5 | **ACF scope shadowing versus additive hosts.** ACF project scope shadows user scope per `(family, name)`; every host loads both user and project instructions. | SPEC §2, §17; all tools | Caplet cannot suppress a user-scope file for one project. When the same `(capability, instruction)` resolves in both scopes, emit `warn` `acf.capability.instruction-shadow-unenforceable` and require an explicit choice before emission rather than claiming shadowing. |
| C6 | **Hosts read each other's files.** `AGENTS.md` is read by about fourteen hosts; `CLAUDE.md` by Claude, Copilot, VS Code, OpenCode (fallback), Pi (fallback), Amp (fallback), Devin, Lume; `.claude/rules/` by Claude and VS Code; `GEMINI.md` by Gemini and Copilot; `.cursor/rules/` by Cursor and Devin (`read_config_from`, default on); `.windsurfrules` by Windsurf, Devin, Cline; `~/.claude/CLAUDE.md` by Claude, OpenCode, Devin. Emitting per target can load one instruction twice in one host. | tool inventories | An emission planner computes each selected host's read set over planned and existing files and chooses carriers so each selected host loads each instruction once; residual duplicates in unselected hosts get `info` `acf.adapter.instruction-duplicate-load`. Open design decision (Q1). |
| C7 | **`@path` means import in Claude, Amp, Copilot, Gemini, Goose and plain text in Cursor, OpenCode, Pi, Codex.** In a foreign `AGENTS.md` the meaning depends on which host reads it. | §1.1 M6 | Canonical uses the explicit `acf:include` directive. Readers convert only from files whose host contract is eager import (`CLAUDE.md`, `GEMINI.md`, `.goosehints`, Kiro steering); `@` in `AGENTS.md` and `.mdc` stays literal with `info`. |
| C8 | **"rules" homonyms**: Codex `.rules` execution policy, Gemini policy TOML. | §1.3 | Never read as instructions; routed to the permissions facet. |
| C9 | **Spelling traps**: Kiro `auto` means model-decided, not always-on; Devin `agent` versus `model_decision` is undocumented. | Kiro steering; Devin rules reference | `auto` maps to `model`. `agent` is not unioned: kept raw in `targets.devin` and skipped elsewhere with `lossy` until the distinction is known. |
| C10 | **`name`**: ACF slug identifier; Kiro identifier; VS Code display label. | VS Code instructions frontmatter | Canonical `name` is the identifier. VS Code display `name` goes to `targets.vscode.name` (ACF reserves `title`/`displayName`, SPEC §15). |
| C11 | **File-trigger breadth**: Claude fires on Read/Write/Edit; VS Code on create/modify; Amp on read; Cline on mentions, open tabs, visible files and edits; Cursor on files in context; Windsurf on read/edit. | inventories, verified for Claude | No tool lets authors choose breadth, so it is a host property, not a field. Canonical meaning is the abstract one; writers report narrower hosts with `info` and never claim breadth parity. |
| C12 | **Glob anchoring and spelling**: Amp implicitly prefixes `**/`; Kiro include paths are workspace-root-relative while ACF includes are file-relative; Copilot and Cursor comma-join; braces may contain commas. | §2.3 | Pinned canonical dialect; writers rewrite (expand, re-anchor) and report `info` `acf.adapter.glob-rewritten`; unknown grammars get `warn`. |
| C13 | **Fail-open parsing**: invalid rule YAML makes Claude load the rule unconditionally and Cline keep raw content active. A malformed file-scoped rule becomes always-on. | Claude memory doc (verified); Cline rules | Writers validate rendered frontmatter before emission (`error` on failure). Readers report invalid native frontmatter as `error`, never import it as `always`. |
| C14 | **Empty glob list**: Cline `paths: []` means never; ACF requires non-empty `paths`. | Cline rules | Reader emits `warn` and imports the file as disabled raw content in the native remainder, not as canonical activation. |
| C15 | **Surface wording**: SPEC §12.4 requires `always` to be system-surface and immutable; hosts inject memory as reminders or first turns, re-inject after compaction (Claude), or place it in the system prompt every message (Windsurf). | SPEC §12.4; Claude doc | Canonical meaning becomes "session-initial ambient context with stable content"; role placement is a host property recorded in the registry, not a MUST the writers cannot keep. |
| C16 | **Fallback to always-on**: SPEC §22.4 lets adapters fall back to always-on for unsupported triggers; SPEC §22b forbids it for direct consumers. | SPEC §22.4, §22b | One rule for both: never broaden (§2.2 rule 3). |
| C17 | **Plugin lifecycle**: Claude, Codex, Agent Plugins, Pi and OpenCode packages cannot carry instructions; loose instruction files stay active when the plugin is disabled. | §1.1 M9; advisor §§4-5 | Status reports loose instruction carriers separately from plugin state. For Claude, an opt-in `SessionStart` carrier inside the plugin trades placement for lifecycle (footnote [e]). |
| C18 | **Hook-translated triggers inherit hook contracts** (exit-code meanings, deny precedence, Codex `ask` unimplemented, concurrent handlers, context caps). | hooks inventories | Instruction translation uses only two hook effects: context injection and deny-with-reason. Shim failure leaves the operation running (guidance, not enforcement). SPEC §12.14 `no-rm-rf` presents an instruction as a guard; enforcement belongs to hooks. |
| C19 | **Restricting extras**: Roo mode-scoped rules and Devin `agent` narrow activation; dropping them on another target broadens it. | Roo instructions | Extras declare whether they restrict activation. Restricting extras make other writers skip the instruction with `lossy`; non-restricting extras (Copilot `excludeAgent`, VS Code `name`) are dropped with `info`. |

---

## 5. Per-target extras and lossless round trips

### 5.1 Mechanism

Two layers, matching the advisor's envelope:

1. **Typed extras** in `targets.<target>` frontmatter for tool-only semantics a user may author. Each target gets its own schema; a target with nothing tool-only gets no instruction schema.
2. **Native remainder** in the package provenance envelope, not in frontmatter: original bytes, unknown frontmatter keys, spelling variants, file extension and carrier identity. Unchanged same-format packages are copied byte-for-byte; modified ones are regenerated from canonical + typed extras, and the remainder is re-attached only while the file's identity (path and name) is unchanged.

Spelling variants recorded in the remainder (formatting, not semantics): Claude `paths` list versus comma string; Cursor `globs` string versus list and `.md`/`.mdc`/`.markdown` extension (project rules ignore `.md`, plugins accept it); Copilot `applyTo` comma string; Kiro `fileMatchPattern` string versus list; `AGENTS.md` versus `agents.md` (Windsurf); marker placement inside a shared file.

### 5.2 Typed extras per tool

| Target | Extra (canonical home) | Restricts activation | Other targets | Round trip |
|---|---|---|---|---|
| copilot | `targets.copilot.excludeAgent: code-review \| cloud-agent` | no (surfaces exist only in Copilot) | dropped, `info` | written back to `.instructions.md` frontmatter |
| vscode | `targets.vscode.name` (display label) | no | dropped, `info` | written back to frontmatter |
| devin | `targets.devin.trigger: agent` | yes | skipped, `lossy` | written back as `trigger: agent` |
| roo | `targets.roo.mode: <slug>` | yes | skipped, `lossy` | emitted to `.roo/rules-<slug>/` |
| cline | none for files (`whenToolAvailable` is code-plugin only; `paths: []` is remainder) | - | - | remainder |
| opencode | capability-level `targets.opencode.instructions: [<url>]` (remote instructions; no body) | no | dropped, `info`; caplet never fetches | written back to `instructions[]` |
| kiro | none; line/range/folder references stay literal body text | - | `info` that Kiro-only reference syntax is text elsewhere | body bytes |
| amp | none; glob mentions and `@~/` imports stay literal | - | `info` | body bytes |
| claude | none; external `@~/` or absolute imports stay literal | - | `info` | body bytes |
| cursor, windsurf, gemini, codex, pi, goose, lume | none (all instruction semantics map to core) | - | - | remainder only |

Current `packages/core/src/targets/extensions.ts` `instructionExtension` (`globs`, `paths`, `alwaysApply`, `ruleType`, `triggers`, identical for all five targets) restates canonical activation, contradicting SPEC §7.1. It should be replaced by the table above.

### 5.3 Reader scope (what counts as instruction content)

| Source format | Imported as instructions | Not imported (kept in the native snapshot) |
|---|---|---|
| Native ACF | `instructions/` | - |
| Claude plugin | none (no component) | plugin-root `CLAUDE.md`/`AGENTS.md` (repository docs; Claude does not load them) |
| Bare skill repository | none | root `AGENTS.md`/`CLAUDE.md` |
| Agent Plugins 1.0 | none portable; known client namespaces once their schemas are verified | unknown namespaces |
| Cursor-native plugin | `rules/*.{mdc,md,markdown}` (or manifest `rules`) | - |
| Gemini extension | `contextFileName` files as `always` | - |
| Devin plugin | root `AGENTS.md` as `always`; `rules/*.md` by `trigger` | - |
| Kiro legacy power | `steering/*.md` by `inclusion` | `POWER.md` body (power-level guidance; activation semantics differ) |

---

## 6. Delta versus current ACF

### 6.1 Exists and stays

- Two source shapes, `name` = basename, `assets`, `only`/`except`, `targets` slot (SPEC §12.1-12.2).
- `activation: always` and `activation.when` with ORed triggers, `file_context.paths`, regex `conditions`, knobs and defaults (SPEC §12.3-12.12; `model.ts` `InstructionActivation`, `triggerInterruptDefaults`).
- Reserved `priority`/`before`/`after` (SPEC §15).

### 6.2 Changes

| Area | Today | Change |
|---|---|---|
| SPEC §12.2, `schemas/index.ts` `instructionFrontmatterSchema`, `model.ts` | `description` required | optional; required when `activation: model` |
| SPEC §12.3, schema, `model.ts` | `"always" \| { when }` | add `"model"` and `"manual"`. New enum values fail older readers, so this needs the SPEC §15 versioning decision (Q10). |
| SPEC §12.4, `CONTEXT.md` Axiom 10 | system-surface MUST; zero tokens for all non-always | session-initial stable context; zero-token guarantee for `manual` and `when` only |
| SPEC §12.8 | glob syntax not enumerated | pin dialect (§2.3) |
| SPEC §22.4 | trigger-level `full/partial/none`; MAY fall back to always-on | per-mode, per-scope, per-carrier contract table derived from the registry; never broaden |
| `registry.ts` `mappings.instructionTriggers` | claims unsupported by code or tools: Claude `operation_input`/`file_context` full; Codex `operation_input`/`file_context` full; OpenCode `operation_input` full; Pi `instruction: full`, `assistant_output`/`operation_input` full; Cursor `file_context` partial | granular entries per row of §3 (activation mode, scope, carrier, shim requirement, minimum tested client version). Pi and Codex have no native file-scoped or runtime-trigger instructions; Cursor is native for all four core modes. |
| `extensions.ts` `instructionExtension` | shared schema restating canonical fields | per-target schemas from §5.2 |
| `emitter.ts` `layoutFor` / `emitInstructions`, Claude | `always` to marker in `<installRoot>/CLAUDE.md` (project: `.claude/CLAUDE.md`, which suppresses `AGENTS.md`); triggered to `.claude/.acf/instructions/*.md`, which Claude never reads, with no diagnostic for "full" triggers | `.claude/rules/acf/<f>.md` for `always` and `file_context`; skills for `model`/`manual`; shims or `lossy` for runtime triggers |
| `emitter.ts`, Codex/OpenCode/Pi | **every** instruction, including `always`, written to `<installRoot>/.acf/instructions/<name>.md`, which none of these hosts reads; no diagnostic for `always` or "full" triggers (instructions silently not applied) | Codex and Pi: marker in the host-selected `AGENTS*` file (project root, not install root); OpenCode: `instructions[]` config entries |
| `emitter.ts`, Cursor | `always` dropped with `lossy` although `alwaysApply: true` is native; `file_context` emitted without `alwaysApply: false`, globs as YAML array; user scope written to `~/.cursor/rules`, which Cursor does not read | native `.mdc` for all four modes; comma-string globs after brace expansion; user scope `lossy` unless a Cursor-native plugin carrier is chosen |
| `renderInstructionFile` | `<!-- acf:activation ... -->` comment appended to a dead file | removed |
| SPEC §23, `CONTEXT.md` aliases | rule, ambient context, rulebook entry | add steering (Kiro), custom instructions (Copilot), context files (Gemini), hints (Goose), memory (Claude) |

### 6.3 New

- Include directive with validation codes `acf.instruction.include-outside-capability`, `acf.instruction.include-cycle`, `acf.instruction.include-depth`.
- Carrier selection and planner (C3, C6) with `acf.adapter.instruction-carrier-shadowed` (`warn`), `acf.adapter.instruction-duplicate-load` (`info`), `acf.adapter.instruction-budget` (`warn`/`error`), `acf.adapter.instruction-outside-plugin` (`info`), `acf.adapter.instruction-mode-translated` (`info`), `acf.adapter.instruction-broadening` (`error`, never emitted silently), `acf.adapter.glob-rewritten` (`info`), `acf.capability.instruction-shadow-unenforceable` (`warn`). These sit under existing SPEC §14.6 namespaces.
- Instruction-to-skill and instruction-to-command translation for `model`/`manual`, reusing the skills and commands writers.
- Foreign readers: Cursor rules (project and plugin), Claude `.claude/rules`, Copilot `.instructions.md` and `copilot-instructions.md`, Windsurf/Devin rules, Kiro steering, Gemini `contextFileName`, Devin plugin `AGENTS.md`.
- New target ids needed for extras and writers: `copilot`, `vscode`, `gemini`, `windsurf`/`devin`, `kiro`, `cline`, `roo`, `amp`, `goose`, `lume`.
- Hook-runner shim for runtime triggers and for `file_context` on hosts without glob rules (shared with the hooks facet; SPEC §25).

---

## 7. Open questions and unverified claims

| # | Question | Why it matters |
|---|---|---|
| Q1 | Carrier strategy for multi-target projects: one shared `AGENTS.md` marker read by many hosts, or per-host carriers with a duplicate-load planner? A shared carrier depends on observed state (a later `CLAUDE.md` silently removes it for Claude); per-host carriers duplicate in cross-reading hosts. | C3, C6 |
| Q2 | Claude plugin carrier: loose `.claude/rules` (memory placement, survives plugin disable) or plugin `SessionStart` hook (plugin lifecycle, hook trust, different placement)? | C17, user goal of a real Claude plugin |
| Q3 | Do `@path` imports expand inside `.claude/rules/*.md` files? The doc describes imports for `CLAUDE.md`. | R10 Claude |
| Q4 | Copilot/VS Code Agent Plugins `com.github.copilot/rules/` file schema and activation; Kiro `dev.kiro/` steering layout. | R3; whether Agent Plugins outputs can carry instructions at all |
| Q5 | Cursor: are YAML-array `globs` valid in project `.mdc`? Brace support? Can every rule be `@`-mentioned, making `model`/`files` rules also manual? | R4, R5, current writer |
| Q6 | Copilot CLI: does an `.instructions.md` without `applyTo` apply always, never, or manually? Is `description` read? | R2/R4/R8 Copilot |
| Q7 | VS Code: multi-glob grammar of `applyTo`; effect of `description` together with `applyTo`; whether `.claude/rules` reading is setting-gated. | R5, R8, C6 |
| Q8 | Windsurf/Devin: `globs` array support and anchoring; `agent` versus `model_decision`. | R5, C9 |
| Q9 | Version floors: locally installed Claude is 2.1.97 (advisor), while direct `AGENTS.md` reading needs 2.1.277+ and brace-budget fixes are 2.1.217+. The registry needs a minimum tested client version per row. | R2, R5 Claude |
| Q10 | Versioning: are new `activation` values and optional `description` acceptable within `acf: 1` under SPEC §15, or do they require `acf: 2`? | §6.2 |
| Q11 | Naming of translated skills/commands (`<instruction>` versus `<capability>__<instruction>`) and collisions with real skills of the same capability. | R6, R7 |
| Q12 | Should Pi `APPEND_SYSTEM.md` (true system surface, trust-gated, single file where project shadows global) ever carry `always` instructions? Proposed: no; it is a shadowing single-owner file. | C3, C15 |
| Q13 | Local/private scope (`CLAUDE.local.md`, Devin `AGENTS.local.md`, Claude `local` install scope) has no ACF scope. | M8 |
| Q14 | Should caplet ever write nested `<dir>/AGENTS.md` to realize `file_context` with a single directory prefix on Codex, Pi, Gemini or Goose? It writes outside install roots and only works when the session cwd is inside `<dir>` (Codex, Pi). Proposed: no. | R4 |
| Q15 | ACF hook-runner shim: without it, every runtime-trigger cell and every shim-based `file_context` cell is U. | R4, R11-R14 |
| Q16 | OpenCode: project config path for `instructions[]` and nested-loader behavior are not traced (inventory flags this as the next research priority). | R2, R4 OpenCode |

Unverified or post-cutoff claims this facet relies on:

- Kiro steering details (modes, `#[[file:]]` forms) come from pages updated 2026-10-06, after the snapshot; CLI V1/V2 load only `always` automatically.
- Amp manual activation: skills lost user invocation in the 2026-05-06 rebuild; no documented manual rule mechanism.
- Gemini skill user-invocation controls are not documented in the inventory; manual is mapped to a command.
- Copilot hook context caps (10 KB `postToolUse`) and Codex `additionalContextLimit` spill behavior affect R11-R12 body sizes.
- Claude facts in §0 are from the rolling doc, which documents releases after the snapshot; behavior on the locally installed 2.1.97 is not established.
