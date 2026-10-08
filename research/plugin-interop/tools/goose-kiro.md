# Goose and Kiro - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence dates and status.** Research cutoff: **2026-10-01**. Goose implementation references below use **v1.52.0**, released **2026-09-23**, unless stated otherwise: [release](https://github.com/aaif-goose/goose/releases/tag/v1.52.0). Kiro documents describe **IDE 1.0 / CLI 3.0** as current, but several live pages have update dates **after the cutoff**. Those are explicitly marked **post-cutoff documentation; as-of availability UNKNOWN**. “Documented” does not mean independently runtime-tested.

### Goose — shipped

Required layout: `<skill-directory>/SKILL.md`; supporting files may have arbitrary names and subdirectories. The Skills platform extension is enabled by default. Discovery exposes names/descriptions; full instructions load on relevance or explicit request. User invocation includes `/skills <name> ...`; Open Plugins skills use `plugin-name:skill-name`. [Skills documentation](https://goose-docs.ai/docs/guides/context-engineering/using-skills/)

| Field | Type | Meaning / implementation |
|---|---|---|
| `name` | string | Required for discovery; missing/empty names are skipped. |
| `description` | string | Discovery description; implementation defaults to `""`, despite documentation requiring it. |
| `metadata` | map<string, JSON value> | Free-form properties retained in the discovered skill. |
| `metadata.argument-hint` | string | Argument hint read by the runtime. |
| `metadata.arguments` | string[] | Ordered names for named argument substitution. |
| `license`, `compatibility`, `allowed-tools` | UNKNOWN native semantics | Not represented in Goose’s `SkillFrontmatter`; do not infer enforcement from Agent Skills compatibility. |
| Other top-level frontmatter | UNKNOWN native semantics | Parser’s modeled fields are only `name`, `description`, `metadata`. |

Sources: [frontmatter and argument metadata, lines 32–44, 162–195](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L32-L195); [discovery parsing, lines 443–486](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L443-L486).

**Exact same-name precedence**, first discovered name wins:

1. `<cwd>/.agents/skills/`
2. `<cwd>/.goose/skills/`
3. `<cwd>/.claude/skills/`
4. Enabled project-plugin skill directories
5. `~/.agents/skills/`
6. Platform configuration directory’s `skills/`—normally `~/.config/goose/skills/`
7. `~/.claude/skills/`
8. `~/.config/agents/skills/`
9. Enabled user-plugin skill directories
10. Built-in skills

Scanning is recursive; `.git`, `.hg`, `.svn` are skipped. Same-name ordering **within a recursively scanned directory is not sorted in the inspected implementation**. Project-plugin skills are marked non-writable through source CRUD; user-plugin skills are marked writable. [Discovery roots, lines 354–442](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L354-L442), [scan/deduplication, lines 489–640](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L489-L640).

Supporting files are enumerated when loading a skill; paths resolve from its directory, **but shell execution remains in the session working directory**. The agent must use resolved paths or change directory. No extra metadata file is documented. [Loaded context, lines 125–159](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L125-L159)

### Kiro — documented; skill page updated 2026-10-02, post-cutoff

Layout: `.kiro/skills/<name>/SKILL.md`, `~/.kiro/skills/<name>/SKILL.md`, or power-root `skills/<name>/SKILL.md`. Optional `scripts/`, `references/`, `assets/`. Names/descriptions load at startup; full body loads by description relevance or `/<skill-name>`. References load when instructions direct the agent to them. Same-name workspace skills override global skills according to the Skills page. [Skills](https://kiro.dev/docs/skills/)

| Field | Type | Meaning |
|---|---|---|
| `name` | string, required | Matches directory; lowercase letters, digits, hyphens; maximum 64 characters. |
| `description` | string, required | Activation description; maximum 1024 characters. |
| `license` | string | License name or bundled license reference. |
| `compatibility` | string | Environment requirements. |
| `metadata` | key/value map | Additional metadata such as author/version. |
| `allowed-tools` | experimental; enforcement UNKNOWN | Official Power Builder calls it experimental tool-restriction glob patterns; ordinary Kiro Skills documentation does not list it. |

Sources: [Skills field reference](https://kiro.dev/docs/skills/#frontmatter-fields); [official Power Builder reference, cutoff-pinned](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/power-builder/skills/agent-plugins-reference/SKILL.md).

IDE imports copy a public GitHub **subdirectory or SKILL.md URL**, not repository-root URL, or a local folder. CLI discovery uses files placed in skill directories. Web documents zip upload/update and personal cloud skills. These descriptions are from the post-cutoff Skills page; **availability on 2026-10-01 UNKNOWN**. No tool-specific skill metadata file is documented. [Skills import/scope](https://kiro.dev/docs/skills.md)

**Conflict:** Skills documentation says custom agents need explicit `skill://` resources; the agent reference says they inherit default resources unless `chat.disableInheritingDefaultResources: true`. Resolve before generating agent configurations. [Skills](https://kiro.dev/docs/skills.md), [agent reference](https://kiro.dev/docs/custom-agents/configuration-reference/)

## Instructions and rules

### Goose — shipped

| File/configuration | Semantics |
|---|---|
| `~/.config/goose/.goosehints` | Global natural-language instructions. |
| `<project>/.goosehints`, nested `.goosehints` | Hierarchical project instructions; local conflicts take priority over global. |
| `AGENTS.md` | Default companion context filename, searched before `.goosehints`. |
| `CONTEXT_FILE_NAMES` | Environment variable containing JSON string array; default `["AGENTS.md", ".goosehints"]`; replaces configured filename list. |
| `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, other names | Can be loaded as ordinary context files if explicitly included in `CONTEXT_FILE_NAMES`; native format-specific semantics UNKNOWN. |
| `@relative-file` in hints | Automatically includes referenced content. Plain path references are guidance to read later. |

Requires Developer extension. Session startup loads configured context filenames from working directory through git repository root; subsequent reads/modifications discover nested context files. Loaded hints join the system prompt for each request. No frontmatter activation modes, `.mdc` parser, manual rule activation, or model-decided rule metadata is documented. [Goosehints](https://goose-docs.ai/docs/guides/context-engineering/using-goosehints/)

### Kiro — documented; Steering updated 2026-10-06, post-cutoff

Files: `.kiro/steering/*.md`, `~/.kiro/steering/*.md`; generated foundation documents `product.md`, `tech.md`, `structure.md`. YAML frontmatter must be the first content, with no preceding blank line. Workspace instructions take priority on conflicts; scopes otherwise combine. [Steering](https://kiro.dev/docs/steering/)

| Field | Type | Meaning |
|---|---|---|
| `inclusion` | `always` / `fileMatch` / `manual` / `auto` | Activation mode; default `always`. |
| `fileMatchPattern` | string or string[] | Glob(s) for `fileMatch`. |
| `name` | string | Required identifier for `auto`. |
| `description` | string | Required relevance description for `auto`. |

- `always`: every interaction.
- `fileMatch`: when working with matching files.
- `manual`: `#<steering-file-name>` or `/<filename>`.
- `auto`: model/relevance-selected from description; also slash-invocable.
- CLI V3 documents all four modes; V1/V2 load `always` automatically and exclude `fileMatch`/`manual` from automatic loading.
- `AGENTS.md`: workspace root, nested workspace directories, and `~/.kiro/steering/`; always included, **no inclusion-mode metadata**.
- Native `CLAUDE.md`, `GEMINI.md`, `.mdc` loading: **UNKNOWN**, not documented in this source.

[Steering modes and AGENTS.md](https://kiro.dev/docs/steering.md)

Includes:

| Syntax | Meaning |
|---|---|
| `#[[file:path]]` | Whole file. |
| `#[[file:path:line]]` | One line; IDE / CLI V3. |
| `#[[file:path:start-end]]` | Inclusive range; IDE / CLI V3. |
| `#[[folder:path]]` | One-level folder listing; IDE / CLI V3. |

Relative paths resolve from workspace root for workspace steering, global steering directory for global steering, containing directory for `AGENTS.md`. References obey file-read permissions/ignore rules; unresolved references leave visible markers. **These detailed include semantics are post-cutoff documented; historical availability UNKNOWN.** [File references](https://kiro.dev/docs/steering.md#file-references)

## Subagents and custom agents

### Goose — shipped

Markdown with YAML frontmatter: `~/.agents/agents/<name>.md`, `<project>/.agents/agents/<name>.md`. Compatibility roots: project `.goose/agents/`, `.claude/agents/`; home `~/.goose/agents/`, `~/.claude/agents/`; platform configuration `agents/`. Body supplies instructions. [Custom agents](https://goose-docs.ai/docs/guides/context-engineering/custom-agents/), [release-pinned documentation](https://github.com/aaif-goose/goose/blob/v1.52.0/documentation/docs/guides/context-engineering/custom-agents.md)

| Field | Type | Meaning |
|---|---|---|
| `name` | string, required | Listing, loading, mentions, delegation identifier. |
| `description` | string, optional | Human/listing description. |
| `model` | string, optional | Preferred delegated model. |
| `tools`, `permissions`, `color`, separate MCP definitions | Not supported by documented agent file schema | Agent uses enabled session extensions; use recipe for an explicit extension set. |

Invocation: `@name`, natural-language load, or delegate. **Load** adds instructions to current conversation; **delegate** creates isolated session. Some interfaces support provider/model/temperature/max-turn overrides. Same-name agent precedence is **UNKNOWN from inspected documentation**. [Custom agents](https://goose-docs.ai/docs/guides/context-engineering/custom-agents/)

Delegation uses default-enabled `summon` platform extension’s `delegate` and `load`. Explicit recipe `extensions` replaces defaults, so include `summon`; `sub_recipes` auto-injects it. Subagents are available only in `auto` permission mode, not `approve`, `smart_approve`, `chat`. Defaults: 25 turns, 5-minute timeout, inherited extensions; model/provider defaults via `GOOSE_SUBAGENT_MODEL`, `GOOSE_SUBAGENT_PROVIDER`; recipe settings override them. Nested spawning, extension management, schedule management are blocked. [Subagents](https://goose-docs.ai/docs/guides/context-engineering/subagents/), [recipe reference](https://goose-docs.ai/docs/guides/recipes/recipe-reference/)

### Kiro — documented; agent/subagent references updated 2026-10-02, post-cutoff

Files: `.kiro/agents/<name>.json` or `.md`; user equivalents under `~/.kiro/agents/`. Markdown frontmatter has same fields as JSON; body supplies system prompt. Workspace same-name agent wins. Nested filename path becomes name, e.g. `team/planner.md` → `team/planner`. Workspace profiles require trusted workspace. [Custom agents](https://kiro.dev/docs/custom-agents.md)

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Optional; derived from filename/path when absent. |
| `description` | string | Agent purpose; selection for delegation. |
| `prompt` | string | Inline prompt or `file://` URI; relative URI resolves against profile directory. |
| `model` | string | Model-service ID; unavailable ID falls back with warning. |
| `tools` | string[] | Available tools/tags; `*`, `@builtin`, `@mcp`, `@server`, `@server/tool`; tags include `read`, `write`, `shell`, `web`, `subagent`, `knowledge`, `todo_list`. |
| `excludedTools` | string[] | Tool exclusions; shown in overview but omitted from full field table. Detailed interaction with `tools`: UNKNOWN. |
| `toolAliases` | map<string,string> | Original qualified tool name → exposed alias. |
| `allowedTools` | string[] | No-prompt tool patterns; `*`/`?` glob matching, exact/server patterns; **bare `"*"` does not grant all**, unlike `tools`. |
| `mcpServers` | map<string,server> | Agent-local servers. |
| `includeMcpJson` | boolean | Include global/workspace MCP definitions in addition to profile servers. |
| `includePowers` | boolean | Include IDE-installed powers; documented in overview/new-fields list. Default: UNKNOWN. |
| `permissions` | object | `rules` capability policy; see security. |
| `toolsSettings` | object | Deprecated shell/write policy; retained MCP-specific settings and subagent controls. |
| `toolsSettings.subagent.availableAgents` | string[] | Agent-name glob allowlist; omission allows all. |
| `toolsSettings.subagent.trustedAgents` | string[] | Delegations not requiring permission prompt. |
| `resources` | array<string or knowledge-base object> | `file://` eager context; `skill://` progressive context; specific/glob/absolute/relative paths. |
| `hooks` | event → command-array map | Embedded agent hooks; documentation conflicts on IDE support. |
| `keyboardShortcut` | string | Optional `ctrl`/`shift` plus letter/digit; same shortcut collision disables it. |
| `welcomeMessage` | string | Greeting after switching agent. |
| `color` | Not supported in documented schema | No color field listed. |

Sources: [configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/), [overview including exclusions](https://kiro.dev/docs/custom-agents.md), [subagent controls](https://kiro.dev/docs/custom-agents/subagents/).

Knowledge-base resource fields: `type: "knowledgeBase"`, `source: string`, `name: string` required; optional `description: string`, `indexType: "best"|"fast"` default `best`, `autoUpdate: boolean` default `false`. [Resources reference](https://kiro.dev/docs/custom-agents/configuration-reference/#resources-field)

Automatic or explicit delegation, parallel isolated contexts; custom subagent’s own tools/permissions apply. Parent permission rules also constrain descendants. IDE/CLI can use custom primary agents; Web documents custom project agents for delegation only; Mobile uses built-ins. **As-of cutoff availability of these later-page details UNKNOWN.** [Subagents](https://kiro.dev/docs/custom-agents/subagents/), [permissions, dated 2026-10-01](https://kiro.dev/docs/permissions/)

## Commands and prompts

### Goose — shipped

Custom slash commands are **recipe aliases**, not Markdown command files. In `~/.config/goose/config.yaml`:

| Field | Type | Meaning |
|---|---|---|
| `slash_commands` | array<object> | Alias definitions. |
| `slash_commands[].command` | string | Without `/`; unique, no spaces, case-insensitive; cannot shadow built-ins. |
| `slash_commands[].recipe_path` | string | Local recipe path. |

One trailing parameter supported; additional recipe parameters need defaults. Invalid/missing recipe is sent as ordinary model text. This mechanism has **not become skills**; skills and recipe aliases coexist. [Slash commands](https://goose-docs.ai/docs/guides/context-engineering/slash-commands/), [release-pinned documentation](https://github.com/aaif-goose/goose/blob/v1.52.0/documentation/docs/guides/context-engineering/slash-commands.md)

**Recipe YAML/JSON fields:**

| Field | Type | Meaning |
|---|---|---|
| `version` | string | Format version; default `"1.0.0"`. |
| `title`, `description` | string, required | Display title / explanation. |
| `instructions`, `prompt` | string | At least one required; headless requires `prompt`. |
| `activities` | string[] | Desktop clickable prompts; first `message:` entry is information box; ignored CLI/scheduled execution. |
| `extensions` | extension[] | Explicit required extension set; replaces default set. |
| `parameters` | parameter[] | Template inputs. |
| `response.json_schema` | object | Final structured JSON output schema. |
| `retry.max_retries` | number, required if retry used | Retry cap. |
| `retry.checks` | array, required | Ordered success checks. |
| `retry.checks[].type` | `"shell"` | Only documented check type. |
| `retry.checks[].command` | string | Exit 0 means success. |
| `retry.timeout_seconds` | number | Check timeout; default 300. |
| `retry.on_failure_timeout_seconds` | number | Recovery timeout; default 600. |
| `retry.on_failure` | string | Recovery shell command; history resets before retry. |
| `settings.goose_provider`, `settings.goose_model` | string | Provider/model overrides. |
| `settings.temperature` | number | Model temperature. |
| `settings.max_turns` | number | Execution/subagent turn bound. |
| `sub_recipes[].name`, `.path` | string, required | Named child recipe / relative or absolute path. |
| `sub_recipes[].values` | object | Preset child parameters. |
| `sub_recipes[].sequential_when_repeated` | boolean | Repeated instances run sequentially. |
| `sub_recipes[].description` | string | Child purpose. |

Parameter fields: `key: string`, `input_type: "string"|"number"|"boolean"|"date"|"file"|"select"`, `requirement: "required"|"optional"|"user_prompt"`, `description: string`; optional `default` documented as string, `options: array` required for `select`. Optional parameters require defaults; required parameters prohibit defaults; file parameters prohibit all defaults. File input inserts **contents**, not path. [Recipe reference](https://goose-docs.ai/docs/guides/recipes/recipe-reference/)

Templates use `{{ parameter }}` in instructions/prompt/activities; built-in `{{ recipe_dir }}`; `{% extends "parent.yaml" %}`, blocks, `indent()` supported. Global retry timeout variables: `GOOSE_RECIPE_RETRY_TIMEOUT_SECONDS`, `GOOSE_RECIPE_ON_FAILURE_TIMEOUT_SECONDS`, overridden by recipe. No documented generic pre-prompt shell interpolation. CLI does not support `.yml`, despite Desktop/format documentation accepting it. [Recipe reference](https://goose-docs.ai/docs/guides/recipes/recipe-reference/)

Skill argument substitution: `$ARGUMENTS` raw string; `$ARGUMENTS[0]` zero-based; `$1` one-based; `$name` resolves position from `metadata.arguments`; unavailable positions become empty; undeclared names stay literal; no recognized placeholders appends `ARGUMENTS: <raw>`. This is text substitution, not shell evaluation. [Implementation](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/arguments.rs#L6-L52)

Custom system templates: `~/.config/goose/prompts/` or Windows `%APPDATA%\Block\goose\config\prompts\`; `system.md`, `compaction.md`, `permission_judge.md`, `subagent_system.md`, `tiny_model_system.md`, `session_name.md`; `apps_create.md`, `apps_iterate.md` explicitly **in development**. Jinja2 syntax; exact variable inventory depends on template. [Prompt templates](https://goose-docs.ai/docs/guides/context-engineering/prompt-templates/)

### Kiro

Slash-invocable skills and `manual`/`auto` steering coexist; they are **not one identical format**. Skills page documents CLI-only `$ARGUMENTS` and a malformed rendered `$` positional-placeholder description; exact positional syntax/indexing is **UNKNOWN from retrieved docs**. IDE trailing text is extra context, without CLI placeholder substitution. No independent command-file frontmatter, command-specific model/tool overrides, or shell interpolation is documented. [Skills, updated 2026-10-02](https://kiro.dev/docs/skills.md), [Steering, updated 2026-10-06](https://kiro.dev/docs/steering.md)

Legacy IDE `userTriggered` manual hooks remain runnable; new on-demand IDE workflows use manual steering instead. [Hooks types, updated 2026-09-30](https://kiro.dev/docs/hooks/types/)

## Hooks

### Goose — shipped, Open Plugins hooks

File: plugin-root `hooks/hooks.json`. Root `hooks: map<event, rule[]>`; each rule contains optional `matcher: string` regex, required `hooks: action[]`. Action fields: `type: "command"` default; `command: string`; `timeout: number` seconds, default 30; `on_failure: "allow"|"block"` default `allow`, interpreted only on `PreToolUse`. Execution via `sh -c`. `${PLUGIN_ROOT}` command substitution and `PLUGIN_ROOT` environment provided. HTTP/prompt/script-module handlers: **Not supported**. [Hooks](https://goose-docs.ai/docs/guides/context-engineering/hooks/)

| Exact event | Meaning | Matcher target |
|---|---|---|
| `SessionStart` | Session begins | None |
| `SessionEnd` | Session ends | None |
| `Stop` | Turn completion / stop | None |
| `UserPromptSubmit` | User prompt | Prompt text |
| `PreToolUse` | Before tool | Tool name |
| `PreToolUseResult` | Resolved pre-tool policy, before tool/denial delivery | Tool name |
| `PostToolUse` | Successful tool completion | Tool name |
| `PostToolUseFailure` | Failed tool | Tool name |
| `BeforeReadFile` | Before file read | File path |
| `AfterFileEdit` | Successful edit | File path |
| `BeforeShellExecution` | Before shell execution | Command |
| `AfterShellExecution` | Successful shell execution | Command |

`SubagentStart` / `SubagentStop` are **not emitted**. Regex is unanchored; bare `"*"` is invalid and skips rule, unlike glob-based clients. [Events/matchers](https://goose-docs.ai/docs/guides/context-engineering/hooks/)

**Input JSON fields:**

| Field | Type | Applicability |
|---|---|---|
| `event`, `session_id` | string | Always |
| `matcher_context` | string or null | Match subject |
| `tool_call_id` | string | Correlates pre/result/post/failure |
| `tool_name` | string | Tool events |
| `tool_input`, `tool_output` | JSON value | Underlying tool payload/result when applicable |
| `message` | string | Submitted prompt |
| `last_assistant_message` | string | Stop final text |
| `working_dir` | string | Tool/session directory |
| `decision` | `"allow"|"deny"` | `PreToolUseResult` |
| `policy_evaluated` | boolean | At least one matching hook ran to conclusion |
| `blocked_by`, `reason` | string | Denied result |
| `cause` | `"policy_denial"|"hook_failure"` | Result-qualified cause; absent on clean allow |

[Payload struct](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/hooks/mod.rs#L224-L259), [result payload/protocol documentation](https://goose-docs.ai/docs/guides/context-engineering/hooks/).

**Output decisions:** only `PreToolUse` and `Stop` can block.

1. Exit **2** blocks; stderr supplies reason.
2. Otherwise stdout JSON beginning `{` with exact `decision: "block"` blocks, **even on nonzero exit**.
3. Exit **0**, empty stdout or `{"decision":"allow"}` allows.
4. Other output/exits, malformed/non-UTF-8 stdout, spawn/timeout/input-delivery failures mean no usable decision.

`PreToolUse` failure follows `on_failure`; `Stop` failures remain fail-open. Stop block continues turn, bounded by `GOOSE_STOP_HOOK_BLOCK_CAP`. Other events are observational—even `BeforeReadFile`, `BeforeShellExecution`, `UserPromptSubmit`. No documented ask/modify/context-injection output contract. [Decision contract](https://goose-docs.ai/docs/guides/context-engineering/hooks/)

Scopes: enabled user/project plugins. Discovery orders project before user, then plugin name/root; hook rules/actions execute sequentially in stored order. Observation delivery is awaited, not durable. [Plugin ordering](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/discovery.rs#L60-L101), [hook execution](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/hooks/mod.rs#L435-L610)

Pitfalls: diagnostics belong on stderr, not stdout; hook-provided denial reasons are unredacted; unsupported event/action names ignored; malformed selected schema skips plugin hook file; invalid regex skips rule. [Hooks](https://goose-docs.ai/docs/guides/context-engineering/hooks/)

### Kiro — documented IDE 1.0 / CLI 3.0, pages dated 2026-09-30

Standalone `.kiro/hooks/<id>.json`; user scope `~/.kiro/hooks/` is documented by later Configuration scopes page. Root fields `version: "v1"` and `hooks: object[]`. [Hooks](https://kiro.dev/docs/hooks/), [configuration scopes, post-cutoff](https://kiro.dev/docs/configuration/)

| Field | Type | Meaning |
|---|---|---|
| `hooks[].name` | string, required | Identifier |
| `.description` | string | Documentation |
| `.trigger` | string, required | PascalCase event |
| `.matcher` | string | Regex; omitted matches all |
| `.action.type` | `"command"|"agent"` | Shell or agent-prompt action |
| `.action.command` | string | Required for command |
| `.action.prompt` | string | Required for agent |
| `.timeout` | number | Command seconds; default 60; 0 disables |
| `.enabled` | boolean | Default true |
| `.confirm.question` | string | Stop-command confirmation |
| `.confirm.options` | object[] | Choices |
| `.confirm.options[].id`, `.label` | string | Choice ID/display |
| `.confirm.options[].run` | boolean | Whether to run command |
| `.confirm.confirmCommand` | string | Dynamic confirmation JSON producer |

Dynamic confirmation stdout `{ "skip": true }` skips; `{ "question": "...", "options": [...] }` replaces choices. Failure/timeout/invalid JSON falls back to static choices. [Schema and confirmation](https://kiro.dev/docs/hooks/)

| Exact standalone event | Meaning / support |
|---|---|
| `SessionStart` | New session; IDE/Web/CLI V3 |
| `SessionEnd` | Session teardown; CLI V3 only |
| `UserPromptSubmit` | Before prompt processing |
| `Stop` | Finished responding, per types page |
| `PreToolUse` | Before tool; can block |
| `PostToolUse` | After tool, access to result |
| `PostFileCreate` | Agent creates file |
| `PostFileSave` | Agent writes/modifies file |
| `PostFileDelete` | Agent deletes file |
| `PreTaskExec` | Before spec task; CLI docs say blockable |
| `PostTaskExec` | After spec task |
| `Manual` | Web on-demand; V3 recognized/listed but `/hooks` cannot invoke |
| `AgentSpawn`, `agentSpawn` | V3 aliases for `SessionStart` |

File triggers **do not run for manual editor changes**. File/tool matchers are regex. CLI additionally documents canonical/alias tool selectors and `"*"`/`"@builtin"`; IDE category selectors include `read`, `write`, `shell`, `web`, `spec`, `*`, `@mcp`, `@powers`, `@builtin`. These special selectors must not be flattened into a universal regex contract. [Types](https://kiro.dev/docs/hooks/types/), [V3 migration](https://kiro.dev/docs/cli/v3/hooks-migration.md)

Input: JSON on stdin. Verified documented fields `hook_event_name: string`, `cwd: string`, `session_id: string`, `tool_name: string`, `tool_input: object`; post-tool documentation mentions `tool_response`. IDE Prompt Submit exposes `USER_PROMPT`. Complete schemas for file/task/stop/session payloads: **UNKNOWN**, several published examples are empty/broken. [Types](https://kiro.dev/docs/hooks/types.md)

**Different output contracts by surface:**

- IDE: exit 0 stdout becomes agent context; other exits send stderr to agent; nonzero pre-tool/prompt hook blocks. Default 60 seconds, 0 disables timeout.
- CLI: exit 0 context injection only for session-start/prompt-submit; exit 2 blocks `PreToolUse`, `UserPromptSubmit`, `PreTaskExec`; other exits warn and proceed. Actions page states default 30,000 ms, `timeout_ms`, and `cache_ttl_seconds` (0 no cache); AgentSpawn never cached.
- CLI Stop page documents exit 0 JSON `decision: "block"` continuing conversation using `reason`.

Sources: [Actions, updated 2026-08-04](https://kiro.dev/docs/hooks/actions.md), [Types](https://kiro.dev/docs/hooks/types.md).

HTTP/module handlers: **Not supported in documented action enum**. Modify-input output, universal ask/allow JSON, cross-file ordering: **UNKNOWN**.

Legacy variants must remain distinct:

- IDE 0.x `.kiro.hook` files; `when.type`: `sessionStart`, `agentStop`, `promptSubmit`, `preToolUse`, `postToolUse`, `fileCreated`, `fileEdited`, `fileDeleted`, `preTaskExecution`, `postTaskExecution`, `userTriggered`; `when.patterns`, `then.type`, `then.command` appear in legacy-reference examples.
- Embedded agent events: `agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`; action `command`, optional `matcher`.
- Legacy-reference page inconsistently labels `when`/`then` as current 1.0; migration/main page instead specifies `trigger`/`action`.

[IDE reference](https://kiro.dev/docs/ide/0x-reference.md), [agent reference](https://kiro.dev/docs/custom-agents/configuration-reference/), [migration](https://kiro.dev/docs/cli/v3/hooks-migration.md)

## MCP servers

### Goose — shipped

Native configuration: `~/.config/goose/config.yaml`; Windows `%APPDATA%\Block\goose\config\config.yaml`; root `extensions: map<name, entry>`. Recipes embed extension arrays. [Configuration](https://goose-docs.ai/docs/guides/config-files/)

| Field | Type | Meaning / applicable variants |
|---|---|---|
| `enabled` | boolean | Configuration-entry activation |
| `type` | `"stdio"|"streamable_http"|"builtin"|"platform"` | Variant; **SSE unsupported** |
| `name` | string | Internal name |
| `description` | string | Description; defaultable |
| `display_name` | string | Builtin/platform display |
| `bundled` | boolean | Included with Goose |
| `available_tools` | string[] | Empty/omitted means all |
| `timeout` | unsigned integer, seconds | Stdio/HTTP/builtin operation timeout; not platform enum field |
| `cmd` | string | Stdio executable |
| `args` | string[] | Stdio arguments |
| `envs` | map<string,string> | Stdio/HTTP environment; stdio accepts alias `env` |
| `env_keys` | string[] | Names resolved from environment first, then secret storage |
| `cwd` | string | Stdio working directory |
| `uri` | string | Streamable HTTP endpoint |
| `headers` | map<string,string> | HTTP headers |
| `socket` | string | HTTP-over-Unix-socket path; `@name` Linux abstract socket |
| `client_id` | string | Pre-registered OAuth client; supports `$VAR`/`${VAR}` |
| `client_secret_key` | string | Secret-store/environment key, not inline secret |
| `scopes` | string[] | OAuth requested scopes; empty derives server metadata |
| `envFile`, per-server trust flag | Not supported in inspected enum | No corresponding modeled fields |

[Full extension enum](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/agents/extension.rs#L154-L254), [configuration](https://goose-docs.ai/docs/guides/config-files/), [recipe secret resolution](https://goose-docs.ai/docs/guides/recipes/recipe-reference/).

Environment-map construction rejects security-sensitive keys case-insensitively: `PATH`, `PATHEXT`, `SystemRoot`, `windir`, `LD_LIBRARY_PATH`, `LD_PRELOAD`, `LD_AUDIT`, `LD_DEBUG`, `LD_BIND_NOW`, `LD_ASSUME_KERNEL`, `DYLD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `DYLD_FRAMEWORK_PATH`, `PYTHONPATH`, `PYTHONHOME`, `NODE_OPTIONS`, `RUBYOPT`, `GEM_PATH`, `GEM_HOME`, `CLASSPATH`, `GO111MODULE`, `GOROOT`, `APPINIT_DLLS`, `SESSIONNAME`, `ComSpec`, `TEMP`, `TMP`, `LOCALAPPDATA`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`. [Envs validation](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/agents/extension.rs#L88-L151)

**Plugin MCP is a narrower, different schema:** default plugin-root `.mcp.json`, root `mcpServers`; server `command: string`, `args: string[]`, `env: map<string,string>`, `cwd?: string`. Only stdio is constructed. `${PLUGIN_ROOT}` expands in command/args/env/cwd; `PLUGIN_ROOT` is injected; name becomes `<plugin>:<server>`. `${PLUGIN_DATA}` and general environment expansion: **not implemented by this parser**. Manifest `mcpServers` can point to paths or supply inline server map. [Plugin MCP parser](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/mcp_servers.rs#L12-L169)

### Kiro

Files: `.kiro/settings/mcp.json`, `~/.kiro/settings/mcp.json`; root `mcpServers: map<string,server>`. Agent profile also accepts `mcpServers`. Same-name **whole server override**: agent > project > global; different names additive; higher disabled entry suppresses launch. [MCP configuration, updated 2026-10-07, post-cutoff](https://kiro.dev/docs/mcp/configuration.md)

| Field | Type | Meaning |
|---|---|---|
| `command` | string | Required local executable |
| `args` | string[] | Arguments |
| `env` | map<string,string> | Environment; `${VAR}` runtime expansion documented |
| `url` | string | Remote HTTPS; HTTP localhost allowed |
| `headers` | map<string,string> | Remote headers; `${VAR}` shown |
| `disabled` | boolean | Default false |
| `autoApprove` | string[] | Tools requiring no prompt; `"*"` all |
| `disabledTools` | string[] | Omit tools from agent |
| `timeout` | number, milliseconds | Agent reference: stdio connection handshake, default 60000 |
| `requestTimeout` | number, milliseconds | Per-call timeout, default 120000 |
| `type` | string | `"http"` in agent examples; `"registry"` for enterprise overrides |
| `oauth` | object | OAuth configuration |
| `oauth.clientId` | string | Pre-registered ID |
| `oauth.clientSecret` | string | Confidential-client secret; CLI only per MCP page |
| `oauth.redirectUri` | string | Loopback callback |
| `oauth.clientMetadataUrl` | string | HTTPS hosted client metadata document |
| `oauth.oauthScopes` | string[] | Nested scopes; newer MCP page gives priority over top-level |
| `oauthScopes` | string[] | Top-level fallback scopes |
| `cwd`, `envFile` | UNKNOWN standalone support | Not listed in standalone field tables |

Sources: [MCP](https://kiro.dev/docs/mcp/configuration.md), [agent server reference, updated 2026-10-02](https://kiro.dev/docs/custom-agents/configuration-reference/), [registry](https://kiro.dev/docs/mcp/registry.md).

OAuth redirect accepts full `http://localhost:port/path`, `127.0.0.1:port`, `:port`, or omission for random localhost port. Only localhost/127.0.0.1, HTTP, valid port, no query/fragment. Nested scopes override top-level according to newer MCP page; **agent reference contradicts this by requiring top-level scopes**. DCR/client-ID behavior also conflicts between those pages. [MCP OAuth](https://kiro.dev/docs/mcp/configuration.md#oauth-configuration)

**Powers’ Agent Plugins 1.0 MCP is not the standalone Kiro schema.**

Root `mcp.json`: `$schema` exact 1.0.0 URL; `mcpServers` map.

| Variant | Fields |
|---|---|
| `stdio` | `type: "stdio"`, required `command: string`; optional `args: string[]`, `env: map<string,string>`, `cwd: string` |
| HTTP | `type: "streamable-http"` or legacy `"sse"`; required `url: string`; optional `headers: map<string,string>` |

Only `${PLUGIN_ROOT}`, `${PLUGIN_DATA}` single-pass expansion in args/env-values/cwd; **not command/url/headers/env-keys**. Omitted stdio cwd uses plugin root. Reserved env keys cannot be supplied. `cwd` starts `./`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`. Standalone `disabled`, `autoApprove`, `disabledTools` have **no plugin equivalent** in official migration guidance. [1.0.0 schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json), [cutoff-pinned official reference](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/power-builder/skills/agent-plugins-reference/SKILL.md), [migration](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/power-builder/skills/migrate-plugin/SKILL.md).

Power server names are namespaced `power-<power-name>-<server-name>`. New-format power servers are managed internally, **not written into user mcp.json**; legacy `POWER.md` servers are registered there. [Create, dated 2026-08-04](https://kiro.dev/docs/powers/create/), [installation, dated 2026-09-30](https://kiro.dev/docs/powers/installation/)

## Other native capability types

### Goose

- **Recipes**: prompts, provider/model settings, extensions, parameters, structured output, retries, subrecipes; complete field inventory above. Desktop wrapper fields: `recipe: object`, `name: string`, `isGlobal: boolean`, `lastModified: ISO string`, `isArchived: boolean`; ignored by CLI operations. [Recipe reference](https://goose-docs.ai/docs/guides/recipes/recipe-reference/)
- **Model/provider configuration**: `active_provider: string`, `providers: map`; shown provider fields `enabled: boolean`, `model: string`, `configured: boolean`. Environment `GOOSE_PROVIDER`, `GOOSE_MODEL` overrides configuration. [Configuration](https://goose-docs.ai/docs/guides/config-files/)
- **Themes**: configuration strings `GOOSE_CLI_THEME: "light"|"dark"|"ansi"`, `GOOSE_CLI_LIGHT_THEME`, `GOOSE_CLI_DARK_THEME`; **plugin-shipped theme type UNKNOWN**. [Configuration](https://goose-docs.ai/docs/guides/config-files/)
- **Code extensions**: builtin bundled MCP and platform in-process extensions exist; native loadable JS/TS-module package API **UNKNOWN**, not a plugin component demonstrated by inspected manifest/runtime. [Extension enum](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/agents/extension.rs#L154-L254)
- LSP package entries, output-style packages, statusline packages, keybinding packages, monitors, plugin `userConfig`: **Not supported in inspected plugin manifest schema**. Wider application features must not be treated as package component types. [Manifest parser](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L23-L33)
- MCP Apps appear as a separate application feature in official docs navigation; installable plugin component schema **UNKNOWN**. [Documentation index/configuration page](https://goose-docs.ai/docs/guides/config-files/)

### Kiro

- **Specs**: `.kiro/specs/<name>/requirements.md` or `bugfix.md`, `design.md`, `tasks.md`. These are structured project artifacts, not established power-manifest components. Complete machine-readable metadata schema **UNKNOWN**. [Specs](https://kiro.dev/docs/specs.md)
- **Knowledge bases**: agent resource objects described above. [Agent resources](https://kiro.dev/docs/custom-agents/configuration-reference/#resources-field)
- **Workflows**: `.kiro/workflows/`, `~/.kiro/workflows/`, JSON/YAML orchestration recipes; opt-in `kiroAgent.workflows.enabled`; per-step agents/models/effort, loops, parallel branches, waits, artifacts. Page updated **2026-10-02**, so as-of shipped availability **UNKNOWN**; account absence means unavailable. Complete workflow field schema was not reached. [Workflows](https://kiro.dev/docs/workflows/)
- **Power-specific content**: optional `dev.kiro/` documented for client extensions such as steering; precise directory/metadata schema **UNKNOWN**. Agent Plugins manifest `extensions` maps reverse-domain namespace → object. [Powers](https://kiro.dev/docs/powers.md), [manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- **Legacy power steering**: power-root `steering/*.md` plus `POWER.md` body; native `readPowerSteering` usage in official package. [Cutoff-pinned example](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/aws-agentcore/POWER.md)
- LSP server manifests, output styles, themes, apps/connectors, monitors, statusline, keybindings, JS/TS modules, plugin `userConfig`: **Not supported as portable Agent Plugins 1.0 top-level components**; any Kiro-specific package schema **UNKNOWN**. Agent profile `keyboardShortcut` is supported, but is not a general keybinding package. [Manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), [agent reference](https://kiro.dev/docs/custom-agents/configuration-reference/)

## Permissions, trust and security

### Goose — shipped

- Plugins/hooks execute local commands; documentation says install trusted sources and inspect contents. Inspected `goose plugin install` handler performs installation without a documented trust-confirmation step. Signature/provenance verification, workspace trust, per-plugin sandbox: **UNKNOWN**, not established by inspected plugin implementation. [Plugins](https://goose-docs.ai/docs/guides/context-engineering/plugins/), [CLI handler](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose-cli/src/commands/plugin.rs#L4-L19)
- User settings include `GOOSE_MODE: "auto"|"approve"|"chat"|"smart_approve"`; recipe extension filters and hooks can constrain execution, but skill frontmatter `allowed-tools` enforcement is not implemented in inspected skill model. [Configuration](https://goose-docs.ai/docs/guides/config-files/), [skill model](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L32-L44)
- Permission stores: `permission.yaml` and runtime `permissions/tool_permissions.json`; full permission-file fields **not covered**. [Configuration files](https://goose-docs.ai/docs/guides/config-files/)
- Enterprise extension allowlist: `GOOSE_ALLOWLIST` URL; YAML `extensions: [{id: string, command: string}]`; exact installation-command matching; fetched on first need, cached, refreshed on restart. This controls **MCP extension installation**, not proven general plugin governance. [Allowlist](https://goose-docs.ai/docs/guides/allowlist/)
- Provider secrets: system keyring or plaintext `secrets.yaml` fallback/`GOOSE_DISABLE_KEYRING`; provider keys in config.yaml ignored. [Configuration security](https://goose-docs.ai/docs/guides/config-files/)
- Package permission-grant fields: **Not supported in inspected manifest**; hooks may deny tool calls but run with local command authority. [Manifest](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L23-L33), [hooks](https://goose-docs.ai/docs/guides/context-engineering/hooks/)

### Kiro — Permissions page dated 2026-10-01

Permission files: user `~/.kiro/settings/permissions.yaml`; workspace **outside repository** `~/.kiro/workspace-roots/<hash>/permissions.yaml`; agent inline `permissions.rules`. [Permissions](https://kiro.dev/docs/permissions/)

| Field | Type | Meaning |
|---|---|---|
| `rules` | object[] | Policy rules |
| `rules[].capability` | string | Capability |
| `.match` | string[] | Resource patterns; omission all |
| `.exclude` | string[] | Exceptions |
| `.effect` | `"deny"|"ask"|"allow"` | Most restrictive matching effect wins across scopes |

Capabilities: `fs_read`, `fs_write`, `shell`, `web_fetch`, `web_search`, `mcp`, `subagent`, `skill`, `power`, `context`, `diagnostics`, `sandbox_network`; meta `all`, `builtin`, `filesystem`. `sandbox_network` is excluded from `all`. Filesystem glob supports `*`, `**`, braces/classes; shell/web/MCP support `*` but **not `**`, `?`, classes**. Compound shell commands are split and independently evaluated. [Permissions](https://kiro.dev/docs/permissions/)

Scopes: hardcoded Kiro, administration, user, workspace, agent, session. `deny > ask > allow`, not nearest-scope override. Packages cannot override hardcoded/admin denies or asks. [Permissions](https://kiro.dev/docs/permissions/)

**Workspace trust:** untrusted workspace does not load repository agents, steering, MCP, skills, workflows; shell/MCP/power actions require approval despite broad allows. Trust lives outside repository. Certain configuration writes are always denied or always prompt. Installed power MCP path specifically protected: `~/.kiro/powers/installed/<name>/mcp.json`. [Workspace trust/defaults](https://kiro.dev/docs/permissions/#workspace-trust)

**Enterprise managed policy:** `managed-settings.json`, root `rules`, same rule fields but only `deny`/`ask`; macOS `/Library/Application Support/Kiro/managed-settings.json`, Windows `C:\ProgramData\Kiro\managed-settings.json`, Linux `/etc/kiro/managed-settings.json`. Invalid JSON/effect/unknown fields fail closed; unknown capabilities warn/skip. Publication date **UNKNOWN**. [Enterprise permission policies](https://kiro.dev/docs/enterprise/governance/permissions.md)

**Enterprise MCP registry:** only registered names can launch; user env/headers/timeouts can override registry defaults; `type: "registry"`. Does not apply to Web per registry docs. Registry page inconsistently names paths without `/settings/`. Package-requirement policy and signed-power verification: **UNKNOWN**. [Registry](https://kiro.dev/docs/mcp/registry.md)

Web runs sandbox without local permission YAML/per-action approvals; sandbox boundaries and external credentials govern authority. Local skill scripts share agent authority; no per-skill isolation documented. Power installation warns about third-party sources but exact mandatory trust-dialog sequence **UNKNOWN**. [Permissions](https://kiro.dev/docs/permissions/), [installation](https://kiro.dev/docs/powers/installation/), [agent security](https://kiro.dev/docs/custom-agents/configuration-reference/)

## Packaging, install and scopes

### Goose — shipped Open Plugins, not established Agent Plugins 1.0 conformance

Manifest search precedence:

1. `.goose-plugin/plugin.json`
2. `.plugin/plugin.json`
3. `plugin.json`

Runtime fields:

| Field | Type | Meaning |
|---|---|---|
| `name` | optional string | Inferred from source/directory if absent/empty |
| `version` | optional string | Display value; absent `"unknown"` |
| `skills` | string / string[] / path-selector object | Additional/custom skill roots |
| `mcpServers` | paths or inline object | MCP configuration |
| Path-selector `.paths` | string or string[] | Relative component paths |
| Path-selector `.exclusive` | boolean, default false | Omit default component roots |

Name: 1–64 lowercase alphanumeric/dash/dot characters, alphanumeric endpoints, no `--`/`..`. Component paths must begin `./`, be relative, and contain no parent traversal. Fields such as `description` in docs examples are not read into the inspected manifest struct. [Manifest/path parser](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L14-L33), [validation and selectors](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L206-L412)

Default layout: `skills/`, `hooks/hooks.json`, `.mcp.json`; root `SKILL.md` supported when no skills directory/config. Component markers `hooks/hooks.json`, `commands`, `agents`, `.mcp.json` permit format detection without manifest—**marker detection is not evidence that commands/agents are imported**. [Adapter](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L14-L21), [skills roots](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L297-L337)

Gemini extension input: root `gemini-extension.json`; parsed `name: string`, `version: string`; imports `skills/` and requires at least one. Skill names unchanged, unlike Open Plugins install rewriting to `plugin:skill`. Other Gemini manifest semantics **not imported by this adapter**. [Gemini adapter](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/gemini.rs#L11-L84)

**Install/write contract:**

- `goose plugin install <git-source>`; `--auto-update`.
- Shallow `git clone --depth 1` into temporary checkout.
- Copy package tree to `~/.agents/plugins/<name>/`.
- Rewrite imported Open Plugins skill names.
- Write `.goose-plugin-install.json`:
  `source: string`, `source_type: "git"`, `format: "open-plugins"|"gemini"`, `auto_update: boolean`, `last_update_check: timestamp|null`.
- Existing install rejected; update retrieves original git source and replaces installed copy, preserving auto-update.
- Auto-update interval **24 hours**; failure keeps installed version.
- No explicit branch/ref/SHA/npm/zip resolver implemented by inspected clone API; local folders may be manually copied to discovery roots.

[Installer/metadata](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/mod.rs#L17-L84), [install/update](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/mod.rs#L153-L388)

Discovery scopes: user `~/.agents/plugins/`, project `<project>/.agents/plugins/`; same-name project wins. Configuration `config.yaml` `plugins: map<absolute-path,{enabled:boolean}>`; discovery persists new entries as enabled. Settings files:

- user `~/.config/goose/settings.json`
- project `<project>/.config/goose/settings.json`
- local `<project>/.config/goose/settings.local.json`

Keys `enabledPlugins: string[]`, `disabledPlugins: string[]`; local > project > user; within one scope disabled wins; otherwise default enabled. [Discovery implementation](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/discovery.rs#L9-L39), [precedence](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/discovery.rs#L60-L223)

Marketplace/catalog schema, dependencies/transitive imports, lockfile, immutable version pinning, persistent download-cache directory: **UNKNOWN / not present in inspected installer contract**.

### Kiro — Agent Plugins adoption documented 2026-08-04

Required package-root `plugin.json`; optional `skills/`, root `mcp.json`, client-specific `dev.kiro/`. Legacy package-root `POWER.md` still supported. Activation is keyword/context-driven and can deactivate when task changes. [Create powers](https://kiro.dev/docs/powers/create/), [Powers](https://kiro.dev/docs/powers.md)

**Every Agent Plugins 1.0 manifest field:**

| Field | Type | Meaning |
|---|---|---|
| `$schema` | exact string, required | `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |
| `name` | string, required | 1–64 lowercase alphanumeric/dash/dot, no consecutive dash/dot, alphanumeric endpoints |
| `version` | string | Version; SemVer recommended |
| `description` | string | Summary |
| `author` | object | Optional string `name`, `email`, `url` |
| `homepage` | string | Documentation/homepage |
| `repository` | string | Source repository |
| `license` | string | License; SPDX recommended |
| `keywords` | string[] | Discovery tags; Kiro activation triggers |
| `extensions` | map<reverse-domain namespace,object> | Client-specific opaque data |

Schema forbids extra top-level fields. **Kiro create guide calls version/description/author/keywords required; 1.0.0 schema and official reference require only `$schema`/`name`.** [Manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), [Kiro guide](https://kiro.dev/docs/powers/create/), [cutoff-pinned official reference](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/power-builder/skills/agent-plugins-reference/SKILL.md)

Legacy `POWER.md` frontmatter evidenced fields: `name: string`, `displayName: string`, `description: string`, `keywords: string[]`, `author: string`; body supplies guidance, optional `steering/*.md`, `mcp.json`. Complete validator/requiredness **UNKNOWN**. `displayName` has **no direct Agent Plugins equivalent**. [Official migration](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/power-builder/skills/migrate-plugin/SKILL.md), [legacy example](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/aws-agentcore/POWER.md)

Install sources: curated registry/catalog, public GitHub repository, local directory/private clone. One repository may contain multiple powers. IDE Powers panel installs; `Check for updates` then `Install updates` refreshes repository. New-plugin MCP is internally managed; legacy MCP updates user settings as above. [Installation, dated 2026-09-30](https://kiro.dev/docs/powers/installation/)

CLI documentation: `/powers install <name|path>`, `/powers uninstall <name>`; no-chat `kiro-cli powers install/uninstall`; catalog exact-name or existing directory. Interactive install refreshes session; no-chat affects later sessions. Precise publication date for these CLI paragraphs **UNKNOWN**; HTML tab extraction did not expose them. [Installation Markdown](https://kiro.dev/docs/powers/installation.md)

Known installed tree `~/.kiro/powers/installed/<name>/` from dated security documentation. Global directory `~/.kiro/`; Configuration scopes documents `KIRO_HOME` override, project `.kiro/`, agent scopes, but page dated **2026-10-02**. Exact power-registry file, installed metadata fields, cache directory, version pinning/ref/SHA/npm/zip inputs, dependencies/transitive imports, complete catalog schema: **UNKNOWN**. [Protected power path](https://kiro.dev/docs/permissions/), [configuration scopes](https://kiro.dev/docs/configuration/)

## Notable gaps and ambiguities

- **Do not equate Goose Open Plugins with Agent Plugins 1.0.** Goose shipped parser uses `.mcp.json`, `streamable_http` for native extensions, custom manifest component paths, and plugin stdio-only MCP; Kiro’s new powers use `mcp.json`, 1.0.0 schema, `streamable-http`, `${PLUGIN_DATA}`, and separate client extras. [Goose parser](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/mcp_servers.rs), [Agent Plugins schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- **Lossless round trips require preserving raw source documents**, not reconstructing from Goose’s parsed structs: unknown top-level skill/manifest metadata is unmodeled, plugin installs rewrite names, and skill CRUD renders only modeled fields. [Skill rendering](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/skills/mod.rs#L310-L337), [plugin rewrite](https://github.com/aaif-goose/goose/blob/v1.52.0/crates/goose/src/plugins/formats/open_plugins.rs#L92-L108)
- **Kiro cutoff problem:** live skills/agents/configuration/workflows pages dated October 2; steering October 6; MCP October 7. Do not claim all current details shipped by October 1. Dated-before-cutoff power adoption, hook pages, permission page and cutoff-pinned official power source establish only their respective claims.
- **Kiro contradictory contracts:** custom-agent default resource inheritance; embedded hooks IDE support; `trigger/action` versus `when/then`; Stop turn versus session-end wording/blockability; seconds versus milliseconds timeout; regex versus special tool matcher syntax; nested versus top-level OAuth scopes; client ID skips DCR versus fallback after DCR. Sources identify alternatives above; runtime/source validation remains needed.
- **Official documents themselves recommend lossy migration:** legacy Kiro `displayName` and MCP `disabled`/`autoApprove`/`disabledTools` lack portable plugin equivalents. Preserve these as Kiro extras, not silently drop them. [Migration](https://github.com/kirodotdev/powers/blob/fd309373c5fa99d33e9d578ff777ea8aac93ce9c/power-builder/skills/migrate-plugin/SKILL.md)
- **Not established:** complete legacy `.kiro.hook` schema, every Kiro event input/output payload, hook cross-file ordering, complete Kiro workflow schema, Goose permission-file schema, package signatures/provenance, package dependency/catalog schemas, exact Kiro installation metadata/cache writes. `UNKNOWN` is intentional; absence of documentation is not proof of absence.
- **Next evidence to obtain:** version-pinned Kiro IDE/CLI schemas or runtime fixtures covering the conflicting hook/MCP/resource contracts and power installation writes; only then select native writer variants.
