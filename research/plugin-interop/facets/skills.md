# Skills facet: cross-tool comparison and canonical design (snapshot 2026-10-01)

Scope: `SKILL.md` frontmatter and its per-tool variants, body placeholder dialects, bundled files, invocation (model vs user), `allowed-tools`, per-tool sidecar metadata files, discovery roots and precedence, and plugin packaging of skills. Agent-side skill preloading (Claude agent `skills`, Cline agent `skills`, Lume role `skills`, Kiro `skill://` resources) and command-to-skill migration are cross-references only; they belong to the agents and commands facets.

Evidence: the tool inventories in `../tools/*.md` (each states its own evidence baseline), the ACF sources listed in section 6, and two checks made for this document:

- Claude Code skills reference, re-fetched 2026-10-01 (`https://code.claude.com/docs/en/skills`): confirmed `$N`/`$ARGUMENTS[N]` are 0-based, `allowed-tools` grants last for the invoking turn only, `user-invocable: false` also blocks typed `/name`, `paths` limits automatic loading, the combined `description` + `when_to_use` listing cap is 1,536 characters, and `${CLAUDE_SKILL_DIR}` is substituted in the body and in `allowed-tools` Bash rules.
- A probe of the current ACF writer (temporary `bun test` file in `packages/adapters/tests/`, removed afterwards): an authored skill with `invocation.model: false`, `license`, `allowed-tools`, `metadata`, `only: [claude]` and an unlinked `scripts/run.sh` produced, for the Claude adapter, `.agents/skills/demo/SKILL.md` and `.claude/skills/demo/SKILL.md` containing only `name`, `description`, `invocation: {model: false}` and `only: [claude]`; no script; zero diagnostics. Details in section 6.

Tool abbreviations used in the tables:

| Code | Tool / format | Code | Tool / format |
|---|---|---|---|
| AS | Agent Skills open standard (format) | AM | Amp |
| AP | Agent Plugins 1.0 (package format) | WS | Windsurf Cascade (Devin Desktop) |
| CC | Claude Code | DL | Devin Local (Devin CLI) |
| CX | Codex | CL | Cline (ordinary lane; AP lane noted) |
| CP | GitHub Copilot CLI | RO | Roo Code |
| VS | VS Code agent customization | GO | Goose |
| CU | Cursor | KI | Kiro |
| GE | Gemini CLI | PI | Pi |
| OC | OpenCode | LU | Lume |

---

## 1. Concept map

Each row is one meaning. Spellings are verbatim native keys; "none" means the tool has no carrier for that meaning.

### 1.1 Identity and discovery text

| Meaning | Spellings |
|---|---|
| Stable identifier used for invocation and collision | `name` (AS, AP, CC, CX, CP, VS, CU, GE, OC, AM, WS, CL, RO, GO, KI, PI, LU). DL: the **directory name** is the identifier; DL `name` is a display name. CC and PI default/derive from the directory; GE sanitizes `: \ / < > * ? " \|` to `-`; CP accepts letters, digits, `-`, `_`, `.`, `:` and spaces. |
| User-facing label distinct from the identifier | CX `agents/openai.yaml` `interface.display_name`; DL `name`. (Kiro legacy `POWER.md` `displayName` is package-level, not skill-level.) |
| Model-facing "what it does and when to use it" | `description` everywhere. Required by AS and most tools; optional in CC (falls back to first body line), DL (slash-completion text), GO (defaults to `""`), OC runtime (skill then not advertised). |
| Additional activation guidance appended to the description | CC `when_to_use`. Every other tool expresses the same meaning inside `description`. |
| User-facing short summary for UI (not model selection) | CX `interface.short_description` only. |

### 1.2 Standard informational metadata

| Meaning | Spellings |
|---|---|
| License | `license` (AS, AP, CC, CX, CP guide, KI, PI, CL AP lane; accepted-but-ignored in GE, OC, RO, GO, LU) |
| Environment requirements in prose | `compatibility` (AS, AP, CC, CX, KI, PI, CL AP lane; ignored elsewhere). Not target applicability. |
| Arbitrary key/value metadata | `metadata` (AS/AP `map<string,string>`; CC object, non-objects discarded; CU mapping; GO `map<string,JSON>`; KI, PI, CL AP lane string map). GO reserves `metadata.argument-hint` and `metadata.arguments`. |

### 1.3 Invocation control

| Meaning | Spellings |
|---|---|
| Model may select the skill automatically (default on) | CC, CP, VS, CU, PI, LU: `disable-model-invocation: true` turns it off. CX: `agents/openai.yaml` `policy.allow_implicit_invocation: false`. DL: `triggers` list without `model`. |
| User may invoke the skill explicitly (default on) | CC, CP, VS: `user-invocable: false` turns it off (CC also refuses typed `/name`; VS hides it from the slash menu; CP disables `/NAME`). DL: `triggers` list without `user`. |
| Explicit user invocation syntax (not a field) | `/name` (CC, CP, VS, CU, CL, KI, DL); `$name` or `/skills` (CX); `/skill:name` (PI, LU); `@name` (WS); `/skills name` (GO); none documented (GE, OC, AM since 2026-05-06, RO). Plugin-qualified: `/plugin:name` (CC, VS, DL), `/plugin/name` (CP), `plugin:name` (AM, GO). |

### 1.4 Arguments

| Meaning | Spellings |
|---|---|
| UI hint for expected arguments | `argument-hint` (CC, CP, VS, DL); GO `metadata.argument-hint`. |
| Ordered argument names for named substitution | CC `arguments` (space-separated string or list); GO `metadata.arguments` (string[]). |
| Whole argument string in body | `$ARGUMENTS` (CC, GO, KI CLI). |
| Indexed argument in body, 0-based | `$ARGUMENTS[N]` (CC, GO). |
| Indexed shorthand | `$N`: **0-based in CC**, **1-based in GO**. Same spelling, contradicting meaning (section 4). |
| Named argument in body | `$name` (CC, GO), resolved through the argument-name list. |
| No-placeholder fallback | CC appends `ARGUMENTS: <text>`; GO appends `ARGUMENTS: <raw>`; PI appends `User: <args>`; RO renders "Provided arguments"; others undocumented. Host behavior, not a field. |

### 1.5 Activation scope and execution

| Meaning | Spellings |
|---|---|
| Only auto-activate when working with files matching globs | CC `paths` (comma string or list); CU `paths` (string or list; legacy `globs` accepted as fallback). |
| Restrict to agent modes/roles | RO `modeSlugs`/`mode`/`skills-{mode}/` directory; LU role `skills` selector (role side). Different meaning from `paths`. |
| Run the skill in a separate subagent context, returning its result | CC `context: fork`; VS `context: fork` (requires `github.copilot.chat.skillTool.enabled`); DL `subagent: true` (experimental). |
| Which agent profile runs the forked skill | CC `agent` (with `context: fork`); DL `agent` (overrides `subagent`, implies subagent execution). |
| Run forked skill in background | CC `background` only. |
| Model override for the skill | CC `model` (alias, full id, `inherit`); DL `model` (CLI `--model` aliases). Same meaning, target-owned value vocabularies. |
| Reasoning effort override | CC `effort` only. |
| Shell used for body command interpolation | CC `shell` only. |

### 1.6 Tools and permissions

| Meaning | Spellings |
|---|---|
| Pre-approve listed tools while the skill is active (never restricts availability) | `allowed-tools`: AS/AP (experimental; space-separated string, not an array), CC (space/comma string or list; grant lasts for the invoking turn), CP (comma string or list; "while active"; `"*"` = all), DL (list; inline execution only, ignored when run as subagent), PI (declared; not enforced), CL AP lane (parsed; enforcement unknown). |
| Remove tools from the available pool while active | CC `disallowed-tools` only (skill-level). |
| Allow/deny/ask permission scope while active | DL `permissions.{allow,deny,ask}` only. |
| Make plugin-registered tools visible only after the skill loads | AM `builtin-tools`; AM `includeTools` (documented for skill MCP, absent from settings schema). |
| Skill-lifetime hooks | CC `hooks` (persist for the session after invocation). |

### 1.7 Dependencies and sidecars

| Meaning | Spellings |
|---|---|
| Skill depends on / brings an MCP server | CX `agents/openai.yaml` `dependencies.tools[]` with `type: mcp`, `value`, `transport` (`streamable_http`), `url`, `description`; AM frontmatter `mcpServers` map or sibling `mcp.json` bare map (frontmatter wins), servers connect at discovery and their tools stay hidden until the skill loads. |
| UI branding | CX `interface.icon_small`, `icon_large` (file paths), `brand_color` (hex); CU `icon` (name from Cursor's icon set), `color` (10-value enum). Different value domains. |
| Suggested surrounding prompt | CX `interface.default_prompt` only. |
| Per-skill sidecar metadata file | CX `agents/openai.yaml`; AM sibling `mcp.json`. OC `.opencode-version` is generated cache state, not authored. None documented for the other tools. |

### 1.8 Body and bundled files

| Meaning | Spellings |
|---|---|
| Skill directory path in body | CC `${CLAUDE_SKILL_DIR}`; AM `{baseDir}`. Others: paths relative to the skill root (AS convention); GO resolves files from the skill dir but runs shell in the session cwd. |
| Pre-model shell interpolation | CC `` !`cmd` `` and ` ```! ` blocks only. |
| File inclusion syntax | CC `@path`; VS `#file:./path` and Markdown links relative to `SKILL.md`. |
| Other host variables | CC `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${user_config.KEY}`. |
| Bundled resources | `scripts/`, `references/`, `assets/` plus arbitrary files: a convention everywhere (AS, AP, CC, CX, CP, VS, CU, GE, OC, AM, WS, DL, CL, RO, GO, KI, PI, LU). No tool declares them in a manifest. GE grants read access to the whole directory on activation; AP requires everything to resolve inside the plugin root. |

---

## 2. Proposed canonical ACF core schema

### 2.1 Rules applied

1. A field enters the core when at least two tools carry the same meaning, or when every writer can express it without loss by a declared translation (one case: `when-to-use`).
2. Where Agent Skills defines a field, the core keeps the Agent Skills spelling verbatim, so an ACF `SKILL.md` stays a valid Agent Skill for its standard fields.
3. Multi-word ACF-introduced keys use kebab-case, matching the Agent Skills style (`allowed-tools`) and the majority native spelling (`argument-hint`).
4. A field whose meaning is shared but whose **value vocabulary is owned by each tool** (model ids, raw tool-permission strings) is not a core field; it is a per-target extra (section 5). A core field must be writable by every writer from its value alone.
5. Every core field has exactly one meaning; host-specific side effects (for example CC `disable-model-invocation` also blocking subagent preload) are host behavior, documented in section 3, not separate fields.

### 2.2 Field table

| Canonical field | Type / enum | Default | Meaning | Origin tools |
|---|---|---|---|---|
| `name` | slug `^[a-z0-9]+(-[a-z0-9]+)*$`, 1-64 chars, MUST equal the skill directory name | required | Stable identity for invocation, collision and references. Unchanged from SPEC §9.2. | all |
| `display-name` | string, 1-64 chars | absent | User-facing label; never used for identity or invocation. | CX `interface.display_name`, DL `name` |
| `description` | string, 1-1024 chars | required | Model-facing description of what the skill does and when to use it. | all |
| `when-to-use` | string | absent | Additional model-facing activation guidance. Writers without a separate carrier append it to `description`; `description` + separator + `when-to-use` MUST then fit 1024 chars. | CC `when_to_use` (rule 1 exception) |
| `license` | string | absent | License name or reference to a bundled license file. | AS, AP, CC, CX, CP, KI, PI, CL |
| `compatibility` | string, 1-500 chars | absent | Prose environment requirements. Not target applicability (that is `only`/`except`). | AS, AP, CC, CX, KI, PI, CL |
| `metadata` | map<string,string> | absent | Arbitrary informational metadata; never interpreted by ACF. Keys `argument-hint` and `arguments` are reserved (GO interprets them). | AS, AP, CC, CX, CU, GO, KI, PI, CL |
| `invocation.model` | boolean | `true` | The model may select the skill automatically. Unchanged from SPEC §9.3. | CC, CP, VS, CU, PI, LU (`disable-model-invocation`), CX (`policy.allow_implicit_invocation`), DL (`triggers`) |
| `invocation.user` | boolean | `true` | The user may invoke the skill explicitly. Unchanged from SPEC §9.3. | CC, CP, VS (`user-invocable`), DL (`triggers`) |
| `argument-hint` | string | absent | UI hint for expected arguments. | CC, CP, VS, DL, GO |
| `arguments` | list of slug | `[]` | Ordered positional argument names usable as `$<name>` in the body. Same type as command `arguments` (SPEC §11.3). | CC, GO |
| `paths` | list of glob string | absent (no file restriction) | Automatic selection is limited to work involving files matching any glob. Explicit invocation is unaffected. | CC, CU |
| `context` | enum `inline` \| `fork` | `inline` | `fork`: the skill runs in a separate subagent context and only its result returns. | CC, VS, DL (`subagent`) |
| `agent` | string reference | absent | Agent that runs a forked skill. Valid only with `context: fork`. Resolves like command `agent` (SPEC §11.4): same-capability agent facet, sibling capability, then target-native agent id. | CC, DL |
| `allowed-tools` | list of canonical permission expressions (2.4) | `[]` | Tools pre-approved (no prompt) while the skill is active. Never restricts availability. The grant window is host-defined (CC: invoking turn; CP: while active; DL: inline only). | AS, AP, CC, CP, DL, PI, CL |
| `requires.mcp` | list of MCP server names from the same capability's `mcp/mcp.yml` | `[]` | The skill depends on these servers. Provisional: see section 7. | CX (`dependencies.tools`), AM (`mcpServers`) |

ACF structural keys, unchanged and never emitted into native files: `assets` (§16), `only`, `except` (§6), `targets` (§7, holds the per-target extras of section 5).

### 2.3 Body contract

The body is CommonMark. ACF defines this placeholder grammar; writers translate it per target (section 3). Everything else in the body is opaque text.

| Canonical placeholder | Meaning | Origin |
|---|---|---|
| `$ARGUMENTS` | Entire argument text | CC, GO, KI |
| `$ARGUMENTS[N]` | Argument at 0-based index N | CC, GO |
| `$<name>` for a name in `arguments` | Named positional argument | CC, GO |
| `\$` before any of the above | Literal, not substituted | CC |
| `${ACF_SKILL_DIR}` | Absolute path of the installed skill directory | CC `${CLAUDE_SKILL_DIR}`, AM `{baseDir}` |

Bare `$N` is not canonical: CC reads it 0-based and GO 1-based. A canonical body containing `$` followed by a digit outside an escape gets a `warn` diagnostic (`acf.skill.ambiguous-positional`). Readers of CC bodies rewrite `$N` to `$ARGUMENTS[N]` in the canonical projection; readers of GO bodies rewrite `$N` to `$ARGUMENTS[N-1]`. Same-format output uses the preserved original bytes (section 5.4), so this rewrite never touches a same-format round trip.

### 2.4 `allowed-tools` canonical expression grammar

Entry form: `<operation>` or `<operation>(<pattern>)`, where `<operation>` is a provisional operation id from `@caplet/runtime-taxonomy` (`shell`, `file_read`, `file_write`, `file_edit`, `web_fetch`, `web_search`, `code_search`, `doc_search`, `agent_delegate`, `task_management`, `mcp`, `context`, `any`). Patterns: `shell` takes a command glob where `*` matches any suffix (`shell(git status *)`); file operations take a path glob; `mcp` takes `<server>/<tool>` or `<server>/*`; `web_fetch` takes a domain glob. A YAML list is mandatory: AS's space-separated string cannot carry patterns that contain spaces.

Writers translate an entry only when the target has an exactly equivalent rule; otherwise they drop it with a `lossy` diagnostic. Dropping is the fail-safe direction (the user is prompted). A writer MUST NOT widen an entry. Target-native expressions that the canonical grammar cannot state go into `targets.<target>.allowed-tools` (section 5), which is additive for that target only.

### 2.5 Bundled-file contract

The skill is its whole directory. Writers transport every regular file under `skills/<name>/` with its executable bit, excluding only VCS metadata directories, `node_modules`, and the reserved `ACF-MANAGED.md`. Symbolic links and special files produce an `error` (not a silent omission). Hidden files are transported (Agent Skills does not exclude them); this departs from SPEC §3.2 for skill directories only. `assets:` remains the mechanism for files outside the skill directory.

---

## 3. Field-level support table

Cell codes: `N` native, same spelling; `N:x` native under spelling `x`; `N0` native carrier accepted but no runtime effect (emit verbatim, no diagnostic); `T:x` translated as described; `D:x` degraded as described, with a diagnostic; `U` unsupported, dropped with a diagnostic; `?` behavior unverified: writer treats it as `D` with an `info` diagnostic `acf.skill.field-unverified` until verified.

Degradation keys used in cells:

- **append**: `when-to-use` appended to `description` after a blank-line separator; `error` `acf.skill.description-too-long` if the result exceeds 1024 chars.
- **skip**: `invocation.model: false` cannot be enforced, so the skill is not emitted for that target; `warn` `acf.skill.invocation-unenforceable`. Emitting would let the model auto-run a manual-only workflow (fail-open). An opt-in translation to a native command belongs to the commands facet.
- **consent**: GE asks the user to approve every non-built-in skill activation, so a model-initiated activation is still human-gated; emit, `lossy`.
- **explicit-remains**: `invocation.user: false` cannot hide explicit invocation; emit, `lossy` (low risk: the user acts deliberately).
- **vacuous**: the tool has no explicit user invocation, so `user: false` already holds.
- **preamble**: arguments or placeholders without host substitution: writer keeps the body and prepends one line stating that `$ARGUMENTS`, `$ARGUMENTS[N]` and `$<name>` refer to the text the user supplied with the invocation, listing `arguments` names in order; `lossy`.
- **abs**: `${ACF_SKILL_DIR}` substituted by the writer with the absolute emitted skill path (known for loose-file installs).
- **rel**: install location unknown at write time (distributable AS/AP package, plugin caches): `${ACF_SKILL_DIR}/` replaced by a skill-root-relative path; `lossy` where the host runs shell outside the skill dir (GO).
- **desc-paths**: `paths` unsupported: the skill becomes eligible everywhere (broader activation); writer appends "Use when working with files matching: <globs>" to the description (subject to the 1024 limit); `lossy`.
- **inline**: `context: fork` unsupported: runs inline; `lossy`.
- **dex**: target-neutral AS/AP output may carry the de-facto extension keys `disable-model-invocation`, `user-invocable` (understood by CC, CP, VS, CU, PI, LU); strict consumers (CL AP lane) reject the skill, which fails closed; `info`.
- **mcp-facet**: dependency not expressible; the server still arrives through the MCP facet; `info`.

### 3.1 Formats and first group of tools

| Canonical | AS | AP | CC | CX | CP | VS | CU | GE | OC |
|---|---|---|---|---|---|---|---|---|---|
| `name` | N | N (immediate `skills/<name>/`) | N (plugin: `/plugin:name`) | N | N (wider charset accepted) | N | N | N (sanitized) | N |
| `display-name` | U | U | U | N:`interface.display_name` in `agents/openai.yaml` | U | U | U | U | U |
| `description` | N | N | N (1,536 cap incl. `when_to_use`) | N (listing budget may shorten) | N | N | N | N | N |
| `when-to-use` | T:append | T:append | N:`when_to_use` | T:append | T:append | T:append | T:append | T:append | T:append |
| `license` | N | N | N0 | N0 | N0 | ? | ? | N0 | N0 |
| `compatibility` | N | N | N0 | N0 | ? | ? | ? | N0 | N0 |
| `metadata` | N | N | N0 | N0 | ? | ? | N0 | N0 | N0 |
| `invocation.model: false` | D:dex | D:dex | N:`disable-model-invocation: true` | N:`policy.allow_implicit_invocation: false` | N:`disable-model-invocation` | N:`disable-model-invocation` | N:`disable-model-invocation` | D:consent | U:skip |
| `invocation.user: false` | D:dex | D:dex | N:`user-invocable: false` | D:explicit-remains (`$name`) | N:`user-invocable` | N:`user-invocable` | D:explicit-remains (`/name`) | N (vacuous) | N (vacuous; user skill invocation undocumented) |
| both `false` | D:dex | D:dex | N (skill unreachable; also not preloadable) | D | N | N | D | D:consent | U:skip |
| `argument-hint` | U | U | N | U | N | N | ? | U | U |
| `arguments` | U | U | N | D:preamble | ? | D:preamble | ? | D:preamble | D:preamble |
| `$ARGUMENTS`, `$ARGUMENTS[N]`, `$<name>` | D:preamble | D:preamble | N (`$ARGUMENTS`, `$ARGUMENTS[N]`, `$name`) | D:preamble | ? | D:preamble (trailing text) | ? | D:preamble | D:preamble |
| `${ACF_SKILL_DIR}` | T:rel | T:rel | T:`${CLAUDE_SKILL_DIR}` | T:abs (loose) / T:rel (plugin) | T:abs | T:abs | T:abs | T:abs | T:abs |
| `paths` | D:desc-paths | D:desc-paths | N (list) | D:desc-paths | D:desc-paths | D:desc-paths | N (`paths`; reads legacy `globs`) | D:desc-paths | D:desc-paths |
| `context: fork` | U | U | N:`context: fork` | D:inline | D:inline | N:`context: fork` (setting-gated) | D:inline | D:inline | D:inline |
| `agent` | U | U | N | U | U | ? | U | U | U |
| `allowed-tools` | N (space-joined; entries with spaces dropped) | N (as AS) | T: `shell(p)` to `Bash(p)`, `file_read` to `Read`, `file_edit` to `Edit`, `file_write` to `Write`, `web_fetch` to `WebFetch`, `web_search` to `WebSearch`, `mcp(s/t)` to `mcp__s__t`; list | N0 (AS string; enforcement unknown) | T: Copilot tool names; `any` to `"*"`; list | ? | ? | U (ignored) | U (permissions live in agent/config) |
| `requires.mcp` | U | U | D:mcp-facet | T: `dependencies.tools[{type: mcp, value, transport, url}]` (HTTP servers; stdio ?) | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet |
| Bundled files + exec bit | N | N (must resolve inside root) | N | N | N | N | N | N (activation grants dir read) | N |
| Loose shared root `.agents/skills` | n/a | n/a | not read | read (+ ancestors to repo root) | read | read | read (+ nested scoping) | read | read |
| Plugin skill packaging | n/a | `skills/<name>/SKILL.md` | Claude plugin `skills/` (+ manifest `skills` adds roots) | AP root `skills/`; legacy `.codex-plugin` `skills` | AP or legacy plugin | AP; extension `contributes.chatSkills` | AP or `.cursor-plugin` (manifest `skills` replaces default) | extension `skills/` | none (JS plugins; `skills.paths`/`skills.urls` config) |

### 3.2 Second group of tools

| Canonical | AM | WS | DL | CL | RO | GO | KI | PI | LU |
|---|---|---|---|---|---|---|---|---|---|
| `name` | N (first wins) | N | T: directory is identity; frontmatter `name` omitted or equal to directory | N | N (dir or symlink name) | N (Open Plugins install rewrites to `plugin:name`) | N | N (need not match dir) | N (strict) |
| `display-name` | U | U | N:`name` (only when emitting to a DL-exclusive carrier; see 5.2) | U | U | U | U | U | U |
| `description` | N | N | N (optional natively) | N | N | N | N | N | N |
| `when-to-use` | T:append | T:append | T:append | T:append | T:append | T:append | T:append | T:append | T:append |
| `license` | ? | ? | ? | N (AP lane) / ? | N0 | N0 | N | N | N0 |
| `compatibility` | ? | ? | ? | N (AP lane) / ? | N0 | N0 | N | N | N0 |
| `metadata` | ? | ? | ? | N (AP lane, string values) / ? | N0 | N (JSON values; reserved keys) | N | N0 | N0 |
| `invocation.model: false` | U:skip | U:skip | N:`triggers: [user]` | U:skip (UI toggle disables entirely) | U:skip | U:skip | U:skip | N:`disable-model-invocation: true` (literal `true` only) | N:`disable-model-invocation: true` (unquoted) |
| `invocation.user: false` | N (vacuous) | D:explicit-remains (`@name`) | N:`triggers: [model]` | D:explicit-remains (`/name`) | ? | D:explicit-remains (`/skills name`) | D:explicit-remains (`/name`) | D:explicit-remains (`/skill:name`) | D:explicit-remains (`/skill:name`) |
| both `false` | U:skip | U:skip | ? (`triggers: []`) | U:skip | U:skip | U:skip | U:skip | D | D |
| `argument-hint` | U | U | N | U | U | N:`metadata.argument-hint` | U | U | U |
| `arguments` | D:preamble | D:preamble | ? | D:preamble | D:preamble | N:`metadata.arguments` | ? | D:preamble | D:preamble |
| `$ARGUMENTS`, `$ARGUMENTS[N]`, `$<name>` | D:preamble | D:preamble | ? | D:preamble | D:preamble (args shown as "Provided arguments") | N (`$ARGUMENTS`, `$ARGUMENTS[N]`, `$name`) | `$ARGUMENTS` N (CLI only); indexed ? | D:preamble (`User: <args>` appended) | D:preamble |
| `${ACF_SKILL_DIR}` | T:`{baseDir}` | T:abs | T:abs | T:abs | T:abs | T:abs (required: shell runs in session cwd) | T:abs | T:abs | T:abs |
| `paths` | D:desc-paths | D:desc-paths | D:desc-paths | D:desc-paths | D:desc-paths | D:desc-paths | D:desc-paths | D:desc-paths | D:desc-paths |
| `context: fork` | D:inline | D:inline | T:`subagent: true` | D:inline | D:inline | D:inline | D:inline | D:inline | D:inline |
| `agent` | U | U | N (implies subagent) | U | U | U | U | U | U |
| `allowed-tools` | ? | ? | T: DL permission strings; list; ignored in subagent mode | N0 (AP lane parses) / ? | U (ignored) | U (not modeled) | ? (do not emit: Power Builder calls it a restriction) | N0 (declared, unenforced) | U (ignored) |
| `requires.mcp` | T: frontmatter `mcpServers` with the server's config (adds Amp's load-gated tool visibility, `warn`) | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet | D:mcp-facet |
| Bundled files + exec bit | N (hosted repos: text only, 200 files, 10 MiB/file) | N | N | N | N | N | N | N | N (no automatic execution) |
| Loose shared root `.agents/skills` | read (project + parents; user `~/.agents/skills`, `~/.config/agents/skills`) | read | read | read (per config page; skills page omits) | read | read | not read | read (trusted projects; ancestors to git root) | read (ancestors to git root) |
| Plugin skill packaging | JS plugin `amp.registerSkill({path})` | none | AP / `.devin-plugin` `skills/` (manifest `skills` replaces default) | AP lane (`~/.agents/plugins`, strict frontmatter); code plugins `skills/` | none | Open Plugins `skills/`; Gemini-extension import | Power (AP root `skills/`) | package `skills/` or `pi.skills` | none (extension manifest cannot bundle skills) |

### 3.3 Discovery roots and native precedence

Native precedence when two skills share a name. ACF's rule (SPEC §17.6) is: project shadows user; a collision within one scope is an error.

| Tool | Project roots | User roots | Native same-name precedence | Relation to ACF rule |
|---|---|---|---|---|
| CC | `.claude/skills`, nested `.claude/skills` | `~/.claude/skills` | managed > personal > project; plugin skills namespaced | **inverted** |
| CX | `.agents/skills` (cwd and ancestors to repo root) | `~/.agents/skills`; admin `/etc/codex/skills` | duplicates not merged; both listed | **coexist** |
| CP | `.github/skills` > `.agents/skills` > `.claude/skills` | `~/.copilot/skills` > `~/.agents/skills` | first found by frontmatter `name`; project before personal; plugin skills coexist qualified | consistent |
| VS | `.github/skills`, `.claude/skills`, `.agents/skills` | `~/.copilot/skills`, `~/.claude/skills`, `~/.agents/skills` | unknown | unknown |
| CU | `.agents/skills`, `.cursor/skills` (+ `.claude/skills`, `.codex/skills`) | same under `~/` | unknown | unknown |
| GE | `.agents/skills` > `.gemini/skills` | same under `~/` | built-in < extension < user < workspace | consistent |
| OC | `.opencode/skills`, `.claude/skills`, `.agents/skills`, recursive | same under config dirs and `~/` | warning; nondeterministic winner | **undefined** |
| AM | `.agents/skills`, `.claude/skills` (+ parents) | `~/.config/agents/skills`, `~/.agents/skills`, `~/.config/amp/skills`, `~/.claude/skills`, `~/.claude/plugins/cache/` | first wins; global roots before project | **inverted** |
| WS | `.devin/skills`, `.windsurf/skills`, `.agents/skills`, `.claude/skills` (conditional) | `~/.codeium/windsurf/skills`, `~/.config/devin/skills`, `~/.agents/skills` | unknown | unknown |
| DL | `.agents/skills`, `.devin/skills`, `.windsurf/skills`; imports `.claude/skills`, `.github/skills` | `~/.agents/skills`, `~/.config/devin/skills`; imports `~/.copilot/skills` | unknown | unknown |
| CL | `.cline/skills`, `.clinerules/skills`, `.claude/skills`, `.agents/skills` | `~/.cline/skills`, `~/.agents/skills` | global wins over project | **inverted** |
| RO | `.roo/skills[-mode]` > `.agents/skills[-mode]` | same under `~/` | project > global; `.roo` > `.agents` | consistent |
| GO | `.agents/skills` > `.goose/skills` > `.claude/skills` > project plugins | `~/.agents/skills` > `~/.config/goose/skills` > `~/.claude/skills` > `~/.config/agents/skills` > user plugins | first wins, project first | consistent |
| KI | `.kiro/skills` | `~/.kiro/skills` | workspace > global | consistent |
| PI | `.pi/skills`, `.agents/skills` (+ ancestors) | `~/.pi/agent/skills`, `~/.agents/skills` | first discovered wins; order across sources unknown | unknown |
| LU | `.agents/skills` (+ ancestors), `.lume/skills` | `~/.agents/skills`, `<config>/skills` | first wins; global before repository | **inverted** |

Two consequences drive section 4: `.agents/skills` is read by 14 of the 16 runtimes (all but CC and KI), and `.claude/skills` is read by CC plus CP, VS, CU, OC, AM, WS (conditional), DL, CL and GO, so neither is an exclusive carrier for anything.

---

## 4. Conflicts that must not be unioned

| # | Conflict | Why it cannot share one field | Handling |
|---|---|---|---|
| C1 | `$N` is 0-based in CC and 1-based in GO | Same spelling, contradicting values | Bare `$N` is excluded from the canonical grammar (2.3). Readers normalize to `$ARGUMENTS[N]` with the source's base; writers to CC and GO emit `$ARGUMENTS[N]`, which both read 0-based. |
| C2 | "Allowed tools": pre-approval (skill `allowed-tools` in AS, CC, CP, DL, PI) vs availability restriction (CC `disallowed-tools`; DL agent-profile `allowed-tools`; AM `builtin-tools`/`includeTools`; KI Power Builder's description of skill `allowed-tools` as "tool-restriction glob patterns") | Opposite effects: one removes prompts, the other removes tools | Canonical `allowed-tools` means pre-approval only. Restriction stays per-target (`targets.claude.disallowed-tools`, `targets.amp.builtin-tools`). Nothing is emitted to KI until its meaning is verified. |
| C3 | Tool vocabulary in `allowed-tools` (CC `Bash(git add *)`, CP `shell`, DL permission strings, AS example `Bash(git:*)`) | Values are tool-owned | Canonical grammar over ACF operation ids (2.4) with exact-only translation; raw native expressions in `targets.<t>.allowed-tools`. Untranslatable entries are dropped, never widened. |
| C4 | `allowed-tools` serialization: AS/AP require one space-separated string; CC accepts space/comma string or list; CP comma string or list | AS splitting breaks CC patterns containing spaces | Canonical is a list. AS/AP writers space-join and drop (`lossy`) entries containing whitespace. |
| C5 | Grant window: CC invoking turn only; CP while active; DL inline only (ignored under `subagent`) | Same direction, different duration | Kept as one field with host-defined window, documented, because every window only reduces prompts and none widens permission beyond the skill's activity. Writers warn when `allowed-tools` is combined with `context: fork` for DL (grant silently ignored). |
| C6 | Same-name precedence: inverted in CC, AM, CL, LU; undefined in OC, PI; coexisting in CX; consistent in CP, GE, RO, GO, KI; unknown in VS, CU, WS, DL | ACF's "project shadows user" cannot be delegated to hosts; user-scope output is global and cannot be suppressed for one project | Caplet resolves collisions before emission (unchanged §17.6) and, when a project skill shadows a user skill, emits `error` `acf.skill.shadow-unenforceable` for every selected target whose precedence is not "consistent", naming `rename`/`exclude` as the fix. Requires a registry field `skillPrecedence` per target. |
| C7 | `name` = identity (most) vs display name (DL) vs looser charset (CP) vs sanitized (GE) vs unconstrained relative to directory (PI) | Identity and label are different meanings | Canonical `name` is identity (slug = directory). `display-name` is separate. Foreign readers derive the canonical name from a slug-valid frontmatter name, else the directory name; a non-slug native name is preserved in `targets.<source>.name` and in the source snapshot; `info` diagnostic. |
| C8 | `model` values (CC aliases/ids; DL CLI aliases) | Shared meaning, tool-owned vocabulary; also the same key in the shared roots means different things to different readers | Not core. `targets.claude.model`, `targets.devin.model`, emitted only to carriers exclusive to that target (5.2). |
| C9 | Skill-scoped hooks (CC `hooks`, registered for the rest of the session) vs ACF hooks family (capability lifetime) | Different lifetime and trigger | Not mapped to `hooks/hooks.yml`. Kept as `targets.claude.hooks`; dropped elsewhere with `warn` (a dropped blocking hook is a lost enforcement). |
| C10 | Body dialects: CC `` !`cmd` ``, ` ```! `, `@path`, `${CLAUDE_*}`, `${user_config.*}`; VS `#file:`; AM `{baseDir}` | Cannot be expressed as fields; other hosts show them literally | Only `${ACF_SKILL_DIR}` and the argument placeholders are canonical. Readers detect other host constructs and record the dialect; writers for other targets emit `warn` `acf.skill.body-dialect` listing the constructs. Authors resolve with `only`/`except`. |
| C11 | `metadata` value types (AS strings; GO JSON; CC objects) and GO's reserved `metadata.argument-hint`/`metadata.arguments` | Type mismatch and key collision | Canonical `metadata` is string-valued. Non-string values from GO or CC sources are preserved in `targets.<source>.metadata` (verbatim) and the canonical projection keeps only string entries. Canonical `metadata` keys `argument-hint`/`arguments` are an `error`. |
| C12 | Agent Plugins consumers disagree on frontmatter strictness: CL AP lane rejects any non-AS key; CP, VS, CU read extension keys from AP packages | A single AP rendering cannot be both strict and expressive | The AP writer takes a client profile (allowed keys per client). Target-neutral AP or AS distribution uses the strict AS set plus, by explicit option, the `dex` keys. |
| C13 | AM frontmatter `mcpServers` overrides a sibling `mcp.json` completely; CX transport spelling `streamable_http` vs AP `streamable-http` | Two carriers for one value; spelling drift | One owner per carrier: if a raw sibling `mcp.json` exists and `requires.mcp` would generate frontmatter `mcpServers`, `error` `acf.skill.carrier-conflict`. Transport spelling is translated by the CX writer. |
| C14 | `user-invocable: false` (CC refuses typed `/name`; VS hides from menu) and `disable-model-invocation` side effects (CC also blocks subagent preload and scheduled runs; PI/LU only hide from listing) | Same core meaning, different secondary effects | One canonical boolean each; secondary effects documented as host behavior. Validator warns when both are `false` (`acf.skill.unreachable`), since CC then cannot preload it either. |
| C15 | Invocation and namespacing syntax in body cross-references (`/name`, `$name`, `/skill:name`, `@name`, `/plugin:name`, `/plugin/name`) | Prose, not a field | Not rewritten. Writers emit `info` when a body mentions a sibling skill in another tool's invocation syntax. |

---

## 5. Per-target extras

### 5.1 What stays raw

Extras live in the skill's `SKILL.md` frontmatter under `targets.<target>`, with native key spellings and values verbatim. The writer for that target copies them unchanged into the native frontmatter (or sidecar, where noted); every other writer drops them with an `info` diagnostic, or `warn` where the extra carries enforcement (marked).

| Target | Raw extras (native spelling) | Notes |
|---|---|---|
| claude | `model`, `effort`, `background`, `shell`, `disallowed-tools` (warn when dropped), `hooks` (warn when dropped), `allowed-tools` (native rule strings, additive), `metadata` (non-string values), `arguments` string form | Body dialect constructs stay in the body (C10). Legacy command files are a commands-facet concern. |
| codex | `agents/openai.yaml` content except the core-owned keys `policy.allow_implicit_invocation` and `dependencies.tools[type=mcp]`: `interface.short_description`, `interface.icon_small`, `interface.icon_large`, `interface.brand_color`, `interface.default_prompt`, non-MCP `dependencies.tools[]` (`interface.display_name` maps to core `display-name`) | Stored as `targets.codex.openai-yaml` (an object mirroring the file). The Codex writer is the single owner of the generated `agents/openai.yaml`. A literal `agents/openai.yaml` in an ACF source skill is lifted into this key by the reader; supplying both is an `error`. |
| copilot | `name` (non-slug native name), `allowed-tools` (native strings, additive) | Needs a new target id. |
| vscode | none at skill level; extension `contributes.chatSkills` is packaging | Needs a new target id. |
| cursor | `icon`, `color` (`default`, `green`, `cyan`, `blue`, `purple`, `magenta`, `orange`, `yellow`, `red`, `brand`), `globs` (only to reproduce a legacy spelling; canonical reads it into `paths`) | |
| gemini | none (loader reads only `name`, `description`) | Unknown keys preserved through the snapshot only. |
| opencode | none in the skill file | `skills.paths`/`skills.urls`, `permission.skill` are consumer config; not written. |
| amp | `mcpServers` (beyond `requires.mcp`), `builtin-tools`, `includeTools` | Sibling `mcp.json` stays a raw bundled file (C13). |
| windsurf (Cascade) | none | |
| devin (DL) | `model`, `permissions.{allow,deny,ask}` (warn when dropped), `allowed-tools` (native strings, additive) | `name` carries `display-name` only on a DL-exclusive carrier. |
| cline | none | Strict AP lane: extras never go into AP packages. |
| roo | `modeSlugs`, `mode`, and placement under `skills-{mode}/` (recorded as `targets.roo.modes`; the writer chooses the directory) | |
| goose | `metadata` (non-string JSON values) | Plugin name rewriting is install behavior. |
| kiro | `allowed-tools` (native, only after C2 is resolved) | |
| pi | none | Root Markdown skill form is a reader concern (preserved through snapshot). |
| lume | none | |

### 5.2 The exclusive-carrier rule

A per-target extra or a target-specific spelling may be emitted only into a carrier read by that target alone: a tool-exclusive skill root, a plugin installed into that tool, or a key/file no other reader of the same root interprets. Shared roots are not exclusive: `.agents/skills` is read by 14 runtimes and `.claude/skills` by 10. Writing CC's `model: opus` into `.claude/skills` would also reach DL, which reads `model` with its own vocabulary; writing DL `name` as a display name into `.agents/skills` would break identity in every other reader.

Exclusive loose roots that exist today: CU `.cursor/skills`; GE `.gemini/skills`; OC `.opencode/skills`; AM `~/.config/amp/skills` (user scope only; AM has no exclusive project root); CL `.cline/skills`; RO `.roo/skills`; GO `.goose/skills`, `~/.config/goose/skills`; KI `.kiro/skills`; PI `.pi/skills`, `~/.pi/agent/skills`; LU `.lume/skills`. None for CX (only `.agents/skills`; CX extras ride in its exclusive sidecar `agents/openai.yaml`), CP and VS (`.github/skills` and `~/.copilot/skills` are read by CP, VS and DL), WS and DL (`.devin/skills`/`.windsurf/skills` are read by both), CC (`.claude/skills` is widely read). The CC plugin is CC-exclusive, except that AM also scans `~/.claude/plugins/cache/`.

The rule implies, per target and skill, one emission mode:

1. **Shared core rendering**: one copy in `.agents/skills`, containing core fields in their majority native spellings (`disable-model-invocation`, `user-invocable`, `argument-hint`, `paths`, `context`, `agent`, `allowed-tools` only where every shared-root reader agrees) plus exclusive sidecars (CX `agents/openai.yaml`). Valid for every shared-root reader without per-target extras.
2. **Exclusive rendering**: a copy in the target's exclusive root or plugin, with its full dialect and extras.

A skill must not reach one target through both modes, or it is listed twice (OC warns and picks nondeterministically; CC and VS list plugin and loose copies separately). So a target that gets an exclusive rendering must not read the shared copy; where it does (CU, GE, OC, AM, CL, RO, GO, PI, LU all read `.agents/skills`), the shared copy is omitted for that installation and every target gets an exclusive rendering. This is the main cost of keeping extras lossless (see section 7, Q1).

### 5.3 Agent Plugins client profiles

The shared AP writer renders `skills/<name>/SKILL.md` with a per-client key profile:

| Profile | Keys beyond AS standard |
|---|---|
| copilot | `disable-model-invocation`, `user-invocable`, `argument-hint`, `allowed-tools` (list form) |
| vscode | `disable-model-invocation`, `user-invocable`, `argument-hint`, `context` |
| cursor | `disable-model-invocation`, `paths`, `icon`, `color` |
| codex | none in frontmatter; `agents/openai.yaml` inside the skill directory (in-plugin loading of the sidecar is unverified, Q6) |
| devin | `argument-hint`, `triggers`, `subagent`, `agent`, `model`, `permissions`, `allowed-tools` |
| kiro, cline (AP lane), neutral | none (strict AS) |

### 5.4 Lossless round trips

- **Same format, unchanged**: the reader keeps an immutable snapshot of the original skill directory (bytes and modes, as the advice document recommends); the writer copies it. This is the only path that preserves comments, key order, string-vs-list forms, legacy spellings (`globs`), unknown keys and sidecar bytes.
- **Same format, modified** (rename, filtered, applicability change): the writer regenerates from the canonical projection plus `targets.<source>` extras. Semantics are preserved; formatting is not. Readers record spelling hints that change meaning-free bytes only where a later regeneration would otherwise switch a host-visible form: CU `globs` vs `paths` and CC `arguments` string vs list.
- **ACF to ACF**: ACF `SKILL.md` is source; writers must not reserialize it for ACF output.
- **Foreign to ACF export**: canonical fields in canonical spellings, `targets.<source>` for extras and non-canonical values, unknown keys under `targets.<source>` with an `info` diagnostic, all bundled files including sidecars (except those lifted into `targets.codex.openai-yaml`). Re-importing that export and writing the original format reproduces every key and value; bytes match only through the snapshot path.
- **Format-level unknown keys** (bare AS repos and AP packages, which are formats, not targets) have no `targets.<target>` home. Proposed: preserve them in the source snapshot and in a provenance remainder; emit them only to tolerant AS-format outputs, never to strict profiles (Q5).

---

## 6. Delta against the current ACF SPEC and code

### 6.1 Exists today

| Item | Where |
|---|---|
| Skill shape `skills/<name>/SKILL.md`, directory-only; `name` slug equal to directory; `description` required | SPEC §9.1-9.2; `packages/core/src/reader/index.ts` `readSkills`; `packages/core/src/schemas/index.ts` `skillFrontmatterSchema` |
| `invocation: {user, model}`, both default `true`; SPEC requires a `lossy` diagnostic when a target cannot represent either | SPEC §9.3; `SkillFacet` in `packages/core/src/types/model.ts` |
| `assets`, `only`, `except`, `targets` | SPEC §6, §7, §16 |
| Shared canonical install root `.agents/skills` plus optional native roots; canonical-only default for targets that discover the root (Codex, OpenCode, Pi) | SPEC §22.2; `packages/adapters/src/common/skills.ts` `skillDestinations`; `discoversCanonicalSkills` in `packages/core/src/targets/registry.ts` |
| Bare-skill import: root `SKILL.md`, then immediate `skills/*/SKILL.md`, then immediate `*/SKILL.md`; all regular non-hidden files transported; `SKILL.md` bytes copied verbatim | SPEC §20.3; `collectImportedSkillAssets` in `packages/core/src/assets/index.ts`; `pushSkillPrimaryBytes` |
| Executable modes carried for assets | `AssetPayload.mode`, `makeFileDiff` mode arguments |
| Command `arguments` (slug list) and `agent` reference resolution | SPEC §11.3-11.4 |
| Operation vocabulary usable for `allowed-tools` | `packages/runtime-taxonomy/src/index.ts` `provisionalOperations` |

### 6.2 Defects found (verified by the probe described at the top)

1. **Standard fields silently dropped from authored skills.** The reader allow-lists `version`, `license`, `metadata`, `argument-hint`, `allowed-tools`, `disable-model-invocation` (no unknown-field diagnostic), but `skillFrontmatterSchema` is a non-strict zod object, so parsing strips them. They never reach any output, with no diagnostic.
2. **Invocation control is never translated.** `emitSkills` writes `renderMarkdownFile(skill.frontmatter, body)` for every target, so native files contain the ACF key `invocation:`, which no tool reads. An `invocation.model: false` skill is auto-invocable in every tool (fail-open). The §9.3 `lossy` requirement is not implemented; no adapter references `invocation`.
3. **ACF-only keys leak into native files**: `only`, `except`, `targets`, `assets`.
4. **Applicability leak through the shared root.** A skill with `only: [claude]` is written by the Claude adapter to `.agents/skills`, which Claude does not read and 14 other runtimes do.
5. **Unlinked bundled files are not transported for authored skills.** `readSkillAssets` only carries files referenced by Markdown links or `assets:`; `scripts/run.sh` mentioned in prose was dropped. Agent Skills treats the whole directory as the skill.
6. **Re-rendering loses formatting.** Authored skills are re-serialized through `stringifyYml`, losing comments and key style even for unchanged output.
7. **Duplicate discovery from dual emission.** For Claude, every skill goes to `.claude/skills` and `.agents/skills`; CP, VS, CU, OC, AM, GO, CL, DL and WS (conditional) read both, so the same skill can be listed twice (OC: warning and nondeterministic winner).
8. **Registry claims exceed behavior.** `support.skill` is `full` for claude, codex, opencode and pi although invocation and every optional field are untranslated.
9. **Codex native skill path is undocumented.** `skillInstallPaths` for codex is `.codex/skills`/`~/.codex/skills`; the Codex inventory documents only `.agents/skills`, `~/.agents/skills`, `/etc/codex/skills` and plugin roots (CU, not CX, scans `.codex/skills`).
10. **Cursor discovery is special-cased in code.** Cursor reads `.agents/skills` but the registry lacks `discoversCanonicalSkills`; `packages/adapters/src/cursor/index.ts` forces `native: false` instead.
11. **Extension schema restates canonical fields.** `skillExtension` in `packages/core/src/targets/extensions.ts` (`userInvocable`, `modelInvocable`, `disableModelInvocation`, `path`) is identical for all targets, duplicates `invocation` against SPEC §7.1, is `.strict()` (rejecting any real native extra), and is not consumed by any adapter.
12. **Bare-skill import misses common layouts**: nested category directories (CU, OC, PI, GO, AM recurse), CX `agents/openai.yaml` semantics, hidden files; symbolic links are omitted silently.

### 6.3 Changes

| Area | Change |
|---|---|
| SPEC §9.2 | Add the core fields of 2.2: `display-name`, `when-to-use`, `license`, `compatibility`, `metadata`, `argument-hint`, `arguments`, `paths`, `context`, `agent`, `allowed-tools`, `requires.mcp` (provisional). Additive under acf: 1 per §15, except `display-name`, which §15 currently reserves (`title`/`displayName`) and must be released by a spec revision. |
| SPEC §9.4 | Add the body placeholder grammar (2.3) and `acf.skill.ambiguous-positional`. |
| SPEC §9.1, §16.4, §3.2 | Whole-directory transport for skills (2.5), hidden files included, symlinks an error. |
| SPEC §9.3 | Replace "lossy when unrepresentable" with per-direction rules: unenforceable `model: false` blocks emission for that target (skip, `warn`); unenforceable `user: false` emits with `lossy`. |
| SPEC §7, `targets/extensions.ts` | Per-target skill extras schemas listing verbatim native keys (5.1); unknown native keys preserved with `info` instead of rejected; remove the restating common `skillExtension`. |
| SPEC §15 | Remove skill `displayName` from the reserved list (spelled `display-name`). Command `argumentHint` stays reserved for commands (separate facet decision), but its skill counterpart becomes core. |
| SPEC §17.6 | Add `acf.skill.shadow-unenforceable` for targets whose native precedence is not consistent with project-shadows-user. |
| SPEC §20.3 | Recognize nested category directories, CX sidecars, and reject symlinks explicitly. |
| SPEC §22.2 | Replace mandatory canonical-root emission with the two emission modes of 5.2 and the no-double-delivery rule; Claude moves to its plugin (the user's design) and never to `.agents/skills`. |
| `schemas/index.ts` | Strict canonical skill schema with the new fields; unknown keys produce diagnostics, never silent stripping. |
| `common/skills.ts` | Per-target rendering: map core fields to native spellings, strip ACF keys, apply extras only to exclusive carriers, apply applicability per destination, transport the whole directory, emit the diagnostics of section 3. |
| `targets/registry.ts` | Replace `support.skill` with per-field support derived from section 3; add `skillPrecedence`, `readsSkillRoots` (to compute shared-root readers and exclusivity), exclusive roots per scope; fix Codex paths; add `discoversCanonicalSkills` (or its successor) for Cursor. |
| `model.ts` | Extend `SkillFacet.frontmatter` with the new fields; add source provenance and snapshot reference (advice document item 2). |

### 6.4 New

- Target ids for copilot, vscode, gemini, amp, windsurf, devin, cline, roo, goose, kiro, lume (and the AP and Claude-plugin package writers).
- Readers for CC, CX (`agents/openai.yaml`), CU, CP, DL and GO skill dialects into the canonical projection.
- Shared AP writer with client profiles (5.3).
- Diagnostics: `acf.skill.invocation-unenforceable`, `acf.skill.field-unverified`, `acf.skill.allowed-tools-unmapped`, `acf.skill.body-dialect`, `acf.skill.ambiguous-positional`, `acf.skill.shadow-unenforceable`, `acf.skill.carrier-conflict`, `acf.skill.description-too-long`, `acf.skill.metadata-reserved-key`, `acf.skill.unreachable`.
- Behavioral tests at the risky boundaries: `model: false` is honored (or the skill is withheld) per target; no double listing after apply; argument placeholders render as intended in CC and GO.

---

## 7. Open questions and unverified claims

### 7.1 Decisions needed

- **Q1. Shared root vs exclusive roots.** Exclusive per-target renderings keep extras lossless and avoid double listing, at the cost of one copy per target and no single portable copy. Keeping `.agents/skills` as the default gives one portable copy but forbids extras for every shared-root reader. Recommended: exclusive renderings whenever a target is selected explicitly; `.agents/skills` only as an opt-in portable mode.
- **Q2. `model: false` on targets without enforcement** (OC, AM, WS, CL, RO, GO, KI): skip (recommended default) or translate to a native command (OC commands, RO commands, GE commands, PI prompt templates). Coordinate with the commands facet.
- **Q3. Canonical spelling of invocation.** Keeping `invocation: {user, model}` preserves SPEC §9.3 and the positive form. Switching to the majority native spelling (`disable-model-invocation`, `user-invocable`) would make ACF `SKILL.md` natively valid in six tools when copied raw, but is a breaking change under acf: 1.
- **Q4. `requires.mcp`.** CX dependency semantics (install, auth, failure) are undocumented, and AM's `mcpServers` adds load-gated tool visibility. Promote to core only after both are verified; otherwise keep as `targets.codex.openai-yaml.dependencies` and `targets.amp.mcpServers`.
- **Q5. Format-level unknown keys** from bare AS repos and AP packages: provenance remainder plus tolerant-only emission, or drop with `info`.
- **Q6. `when-to-use` in core** relies on lossless concatenation rather than two-tool adoption; reject if the two-tool rule must be strict, leaving it as a CC extra.
- **Q7. `paths` glob dialect.** CC uses the path-specific-rules format; CU's glob grammar is unspecified. Confirm a shared subset (likely `**`, `*`, `?`, braces) before translating.
- **Q8. Body dialect handling.** Is a `warn` enough for CC shell interpolation reaching other targets, or should such skills default to `only: [claude]` on import?

### 7.2 Unverified or conflicting claims

- KI `allowed-tools`: Power Builder reference calls it experimental tool-restriction patterns; the Kiro Skills page does not list it. Opposite meaning to everyone else. Kiro skill pages are dated after the 2026-10-01 cutoff.
- Whether VS `user-invocable: false` also blocks typed `/name` (documented as menu visibility) and whether VS interprets `agent`, `allowed-tools`, `license`, `compatibility`, `metadata`.
- CU behavior for `allowed-tools`, `user-invocable`, `argument-hint`, `license`, `compatibility`, and duplicate-name precedence.
- CP acceptance of `compatibility`/`metadata`; argument placeholder substitution in CP and CU.
- CX: whether `agents/openai.yaml` is honored inside plugin skills; exhaustive `dependencies.tools[].type` and `transport` enums; enforcement of `allowed-tools`.
- CC: whether bare `/name` reaches a plugin skill when no other skill has that name.
- DL: `triggers: []` behavior, argument substitution, duplicate precedence; whether DL reads `disable-model-invocation`/`user-invocable` from `.claude/skills` imports.
- WS (Cascade) and AM: acceptance of every AS optional field; AM user invocation (removed 2026-05-06, no documented replacement).
- CL: whether `.agents/skills` is a project root (configuration page lists it, skills page does not); ordering among aliases and plugin skills.
- RO: user slash invocation of skills; `modeSlugs` is source-only.
- OC: V1 vs V2 skill discovery differences; which runtime ships.
- PI: cross-source precedence beyond "first discovered"; documentation (0.85.0) vs installed runtime (0.87.1).
- LU: evidence is from a checkout dated 2026-10-08, after the cutoff.
- GO `$N` 1-based comes from the v1.52.0 implementation as cited in the Goose inventory; not re-checked here. The CC 0-based reading was re-checked against the live CC docs.
- Agent Skills name charset: "unicode lowercase alphanumeric" vs parenthetical `a-z, 0-9`; CL AP lane NFKC-normalizes Unicode. ACF's ASCII slug is the safe subset.
