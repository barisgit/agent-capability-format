# OpenAI Codex (CLI, IDE, desktop) - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence date:** 2026-10-01. Official pages are unversioned living documentation unless stated otherwise. “Shipped” below means documented as currently supported, not independently runtime-tested. Several `developers.openai.com/codex` URLs now redirect to ChatGPT Learn. Agent Plugins schemas are explicitly **1.0.0, Published**. [Skills](https://learn.chatgpt.com/docs/build-skills), [Agent Plugins specification](https://agent-plugins.org/specification).

### `SKILL.md`

A skill directory contains YAML-frontmatter `SKILL.md`, Markdown instructions, and optional `scripts/`, `references/`, `assets/`, and other files. Codex documents `name` and `description` as required and identifies Agent Skills as its underlying standard. Do not infer that every optional standard field has Codex runtime semantics. [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Agent Skills specification](https://agentskills.io/specification).

| Field | Type | Meaning / status |
|---|---|---|
| `name` | string, required | Skill identifier. Standard: 1–64 characters, lowercase alphanumeric/hyphen, no leading/trailing/consecutive hyphens, matches directory name. |
| `description` | string, required | What the skill does and when to activate it. Standard: 1–1024 characters. Used for implicit selection. |
| `license` | string | Standard field: license identifier or bundled-license reference. Codex-specific enforcement UNKNOWN. |
| `compatibility` | string | Standard field: environmental requirements; 1–500 characters when present. Codex-specific enforcement UNKNOWN. |
| `metadata` | map<string,string> | Standard arbitrary metadata. Codex-specific interpretation UNKNOWN. |
| `allowed-tools` | string | Standard experimental space-separated tool authorization declaration. **Codex enforcement UNKNOWN**; not documented as a substitute for Codex permissions. |

Sources for every row: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Agent Skills field reference](https://agentskills.io/specification#frontmatter).

No documented Codex `SKILL.md` variants equivalent to Claude’s `disable-model-invocation`, `user-invocable`, `context`, `agent`, or `model`. Codex puts its documented invocation policy in a separate metadata file. [Codex optional metadata](https://learn.chatgpt.com/docs/build-skills#optional-metadata).

### `agents/openai.yaml`

Optional file inside each skill directory; **shipped**. [Metadata example and semantics](https://learn.chatgpt.com/docs/build-skills#optional-metadata).

| Key | Type | Meaning |
|---|---|---|
| `interface` | object | UI presentation metadata. |
| `interface.display_name` | string | User-facing name. |
| `interface.short_description` | string | User-facing description. |
| `interface.icon_small` | string/path | Small icon, example `./assets/small-logo.svg`. |
| `interface.icon_large` | string/path | Large icon, example `./assets/large-logo.png`. |
| `interface.brand_color` | string | Brand color, illustrated as hex RGB. |
| `interface.default_prompt` | string | Suggested surrounding invocation prompt. |
| `policy` | object | Invocation policy. |
| `policy.allow_implicit_invocation` | boolean | Defaults `true`; `false` disables implicit selection, not explicit `$skill` invocation. |
| `dependencies` | object | Dependency declarations. |
| `dependencies.tools` | array<object> | Tool dependencies. |
| `dependencies.tools[].type` | string | Example `mcp`; exhaustive accepted enum UNKNOWN. |
| `dependencies.tools[].value` | string | Dependency identifier/server name. |
| `dependencies.tools[].description` | string | Dependency description. |
| `dependencies.tools[].transport` | string | Example `streamable_http`; exhaustive enum UNKNOWN. |
| `dependencies.tools[].url` | string | Dependency endpoint. |

Pitfall: metadata example spells transport **`streamable_http`**, whereas portable plugin MCP spells **`streamable-http`**. Dependency installation, authentication, and mandatory failure semantics are UNKNOWN from this page. [Skill metadata](https://learn.chatgpt.com/docs/build-skills#optional-metadata), [MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json).

### Discovery and invocation

| Scope | Path |
|---|---|
| Repository | `$CWD/.agents/skills`, ancestor `.agents/skills` directories up to `$REPO_ROOT/.agents/skills` |
| User | `$HOME/.agents/skills` |
| Admin | `/etc/codex/skills` |
| System | Bundled OpenAI skills |
| Plugin | Portable package `skills/<skill>/SKILL.md`; compatibility package directories declared by `skills` |

These paths are currently documented; symlinked local skill directories are supported. Duplicate `name` values are **not merged**; both can appear in selectors. No winner precedence is documented for duplicates. Portable package containment rules separately prohibit paths resolving outside the plugin root. [Local discovery](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills), [Plugin packaging](https://developers.openai.com/plugins/build/plugins), [Portable containment](https://agent-plugins.org/specification#41-general-requirements).

- Explicit: CLI/IDE `/skills` or `$skill`; model-driven: description matching. Full instructions load on selection. Initial listing contains name, description, and path, with a budget of 2% of model context or 8,000 characters when unknown; descriptions can be shortened and skills omitted with a warning. [Invocation and disclosure](https://learn.chatgpt.com/docs/build-skills).
- Changes are detected automatically; restart if not reflected. Disable through `[[skills.config]]` in `~/.codex/config.toml`: `path: string` identifying `SKILL.md`, `enabled: boolean`. Configuration changes require restart. [Disable skills](https://learn.chatgpt.com/docs/build-skills#enable-or-disable-local-codex-skills).
- Scripts/resources are bundled files, not independently registered tools. Supported script execution depends on the environment. [Skill structure](https://agentskills.io/specification#optional-directories).

## Instructions and rules

### Instruction files

**Shipped:** `AGENTS.md` and `AGENTS.override.md`; plain Markdown, no documented frontmatter schema. [Official discovery contract](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

| Setting / file | Type | Semantics |
|---|---|---|
| `$CODEX_HOME/AGENTS.override.md` | Markdown | Preferred global guidance; default home `~/.codex`. |
| `$CODEX_HOME/AGENTS.md` | Markdown | Global fallback. First nonempty global file wins. |
| `<directory>/AGENTS.override.md` | Markdown | Preferred project instruction file at that directory. |
| `<directory>/AGENTS.md` | Markdown | Project fallback after override. |
| `project_doc_fallback_filenames` | string[] | Additional ordered filenames checked after those two. |
| `project_doc_max_bytes` | integer | Combined instruction limit, default 32 KiB. |

Discovery is once per run/session: project root → launch CWD, at most one instruction file per directory; concatenate root-first, deeper guidance later. Without a detected project root, only CWD is checked. Empty files are skipped. [Discovery and precedence](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance).

Activation is effectively **always for the discovered directory chain**, not a glob-frontmatter rule system. Arbitrary deeper directories are not all preloaded merely because files there may later be edited. `CLAUDE.md`, `GEMINI.md`, `.mdc`, and steering filenames have no special documented instruction semantics unless configured as fallback filenames. Native imports/includes and model-decided/manual/glob instruction activation: **UNKNOWN / not documented**. [Fallback filename behavior](https://learn.chatgpt.com/docs/agent-configuration/agents-md#customize-fallback-filenames).

### Execution-policy rules

These are **experimental security rules**, not prose instructions. Files: `rules/*.rules` beside active configuration layers, including `~/.codex/rules/default.rules` and trusted project `.codex/rules/`. Rules use side-effect-free Starlark. All active layers are scanned at startup; TUI-approved command prefixes are written to user `default.rules`. [Rules documentation](https://learn.chatgpt.com/docs/agent-configuration/rules).

| `prefix_rule()` argument | Type | Meaning |
|---|---|---|
| `pattern` | nonempty array<string or string[]> | Command argv prefix; nested string arrays express alternatives at one position. |
| `decision` | `allow` / `prompt` / `forbidden` | Default `allow`; controls execution outside sandbox. |
| `justification` | nonempty string, optional | Rationale surfaced to users. |
| `match` | string[], default `[]` | Positive inline test commands. |
| `not_match` | string[], default `[]` | Negative inline test commands. |

Most restrictive match wins: `forbidden > prompt > allow`. Safely parseable shell chains are split and evaluated individually; complex shell syntax is treated conservatively as a single wrapper invocation. Validation command: `codex execpolicy check --pretty --rules FILE -- COMMAND ...`. [Rule semantics](https://learn.chatgpt.com/docs/agent-configuration/rules).

No documented plugin component for shipping execution-policy `.rules` automatically. [Documented plugin components](https://developers.openai.com/plugins/build/plugins#plugin-structure).

## Subagents and custom agents

**Shipped:** current releases enable subagents by default; CLI, IDE, and desktop expose activity. Built-ins: `default`, `worker`, `explorer`. Custom agents are standalone **TOML**, not Markdown/frontmatter. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

| Path / field | Type | Meaning |
|---|---|---|
| `~/.codex/agents/*.toml` | files | Personal definitions. |
| `.codex/agents/*.toml` | files | Project definitions. |
| `name` | string, required | Authoritative identity; filename need not match. |
| `description` | string, required | Selection guidance. |
| `developer_instructions` | string, required | Agent behavior/instructions. |
| Other supported `config.toml` keys | corresponding config types | Agent session overrides; explicitly includes `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`. |

Custom agent files are configuration layers, not a narrowly closed agent manifest. `color`, dedicated `tools` frontmatter, and Claude-style permission fields are not documented agent fields. A custom name matching a built-in overrides that built-in; precedence between same-name project and personal definitions is UNKNOWN in the cited page. [Custom agent schema](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents).

| `[agents]` key | Type | Meaning |
|---|---|---|
| `enabled` | boolean | Default `true`; enables multi-agent tools. |
| `max_concurrent_threads_per_session` | number | Concurrent spawned threads excluding primary; default selected by Codex. |
| `max_threads` | number | Legacy alias retained. |
| `default_subagent_model` | string | Default child model. |
| `default_subagent_reasoning_effort` | string | Default child reasoning effort. |
| `interrupt_message` | boolean | Default `true`; record model-visible interruption message. |

Source: [Global settings](https://learn.chatgpt.com/docs/agent-configuration/subagents#global-settings).

- Delegation follows explicit requests or applicable skill/`AGENTS.md` instructions. CLI `/agent` inspects/switches threads; model orchestration spawns, steers, waits for, and closes children. [Invocation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- Model/effort resolution before custom file: explicit spawn → `[agents]` defaults → parent. Selecting a different model without effort uses that model’s default in the documented cases; custom-file explicit values then win. A custom file setting only model preserves previously resolved effort. [Model resolution](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents).
- Children inherit parent security context. Live parent sandbox/approval overrides are reapplied even when the custom file differs. Fresh approvals unavailable in noninteractive execution fail back to the parent. [Approvals](https://learn.chatgpt.com/docs/agent-configuration/subagents#approvals-and-sandbox-controls).
- Shipping custom agent definitions as a discoverable **plugin component** is not documented; standalone config discovery and plugin skill discovery must not be conflated. [Agent paths](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents), [Plugin components](https://developers.openai.com/plugins/build/plugins#plugin-structure).

## Commands and prompts

**Deprecated but documented:** custom prompts for CLI and IDE. Replacement recommendation: skills, which add implicit invocation and repository distribution; this is not a promise that old command files are automatically converted. [Custom prompts](https://learn.chatgpt.com/docs/custom-prompts).

| Item | Type / syntax | Meaning |
|---|---|---|
| `$CODEX_HOME/prompts/*.md` | top-level Markdown files | Default `~/.codex/prompts`; subdirectories and non-Markdown files ignored. |
| `description` | YAML string | Menu description. |
| `argument-hint` | YAML string | Argument usage hint. |
| `/prompts:<basename>` | slash invocation | Expands file into a user message. |
| `$1` … `$9` | positional placeholders | Space-separated command arguments. |
| `$ARGUMENTS` | placeholder | All supplied arguments. |
| `$UPPERCASE_NAME` | named placeholder | Supply `NAME=value`; quote whitespace-containing values. |
| `$$` | escape | Literal `$`. |

Reload on new session/chat or restart. Prompts are user-home scoped, explicitly invoked, and not shared via repository discovery. Missing-argument failure details are UNKNOWN from this page. [Prompt metadata/arguments](https://learn.chatgpt.com/docs/custom-prompts#add-metadata-and-arguments).

Shell execution interpolation, file inclusion interpolation, per-prompt model/tool overrides, and plugin-native custom-command discovery: **Not supported by the documented prompt contract; undocumented behavior UNKNOWN**. [Complete documented prompt contract](https://learn.chatgpt.com/docs/custom-prompts), [Plugin components](https://developers.openai.com/plugins/build/plugins#plugin-structure).

## Hooks

**Shipped:** enabled by default. Rules below are current release documentation; linked GitHub `main` schemas can contain unreleased fields. [Hooks release reference](https://learn.chatgpt.com/docs/hooks).

### Configuration and handlers

Sources: `hooks.json` beside active config layers, inline `[hooks]` in `config.toml`, managed requirements, and enabled plugins. Typical paths: `~/.codex/hooks.json`, `<project>/.codex/hooks.json`; plugin default `hooks/hooks.json`. Sources are **additive**, unlike ordinary config override precedence. Both inline/file hooks in one layer are merged with warning. Project hooks require trusted project config. [Discovery](https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks).

| Field | Type | Meaning |
|---|---|---|
| `description` | string | Optional hooks-file metadata. |
| `hooks` | map<event,array<object>> | Event groups. |
| `hooks.<Event>[].matcher` | string | Regex filter; omitted, `""`, or `"*"` matches all. |
| `hooks.<Event>[].hooks` | array<object> | Handlers. |
| Handler `type` | string | Executed: `command`, `mcp_tool`; `prompt`, `agent` parsed but **skipped**. |
| `command` | string | Command handler executable shell command. |
| `commandWindows` | string | Windows override; TOML also accepts `command_windows`. |
| `timeout` | number, seconds | Default 600; `SessionEnd`/`Interrupt` default 1, maximum 3. |
| `statusMessage` | string | Runtime status display. |
| `additionalContextLimit` | integer | Approximate token spill threshold for additional context; default 2500, `0` disables spilling for it. |
| `async` | boolean | Background command execution; cannot control triggering operation. |
| MCP `server` | string, required | Already-connected server. |
| MCP `tool` | string, required | Tool on that server. |
| MCP `input` | JSON object, default `{}` | Recursive event argument templates. |

Sources: [Config shape](https://learn.chatgpt.com/docs/hooks#config-shape), [MCP handlers](https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks), [Background hooks](https://learn.chatgpt.com/docs/hooks#run-hooks-in-the-background).

No documented `http` handler or native JS/TS script-module handler. MCP templates use `${field.nested}`; a whole-value placeholder preserves JSON type, embedded placeholders stringify. MCP handlers are synchronous, do not start/reconnect servers, do not request approval or recursively trigger hooks; shorter hook/server timeout wins, excluding elicitation wait time. `SessionEnd` does not support MCP handlers. [MCP execution](https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks).

Commands run in session CWD. Plugin commands receive `PLUGIN_ROOT`, `PLUGIN_DATA`, and compatibility `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`. [Command configuration](https://learn.chatgpt.com/docs/hooks#config-shape), [Plugin environment](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks).

### Events and input payload

Every command receives JSON on stdin: `session_id: string` (parent ID for subagent hooks), `transcript_path: string|null`, `cwd: string`, `hook_event_name: string`, `model: string`. `permission_mode` appears on the events marked below; enum: `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`. Transcript format is not stable. [Common input](https://learn.chatgpt.com/docs/hooks#common-input-fields).

| Event | Meaning / matcher | Additional input |
|---|---|---|
| `SessionStart` | Start/resume/reset/compaction continuation; matches `source` | `source: startup\|resume\|clear\|compact`; permission mode |
| `SessionEnd` | Main session normal close/archive/delete or inactive-unopened 30-minute expiration; not subagents | `reason: "other"`; matcher filters reason |
| `SubagentStart` | Child start; matches `agent_type` | `turn_id`, `agent_id`, `agent_type`: string; permission mode |
| `PreToolUse` | Before local function tool; matches tool name/aliases | `turn_id`, `tool_name`, `tool_use_id`: string; `tool_input: JSON`; permission mode |
| `PermissionRequest` | Before an approval request; matches tool name/aliases | `turn_id`, `tool_name`: string; `tool_input: JSON`, optional `tool_input.description: string|null`; permission mode |
| `PostToolUse` | After local tool result, including nonzero shell exit | `turn_id`, `tool_name`, `tool_use_id`: string; `tool_input`, `tool_response`: JSON; permission mode |
| `PreCompact` | Before compaction; matches trigger | `turn_id: string`, `trigger: manual\|auto` |
| `PostCompact` | After compaction; matches trigger | `turn_id: string`, `trigger: manual\|auto` |
| `UserPromptSubmit` | Before sending user prompt; matcher ignored | `turn_id`, `prompt`: string; permission mode |
| `SubagentStop` | Child completion; matches agent type | `turn_id`, `agent_id`, `agent_type`: string; `agent_transcript_path`, `last_assistant_message`: string|null; `stop_hook_active: boolean`; permission mode |
| `Stop` | Main turn completion; matcher ignored | `turn_id: string`, `stop_hook_active: boolean`, `last_assistant_message: string|null`; permission mode |
| `Interrupt` | Active main-turn interruption only; matcher ignored | `turn_id: string`; permission mode |

Source for all event rows: [Event reference](https://learn.chatgpt.com/docs/hooks#hooks).

Tool matching: shell and unified `exec_command` use `Bash`; `apply_patch` also matches `Edit`/`Write`; `spawn_agent` also matches `Agent`; MCP names resemble `mcp__server__tool`. `write_stdin` does not rerun pre-hooks for an existing command. Hosted tools such as `WebSearch` do **not** use these hooks; specialized paths may opt out. [Tool coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage).

### Output and decisions

Common fields: `continue: boolean`, `stopReason: string`, `systemMessage: string`, `suppressOutput: boolean`. `suppressOutput` is parsed but unimplemented. Event-specific content uses `hookSpecificOutput`, whose `hookEventName` identifies the event and `additionalContext: string` injects developer context where supported. [Common output](https://learn.chatgpt.com/docs/hooks#common-output-fields).

| Event | Implemented output/control |
|---|---|
| `SessionStart` | Plain stdout or JSON additional context; `continue:false` can stop compact continuation. |
| `SessionEnd` | Advisory only; cannot keep thread open or steer it. |
| `SubagentStart` | Plain stdout or JSON context; `continue:false` does **not** prevent child start. |
| `PreToolUse` | `permissionDecision:"deny"` + `permissionDecisionReason`, or legacy `decision:"block"`/`reason`; `allow` plus `updatedInput` rewrites call. Additional context supported. |
| `PermissionRequest` | `hookSpecificOutput.decision.behavior:"allow"\|"deny"`, optional `message`; no decision preserves normal approval. Any deny wins. |
| `PostToolUse` | Context, `decision:"block"`/`reason`, or `continue:false` replaces original result with feedback; cannot undo side effects. |
| `PreCompact` | Common output; `continue:false` prevents compaction. |
| `PostCompact` | Common output; `continue:false` stops after compaction. |
| `UserPromptSubmit` | Plain stdout/context injection; `decision:"block"`/`reason` rejects prompt. |
| `SubagentStop` | JSON required for nonempty successful output; `decision:"block"`/`reason` requests child continuation; any `continue:false` takes precedence. |
| `Stop` | JSON required for nonempty successful output; `decision:"block"`/`reason` creates a new continuation user prompt; any `continue:false` wins. |
| `Interrupt` | Empty success or JSON `systemMessage`; cannot prevent interruption/restart turn; plain text invalid. |

Source: [Event output contracts](https://learn.chatgpt.com/docs/hooks#hooks).

Important incompatibilities:

- `PreToolUse` **`ask` is not implemented**; legacy `approve`, `continue`, `stopReason`, `suppressOutput` fail the hook and tool processing continues. `updatedInput` is accepted only with `allow`; shell/patch require string `command`, other local tools replacement arguments object. [PreToolUse](https://learn.chatgpt.com/docs/hooks#pretooluse).
- Permission-request `updatedInput`, `updatedPermissions`, `interrupt` are reserved and **fail closed** today. [PermissionRequest](https://learn.chatgpt.com/docs/hooks#permissionrequest).
- `updatedMCPToolOutput` is parsed but unsupported. [PostToolUse](https://learn.chatgpt.com/docs/hooks#posttooluse).
- Exit `0` without output succeeds. Exit `2` with stderr implements block/feedback/continuation for the explicitly documented control events. Errors/timeouts are hook failures; pre-tool MCP errors, missing servers, and unavailable tools do not block the operation. Exhaustive behavior for every other numeric exit code is UNKNOWN from the release page. [Common output](https://learn.chatgpt.com/docs/hooks#common-output-fields), [Events](https://learn.chatgpt.com/docs/hooks#hooks), [MCP lifecycle](https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks).
- Matching command handlers launch concurrently; no serial ordering guarantee. Background limit eight per session, queued overflow, output delivered at next safe point, no new turn on completion; unfinished background work is canceled at session end. `SessionEnd` always synchronous. [Ordering](https://learn.chatgpt.com/docs/hooks), [Async limitations](https://learn.chatgpt.com/docs/hooks#run-hooks-in-the-background).
- Large context spills to disk; avoid secrets. The rendered documentation’s exact spill pathname is incomplete, so exact path UNKNOWN. [Large output](https://learn.chatgpt.com/docs/hooks#large-hook-output).

## MCP servers

**Shipped:** CLI, IDE, and desktop share Codex-host configuration; documented transports are STDIO and Streamable HTTP. Native legacy SSE support is **UNKNOWN**, despite SSE being part of portable Agent Plugins 1.0. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp), [Portable MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json).

### Native `config.toml`

Tables: `[mcp_servers.<name>]`; user `~/.codex/config.toml`, trusted project `.codex/config.toml`, other active config layers. [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

| Key | Type | Meaning |
|---|---|---|
| `command` | string | STDIO launcher. |
| `args` | string[] | Launcher arguments. |
| `env` | map<string,string> | Explicit STDIO environment. |
| `env_vars` | array<string or object> | Forwarded variables; object `name:string`, `source:"local"\|"remote"`; strings imply local. |
| `cwd` | string | Process working directory. |
| `experimental_environment` | `local` / `remote` | **Experimental** STDIO executor placement; remote HTTP placement unimplemented. |
| `url` | string | Streamable HTTP endpoint. |
| `auth` | `oauth` / `chatgpt` | Fallback after explicit credentials; OAuth default. ChatGPT auth only trusted first-party origin, then OAuth fallback. May connect unauthenticated if nothing resolves. |
| `bearer_token_env_var` | string | Name of bearer-token environment variable. |
| `http_headers` | map<string,string> | Static request headers. |
| `env_http_headers` | map<string,string> | Header → environment-variable name. |
| `http_headers_helper` | string command | Local HTTP connection helper returning JSON string-valued headers. |
| `oauth_resource` | string | RFC 8707 resource parameter. |
| `oauth.client_id` | string | Pre-registered OAuth client. |
| `oauth.callback_port` | integer | Server-specific callback port. |
| `oauth.callback_url` | string | Server-specific callback URL. |
| `scopes` | string[] | OAuth scopes. |
| `startup_timeout_sec` | number | Default 10 seconds. |
| `startup_timeout_ms` | number | Millisecond alias. |
| `tool_timeout_sec` | number | Default 60 seconds. |
| `enabled` | boolean | Disable without deletion. |
| `required` | boolean | Enabled server failure fails startup/resume. |
| `enabled_tools` | string[] | Tool allowlist. |
| `disabled_tools` | string[] | Denylist applied after allowlist. |
| `default_tools_approval_mode` | `auto` / `prompt` / `writes` / `approve` | Default tool approval behavior. |
| `tools.<tool>.approval_mode` | same enum | Per-tool override. |
| `tools.<tool>.output_token_limit` | positive integer | Output token limit before standard 20% serialization allowance. |

Sources for all keys: [MCP configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [Expanded MCP semantics](https://learn.chatgpt.com/docs/extend/mcp).

Global OAuth settings include `mcp_oauth_callback_port: integer`; server-specific callback overrides it. Exact native `envFile`, explicit `transport`/`type`, arbitrary `${ENV}` string expansion, and per-server trust boolean are **not documented**. Native environment sourcing is explicit through the keys above. [Reference](https://learn.chatgpt.com/docs/config-file/config-reference).

HTTP helper headers are cached; same-origin POST 401/403 refreshes once and retries only on changed values; bearer/OAuth precedence over helper Authorization, insufficient-scope OAuth 403 does not refresh. [HTTP authentication](https://learn.chatgpt.com/docs/extend/mcp#streamable-http-servers).

Commands include `codex mcp add <name> --env KEY=VALUE -- <command> ...`, `codex mcp list`, `codex mcp login <name>`; `/mcp` shows connected servers. [CLI mechanics](https://learn.chatgpt.com/docs/extend/mcp#configure-with-the-cli).

### Relative paths in `[mcp_servers]`

Checked in the source (openai/codex `2351d9e1b608`, `codex-rs/`), not at runtime. No `[mcp_servers]` path resolves against the config file or the project root, so a portable relative path cannot be written:

- The loader resolves only `AbsolutePathBuf` fields of a layer against its folder; for a project layer that folder is its `.codex/` (`config/src/loader/mod.rs:1462-1472`, `:1650-1651`).
- `command`, `args`, `env` and `url` are plain strings, and `cwd` is `LegacyAppPathString` (`config/src/mcp_types.rs:367-377`, `:625`), which deserializes without interpreting the text (`utils/path-uri/src/api_path_string.rs:28-38`).
- A local stdio server starts in `PathBuf::from(cwd)` passed to `current_dir`, so a relative `cwd` is relative to the Codex process; without `cwd` it starts in the session's working directory (`rmcp-client/src/stdio_server_launcher.rs:277-283`, `codex-mcp/src/rmcp_client.rs:1235-1249`, `core/src/session/mcp.rs:160-177`). On Unix the program is spawned unchanged (`rmcp-client/src/program_resolver.rs:22-29`).
- Plugin MCP servers differ: Codex resolves a `./` command and the `cwd` against the plugin root (`codex-mcp/src/agent_plugin_config.rs:205-243`).

### Plugin MCP

Portable root `mcp.json` is a closed schema: required `$schema` and `mcpServers: map<string,server>`. [Schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json).

| Server type | Exact fields |
|---|---|
| `stdio` | Required `type:"stdio"`, `command:string`; optional `args:string[]`, `env:map<string,string>`, `cwd:string`. |
| `streamable-http` | Required `type:"streamable-http"`, `url:string`; optional `headers:map<string,string>`. |
| `sse` | Required `type:"sse"`, `url:string`; optional `headers:map<string,string>`. Codex-specific actual runtime support UNKNOWN. |

Compatibility packages use `.mcp.json` and manifest `mcpServers:"./.mcp.json"`; official remote example omits `type` and schema. Do not merely rename compatibility `.mcp.json` into portable `mcp.json`. [Packaging](https://developers.openai.com/plugins/build/plugins), [Compatibility example](https://developers.openai.com/plugins/deploy/submission#complete-metadata-examples).

Portable expansion: only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, single-pass, in `args` values, `env` values, and `cwd`; **not** in `command`, env keys, headers, or fixed component paths. Other placeholder-like strings remain literal. Reserved env keys cannot be overridden. `PLUGIN_DATA` is writable, persistent across updates; its exact Codex location UNKNOWN. [Normative expansion](https://agent-plugins.org/specification#9-environment-variables-and-placeholder-expansion).

User-side `[plugins.<plugin>.mcp_servers.<server>]` policy fields: `enabled:boolean`, `enabled_tools:string[]`, `disabled_tools:string[]`, `default_tools_approval_mode` and `tools.<tool>.approval_mode` with the same four-value enum. These are consumer settings, not portable server fields. [Plugin MCP policy](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).

## Other native capability types

| Type | Support / package behavior |
|---|---|
| Registered apps/connectors | **Shipped** compatibility `.app.json`, referenced by OpenAI `apps`. Public example: `{"apps":{"notion":{"id":"asdk_app_..."}}}`. Full mapping schema UNKNOWN. |
| MCP-returned UI | **Shipped** MCP Apps UI standard; server-owned UI resources, not a separate locally executable Codex extension module. |
| Onboarding workflow | **Shipped** `onboardingSkill` path to a packaged `SKILL.md`. |
| Presentation assets | Icons, logos, dark variants, screenshots, brand colors, starter prompts; detailed fields below. |
| LSP server components | **Not supported in documented plugin format**; runtime internals UNKNOWN. |
| Output-style packages | **Not supported in documented plugin format**. |
| Theme packages | **Not supported in documented plugin format**. |
| Monitor packages | **Not supported in documented plugin format**. |
| `userConfig` / typed plugin settings schema | **Not supported in documented plugin format**. Onboarding skill is not such a schema. |
| JS/TS native tool/extension modules | **Not supported in documented plugin format**; code can ship as resources or execute through MCP/hooks, not Pi-style in-process extension registration. |
| Statusline/keybinding components | No documented plugin component. Native TUI configuration exists. |
| Models/providers | Native configuration exists; no documented plugin provider/model-registration component. |

Sources: [Plugin structure](https://developers.openai.com/plugins/build/plugins#plugin-structure), [Registered mapping example](https://raw.githubusercontent.com/openai/plugins/main/plugins/notion/.app.json), [Plugin architecture/UI](https://developers.openai.com/plugins/concepts/plugins), [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Native app policy keys, all **consumer configuration**, not `.app.json` mapping fields: `apps._default.{approvals_reviewer,default_tools_approval_mode,destructive_enabled,enabled,open_world_enabled}`; per-app equivalents plus `default_tools_enabled`; `apps.<id>.tools.<tool>.{approval_mode,enabled}`. Reviewer enum `user|auto_review`; approval enum `auto|prompt|writes|approve`; enabled/destructive/open-world controls boolean. [App policy reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Native provider configuration `[model_providers.<id>]` fields: `name`, `base_url`, `env_key`, `env_key_instructions`, `experimental_bearer_token`: strings; `http_headers`, `env_http_headers`, `query_params`: maps; `request_max_retries`, `stream_max_retries`, `stream_idle_timeout_ms`: numbers; `requires_openai_auth`, `supports_standalone_web_search`, `supports_websockets`: booleans; `wire_api:"responses"`; `auth.command:string`, `auth.args:array`, `auth.cwd:string`, `auth.refresh_interval_ms:number`, `auth.timeout_ms:number`; Bedrock `aws.profile:string`, `aws.region:string`. These are configuration capabilities, not authorized portable plugin fields. [Provider reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Native `tui.keymap.global`, `.composer`, `.chat` map supported actions to string or string-array bindings; empty array unbinds. Context-specific actions take precedence where supported. Example actions documented: `open_transcript`, `submit`, `interrupt_turn`. Exhaustive action enum and plugin distributability UNKNOWN. [TUI keymap](https://learn.chatgpt.com/docs/config-file/config-basic#tui-keymap).

## Permissions, trust and security

- Project `.codex/` config, hooks, and execution rules load only when the project is trusted; user/system layers continue in untrusted projects. Project trust is not equivalent to hook trust. [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic), [Hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).
- Nonmanaged hooks require review of their exact current definition; trust is hash-bound, changed definitions are skipped until reviewed. `/hooks` reviews/trusts/disables. Plugin install/enable does **not** trust hooks. Managed hooks are policy-trusted and user-undisableable. Invocation override: `--dangerously-bypass-hook-trust`. [Hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).
- Packages cannot set portable sandbox/approval policy through Agent Plugins core fields. Custom standalone agents can express config defaults, but live parent security overrides and enterprise requirements still govern. [Portable manifest](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), [Child security](https://learn.chatgpt.com/docs/agent-configuration/subagents#approvals-and-sandbox-controls).
- Native legacy sandbox modes documented: `read-only`, `workspace-write`, `danger-full-access`; current permission profiles include `:read-only`, `:workspace`, `:danger-full-access`, custom `[permissions.<name>]` plus `default_permissions`. Codex 0.138.0+ enterprise guidance prefers profiles. [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic), [Managed version guidance](https://learn.chatgpt.com/docs/enterprise/managed-configuration).
- `approval_policy="untrusted"` is retired; current migration guidance distinguishes it from project `trust_level="untrusted"`, which remains meaningful. Do not map these as one concept. [Managed migration](https://learn.chatgpt.com/docs/enterprise/managed-configuration#migrate-the-retired-untrusted-approval-policy).
- Enterprise `requirements.toml` can constrain approvals, sandbox/profiles, web search, hooks, MCP identities, and marketplace sources. An MCP allowlist requires both name and identity; identity can match URL, command string, or structured executable/ordered arguments. Command-string identity alone does not constrain args/env/cwd. [Managed requirements](https://learn.chatgpt.com/docs/enterprise/managed-configuration).
- Hook management keys: `features.hooks:boolean` (`codex_hooks` deprecated alias), `allow_managed_hooks_only:boolean`, `hooks.managed_dir:string`, `hooks.windows_managed_dir:string`. Admin scripts are deployed separately, not downloaded by these settings. [Managed hooks](https://learn.chatgpt.com/docs/hooks#managed-hooks-from-requirementstoml).
- Portable path containment restricts packaged file discovery but **does not sandbox subprocesses**. Local skill symlink support must not bypass portable package containment. [Containment](https://agent-plugins.org/specification#41-general-requirements).
- Npm plugin acquisition runs no lifecycle scripts, but installed hook/MCP code remains executable capability. [Npm sources](https://developers.openai.com/plugins/build/plugins#marketplace-metadata).
- Public submission requires verified publisher identity, automated metadata/skill/tool checks, and human review; MCP domain verification uses `/.well-known/openai-apps-challenge`. Cryptographic package signatures, signed provenance/attestations, exact local install trust prompt, and checksum persistence: **UNKNOWN**. [Submission process](https://developers.openai.com/plugins/deploy/submission).

## Packaging, install and scopes

### Portable manifest

Root `plugin.json`, recognized Agent Plugins **1.0.0** schema; root `skills/`, root `mcp.json`, assets/resources. Optional `.codex-plugin/plugin.json` compatibility overlay. [Packaging](https://developers.openai.com/plugins/build/plugins#plugin-structure).

| Root key | Type | Meaning |
|---|---|---|
| `$schema` | required constant string | `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |
| `name` | required string | 1–64 characters; schema accepts lowercase alphanumeric, dots, hyphens with restrictions; public submission asks lowercase letters/numbers/single hyphens. |
| `version` | string | Release version; optional schema field, explicit semantic version recommended for submission/updates. |
| `description` | string | Summary. |
| `author` | object | Optional publisher metadata. |
| `author.name`, `.email`, `.url` | string | Publisher identity/contact. |
| `homepage`, `repository`, `license` | string | Project URL, source URL, license. |
| `keywords` | string[] | Discovery terms. |
| `extensions` | map<string,object> | Client-owned reverse-domain namespaces. |

Closed top-level schema; no core dependency, command, agent, hook, or permission fields. Source: [Exact schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).

### OpenAI extension and compatibility manifest

When root `extensions.com.openai` is an object, it **replaces the entire compatibility overlay**, not merges. Root identity and portable `skills/`/`mcp.json` remain canonical; overlay `skills`/`mcpServers` cannot add/replace/disable them. [Overlay semantics](https://developers.openai.com/plugins/deploy/submission#manifest-fields).

| Field | Type / location | Meaning |
|---|---|---|
| `interface` | object; extension or compatibility root | Listing/UI metadata below. |
| `id` | optional string; same placement | Assigned managed-catalog identity; preserve it. |
| `apps` | documented relative path; same placement | Registered app mappings, typically `./.app.json`. Exhaustive accepted shapes UNKNOWN. |
| `hooks` | path, path[], inline object, object[]; same placement | Explicit definition replaces default `hooks/hooks.json`. |
| `skills` | compatibility root string or string[] | Relative skill directories; ignored for portable components. |
| `mcpServers` | compatibility root documented path | Bundled compatibility `.mcp.json`; ignored for portable components. |
| `extensions.com.openai.onboardingSkill` | string | Included setup `SKILL.md`; same nested placement in compatibility manifest. |
| `extensions.com.openai.review` | object | Submission review data. |
| `extensions.com.openai.publication` | object | Publication targeting/release/localization data. |

Compatibility upload format requires `name`, `version`, `description`, `author.name`, and `interface`; minimal runtime hook examples are less complete, so do not assume upload requirements equal every runtime loader requirement. [Submission field requirements](https://developers.openai.com/plugins/deploy/submission#manifest-fields), [Runtime hook example](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks).

Paths start `./`, resolve from plugin root, remain inside it. Resources stay at root, not within `.codex-plugin/`. [Path rules](https://developers.openai.com/plugins/build/plugins#path-rules).

### Listing fields

All below are strings except stated otherwise. Limits/requirements are **public submission rules**, not necessarily local runtime constraints. [Complete listing reference](https://developers.openai.com/plugins/deploy/submission#listing-metadata).

| Field | Meaning / limit |
|---|---|
| `displayName` | Listing name; required, ≤30 characters. |
| `shortDescription` | Subtitle; required, ≤30. |
| `longDescription` | Detailed tasks/users/limitations; required, ≤4000. |
| `developerName` | Publisher; required, ≤80; directory identity comes from verified developer selection. |
| `category` | Required dashboard category, e.g. `Productivity`; exhaustive enum UNKNOWN. |
| `capabilities` | string[]; ≤20 labels, ≤120 each; required compatibility format, optional portable. Not permissions. |
| `websiteURL` | HTTPS product URL; ≤1024. |
| `supportURL` | HTTPS support URL; ≤1024. |
| `privacyPolicyURL` | HTTPS privacy URL; ≤1024. |
| `termsOfServiceURL` | HTTPS terms URL; ≤1024. |
| `defaultPrompt` | string or string[]; up to three starter prompts, ≤128 each. |
| `brandColor` | `#RRGGBB`; light color, ≥2:1 contrast against white. |
| `brandColorDark` | Dark variant; ≥2:1 against `#212121`; derived if absent. |
| `composerIcon`, `composerIconDark` | Packaged composer icon paths. |
| `logo`, `logoDark` | Packaged primary listing icon paths. |
| `screenshots` | string[] of packaged image paths. |

Four listing URLs required for MCP review, not all for skills-only. Compatibility validation requires composer icon and logo. PNG/JPEG/WebP/SVG, ≤5 MiB each; square icons ≥48×48, raster maximum 4096 per dimension. [Images and URLs](https://developers.openai.com/plugins/deploy/submission#icons-and-screenshots).

### Review/publication fields

Paths below are relative to `extensions.com.openai`. [Review/publication reference](https://developers.openai.com/plugins/deploy/submission#configure-onboarding-review-and-publication).

| Key | Type | Meaning |
|---|---|---|
| `review.test_cases.positive` | object[] | Five cases required for initial MCP review. |
| `review.test_cases.negative` | object[] | Three cases required for initial MCP review. |
| Case `description`, `prompt` | string, required | Scenario and user prompt. |
| Case `tools_triggered`, `expected_behavior` | string | Required for positive submission cases. |
| Case `file_attachment_urls` | string[] | Reviewer input attachments. |
| Case `expected_output_url` | string | Reference output. |
| `review.demo_recording_url` | string | Required MCP-review walkthrough. |
| `review.commerce` | boolean | Commerce declaration. |
| `review.commerce_description` | string | Commerce explanation. |
| `publication.countries` | string[] | Uppercase country-code allowlist; omission preserves targeting, `[]` clears restrictions. |
| `publication.release_notes` | string | Release changes. |
| `publication.translations` | object or null | Locale-keyed listing translations. |
| `publication.translations.<locale>.subtitle` | string or null | ≤30 characters. |
| `publication.translations.<locale>.description` | string or null | ≤4000 characters. |

Import semantics are stateful: omitted/null scalar review fields preserve saved values; empty strings clear; omitted/null test cases preserve, `{}` clears lists. Credentials and reviewer instructions are rejected in ZIP metadata. Translations are validated/retained but **do not yet change directory/API listing text**. [Import and translation behavior](https://developers.openai.com/plugins/deploy/submission#configure-onboarding-review-and-publication).

### Marketplaces and source types

Catalog paths: `$REPO_ROOT/.agents/plugins/marketplace.json`, personal `~/.agents/plugins/marketplace.json`; desktop also accepts legacy `$REPO_ROOT/.claude-plugin/marketplace.json`. These are separate from the universal public directory. [Marketplace behavior](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work).

| Catalog field | Type | Meaning |
|---|---|---|
| `name` | string | Marketplace identity. |
| `interface.displayName` | string | Desktop source-picker label. |
| `plugins` | object[] | Ordered plugin catalog. |
| `plugins[].name` | string | Entry identity. |
| `plugins[].source` | string or object | Local path shorthand or source descriptor. |
| `source.source` | string | Documented kinds: `local`, `url`, `git-subdir`, `npm`. |
| Local `source.path` | string | `./` path relative to marketplace **root**, not catalog directory; contained in root. |
| Git `source.url` | string | Git repository URL. |
| `git-subdir` `source.path` | string | Plugin subdirectory. |
| Git `source.ref`, `.sha` | string | Ref or commit selector; simultaneous-selector precedence UNKNOWN. |
| Npm `source.package` | string, required | Registry package identifier. |
| Npm `source.version` | string | Version/tag/range; not path/URL selectors. |
| Npm `source.registry` | string | HTTPS registry; no credentials/query/fragment. |
| `policy.installation` | string | Documented values `AVAILABLE`, `INSTALLED_BY_DEFAULT`, `NOT_AVAILABLE`. |
| `policy.authentication` | string | Auth on installation or first use; `ON_INSTALL` explicitly illustrated; exhaustive exact enum UNKNOWN. |
| `category` | string | Catalog category. |

Every entry is instructed to include both policy fields and category. Invalid/unresolvable source entries are skipped without failing entire marketplace. Npm requires installed `npm`, uses npm authentication, and does not run lifecycle scripts. [Catalog/source reference](https://developers.openai.com/plugins/build/plugins#marketplace-metadata).

Configured `[marketplaces.<name>]` keys: `source_type:"git"|"local"`, `source:string` (absolute local root or Git location), `ref:string`, `sparse_paths:string[]`. Supported config scopes: system, cloud-managed, user, trusted project. [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference).

CLI marketplace commands:

```text
codex plugin marketplace add owner/repo
codex plugin marketplace add owner/repo --ref main
codex plugin marketplace add https://github.com/example/plugins.git --sparse .agents/plugins
codex plugin marketplace add ./local-marketplace-root
codex plugin marketplace list
codex plugin marketplace upgrade [marketplace-name]
codex plugin marketplace remove marketplace-name
```

GitHub shorthand `owner/repo@ref`, HTTP(S)/SSH Git URLs, local roots supported; repeated `--sparse` only Git. These documented commands manage catalogs; the guide directs local install/test through desktop. Exact standalone CLI install/update/uninstall command contract: **UNKNOWN**. [CLI catalog setup](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli).

### Installation state, scope, updates

- Desktop installs into `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`; local packages use version directory `local` and load the cached copy, not source folder directly. User examples may store source in `~/.codex/plugins/`, but source locations are not fixed. [Cache behavior](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work).
- Enable setting: `[plugins."plugin-name@marketplace-name"] enabled = true|false`; browser stores choices in `~/.codex/config.toml`; repo `.codex/config.toml` can override. **Not Claude `enabledPlugins` JSON.** Disabled configured plugins can still be installed/refreshed during marketplace refresh. [Enablement](https://developers.openai.com/plugins/build/plugins#enable-or-disable-a-plugin-for-a-repo).
- Config precedence highest first: CLI overrides → trusted project layers root-to-CWD/closest wins → selected `~/.codex/<profile>.config.toml` → user → cloud-managed defaults → `/etc/codex/config.toml` → built-ins. Requirements constrain all defaults. [Precedence](https://learn.chatgpt.com/docs/config-file/config-basic#configuration-precedence).
- Workspace-admin imported plugins have workspace-managed enabled state; local config does not override it even when source is GitHub. Workspace publishing may target roles; `features.plugin_sharing=false` in requirements disables workspace publishing. [Workspace distinction](https://developers.openai.com/plugins/build/plugins#enable-or-disable-a-plugin-for-a-repo), [Publishing](https://developers.openai.com/plugins/build/plugins#publish-a-local-plugin-to-your-workspace).
- Public upload uses ZIP. Hooks and `.app.json`/`apps` references are currently **ineligible**; remote HTTPS MCP submission is supported, only one MCP server can currently be connected per public plugin despite package multiple-server declarations. Metadata/skills changes require a new ZIP; eligible hosted MCP changes update after automated checks. Adding MCP to an existing skills-only public plugin is currently unsupported. [Submission](https://developers.openai.com/plugins/deploy/submission).
- Portable manifest has no dependency graph/import field. Skill dependency metadata is not documented transitive plugin resolution. Exact lockfile, installation index, marketplace snapshot cache, hook-trust persistence file, rollback/version-selection rules, and automatic local refresh interval: **UNKNOWN**. [Manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), [Documented install behavior](https://developers.openai.com/plugins/build/plugins).

## Notable gaps and ambiguities

- **Surface scope conflict:** packaging text says lifecycle hooks are for manually installed Codex desktop plugins, while hook documentation describes enabled plugin hooks in the runtime alongside CLI hook controls. Cloud orchestration explicitly excludes local/plugin command hooks. Do not advertise a uniform CLI/IDE/desktop/cloud plugin-hook matrix without surface testing. [Packaging restrictions](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks), [Hook discovery](https://learn.chatgpt.com/docs/hooks), [Cloud restrictions](https://learn.chatgpt.com/docs/enterprise/managed-configuration).
- **Portable schema versus host implementation:** published MCP schema includes `sse`; Codex transport docs enumerate STDIO/Streamable HTTP. Preserve SSE on import, but Codex emission support remains UNKNOWN. [Schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json), [Codex transports](https://learn.chatgpt.com/docs/extend/mcp).
- **Skill permissions:** experimental standard `allowed-tools` is not evidence of Codex authorization enforcement. [Standard](https://agentskills.io/specification#allowed-tools-field), [Codex skill contract](https://learn.chatgpt.com/docs/build-skills).
- **Lossless modeling requirement:** preserve complete `agents/openai.yaml`, OpenAI manifest extension, compatibility manifest, hook event-specific output, and standalone agent TOML configuration. Known fields alone are not a safe claim of an exhaustive closed Codex schema; optional metadata enums, `.app.json`, full marketplace schema, and custom-agent conflict precedence remain undocumented in inspected sources. [Metadata](https://learn.chatgpt.com/docs/build-skills#optional-metadata), [Agent config](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents), [Packaging](https://developers.openai.com/plugins/build/plugins).
- **Validation versus execution:** submission’s compatibility-manifest required fields exceed minimal runtime examples. Treat public publication metadata validation separately from local runtime package validity. [Submission reference](https://developers.openai.com/plugins/deploy/submission#manifest-fields), [Runtime hook package](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks).
- **Unsupported is not silently portable:** no documented native plugin discovery for custom agents, prose rules, prompts, execution policies, LSP, theme/output-style/keybinding/statusline modules, or in-process JS extensions. Standalone native configuration and bundled resource files are not plugin components. [Plugin component inventory](https://developers.openai.com/plugins/build/plugins#plugin-structure).
- **Research limitation:** official living docs and versioned portable schemas were inspected read-only; no runtime checks or repository edits. GitHub Codex source/schema corroboration was blocked by failed API retrieval and an obsolete raw source path. No shipped-version tag or commit was established; hook docs explicitly caution that `main` schemas can be ahead of releases. [Schema warning](https://learn.chatgpt.com/docs/hooks#schemas).
