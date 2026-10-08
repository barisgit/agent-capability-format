# Facet: commands and prompts (snapshot 2026-10-01)

Scope: user-invoked, parameterized prompt templates (slash commands, prompt files, custom prompts, workflows, recipe aliases): file layout, frontmatter, arguments and placeholders, shell/file interpolation, model/agent/tool overrides, and the command-to-skill convergence. Code-registered commands (Pi `registerCommand`, Amp `amp.registerCommand`, Cline plugin `handler`, Lume extension commands, Copilot executable extensions) are executable extension modules and belong to the extension-module facet; they appear here only where they block a declarative mapping.

Evidence: the 15 inventories under `../tools/` (each cites its sources), plus three spot checks made for this facet on 2026-10-01:

- [Claude skills](https://code.claude.com/docs/en/skills): `$ARGUMENTS[N]` and `$N` are **0-based** (`$0` = first, `$1` = second); a missing indexed placeholder stays literal while a missing named placeholder becomes empty; literal `$` is escaped with `\$`; arguments use shell-style quoting; a failing `` !`cmd` `` aborts the whole invocation (exit 1 carve-out for search/compare commands); injected commands run in the session's current directory; permission rules are checked without prompting; `disableSkillShellExecution` replaces them with a placeholder; unreferenced arguments are appended as `ARGUMENTS: <raw>`. The page states "Custom commands have been merged into skills."
- [OpenCode commands](https://opencode.ai/docs/commands/): `$1` = **first** argument; `` !`cmd` `` runs in the project root; `@path` includes file content; `agent` naming a subagent triggers a subtask unless `subtask: false`.
- [Codex custom prompts](https://learn.chatgpt.com/docs/custom-prompts): deprecated; `$1`–`$9` positional (1-based); named placeholders are **keyword-bound** (`$FILE` filled by `FILE=value`), not position-bound; `$$` is a literal `$`; only top-level `.md` in `~/.codex/prompts/` is read.
- [Gemini custom commands](https://geminicli.com/docs/cli/custom-commands/): `{{args}}` is shell-escaped inside `!{...}`; failed shell injects stderr plus `[Shell command exited with code N]` and continues; `@{...}` runs before `!{...}` and `{{args}}`; without `{{args}}` the full typed command is appended after two newlines.

Cell and status legend used throughout:

| Mark | Meaning |
|---|---|
| **N**(spelling) | Native: the target has the same meaning; writer emits that spelling. |
| **T**(how) | Translated: a deterministic rewrite preserves the meaning. |
| **D**(how) | Degraded: meaning is weakened in a declared way; writer emits the named `lossy` diagnostic. |
| **E** | Refused: writer does not emit the command for that target (`error` diagnostic) because every available degradation would broaden invocation, permissions, or injection exposure. |
| **U** | Unsupported and nothing to emit (field absent from the target). Treated as D with a diagnostic when the canonical field is set. |
| **?** | Unverified: documentation does not establish the behavior; writer treats it as U until a fixture proves it (see section 7). |
| — | Not applicable. |

## 1. Concept map

### 1.1 Where each tool stands on "commands became skills"

| Tool | Declarative command surface on 2026-10-01 | Relation to skills |
|---|---|---|
| Claude Code | `.claude/commands/**/*.md`, `~/.claude/commands/`, plugin `commands/` or manifest `commands` map | **Merged into skills**: same frontmatter and processing; legacy files still work; same-name skill wins. |
| Codex | `~/.codex/prompts/*.md` (user scope only, top-level only, invoked `/prompts:<name>`) | **Deprecated** in favor of skills (explicit `$skill` or `/skills`; implicit invocation off via `agents/openai.yaml` `policy.allow_implicit_invocation: false`). No plugin command component. |
| GitHub Copilot CLI | `.claude/commands/NAME.md`; plugin `com.github.copilot/commands/` (Agent Plugins) or legacy `commands` paths | "Alternative skill format": skill frontmatter subset; skills win on same name. |
| VS Code | `.github/prompts/*.prompt.md` (Local harness only); plugin `com.github.copilot/commands/` | **Deprecated for Agent Host** (not loaded there); experimental prompt-to-skill migration. |
| Cursor | Plugin `commands/` (`.md/.mdc/.markdown/.txt`); legacy local commands (path unverified) | `/migrate-to-skills` converts to skills with `disable-model-invocation: true`; plugin commands remain. |
| Gemini CLI | `.gemini/commands/**/*.toml`, `~/.gemini/commands/`, extension `commands/` | Separate; not replaced. |
| OpenCode | `.opencode/commands/<n>.md`, `~/.config/opencode/commands/`, JSON `command.<n>` | Separate; skills have no user invocation. |
| Pi | `.pi/prompts/*.md`, `~/.pi/agent/prompts/`, package `pi.prompts` | Separate ("prompt templates"); skills also user-invocable via `/skill:name args`. |
| Roo Code | `.roo/commands/<n>.md`, `~/.roo/commands/` | Separate. |
| Cline | `.cline/workflows/`, `.clinerules/workflows/`, `~/.cline/workflows/` | Separate; enabled skills also become slash invocations. |
| Windsurf Cascade | `.devin/workflows/*.md` (legacy `.windsurf/workflows/`), global, system | Separate; manual-only; 12,000-character limit. |
| Devin Local | No command format; `.claude/commands/**/*.md` **imported as skills** | Commands are skills (`triggers: [user]` gives user-only). |
| Goose | `slash_commands[]` in `~/.config/goose/config.yaml` aliasing recipe files | Separate (recipes); skills separately accept `$ARGUMENTS` substitution. |
| Kiro | Slash-invocable skills; `manual` steering | Skills (CLI `$ARGUMENTS`); no command file format. |
| Amp | **Removed** 2026-01-29 (migrated to skills); user-invocable skills removed 2026-05-06 | No declarative user-invoked prompt at all; only code `amp.registerCommand`. |
| Lume | None declarative | `/skill:<name> text` honours `disable-model-invocation`; commands are code. |
| Agent Plugins 1.0 | None (skills + MCP only); commands live only in client namespaces such as `com.github.copilot/commands/` | Not standardized. |
| Agent Skills / MCPB | MCPB `prompts[]` (MCP prompt templates: `name`, `description`, `arguments` names, `text` with `${arguments.x}`) | Not standardized as commands. |

Conclusion: the *meaning* "a named, user-invoked prompt template expanded into the conversation with the user's arguments" is shared by every tool except Amp and Agent Plugins. Six tools carry it in a command format, six carry it as a user-invocable skill, and Claude, Copilot and Devin treat both as one namespace. ACF should therefore keep `command` as the authoring family for that meaning and let each writer choose between the target's command format and a user-only skill (section 2.4). It should not fold commands into skills: the skill side lacks a portable user-only switch (Agent Skills has none, and OpenCode, Gemini, Goose and Amp ignore the client switches), so folding would broaden model invocation.

### 1.2 Shared meanings and their spellings

| Meaning | Tools and native spelling |
|---|---|
| Command identity | Filename stem: Claude, Codex, Copilot, OpenCode, Pi, Roo, Cline, Windsurf, Gemini (path); frontmatter `name`: VS Code, Cursor, ACF; skill directory name: Devin, Lume, Kiro; config `command`: Goose; MCPB `prompts[].name`. |
| Hierarchical name | Subdirectory to `:` segment: Gemini (`git/commit.toml` to `/git:commit`), Claude plugin commands. Host-added prefixes (not author data): Codex `/prompts:`, plugin `/<plugin>:`, Gemini extension collision `/<ext>.<cmd>`, Pi `:1` suffixes, Lume `/ext.<id>:`. |
| Menu description | `description`: Claude, Codex, Copilot, VS Code, Cursor, Gemini, OpenCode, Pi, Roo, Devin, Goose (recipe), Lume, MCPB. Fallbacks when absent differ: Claude first paragraph, Pi first non-empty line, Gemini filename. |
| Argument usage hint (display only) | `argument-hint`: Claude, Codex, Copilot, VS Code, Pi, Roo, Devin; `argumentHint`: Claude manifest command map; `metadata.argument-hint`: Goose skills. |
| All arguments as raw text | `$ARGUMENTS`: Claude, Codex, OpenCode, Pi (also `$@`), Goose skills, Kiro CLI; `{{args}}`: Gemini; implicit trailing text: VS Code, Cursor `/skill`, Lume, Pi `/skill:` (`User: <args>`). |
| Positional argument | 0-based `$ARGUMENTS[N]`: Claude, Goose; 0-based `$N`: Claude; **1-based** `$N`: Codex (`$1`–`$9`), OpenCode, Pi, Goose. |
| Named argument bound by position | `arguments` + `$name`: Claude; `metadata.arguments` + `$name`: Goose skills; ACF `arguments` (names only, no body syntax defined). |
| Named argument bound by keyword | `$UPPER` filled by `NAME=value`: Codex; recipe `parameters[].key` + `{{ key }}`: Goose (CLI params); `${input:name}` model-mediated: VS Code. |
| Argument metadata | MCP/MCPB prompt arguments (`name`, `description`, `required` in MCP); Goose recipe `parameters[]` (`key`, `input_type`, `requirement`, `description`, `default`, `options`); Lume code `arguments` Zod schema. |
| Argument default | Pi `${1:-default}`, `${@:-default}`; Goose `parameters[].default`. |
| Literal `$` escape | `\$`: Claude; `$$`: Codex. Others undocumented. |
| Unreferenced arguments | Appended `ARGUMENTS: <raw>`: Claude, Goose skills; full typed command appended after two newlines: Gemini; same-message text: VS Code, Cursor, Lume; others undocumented. |
| Shell output interpolation | `` !`cmd` ``: Claude, OpenCode; fenced ```` ```! ```` block: Claude; `!{cmd}`: Gemini. |
| File content interpolation | `@path`: OpenCode (content), Claude (syntax listed, inclusion in skill bodies unverified); `@{path}`: Gemini (files, multimodal, recursive directories); `#file:./p` and Markdown links (prompt-relative reference, model reads): VS Code. |
| Package/command directory variable | `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`: Claude; `{{ recipe_dir }}`: Goose; `{baseDir}`: Amp skills; ACF `${ACF_CAPABILITY_DIR}` (hooks/MCP only today). |
| Model override | `model`: Claude (alias, full ID, `inherit`), OpenCode (`provider/model`), VS Code (picker model name), Devin skills (CLI alias); `settings.goose_provider` + `settings.goose_model`: Goose; manifest `model`: Claude command map. |
| Run under a named agent/mode inline | `agent`: VS Code (`ask`, `agent`, `plan`, custom), OpenCode (primary agent); `mode`: Roo (switch mode before processing). |
| Run delegated in a subagent | `context: fork` + `agent`: Claude (and VS Code skills); `subtask: true` (+ `agent`): OpenCode; `subagent: true` / `agent`: Devin skills. |
| Pre-approve tools while active | `allowed-tools`: Claude (grants, not a whitelist), Copilot commands (auto-approve, `"*"` = all), Devin skills (auto-approve); `allowedTools`: Claude manifest map. |
| Restrict available tools | `tools` allowlist: VS Code prompts (`<server>/*` allowed); `extensions` explicit set: Goose recipes; `disallowed-tools` denylist: Claude. |
| Model may also auto-invoke | Default on for Claude and Copilot commands, off with `disable-model-invocation: true`; never for Codex, Gemini, OpenCode, Pi, Roo, Cline, Windsurf, VS Code prompt files, Goose. |
| Effort / variant | `effort` (`low`..`max`): Claude; `variant`: OpenCode (named model variant, provider-defined). Same family, not the same meaning (section 4, C14). |
| Shell selection for interpolation | `shell: bash|powershell`: Claude only. |

## 2. Proposed canonical ACF core schema

### 2.1 Frontmatter (`commands/<name>.md` or `commands/<name>/COMMAND.md`)

| Canonical field | Type / enum | Default | Meaning (exactly one) | Origin tools | Status vs SPEC §11 |
|---|---|---|---|---|---|
| `name` | slug | file/dir basename | Stable command identifier; the invoked name before host prefixes. | all | exists |
| `namespace` | slug[] (0–4 items) | `[]` | Ordered name segments before `name`; invocation `/<ns1>:<ns2>:<name>` where native. | Gemini, Claude plugins | new |
| `description` | string, 1–1024 | required for ACF sources; readers synthesize per section 5.3 | Menu/help text. | all | exists |
| `argument-hint` | string | derived from `arguments` when omitted (section 2.3) | Display-only usage hint; never validated or substituted. | Claude, Codex, Copilot, VS Code, Pi, Roo, Devin, Goose | new (replaces reserved `argumentHint`, §15) |
| `arguments` | list of `ArgumentSpec` (a bare slug is shorthand for `{name}`) | `[]` | Ordered named arguments bound **by position** to the whitespace-split, shell-quoted argument list. | Claude, Goose, ACF; metadata from MCP/MCPB prompts, Goose recipes, Lume | exists (names only); widened |
| `arguments[].name` | slug, not `arguments` | — | Placeholder name for `$name`. | Claude, Goose, MCPB, MCP | exists |
| `arguments[].description` | string | — | Human help for one argument. | MCP prompts, Goose recipes, Lume | new |
| `arguments[].required` | boolean | `false` | Invocation without this position is an author error the host may reject; otherwise substitutes empty. | MCP prompts, Goose recipes (`requirement`), Lume | new |
| `arguments[].default` | string | — | Value substituted when the position is absent. | Pi, Goose recipes | new |
| `invocation.model` | boolean | `false` | Whether the model may also invoke the command autonomously. User invocation is always on for commands. | Claude, Copilot (and Devin `triggers`) | new (skills already have `invocation`) |
| `agent` | string (agent reference, §11.4 resolution) | current agent | Agent that processes the expanded prompt. | ACF, OpenCode, VS Code, Roo (`mode`), Claude, Devin | exists |
| `context` | enum `inline` \| `fork` | `inline` | `inline`: expanded prompt joins the current conversation (with `agent`, as that agent/mode). `fork`: runs in an isolated subagent whose final result returns. | Claude, VS Code skills (`context: fork`), OpenCode (`subtask`), Devin (`subagent`) | new (replaces reserved `subtask`) |
| `model` | `inherit` \| `<provider>/<model-id>` | `inherit` | Model used for this invocation. | Claude, OpenCode, VS Code, Devin, Goose | new (replaces reserved `model`) |
| `grants` | list of `{operation, match?}` (operation from §24) | `[]` | Pre-approve these operations while the command is active. Never restricts. | Claude, Copilot, Devin | **pending runtime taxonomy**; until then per-target extras |
| `tools` | list of tool selectors (`<operation>`, `mcp:<server>`, `mcp:<server>/<tool>`) | unrestricted | Restrict tools available during the command to this allowlist. Never grants. | VS Code, Goose (`extensions`); Claude denylist only | **pending runtime taxonomy** |
| `assets` | list | `[]` | Explicit asset references (§16). | ACF | exists |
| `only` / `except` / `targets` | §6 / §7 | — | ACF applicability and per-target extras; never emitted to native files. | ACF | exists |

`ArgumentSpec` name rule: slug, and not equal to `arguments`. Tokenization uses the longest *declared* name, so `$issue-number` resolves to a declared `issue-number` before `issue`; writers rename to target-safe identifiers where a target's tokenization of hyphens is unknown (section 3, row `$name`). This keeps today's slug rule (no `acf: 2` change).

Size: 12 frontmatter fields in the core plus 4 argument sub-fields; 2 of the 12 (`grants`, `tools`) are defined now but held behind the runtime taxonomy (SPEC §14.5) and accepted only as per-target extras until it ships.

### 2.2 Body template grammar (new; SPEC §11 defines none today)

The body is CommonMark plus exactly these tokens. Everything else is literal text for every target, and writers escape it so no target interprets it (section 3, escape row). Tokens are recognized outside fenced/inline code except the shell forms, which are code-span shaped.

| Token | Meaning | Origin tools |
|---|---|---|
| `$ARGUMENTS` | The raw argument text as typed. | Claude, Codex, OpenCode, Pi, Goose, Kiro, Gemini (`{{args}}`) |
| `$ARGUMENTS[N]` | 0-based positional argument after shell-style splitting; empty when absent (or `default`). | Claude, Goose (same spelling, same base) |
| `$name` | Declared argument by position; empty when absent (or `default`). | Claude, Goose |
| `\$` | Literal `$` (CommonMark-compatible). | Claude (`\$`), Codex (`$$`) |
| `` !`cmd` `` and a fenced block opened with ```` ```! ```` | Before the model sees the prompt, run `cmd` with the project root as working directory and insert stdout. A non-zero exit aborts the invocation. Argument tokens inside are substituted shell-quoted. | Claude, OpenCode, Gemini (`!{}`) |
| `@{path}` | Insert the content of the workspace file `path` (project-root-relative) at expansion time. Files only. | Gemini (`@{}`), OpenCode (`@path`), Claude (`@path`, unverified) |
| `${ACF_CAPABILITY_DIR}` | Absolute directory of the installed capability (existing §13.6.3 placeholder, extended to command bodies). | Claude (`${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`), Goose (`{{ recipe_dir }}`), Amp (`{baseDir}`) |

Bare `$<digit>` is **forbidden** in canonical bodies (`acf.command.ambiguous-positional`, error): Claude reads `$1` as the second argument and every other tool reads it as the first. Readers convert each source's `$N` to `$ARGUMENTS[k]` using that source's base.

Behavioral contract (no field):

- **Unreferenced arguments.** When the body contains no argument token, the raw arguments are appended after the body. Hosts that append natively do so in their own format (Claude `ARGUMENTS: ...`, Gemini full typed command); writers for other hosts append an explicit trailing `$ARGUMENTS` equivalent.
- **Missing arguments** substitute `default` or empty. Writers for hosts whose missing-argument behavior differs translate (Claude: section 3) or degrade.
- **Expansion order**: `@{}` file inclusion, then argument substitution, then shell execution. Substituted values are not re-scanned (Claude and Gemini both document single-pass behavior).

### 2.3 Derived values

- `argument-hint` absent and `arguments` present: writers emit `[name]` per argument, `[name?]` for non-required, `[name=default]` with a default. This is how `arguments[].description/required` degrade on hint-only targets.
- `description` absent on import: see section 5.3.

### 2.4 Writer form selection (per target)

A command is emitted in exactly one native form per target. Picking a form must not broaden invocation: a canonical `invocation.model: false` command never lands where a host that ignores the user-only switch would let the model call it.

| Target | Native form chosen | Why |
|---|---|---|
| Claude (plugin, per goal) | File form: plugin `commands/<ns>/<name>.md`; directory form: plugin `skills/<name>/SKILL.md` with `disable-model-invocation: true` | Plugin `commands/` is recursive, so support files must not sit there (section 6, bug B4). |
| Copilot CLI / VS Code via Agent Plugins | `com.github.copilot/commands/<name>.md` inside the Agent Plugins package | Agent Plugins has no portable commands. Portable `skills/` cannot express user-only and Cline's strict Agent Plugins skill parser rejects unknown frontmatter. |
| VS Code Local (loose) | `.github/prompts/<name>.prompt.md` | Native prompt files. Agent Host ignores them (declared D). |
| Codex | User scope: `~/.codex/prompts/<name>.md`. Project scope: **E** unless `targets.codex.as: skill` opts into a skill under `.agents/skills/` with `agents/openai.yaml` `policy.allow_implicit_invocation: false` **and** `disable-model-invocation: true` | `.agents/skills` is also read by OpenCode, Goose, Amp and Gemini, which ignore both switches, so those hosts would gain a model-invocable skill. The opt-in records acceptance of that broadening. |
| Cursor | Cursor plugin `commands/<name>.md`; loose: `.cursor/skills/<name>/SKILL.md` with `disable-model-invocation: true` | Cursor's own skill directory honours the switch; legacy loose command path unverified. |
| OpenCode | `.opencode/commands/<name>.md`, `~/.config/opencode/commands/<name>.md` | Native. |
| Pi | `.pi/prompts/<name>.md`, `~/.pi/agent/prompts/<name>.md` | Native (current code writes `commands/`, which Pi ignores). |
| Gemini | `.gemini/commands/<ns>/<name>.toml` (`description`, `prompt`) | Native TOML. |
| Roo | `.roo/commands/<name>.md` | Native. |
| Cline | `.cline/workflows/<name>.md` | Native, body only. |
| Windsurf Cascade | `.devin/workflows/<name>.md` | Native, body only, 12,000 characters. |
| Devin Local | `.devin/skills/<name>/SKILL.md` with `triggers: [user]` | Devin's command equivalent; `.devin/skills` is Devin-only. |
| Goose | Recipe file + `slash_commands[]` entry (shared region in user config) | Only command mechanism. |
| Lume | `.lume/skills/<name>/SKILL.md` with `disable-model-invocation: true` | `/skill:<name>` is Lume's only declarative user invocation. |
| Kiro | Skill under `.kiro/skills/` | Only slash mechanism. Invocation switch unverified, so E unless opted in. |
| Amp | **E** | No declarative user-invoked prompt exists; a skill would be model-invoked. |

When two targets share a discovery location, writers must not each write their own dialect into it. `.claude/commands/` is read by Claude and Copilot CLI and imported by Devin Local, and `.claude-plugin` packages are read by Claude, Copilot and VS Code. Emitting a Claude dialect file there exposes Claude-only tokens (`$ARGUMENTS[0]`, `` !`cmd` ``) to hosts whose handling is unverified. Section 4 (C12) covers this.

## 3. Field-level support table

Row keys are canonical fields, enum values and body tokens. Diagnostic codes for D/E cells are in section 3.3.

### 3.1 Current ACF targets and package formats

| Canonical | Claude | Codex | Cursor | OpenCode | Pi | Copilot CLI | VS Code | Agent Plugins 1.0 |
|---|---|---|---|---|---|---|---|---|
| Form / location | N(plugin `commands/`; dir form as skill) | N(`~/.codex/prompts/`, user only); project E (opt-in skill) | N(plugin `commands/`); loose T(user-only skill) | N(`commands/`) | N(`prompts/`) | N(`.claude/commands/`, `com.github.copilot/commands/`) | N(`.github/prompts/*.prompt.md`, Local); Agent Host D | U (client namespaces only) |
| `name` | N(stem) | N(stem; host shows `/prompts:<n>`) | N(`name`) | N(stem) | N(stem) | N(stem) | N(`name`) | — |
| `namespace` | N(subdirs to `:`, plugin) | D(flatten `ns-name`; subdirs ignored) | D(flatten) | D(flatten; nesting unverified) | D(flatten; non-recursive) | ? D(flatten) | D(flatten) | — |
| `description` | N | N | N | N | N | N | N | — |
| `argument-hint` | N(`argument-hint`) | N | ? D(drop) | U D(drop) | N | N | N | — |
| `arguments[].name` | N(`arguments` + `$name`) | T(positional `$k+1`, max 9; beyond D) | ? D(prose) | T(`$k+1`) | T(`$k+1`) | ? D(prose) | D(prose; `${input:}` is model-mediated) | — |
| `arguments[].description` / `required` | T(into derived hint) | T(hint) | D(drop) | D(drop) | T(hint) | T(hint) | T(hint) | — |
| `arguments[].default` | D(empty when absent) | D | D | D | N(`${k+1:-default}`) | D | D | — |
| `invocation.model: false` | T(`disable-model-invocation: true`) | N(explicit-only) | N(plugin cmd); T(skill flag) | N | N | T(`disable-model-invocation: true`) | N | — |
| `invocation.model: true` | N(default) | D(stays explicit-only; narrowing) | T(skill without flag) / D | D(narrowing) | D(narrowing) | N(default) | D(narrowing) | — |
| `agent` (inline) | D(Claude `agent` acts only with fork; dropped) | U D | ? D | N(`agent`, primary) | U D | U D | N(`agent`) | — |
| `context: inline` | N(default) | N | N | T(`subtask: false` when `agent` is a subagent) | N | N | N | — |
| `context: fork` | N(`context: fork` + `agent`) | U D(inline) | U D | N(`subtask: true`) | U D | U D | D(prompt files lack it) | — |
| `model` | T(`anthropic/<id>` to `<id>`; `inherit` native; other providers D) | U D | ? D | N(`provider/model`) | U D | U D | D(needs display-name map; unmapped D) | — |
| `grants` (pending) | T(`allowed-tools` patterns; never widen) | U D(drop = more prompts) | ? D(drop) | U D(drop) | U D(drop) | T(`allowed-tools`) | U D(drop) | — |
| `tools` (pending) | E unless complement is enumerable as `disallowed-tools` | E | E | E | E | E | N(`tools`) | — |
| `$ARGUMENTS` | N | N | ? D(prose) | N | N(`$ARGUMENTS`/`$@`) | ? | D(prose; trailing text is native) | — |
| `$ARGUMENTS[N]` | T(synthesized named arg, so missing = empty) | T(`$N+1`) | ? D | T(`$N+1`) | T(`$N+1`) | ? | D | — |
| `$name` | N(rename to `[a-z0-9_]` if hyphenated, unverified tokenization) | T(positional) | ? D | T(positional) | T(positional) | ? | D | — |
| `\$` and literal-`$` safety | N(`\$`) | T(`$$`; also escape literal `$UPPER`, `$digit`) | — | ? D(if literal `$digit`/`$ARGUMENTS` text occurs) | ? D(same) | ? | — | — |
| Unreferenced-args append | N | ? T(explicit trailing `$ARGUMENTS`) | N(same message) | ? T(explicit) | ? T(explicit) | ? | N(same message) | — |
| `` !`cmd` `` | N; cwd T(prefix `cd "${CLAUDE_PROJECT_DIR}" &&`); quoted-argument substitution unverified: E if args inside | U D(prose instruction) | U D | N(cwd project root); failure behavior ? | U D | ? D | U D | — |
| `@{path}` | ? D(prose) until `@path` inclusion is verified | U D | ? D | T(`@path`; spaces D) | U D | ? D | D(`#file:` reference, not inclusion) | — |
| `${ACF_CAPABILITY_DIR}` | T(`${CLAUDE_PLUGIN_ROOT}` in plugin; absolute path loose) | T(absolute) | T(absolute) | T(absolute) | T(absolute) | T(absolute) | T(absolute) | — |
| Support files / assets | T(dir form as skill dir; never `.md` into `commands/`) | T(subdir of `prompts/`, which is ignored) | T | T(outside `commands/`) | T(subdir; non-recursive) | T | N(relative links) | — |

### 3.2 Other inventoried tools

| Canonical | Gemini CLI | Roo | Cline | Windsurf Cascade | Devin Local | Goose | Kiro | Amp | Lume | MCPB prompts |
|---|---|---|---|---|---|---|---|---|---|---|
| Form / location | N(`commands/**/*.toml`) | N(`.roo/commands/`) | N(`workflows/`) | N(`.devin/workflows/`) | T(skill, `triggers: [user]`) | T(recipe + `slash_commands`) | T(skill) ? | E | T(user-only skill) | N(`manifest.json` `prompts[]`) |
| `name` | N(path) | N(stem) | N(stem) | N(stem) | N(dir) | N(`command`) | N(dir) | — | N(dir) | N(`name`) |
| `namespace` | N(subdir `:`) | D(not recursive) | ? D | D | D | D | D | — | D | D |
| `description` | N | N | ? D | T(body heading) | N | N(+ `title` T from name) | N | — | N | N |
| `argument-hint` | U D | N | ? D | U D | N | U D | ? D | — | U D | U D |
| `arguments[].name` | D(prose; only `{{args}}`) | U D | ? D | U D | ? D | T(one trailing `parameters[]` key via slash; more D) | ? D | — | D(prose) | N(`arguments` + `${arguments.x}`) |
| `arguments[].description` / `required` | D | T(hint) | D | D | T(hint) | N(`description`, `requirement`) | D | — | D | D(names only) |
| `arguments[].default` | D | D | D | D | D | N(`default`) | D | — | D | D |
| `invocation.model: false` | N | N | N | N | T(`triggers: [user]`) | N | ? E | — | T(`disable-model-invocation: true`) | N |
| `invocation.model: true` | D | D | D | D | N(`triggers: [user, model]`) | D | ? | — | D | D |
| `agent` (inline) | U D | T(`mode`) | ? D | U D | U D(Devin `agent` implies subagent) | U D | ? D | — | U D | U D |
| `context: fork` | U D | U D | ? D | U D | N(`subagent: true` / `agent`) | U D | ? D | — | U D | U D |
| `model` | U D | U D | ? D | U D | T(`model` alias/ID; unmapped D) | T(`settings.goose_provider` + `goose_model`) | ? D | — | U D | U D |
| `grants` (pending) | U D (extension `policies/` is package-wide) | U D | ? D | U D | T(`allowed-tools` / `permissions.allow`) | U D | ? D | — | U D | U D |
| `tools` (pending) | E (`excludeTools` is extension-wide) | E | E | E | E | T(`extensions`, MCP-server granularity only; otherwise E) | E | — | E | E |
| `$ARGUMENTS` | T(`{{args}}`) | ? D | ? D | U D | ? D | T(single parameter) | ? N(CLI) | — | D(prose) | D |
| `$ARGUMENTS[N]` | D(prose) | ? D | ? D | U D | ? D | D | ? D | — | D | D |
| `$name` | D(prose) | ? D | ? D | U D | ? D | T(`{{ key }}`) | ? D | — | D | N(`${arguments.name}`) |
| Unreferenced-args append | N(full typed command) | ? | ? | ? | ? | — | ? | — | N(same message) | — |
| `` !`cmd` `` | T(`!{cmd}`; quoting N; failure continues D) | U D | ? D | U D | ? D | U D(`retry.checks` is not interpolation) | ? D | — | U D | U D |
| `@{path}` | N(`@{path}`) | U D | ? D | U D | ? D | D(file parameters insert user-chosen files) | ? D | — | U D | U D |
| `${ACF_CAPABILITY_DIR}` | T(absolute) | T | T | T | T | T(`{{ recipe_dir }}`) | T | — | T | U D |
| Length limit | — | — | — | E if over 12,000 characters | — | — | — | — | — | — |

### 3.3 Diagnostics for D and E cells

| Code | Severity | Fired when |
|---|---|---|
| `acf.command.ambiguous-positional` | error | Canonical body contains bare `$<digit>`. |
| `acf.command.reserved-argument-name` | error | An argument is named `arguments`. |
| `acf.command.shell-arg-unquoted` | error (per target) | Argument tokens appear inside a shell span and the target's quoting is not verified. |
| `acf.adapter.command-form-refused` | error | E cells: the only native carrier would broaden invocation, or the target has none (Amp, Codex project scope without opt-in, Kiro). |
| `acf.adapter.command-placeholder-degraded` | lossy | An argument token is rewritten to prose ("the first word of the user's arguments"). |
| `acf.adapter.command-argument-metadata-dropped` | lossy | `description`/`required`/`default` cannot be carried, even in a hint. |
| `acf.adapter.command-shell-degraded` | lossy | `` !`cmd` `` becomes an instruction asking the agent to run the command (model-mediated and permission-checked, never pre-executed). |
| `acf.adapter.command-shell-failure-continues` | lossy | Target injects failure output instead of aborting (Gemini). |
| `acf.adapter.command-include-degraded` | lossy | `@{path}` becomes an instruction to read the file. |
| `acf.adapter.command-agent-dropped`, `acf.adapter.command-fork-dropped` | lossy | `agent` or `context: fork` has no carrier; runs inline in the current agent. |
| `acf.adapter.command-model-unmapped` | lossy | `model` cannot be expressed; host default used. Model choice is a preference, so dropping it fails safe. |
| `acf.adapter.command-grants-dropped` | lossy | Grants omitted; the user sees more approval prompts. Writers never widen a pattern to fit coarser native grammar. |
| `acf.adapter.command-tools-unenforceable` | error | `tools` restriction cannot be enforced. Dropping it would widen tool access, so the writer refuses. |
| `acf.adapter.command-invocation-narrowed` | lossy | `invocation.model: true` on a target whose commands are explicit-only. |
| `acf.adapter.command-namespace-flattened` | lossy | `namespace` joined into `name`; reports the effective invocation name. |
| `acf.adapter.command-name-collision` | error | Same effective name as a skill/command in a shared namespace (Claude, Copilot, Devin, Codex-as-skill), or the name shadows a target built-in. |

## 4. Conflicts that must not be unioned

| # | Conflict | Evidence | Canonical handling |
|---|---|---|---|
| C1 | **`$N` index base inverted.** Claude `$0` = first and `$1` = second; Codex, OpenCode, Pi and Goose `$1` = first. | Claude skills doc; OpenCode/Codex docs; Pi and Goose inventories | Bare `$<digit>` forbidden. Canonical `$ARGUMENTS[N]` is 0-based (the one spelling with the same meaning in Claude and Goose). Readers convert by source base; writers emit the target base. |
| C2 | **Named binding: position vs keyword.** Claude/Goose `$name` binds by declared order; Codex `$NAME` binds `NAME=value` (any order, call-site syntax differs); VS Code `${input:x}` asks the model. | Codex prompts doc; Claude doc; VS Code inventory | Canonical binds by position. Codex keyword prompts are preserved raw in `targets.codex.template` for Codex, and translated elsewhere to positions in order of first appearance with `acf.adapter.command-placeholder-degraded`, because users must change how they call it. |
| C3 | **Missing argument behavior.** Claude: indexed stays literal, named becomes empty; Goose: empty; Pi: optional default; others undocumented. | Claude doc; Goose source | Canonical: `default` or empty. The Claude writer maps every positional token to a synthesized named argument so missing values become empty. |
| C4 | **Unreferenced arguments.** Claude/Goose append `ARGUMENTS: raw`; Gemini appends the full typed command; Pi skills append `User: args`; Codex/OpenCode/Pi templates undocumented. | docs above | Canonical: raw arguments are appended. Format is host-defined (info). Writers for undocumented hosts append an explicit trailing all-args token, which needs fixture verification against double-appending (section 7). |
| C5 | **Shell failure contract inverted.** Claude aborts the invocation on non-zero exit (with an exit-1 carve-out for search commands); Gemini injects stderr and status and continues. | Claude doc; Gemini doc | Canonical = abort, the fail-closed choice: the model never acts on partial context. Gemini is D with `acf.adapter.command-shell-failure-continues`. The writer does not try to emulate aborting. |
| C6 | **Shell working directory.** Claude: session cwd, which moves with `cd`; OpenCode: project root; Gemini: unverified. | Claude doc; OpenCode doc | Canonical = project root. Claude writer prefixes `cd "${CLAUDE_PROJECT_DIR}" && `. |
| C7 | **Shell argument quoting.** Gemini shell-escapes `{{args}}` inside `!{}`; Claude and OpenCode quoting of substituted values inside shell is undocumented. | Gemini doc | Canonical substitutes shell-quoted. Targets without verified quoting get E (`acf.command.shell-arg-unquoted`) rather than an injection-prone emit. |
| C8 | **Shell approval model.** Claude checks permission rules without prompting (deny aborts; `disableSkillShellExecution` blanks it); Gemini confirms each resolved command; OpenCode undocumented. | docs | Not a field. The canonical template carries no approval promise; host trust policy applies. Writers never add grants to make interpolation silent. |
| C9 | **File interpolation semantics.** Gemini/OpenCode insert content eagerly from workspace-relative paths (Gemini also whole directories); VS Code `#file:` and Markdown links are prompt-relative references the model reads. | inventories | Two canonical constructs: `@{path}` = eager, workspace-relative, files only; a Markdown link to a bundled file = §16 asset reference. Gemini directory inclusion is a Gemini extra. They are never mapped onto each other. |
| C10 | **`agent` overloaded.** VS Code/Roo switch the primary agent inline; Claude `agent` only selects the fork's subagent; Devin `agent` implies a subagent; OpenCode's meaning depends on the referenced agent's `mode`. | inventories | Split into `agent` (who) and `context` (`inline`/`fork`). OpenCode writer sets `subtask` explicitly in both directions; Claude inline+agent is D. |
| C11 | **`allowed-tools` grants vs restricts.** Claude, Copilot and Devin treat it as pre-approval; Kiro's Power Builder describes it as tool restriction; VS Code `tools` is an availability allowlist; Claude `disallowed-tools` is a denylist. | Claude, Copilot, Devin, Kiro, VS Code inventories | Two canonical fields, `grants` and `tools`, never converted into each other. Dropping `grants` is safe (more prompts); dropping `tools` widens access, so it is E. |
| C12 | **Shared discovery locations, different dialects.** `.claude/commands/` is read by Claude and Copilot and imported by Devin; `.claude-plugin` packages are read by Claude, Copilot and VS Code; `.agents/skills/` is read by about ten hosts with different invocation controls. | inventories | Writers own a location only when its readers have a verified common dialect. Otherwise each location's emitted body is restricted to the intersection of its readers' verified tokens, and other tokens degrade, or the command goes to a target-private location (section 2.4). The capability's applicability (`only`/`except`) must not be bypassed by such leakage; report it as info. |
| C13 | **Collision and precedence policies.** Claude: skill beats same-name command; Copilot: priority dedupe; Gemini: renames extension command `/ext.cmd`; Pi: `:1` suffixes; OpenCode: custom overrides built-ins; Goose: cannot shadow built-ins; Roo: project > global > built-in. | inventories | ACF resolves its own collisions before emission (§17.6). Writers then check the effective native namespace, which spans skills and commands for Claude, Copilot and Devin and includes built-ins, and raise `acf.adapter.command-name-collision`. No host collision policy enters the core. |
| C14 | **Effort vs variant.** Claude `effort` is an ordered level; OpenCode `variant` is a provider-defined named option set. | Claude, OpenCode inventories | Not unioned; both stay per-target extras (open question Q9). |
| C15 | **Default model-invocability of commands.** On for Claude/Copilot commands, never elsewhere. | inventories | Canonical default `invocation.model: false`. Importing a Claude command without `disable-model-invocation` sets `true` explicitly, so the round trip is faithful. |
| C16 | **Agent Plugins strictness vs client switches.** Portable `skills/` cannot carry `disable-model-invocation` (Cline's Agent Plugins lane rejects unknown frontmatter; OpenCode, Gemini, Goose and Amp ignore it). | Cline, Agent Plugins inventories | Commands are never emitted into portable `skills/`; they go into client namespaces (`com.github.copilot/commands/`) or target-native packages. |

## 5. Per-target extras and lossless round trips

### 5.1 What stays raw

Per SPEC §7, extras live in `targets.<target>` on the command frontmatter. Each target has its own command extension schema (today one shared schema serves all five targets). A key that a canonical field already owns for that target is an error. The one exception is `model` (section 7, Q6).

| Target | Raw extras (frontmatter) | Raw body constructs (need `template`) |
|---|---|---|
| Claude | `effort`, `when_to_use`, `background`, `shell`, `paths`, `hooks` (session-lived), `disallowed-tools`, `allowed-tools` (until taxonomy), `license`, `compatibility`, `metadata`, native `model` alias (`opus`, `sonnet`), manifest command-map `content` form | `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}` (when not mapped to an asset), shell spans containing argument tokens, `@path` until verified |
| Codex | keyword placeholders, `agents/openai.yaml` (`interface.*`, `dependencies`) when emitted as skill | `$NAME` keyword tokens |
| Copilot / VS Code | `allowed-tools` (Copilot), `tools`, `agent` built-ins (`ask`, `agent`, `plan`), `model` display name | `${selection}`, `${input:name[:placeholder]}`, `#tool:`, `#file:` |
| Cursor | file extension (`.mdc`, `.markdown`, `.txt`), `icon`, `color` (skill form) | — |
| OpenCode | `variant`, JSON-config form (`command.<n>` instead of a file), native `model` | `@path` with spaces |
| Pi | — | `${@:N}`, `${@:N:L}`, `${@:-default}`, `$@` (kept as written) |
| Gemini | TOML formatting, extension conflict naming | `@{dir}` recursive inclusion, `{{args}}` positions where raw vs escaped placement matters |
| Roo | — (`mode` maps to canonical `agent`) | — |
| Goose | recipe-only fields: `response.json_schema`, `retry.*`, `sub_recipes[]`, `activities`, `settings.temperature`, `settings.max_turns`, parameter `input_type`, `options`, `requirement: user_prompt`; Jinja `{% extends %}` | Jinja constructs beyond `{{ key }}` |
| Devin | `permissions.{allow,deny,ask}` (until taxonomy), `subagent` vs `agent` precedence | — |
| Windsurf | — | Free-form workflow Markdown (already the body) |

`targets.<t>.template` holds a complete native body that replaces the canonical body for target `t` only. Readers set it whenever the source body uses a construct without canonical meaning. The canonical body then holds a degraded rendering for every other target, with diagnostics recorded at read time. Authors may also set it by hand. It is a whole-field replacement at the target boundary, not a merge, which keeps the one-owner rule.

### 5.2 Round-trip contract

1. **Unchanged same-format package**: byte-and-mode copy of the preserved native snapshot (advisor rule 2). No reserialization, so the following survive: Claude `arguments` written as a space-separated string, `allowed-tools` as a comma string, legacy `commands/` vs `skills/` placement, Gemini TOML comments, Cursor `.mdc` extensions.
2. **Translated or modified**: emit the typed projection plus `targets.<t>` extras and `template` for the matching target. The reader records `targets.<source>.native = { path, format, frontmatterKeyOrder }` so regeneration restores file placement and key order. Value-shape variants (string vs list) normalize to the shape the target documents; that loss is acceptable under advisor rule 3 and is reported as info.
3. **Exclusion safety**: a raw remainder cannot resurrect an excluded facet. If an import filter or `only`/`except` removes a command, its `targets.*` data goes with it. A preserved plugin `commands` manifest map (Claude) is regenerated from the surviving commands, never copied.

### 5.3 Reader rules (new)

- **Name**: native stem or `name`; native subdirectories become `namespace`. Names outside the slug pattern (Copilot allows spaces, periods, colons in skills; Gemini sanitizes) are slugified, and the original is kept in `targets.<source>.native.name` so the invocation name survives.
- **Description absent**: synthesize with the *source tool's* documented fallback (Pi first non-empty body line, Claude first paragraph, Gemini filename) and record `targets.<source>.native.descriptionDerived: true`, so a same-format writer omits it again.
- **Placeholders**: convert by source dialect (`$N` with the source base, Gemini `{{args}}` to `$ARGUMENTS`, Pi `$@` to `$ARGUMENTS`, Codex `$$` to `\$`, OpenCode `@path` to `@{path}`, Gemini `!{}` to `` !`...` ``). A file containing *any* unmappable token gets `template` (5.1).
- **Claude**: `.claude/commands/**/*.md` and plugin `commands/` become command facets. Plugin `skills/*` with `disable-model-invocation: true` and `$ARGUMENTS`-family tokens stay **skills**. The reader does not guess intent; the skills facet owns that decision.
- **MCP prompts** (Claude, Devin) and MCPB `prompts[]` are not command facets; they belong to the MCP facet. The MCPB reader may offer a declared conversion.
- **Code-registered commands** are preserved inside the extension-module facet and never projected.

## 6. Delta vs current ACF SPEC and code

### 6.1 Exists today

- SPEC §8/§11: `commands/<name>.md` and `commands/<name>/COMMAND.md`; frontmatter `name`, `description` (required), `arguments` (slug list), `agent` (§11.4 resolution order), `assets`, `only`, `except`, `targets`. §15 reserves canonical `model`, `subtask`, `argumentHint`; §25 lists them as open.
- `packages/core/src/types/model.ts` `CommandFacet` matches §11; `schemas/index.ts` `commandFrontmatterSchema`; `reader/index.ts` `frontmatterKeys.command` (unknown keys diagnosed).
- `packages/core/src/targets/extensions.ts` `commandExtension` = `{argumentHint, model, subtask, agent}`, one schema shared by every target. No adapter reads any of these keys.
- Registry support (`registry.ts`): claude `full`, codex `partial`, cursor `partial`, opencode `partial`, pi `full`.

### 6.2 Defects found (current behavior, verified in code)

| # | Defect | Location |
|---|---|---|
| B1 | **No body placeholder grammar.** SPEC §11.5 example uses `{focus}`; adapter fixture `fix.md` uses `{{issue}}`; no host substitutes either. Arguments never bind. Claude falls back to appending `ARGUMENTS:`, while OpenCode and Pi show the braces literally. | SPEC §11.5; `packages/adapters/tests/fixtures/full/commands/fix.md` |
| B2 | **Canonical frontmatter emitted verbatim** to every target: `targets`, `only`, `except`, `assets` and `arguments` leak into native files; `targets.<t>.argumentHint/model/subtask` are never translated (`argument-hint`, `model`, `subtask` never appear). | `common/emitter.ts` `emitProseFiles` uses `renderMarkdownFile(facet.frontmatter, body)` |
| B3 | **Wrong native locations.** Codex writes `.codex/commands/` (Codex reads `~/.codex/prompts/`, user scope only); Pi writes `.pi/commands/` (Pi reads `prompts/`). The registry still says Pi command support is `full`. | `emitter.ts` `layoutFor` `commandDir`; `registry.ts` |
| B4 | **Assets land inside command directories.** Referenced command assets are copied next to the command file (test expects `.claude/commands/examples.md`). Claude discovers `commands/**/*.md` recursively, and OpenCode `commands/`, so a Markdown asset becomes an extra slash command (`/examples`). | `emitProseFiles`; `packages/adapters/tests/claude.test.ts` |
| B5 | **Cursor emits no commands** (lossy "not natively supported"), although Cursor plugins have `commands/` and Cursor skills honour `disable-model-invocation`. | `emitter.ts` `diagnoseCursorProse`; cursor adapter `cursorRulesOnly` |
| B6 | **Default model-invocability not controlled.** Claude command files without `disable-model-invocation` are model-invocable, unlike every other target's commands. | emitter (no translation) |
| B7 | **Per-target extension schema is not per target.** Every target accepts `subtask`, which only OpenCode understands; Claude's `effort`/`allowed-tools`, VS Code's `tools`, Pi's nothing. | `targets/extensions.ts` |
| B8 | **Cross-family name collision unchecked for shared namespaces.** §5.4 allows skill `x` and command `x`; in Claude, Copilot and Devin they collide (the skill silently wins). | SPEC §5.4; no adapter check |
| B9 | **No foreign readers** for Claude commands, Gemini TOML, OpenCode, Codex prompts, Pi prompts, VS Code prompt files, Roo commands. | `reader/index.ts` reads canonical `commands/` only |

### 6.3 Changes and additions

| Area | Change |
|---|---|
| SPEC §11.2 | Add `namespace`, `argument-hint`, `invocation.model`, `context`, `model`; widen `arguments` to `ArgumentSpec`; reserve `grants` and `tools` behind §14.5. Additive within `acf: 1` (§15 permits additive fields). |
| SPEC §11 (new subsections) | Body template grammar (2.2), behavioral contract, forbidden bare `$<digit>`, expansion order, shell and include semantics (C5–C9). |
| SPEC §11.5 | Replace example body `{focus}` with `$focus`, and `targets.claude.argumentHint` with canonical `argument-hint`. |
| SPEC §15 / §25 / CONTEXT.md open questions | Remove command `model`, `subtask`, `argumentHint` from the reserved and open lists (now `model`, `context`, `argument-hint`). |
| SPEC §13.6.3 | Extend `${ACF_CAPABILITY_DIR}` to command bodies. |
| SPEC §5.4 | Add a writer-level check: skills and commands share one namespace on Claude, Copilot, Devin, Codex-as-skill and Lume/Kiro skill forms. |
| SPEC §7 | Per-target command extension schemas; `targets.<t>.template` whole-body replacement; `targets.<source>.native` provenance; the `model` override rule (Q6). |
| SPEC §22 / registry | Replace family-level `command` support with field-level entries mirroring section 3 (form, placeholders, shell, include, fork, model, invocation). Correct Pi (`prompts/`), Codex (user-scope prompts; project via opt-in), Cursor (plugin `commands/` or user-only skill). Add the targets from the goal: Copilot, VS Code, Gemini, Agent Plugins writer. |
| `model.ts` `CommandFacet` | Typed `ArgumentSpec`, `invocation`, `context`, `model`, `namespace`, `argument-hint`; parsed body token list for writers; `native` provenance. |
| `common/emitter.ts` | Replace `emitProseFiles` for commands with a per-target command writer: frontmatter mapping, body token rewriting and escaping, form selection (2.4), asset placement outside discovery directories, diagnostics (3.3). |
| Tests | Golden tests per target for one canonical command exercising `$ARGUMENTS`, `$ARGUMENTS[0]`, `$name` with default, `\$`, `` !`cmd` ``, `@{path}`; a regression test for B4 (assets never under a discovered `commands/`); a test for C12 leakage. Behavioral checks against real Claude and OpenCode for placeholder bases are needed; golden files alone preserved the current defects. |

## 7. Open questions and unverified claims

| # | Question / unverified claim | Why it matters | Resolve by |
|---|---|---|---|
| Q1 | Copilot CLI and `com.github.copilot/commands/`: placeholder syntax, shell/file interpolation, schema beyond `description`, `argument-hint`, `allowed-tools`, `disable-model-invocation`. | Copilot reads `.claude/commands` and Claude plugins (C12). | Copilot CLI fixture run. |
| Q2 | Claude: are argument values substituted inside `` !`cmd` ``, and are they quoted? Does `@path` in a skill/command body inline content? Are hyphenated `arguments` names tokenized whole? Do loose `.claude/commands/` subdirectories create `:` names or only labels? | C7, `@{}` row, `$name` row, `namespace` row. | Claude 2.1.x fixture. |
| Q3 | OpenCode: unknown frontmatter keys (rejected or ignored by the V1 schema), missing positional behavior, unreferenced-argument append, `$` escape, shell failure behavior, `@path` base directory, nested `commands/` naming. | B2 safety, C3, C4, C5. | Pinned OpenCode source trace or fixture. |
| Q4 | Pi: literal-`$` escape in templates, unreferenced-argument behavior, behavior of `${N:-}` with an empty default. | Escape and append rows. | Pi 0.87 fixture. |
| Q5 | Codex: missing-argument behavior, whether trailing text is appended without `$ARGUMENTS`, whether Codex discovers `.codex/skills/` (the registry declares it; the inventory does not list it). | Codex form selection; registry correctness. | Codex fixture. |
| Q6 | `model` value mapping: VS Code needs picker display names, Claude needs Anthropic IDs or aliases. Proposal: canonical `<provider>/<id>` plus `targets.<t>.model` as a whole-field replacement for that target. This amends SPEC §7.1 ("not a replacement object for canonical data") for one field. | Union rule vs one-owner rule. | Design decision with the agents facet owner, which has the same issue. |
| Q7 | Runtime taxonomy for `grants` and `tools` (operation + pattern grammar, MCP selectors), shared with the agents facet. | Two core fields are blocked on it. | Taxonomy spec. |
| Q8 | Gemini `!{}` working directory; Cursor command placeholders and legacy local command paths; Roo and Cline argument syntax; Kiro positional syntax (docs render malformed); Devin handling of placeholders in imported `.claude/commands`. | Many `?` cells. | Per-tool fixtures. |
| Q9 | Should `effort` become core (Claude `effort`, Copilot agent `reasoningEffort`, OpenCode `variant` if variants are proven to be effort levels)? | Union candidate kept out by C14. | Agents facet survey. |
| Q10 | Should the skills facet adopt the same argument/placeholder sub-schema (`argument-hint`, `arguments`, body grammar)? Claude, Copilot, VS Code, Devin, Goose and Kiro accept arguments on skills. | Avoids two grammars for one meaning. | Skills facet owner. |
| Q11 | Could MCP prompts serve as the cross-client carrier for commands? Claude, Devin and VS Code expose them as slash commands. | Would give Amp-like and package-only clients a declarative path, but needs a shipped prompt-server runtime. | Later slice; not in the core. |
| Q12 | `title`/`displayName` (Goose recipe `title`, Codex `interface.display_name`, Amp/Lume code-command `title`) is reserved in §15 for all facets. | Possible cross-facet core field. | Cross-facet decision. |
| Q13 | Agent Plugins 1.1.0 draft (Copilot already recognizes it): does it add commands? | Could replace client-namespace emission. | Read the 1.1.0 draft when it is published. |
| Q14 | Time-sensitivity: Claude docs retrieved after the cutoff contain later releases; Amp changes are dated 2026-01-29 and 2026-05-06; Kiro pages are post-cutoff. | Behaviors may not hold for the 2026-10-01 builds. | Pin versions in fixtures. |

## Assessment for the union-without-sacrifice rule

- The core is small: 12 fields, 4 argument sub-fields and 7 body tokens. Ten fields are usable now. `grants` and `tools` wait on the runtime taxonomy.
- **Positional indexing** (C1) is the only same-spelling contradiction. Forbidding bare `$<digit>` resolves it without losing anything.
- **Shell failure** (C5) and **keyword binding** (C2) cannot be unified. They are handled by an explicit canonical choice plus a declared degradation or raw template.
- Two places can sacrifice semantics unless writers refuse. `tools` restrictions cannot be dropped safely (E). The user-only guarantee cannot be expressed in portable Agent Skills or Agent Plugins `skills/` (C16) or in shared skill roots (C12). That forces target-private locations and blocks Codex project scope, Kiro and Amp.
- Many cells are `?`. Until fixtures exist, writers must degrade those cells rather than assume Claude syntax works in hosts that only share Claude's directories.
