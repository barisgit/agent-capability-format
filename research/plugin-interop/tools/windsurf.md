# Windsurf / Devin Desktop - capability inventory (snapshot 2026-10-01)

Research snapshot: **2026-10-01**. Official Windsurf URLs now redirect to `docs.devin.ai/desktop/…`. These are live, unversioned documentation; publication dates and minimum supported Desktop versions are **UNKNOWN** unless stated below.

**Two distinct targets are necessary:** legacy **Cascade** and current **Devin Local**, which shares the Devin CLI harness. New Desktop conversations default to Devin Local; existing Cascade conversations remain available. Plugins and subagents have no Cascade equivalent. Sources: [Desktop agent documentation](https://docs.devin.ai/desktop/devin-local), [plugin reference](https://docs.devin.ai/cli/extensibility/plugins/overview).

Status: Cascade capabilities below are documented as shipped legacy features. Devin Local is shipped; Desktop subagents are labelled **Preview**, custom subagents and subagent skills **experimental**, and plugins **beta** in the [official template](https://github.com/CognitionAI/plugin-template). No announced-only capability is included.

## Skills

### Cascade

Source for this subsection: [Cascade skills](https://docs.windsurf.com/windsurf/cascade/skills), redirecting to [Devin Desktop skills](https://docs.devin.ai/desktop/cascade/skills).

Layout: `<skills-directory>/<name>/SKILL.md`, with supporting files beside it.

| Frontmatter key | Type | Meaning |
|---|---|---|
| `name` | string, required | Unique identifier; UI display and `@name` invocation. Names use lowercase letters, numbers and hyphens. |
| `description` | string, required | Description exposed to the model for automatic selection. |

Other Agent Skills fields—including `allowed-tools`, `license`, `compatibility`, `metadata`—are **UNKNOWN** for Cascade: its documentation links Agent Skills but does not enumerate their implementation.

Discovery:

| Scope | Paths |
|---|---|
| Workspace | `.devin/skills/` preferred; `.windsurf/skills/` legacy |
| User | `~/.codeium/windsurf/skills/`, `~/.config/devin/skills/` |
| Cross-agent | `.agents/skills/`, `~/.agents/skills/` |
| Claude-compatible, conditional | `.claude/skills/`, `~/.claude/skills/`, when Claude configuration reading is enabled |
| System, macOS | `/Library/Application Support/Devin/skills/` |
| System, Linux/WSL | `/etc/devin/skills/` |
| System, Windows | `C:\ProgramData\Devin\skills\` |

System paths fall back to the corresponding `Windsurf` directory **only when the Devin directory does not exist**; directories are not merged. System skills are read-only to users. Duplicate-name precedence between other skill directories is **UNKNOWN**.

Only `name` and `description` initially enter model context. Full instructions and resources load on model selection or explicit **`@skill-name`**, not a slash command. Scripts, references, templates, checklists and arbitrary supporting files can be bundled; no mandatory `scripts/`, `references/` or `assets/` convention or extra metadata file is documented.

### Devin Local

Sources: [skills overview](https://docs.devin.ai/cli/extensibility/skills/overview), [creating skills](https://docs.devin.ai/cli/extensibility/skills/creating-skills), [configuration imports](https://docs.devin.ai/cli/reference/configuration/read-config-from).

`<name>/SKILL.md`; directory name is the invocation identifier. YAML frontmatter is optional.

| Key | Type/default | Meaning |
|---|---|---|
| `name` | string; directory name | Display name |
| `description` | string; unset | Slash completion description |
| `argument-hint` | string; unset | Completion hint |
| `model` | string; current model | Execution model override; same aliases as CLI `--model` |
| `subagent` | boolean; `false` | Run with `subagent_general` rather than inline; experimental |
| `agent` | string; unset | Named subagent profile; experimental; overrides `subagent` |
| `allowed-tools` | list; unset | **Auto-approval**, not tool restriction, for inline execution |
| `permissions` | object; inherited | Inline permission scope |
| `permissions.allow` | list of permission strings | Auto-approve matching operations |
| `permissions.deny` | list of permission strings | Block matching operations |
| `permissions.ask` | list of permission strings | Require approval |
| `triggers` | list; `[user, model]` | Exact values `user`, `model`; controls invocation eligibility |

Invocation: `/name`, model-selected, or `/<plugin>:<skill>` for installed plugins. `name` frontmatter is not documented as replacing the directory-derived slash identifier.

Discovery:

- Project: `.agents/skills/`, `.devin/skills/`, `.windsurf/skills/`.
- Global: `~/.agents/skills/`, `~/.config/devin/skills/`; Windows `%APPDATA%\devin\skills\`.
- Legacy global: `~/.codeium/<channel>/skills/`, where channel is `windsurf`, `windsurf-next`, or `windsurf-insiders`.
- Imported Claude: `.claude/skills/**/SKILL.md`; `.claude/commands/**/*.md` become skills.
- Imported Copilot: `.github/skills/**/SKILL.md`, `~/.copilot/skills/**/SKILL.md`; `$COPILOT_HOME/skills/` replaces the latter when set.
- Installed plugin: `skills/` or manifest-defined directories.
- Duplicate-name precedence and exhaustive ancestor traversal for skills: **UNKNOWN**; documentation describes project-root discovery, while hooks documentation references ancestor discovery “matching” skills/rules.

Supporting scripts are documented; mandatory auxiliary metadata files are **UNKNOWN**.

Pitfalls:

- Skill `allowed-tools` leaves unlisted tools available under normal permission checks.
- Skill permissions add to session permissions and cannot override higher-level denials.
- For subagent execution, **both skill `allowed-tools` and skill `permissions` are ignored**; profile tool restrictions apply instead.
- Skill `model` overrides profile model; `agent` overrides `subagent`.
- A subagent skill invoked inside a subagent runs inline rather than spawning another worker.
- Cascade workflows are **not automatically imported as skills**. [Creating skills](https://docs.devin.ai/cli/extensibility/skills/creating-skills), [imports](https://docs.devin.ai/cli/reference/configuration/read-config-from).

## Instructions and rules

### Cascade

Sources: [memories and rules](https://docs.devin.ai/desktop/cascade/memories), [AGENTS.md](https://docs.devin.ai/desktop/cascade/agents-md).

| File/path | Semantics |
|---|---|
| `AGENTS.md` or `agents.md` | Plain Markdown; case-insensitive recognition; workspace-root always-on, descendants auto-glob-scoped to their directory tree |
| `.devin/rules/*.md` | Preferred native rule files |
| `.windsurf/rules/*.md` | Legacy fallback |
| `.windsurfrules` | Legacy workspace-root single file, still read |
| `~/.codeium/windsurf/memories/global_rules.md` | Always-on global file; no frontmatter; 6,000-character limit |
| Workspace rule files | 12,000-character limit per file |
| System `rules/*.md` | OS paths below; additive enterprise rules, not replacements for user rules |

Rule frontmatter:

| Key | Type | Meaning |
|---|---|---|
| `trigger` | string enum | `always_on`, `glob`, `model_decision`, `manual` |
| `globs` | string demonstrated | File pattern for `glob`; array support, multiple-pattern grammar and anchoring **UNKNOWN** |
| `description` | string | Model-selection description for `model_decision` |

Activation:

- `always_on`: complete content in system prompt every message.
- `glob`: applied when reading/editing matching files.
- `model_decision`: description always exposed; complete content on model selection.
- `manual`: only `@rule-name`; not initially in system prompt.

Discovery scans workspace and descendants, plus ancestors up to Git root. Multiple workspace folders are deduplicated and displayed using shortest relative paths. Descendant `AGENTS.md` instructions inherit parent guidance; conflict-resolution ordering is **UNKNOWN**.

System directories: `/Library/Application Support/Devin/rules/`, `/etc/devin/rules/`, `C:\ProgramData\Devin\rules\`; corresponding Windsurf locations are legacy fallback. System rules merge with workspace/global rules rather than overriding them. Precise per-file fallback/collision algorithm is **UNKNOWN**.

Native Cascade support for `CLAUDE.md`, `GEMINI.md`, `.mdc`, steering files, and syntactic imports/includes is **UNKNOWN** in these rules docs.

### Devin Local

Sources: [rules reference](https://docs.devin.ai/cli/extensibility/rules), [imports](https://docs.devin.ai/cli/reference/configuration/read-config-from).

Always-on files: `AGENTS.md`, `AGENTS.local.md`, `AGENT.md`, `.windsurfrules`, `CLAUDE.md`. Workspace-root files load at session start; descendant files load lazily when their directory is accessed. These are additive instructions, not a documented nearest-file replacement.

Global: `~/.config/devin/AGENTS.md` or `AGENT.md`; Windows `%APPDATA%\devin\…`; Claude global instructions from `~/.claude/CLAUDE.md`.

Native rule paths:

- `.devin/rules/*.md`, `.devin/global_rules.md`.
- `~/.devin/rules/*.md`, `~/.devin/global_rules.md`.
- Legacy `.windsurf/rules/*.md`, `.windsurf/global_rules.md`.
- Both `.devin/rules/` and `.windsurf/rules/` load. For `global_rules.md`, Devin wins when both exist.
- Plugin `AGENTS.md` and `rules/*.md`.

Frontmatter uses `description`, `trigger`, `globs`; documented `trigger` values are **`always_on`, `manual`, `model_decision`, `agent`, `glob`**. Distinction between `agent` and `model_decision` is **UNKNOWN**.

Imported Cursor rules: `.cursor/rules/*.md` and `*.mdc`:

| Key | Type | Activation |
|---|---|---|
| `alwaysApply` | boolean | `true` means always active |
| `globs` | string demonstrated | Matching-file activation |
| `description` | string | Description-only means agent-selected |

Without these activation signals, imported Cursor rules require manual invocation. Exact rule-name invocation syntax is **UNKNOWN** in Local rules documentation.

`read_config_from` is an object containing boolean keys `agents_standard`, `cursor`, `windsurf`, `claude`, `copilot`, `opencode`, `zed`; all default `true`. These select configuration imports, not textual Markdown includes.

`GEMINI.md`, steering files and syntactic `@file`/`!include` processing: **UNKNOWN**. `.codeiumignore` is explicitly **not supported** by Local. Copilot custom instruction files are explicitly **not imported**.

## Subagents and custom agents

**Cascade: Not supported.** [Desktop limitations](https://docs.devin.ai/desktop/devin-local#limitations).

**Devin Local: Preview in Desktop; custom definitions experimental.** Source: [subagents](https://docs.devin.ai/cli/subagents).

Definition layouts:

- `.devin/agents/<name>.md`
- `.devin/agents/<name>/AGENT.md`
- `.agents/agents/` with the same layouts
- Global `~/.config/devin/agents/`; Windows `%APPDATA%\devin\agents\`
- Plugin `agents/`; profiles exposed as `<plugin>:<name>`

Directory-file precedence: `AGENT.md` > `AGENTS.md` > `agent.md` > `agents.md`. Frontmatter `name` overrides path-derived identifier. Body supplies system instructions.

| Key | Type/default | Meaning |
|---|---|---|
| `name` | string; file/directory name | Profile identifier; built-in conflicts skipped with warning |
| `description` | string; unset | Profile-selection description |
| `model` | string; default subagent model | Model override; not normally parent model |
| `allowed-tools` | list; all tools | **Restricts available tools** |
| `tools` | list | Alias of `allowed-tools` |
| `max-nesting` | integer; unset | Maximum permitted delegation depth override |

`permissions`, `color`, and other frontmatter: **UNKNOWN**, not enumerated as supported. `ask_user_question` is always withheld and cannot be granted.

Invocation: model-selected delegation or user request naming a profile. Foreground waits and supports approval prompts; background runs concurrently and automatically denies operations not pre-approved. Background workers inherit session grants.

Built-ins: `subagent_explore` uses routed/default subagent model; `subagent_general` uses parent model. `agent.subagent_model` user setting selects default for explore and unpinned custom profiles. Enterprise policy can pin the default or disable all subagents. `subagents_enabled: false` removes delegation tools.

Default subagents cannot nest; custom `max-nesting` permits bounded nesting. Profile collision precedence across project/global/plugin sources is **UNKNOWN**. Plugin subagents load in CLI/Desktop, **not cloud sessions**. [Plugin reference](https://docs.devin.ai/cli/extensibility/plugins/overview).

## Commands and prompts

### Cascade workflows

Source: [workflows](https://docs.devin.ai/desktop/cascade/workflows).

| Scope | File layout |
|---|---|
| Workspace | `.devin/workflows/*.md`, legacy `.windsurf/workflows/*.md` |
| Global | `~/.codeium/windsurf/global_workflows/*.md` |
| Built-in | Desktop-managed, e.g. `/plan` |
| System | `/Library/Application Support/Devin/workflows/*.md`, `/etc/devin/workflows/*.md`, `C:\ProgramData\Devin\workflows\*.md` |

Manual invocation **`/workflow-name`** only; workflows do not trigger autonomously. Markdown contains title, description and ordered instructions; maximum 12,000 characters. Workflows can instruct Cascade to call other workflows.

Discovery: workspace/descendants and ancestors up to Git root; multi-root deduplication. Same-name precedence: **system > workspace > global > built-in**. System Devin directory existence suppresses legacy Windsurf directory entirely. UI creation writes `.devin/workflows/`, except declined migration may retain `.windsurf/workflows/`.

Formal frontmatter keys, argument syntax, `$ARGUMENTS`/positional placeholders, shell/file interpolation, model/tool overrides: **UNKNOWN**. Example `[id]` text is not evidence of a substitution engine.

### Devin Local

Cascade workflows: **Not supported**; migration wizard converts workflows/memories to skills. They have not become Cascade skills automatically. [Desktop limitations](https://docs.devin.ai/desktop/devin-local#limitations), [import exclusions](https://docs.devin.ai/cli/reference/configuration/read-config-from).

- Native reusable prompts use skills; frontmatter above.
- Claude `.claude/commands/**/*.md` imported **as skills**.
- MCP prompt capability contributes `/mcp__<server>__<prompt>` commands; changing server name changes prompt command names. [MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration#prompts).
- Formal argument substitution, shell/file interpolation, and extra native command-file format: **UNKNOWN** in inspected references.

## Hooks

### Cascade

Source for configuration, events and contracts: [Cascade hooks](https://docs.devin.ai/desktop/cascade/hooks).

Config: JSON `{"hooks": {"<event>": [<handler>, …]}}`.

| Handler key | Type | Meaning |
|---|---|---|
| `command` | string | macOS/Linux via `bash -c`; Windows fallback via PowerShell |
| `powershell` | string | Windows via `powershell -Command`; ignored on Unix |
| `show_output` | boolean | Display stdout/stderr in Cascade UI |
| `working_directory` | string | Absolute or workspace-relative cwd; defaults workspace/current repo root |

At least one command field required. Unix skips PowerShell-only handlers. `working_directory` does **not** expand `~`.

Common stdin JSON fields: `agent_action_name: string`, `trajectory_id: string`, `execution_id: string`, `timestamp: string` ISO 8601, `model_name: string` display label or `"Unknown"`, `tool_info: object`.

Every documented event:

| Exact event | Meaning | `tool_info` payload |
|---|---|---|
| `pre_read_code` | Before file/directory read; blockable | `file_path: string` |
| `post_read_code` | After successful read | `file_path: string` |
| `pre_write_code` | Before write/edit; blockable | `file_path: string`, `edits: {old_string: string, new_string: string}[]` |
| `post_write_code` | After write/edit | Same edit payload |
| `pre_run_command` | Before terminal execution; blockable | `command_line: string`, `cwd: string` |
| `post_run_command` | After execution | `command_line: string`, `cwd: string`; no documented result/exit field |
| `pre_mcp_tool_use` | Before MCP invocation; blockable | `mcp_server_name: string`, `mcp_tool_name: string`, `mcp_tool_arguments: object` |
| `post_mcp_tool_use` | After successful MCP invocation | Same fields plus `mcp_result`, string demonstrated |
| `pre_user_prompt` | Before processing prompt; blockable | `user_prompt: string` |
| `post_cascade_response` | Asynchronously after completed response | `response: string`, Markdown since last user input, including tool actions/triggered rules |
| `post_cascade_response_with_transcript` | Asynchronously after response | `transcript_path: string`, full-conversation JSONL |
| `post_setup_worktree` | After new worktree setup; runs inside worktree | `worktree_path: string`, `root_workspace_path: string` |

Transcript path: `~/.windsurf/transcripts/{trajectory_id}.jsonl`, permissions `0600`; directory capped at 100 files, oldest modification times pruned. Entries contain `type`, `status`, and step-specific data; exact schema may change. `show_output` does not apply to prompt/response/transcript events.

Exit contract:

- `0`: proceed.
- `2`: pre-event blocks; stderr shown to agent.
- Other nonzero: error, action proceeds.
- Post-events cannot undo/block completed action.

JSON decision output, ask, tool-input modification, context injection, matchers, HTTP handlers, prompt handlers, JS module handlers, configurable timeout: **UNKNOWN/not documented** for Cascade. Shell scripts can implement their own filtering. `post_setup_worktree` supplies `$ROOT_WORKSPACE_PATH`; other special environment variables **UNKNOWN**.

Locations/order:

1. Enterprise cloud dashboard hooks.
2. System: `/Library/Application Support/Devin/hooks.json`, `/etc/devin/hooks.json`, `C:\ProgramData\Devin\hooks.json`; Windsurf fallback if Devin file absent.
3. User: `~/.codeium/windsurf/hooks.json`; JetBrains legacy `~/.codeium/hooks.json`.
4. Workspace `.devin/hooks.json`; `.windsurf/hooks.json` if preferred file absent **or defines no hooks**.

All sources combine; same-event handlers run cloud → system → user → workspace. Restricted Mode prevents loading/running. Hooks execute with user's full permissions.

### Devin Local

Sources: [hooks overview](https://docs.devin.ai/cli/extensibility/hooks/overview), [lifecycle reference](https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks), [configuration precedence](https://docs.devin.ai/cli/reference/configuration/global-vs-local).

Standalone `.devin/hooks.v1.json` is **the event map itself**, without `hooks` wrapper. Settings embed it under `hooks`.

Structure: `<event>: [{matcher?: string, hooks: [handler, …]}]`.

| Key | Type | Meaning |
|---|---|---|
| `matcher` | string | Regex on `tool_name`; omitted/empty matches all |
| `hooks` | handler array | Matching handlers |
| `type` | `"command"` or `"prompt"` | Shell command or LLM prompt |
| `command` | string | Command handler |
| `prompt` | string | Prompt handler |
| `timeout` | number | Seconds; default and timeout-failure decision **UNKNOWN** |

No documented HTTP or JS-module handler. Prompt-handler model, interpolation and exact response schema **UNKNOWN**.

Common fields: `hook_event_name: string`, `session_id: string`, `prompt_id: string`—last absent before first prompt.

| Event | Meaning | Additional input |
|---|---|---|
| `PreToolUse` | Before execution | `tool_name: string`, `tool_input: object` |
| `PostToolUse` | After execution | Same plus `tool_response: {success: boolean, output: string, error: string|null}` |
| `PermissionRequest` | Approval decision needed | `tool_name`, `tool_input` |
| `UserPromptSubmit` | User message submitted | `prompt: string` |
| `Stop` | Agent wants to finish turn | `stop_hook_active: boolean` |
| `PostCompaction` | Successful context compaction | `summary: string|null` |
| `SessionStart` | New session | `source: string`; enum **UNKNOWN** |
| `SessionEnd` | Session ends | `reason: string`; enum **UNKNOWN** |

Matchers apply to three tool events; other events omit matcher/use empty string. MCP tool names use `mcp__<server>__<tool>`; matchers are **regex**, not permission globs.

Command stdin is event JSON. stdout contract:

| Field | Type | Meaning |
|---|---|---|
| `decision` | `"approve"` or `"block"` | Allow/deny action |
| `reason` | string | Agent-facing explanation |
| `hookSpecificOutput` | object | Event-specific response |
| `.hookEventName` | string | Matching event name |
| `.additionalContext` | string | Inject context; overview lists `UserPromptSubmit`, `SessionStart`, `PostToolUse` |
| `.updatedInput` | object | `PreToolUse`: merged into tool arguments |

Exit `0` succeeds, `2` blocks, others log errors without blocking. `Stop` can block completion, risking loops. `PostCompaction` prose mentions reinjection but overview omits it from supported `additionalContext` events: **UNKNOWN** exact contract.

Environment: `DEVIN_PROJECT_DIR` equals project root. Handler cwd, plugin-root hook variable and exact shell **UNKNOWN**.

Discovery:

- Project/ancestors to repo root: `.devin/hooks.v1.json`; `hooks` in `.devin/config.json`, `.devin/config.local.json`, `.claude/settings.json`, `.claude/settings.local.json`.
- User: `hooks` in `~/.config/devin/config.json` or Windows equivalent, `~/.claude.json`, `~/.claude/settings.json`, `~/.claude/settings.local.json`.
- Installed plugin root `hooks.json`.
- Claude sources conditional on `read_config_from.claude`, default enabled.

Hooks collect rather than override; exact Local ordering/concurrency and competing rewrite/decision resolution **UNKNOWN**. Plugin hooks are explicitly **best-effort, fail-open**; unsuitable as critical guardrails. Restricted Mode disables agents/hooks. [Plugin reference](https://docs.devin.ai/cli/extensibility/plugins/overview), [Desktop restricted mode](https://docs.devin.ai/desktop/devin-local#restricted-mode).

## MCP servers

### Cascade

Source: [Cascade MCP](https://docs.devin.ai/desktop/cascade/mcp).

Current user file: `~/.config/devin/mcp_config.json` or `$XDG_CONFIG_HOME/devin/mcp_config.json`; Windows `%APPDATA%\devin\mcp_config.json`. Root key `mcpServers: object`, server name → config.

| Key | Type | Meaning |
|---|---|---|
| `command` | string | Stdio executable |
| `args` | string[] | Command arguments |
| `env` | string-valued object demonstrated | Process environment |
| `serverUrl` | string | Remote endpoint |
| `url` | string | Alternative remote endpoint field |
| `headers` | string-valued object demonstrated | HTTP headers |
| `disabledTools` | string[] | Individual disabled tool names |

Supports stdio, Streamable HTTP and SSE, and OAuth for each transport. Explicit transport selector, OAuth configuration fields, `cwd`, `envFile`, timeout keys, enabled-tools list, trust keys, persisted server-toggle key and project scope: **UNKNOWN**. `url` versus `serverUrl` precedence is **UNKNOWN**.

Interpolation in `command`, `args`, `env`, `serverUrl`, `url`, `headers`:

- `${env:VAR_NAME}`: environment value; missing → empty string.
- `${file:/path}`: trimmed file contents; supports `~`; unreadable → original pattern retained.

No documented plugin-root interpolation because Cascade has no agent plugins.

Cascade has a **100-tool limit** across enabled MCP tools. Supports MCP tools, resources and prompts. No Cascade MCP marketplace/one-click installation.

Enterprise can disable MCP or allowlist servers. First allowlist entry blocks all others. IDs are case-sensitive. Command/argument patterns are full-string-anchored regexes; argument counts must match. `env` freely varies; `disabledTools` handled separately.

### Devin Local

Sources: [MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration), [precedence](https://docs.devin.ai/cli/reference/configuration/global-vs-local), [plugin MCP conventions](https://docs.devin.ai/cli/extensibility/plugins/overview).

**v3000.3 / Local 3.6** moved `mcpServers` from main configuration into dedicated files, automatically migrating old entries:

| Scope | File |
|---|---|
| User | `~/.config/devin/mcp_config.json`; Windows `%APPDATA%\devin\mcp_config.json` |
| Project | `.devin/mcp_config.json` |
| Local | `.devin/mcp_config.local.json` |

`devin mcp add` defaults to **local**, `--scope project`/`user` changes it. Local > project > user for same-named servers; organization restrictions remain authoritative. Imported files include Cursor `.cursor/mcp.json`, Claude files, legacy Windsurf channel config, OpenCode and Zed config. Imported-server collision ordering across formats is **UNKNOWN**.

| Key | Type | Meaning |
|---|---|---|
| `command` | string | Required stdio executable |
| `args` | string[] | Arguments |
| `env` | object | Environment variables |
| `url` | string | Required remote endpoint |
| `transport` | `"http"` or `"sse"` | HTTP default for URL; explicit legacy SSE |
| `headers` | object | Request headers |
| `oauthClientId` | string | Pre-registered client; bypass DCR |
| `oauthClientSecret` | string | Confidential client secret in ordinary user/project config |
| `oauthResource` | string | RFC 8707 resource override; unset = server URL; empty = omit |
| `disabled` | boolean | Skip discovery and process startup |

Remote HTTP falls back to SSE on non-authentication 4xx, same URL. Authentication challenges, timeouts, connection failures and 5xx do not trigger fallback. OAuth login/logout is client-specific; tokens stored locally and refreshed, exact token path **UNKNOWN**. `${env:VAR}` and `${file:/path}` secret expansion is documented for OAuth fields; exhaustive expansion-field coverage is **UNKNOWN**.

Ordinary server `cwd`, `envFile`, server/tool timeout fields, `disabledTools` or enabled-tools filtering: **UNKNOWN**. Tool approval uses permission rules `mcp__server__tool`, `mcp__server__*`, `mcp__*`; default Local MCP calls prompt.

Plugin-specific additions:

- Root `.mcp.json`; Agent Plugins root `mcp.json`; manifest `mcpServers`.
- `${CLAUDE_PLUGIN_ROOT}` and `${PLUGIN_ROOT}` expand to plugin root.
- Root-manifest Agent Plugins accepts `type: "stdio" | "streamable-http" | "sse"`.
- Only Agent Plugins layout gets `${PLUGIN_DATA}` expansion in `args`, `env` values, `cwd`; persistent data survives versions and is deleted on uninstall.
- Agent Plugins `cwd` is plugin-relative, default plugin root; `./` commands resolve against plugin root. Both validated inside plugin root/data directory.
- Agent Plugins stdio receives `PLUGIN_ROOT`, `PLUGIN_DATA` environment variables.
- Plugin MCP OAuth client secrets are **rejected at activation**, unlike ordinary config. Plugin configs may declare client ID/scopes; exact scopes-key schema **UNKNOWN**.
- Plugin secret placeholders use `${NAME}`; literal secret values are stripped. Exact stripping-field algorithm **UNKNOWN**.

Enterprise MCP registries replace default Local catalog; multiple registry URLs union. Docs require “official MCP registry schema” without pinning a version. Enterprise allowlists/registries can block connections. [Cascade enterprise MCP section](https://docs.devin.ai/desktop/cascade/mcp#admin-controls-teams-enterprises), [Local organization restrictions](https://docs.devin.ai/cli/extensibility/mcp/configuration#organization-restrictions).

## Other native capability types

Source: [plugin reference](https://docs.devin.ai/cli/extensibility/plugins/overview).

Devin agent plugins document **skills, rules, subagents, hooks, MCP servers**. Agent-plugin declarations for LSP servers, output styles, themes, statuslines, keybindings, monitors, custom providers/models, app modules or JS/TS extension entrypoints: **UNKNOWN/not documented**. Bundled executable scripts can run through skills/hooks/MCP; that is not evidence of a plugin-module API.

Cascade memories are shipped, local and workspace-associated at `~/.codeium/windsurf/memories/`, generated/retrieved by the model; not committed or shared between workspaces. Devin Local **does not persist Cascade memories**. Serialized memory fields and portable import/export format **UNKNOWN**. [Memories](https://docs.devin.ai/desktop/cascade/memories).

Desktop IDE extensions are **separate from agent plugins**, sourced through **Open VSX**, and can provide language servers, debugging and keymaps. The Windsurf “plugins” for other editors are also a different product. Do not treat these as Devin agent-plugin assets. [Extension guidance](https://docs.devin.ai/desktop/recommended-extensions), [Desktop customizations warning](https://docs.devin.ai/desktop/devin-local#customizations).

Local user-only configuration includes:

| Key | Type | Meaning |
|---|---|---|
| `agent.model` | string | Default model |
| `agent.subagent_model` | string | Default subagent-model override |
| `agent.show_history_on_continue` | boolean | Resume-history display |
| `theme_mode` | string/null | `light`, `dark`, `terminal-dark`, `terminal-light`, `nocolor`, or automatic `null` |
| `keymap` | object | Context → action → key specifications |
| `subagents_enabled` | boolean | Enable delegation |

These are **user settings**, not documented plugin contributions. No plugin `userConfig` schema is documented. [Configuration reference](https://docs.devin.ai/cli/reference/configuration/config-file).

## Permissions, trust and security

### Cascade

Sources: [terminal controls](https://docs.devin.ai/desktop/terminal), [hooks security](https://docs.devin.ai/desktop/cascade/hooks#security), [restricted mode](https://docs.devin.ai/desktop/devin-local#restricted-mode).

Auto-execution levels: **Disabled**, **Allowlist Only**, **Auto**, **Turbo**. Allowlist entries ending `*` match command-token prefixes; other entries exact-match. Denylist means **ask for approval**, not hard deny. Team and user lists merge; denylist wins; admins cap maximum execution level.

System rules/skills/workflows are read-only via deployment/filesystem permissions. System hooks run before user/workspace hooks; shell hooks run with full user privileges. No agent-plugin installation trust model exists for Cascade.

Restricted Mode disables Cascade, Local and ACP agents and prevents hooks from loading/running.

### Devin Local

Sources: [permissions](https://docs.devin.ai/cli/reference/permissions), [Desktop security](https://docs.devin.ai/desktop/devin-local), [plugin governance](https://docs.devin.ai/cli/extensibility/plugins/overview), [install security notice](https://docs.devin.ai/product-guides/plugins#installing-plugins).

`permissions` contains `allow`, `deny`, `ask` lists. Matching denial always wins. **Important nuance:** equally/more-specific command or MCP allow can override broader ask **at the same level**; lower-level allow cannot override higher-level ask. File-scope behavior is not documented as receiving that exception.

Examples of permission syntax: `Read(src/**)`, `Write(**)`, `Exec(git status)`, tool names `exec`/`edit`, MCP patterns above. Permissions cover file access, execution, HTTP fetches and MCP tools.

Configuration priority: organization/team > session grants > project-local > project > user. Nested project configs override ancestors. Skills may supply inline grants/denials but cannot override higher-level denial.

Permission modes: Normal, Accept Edits, Smart, Bypass, Autonomous. Smart is gradually rolling out. Sandbox Autonomous auto-approves commands/fetches under OS restrictions but direct edit/write tools still prompt because they run outside the sandbox. Organization deny/ask policies remain active even in permissive modes. Desktop's simplified “ask always prompts” description omits the CLI-specific same-level exception.

Sandbox isolates filesystem writes and network access; `Read(...)` deny hides paths from commands. Enterprise can require sandbox and domain filtering. Sandbox settings are user/managed settings, **not documented plugin configuration**.

Trust/install:

- CLI previews skills, required dependencies and policy before install; `-y`/`--yes` skips confirmation.
- Web first-install notice warns plugins run rules/hooks/skills and may access external MCP data.
- Official marketplace plugins are labelled official.
- Signatures, cryptographic provenance verification, package attestation, per-package sandbox and a formal trusted-publisher field: **UNKNOWN**.
- Private repository access relies on local Git credentials for CLI/Desktop.
- Enterprise can disable CLI plugins; managed plugin requirements/forbids govern activation.
- Plugin hooks fail open; **managed manifest fetch failure also fails open**, with that level's installs/forbids unapplied for the session.

No documented plugin manifest permission-policy field exists; permissions arise from skills/hooks and external configuration.

## Packaging, install and scopes

### Cascade

**Agent plugins: Not supported.** Deployment consists of the loose files described above. No Cascade plugin manifest, dependency model, install registry or `enabledPlugins` setting is documented. [Desktop limitations](https://docs.devin.ai/desktop/devin-local#limitations).

### Devin Local / Desktop plugins

Sources: [plugin reference](https://docs.devin.ai/cli/extensibility/plugins/overview), [web packaging](https://docs.devin.ai/product-guides/plugins), [official beta template](https://github.com/CognitionAI/plugin-template).

Native layout:

```text
.devin-plugin/plugin.json
AGENTS.md
rules/*.md
agents/<name>.md                 # or <name>/AGENT.md
hooks.json
.mcp.json
skills/<name>/SKILL.md
```

All except manifest are optional. Manifest precedence:

**`.devin-plugin/plugin.json` > `.claude-plugin/plugin.json` > root `plugin.json`**.

Supported root Agent Plugins version: **1.0.0**. Unrecognized `$schema` version warns and loads best-effort. Manifestless `skills/<name>/SKILL.md` repositories install as skills-only plugins named after repository.

Manifest inventory:

| Field | Type | Meaning |
|---|---|---|
| `name` | string; required | Unique installed namespace; lowercase alphanumeric with single `-`/`.` separators |
| `version` | string | Descriptive version; SemVer validation **UNKNOWN** |
| `description` | string | Description |
| `author` | object | Metadata |
| `author.name` | string | Author name |
| `author.email` | string | Author email |
| `homepage` | string | Homepage |
| `repository` | string | Repository |
| `license` | string | License |
| `keywords` | string[] | Keywords |
| `skills` | string or string[] | Replace default `skills/` discovery; empty array disables skills |
| `mcpServers` | string, string[], object | MCP declarations described below |
| `requiredPlugins` | source[] | Recursively auto-install dependencies |
| `optionalPlugins` | source[] | Endorsed exceptions; **not automatically installed** |
| `forbiddenPlugins` | string[] | Identity/path/glob denylist |
| `displayName` | string, observed official source | Display metadata; formal reference semantics **UNKNOWN** |
| `logo` | string, observed official source | Relative image path used by official plugin; validation/format constraints **UNKNOWN** |

`displayName` and `logo` evidence: [official ActiveCampaign manifest, pinned source](https://github.com/CognitionAI/devin-marketplace/blob/5ba4432afd2caf3b266361b1ba3df8e06dc23020/plugins/activecampaign/.devin-plugin/plugin.json).

`skills` paths stay inside plugin: absolute paths, `~`, traversal rejected; invalid entry invalidates manifest.

`mcpServers` shapes:

- String: one config path.
- String array: ordered config paths.
- `{paths: string[], exclusive: boolean}`: `exclusive: true` suppresses conventional root MCP files.
- Inline server-name map: nonempty suppresses root convention.
- Empty array/map does not suppress root convention.
- Unsafe declaration paths dropped; invalid field disables MCP only.
- Same-name servers: first source wins.
- Agent Plugins `mcp.json` follows `.mcp.json`, which wins collisions; Devin/Claude layouts ignore `mcp.json` unless explicitly declared.

Source fields:

| Key | Type | Meaning |
|---|---|---|
| `source` | string enum | Documented `github`, `url`, `git-subdir`; managed uploads use `account-upload` |
| `repo` | string | GitHub `owner/repo` |
| `url` | string | Git URL |
| `path` | string | Git subdirectory |
| `sha` | string | Exact commit pin |
| `ref` | string | Floating branch/tag; mutually exclusive with `sha` |
| `bundleId` | string | Managed uploaded bundle |
| `bundleScope` | string | `"account"` documented for enterprise uploads referenced elsewhere; other values **UNKNOWN** |
| `env` | string-valued object | Cloud command-hook configuration on dependency entry |

String sources: `owner/repo`, Git HTTPS/SSH URL; install syntax supports `#subdirectory`. Local paths supported for machine-local installation. Official marketplace also uses relative `./plugins/…` optional entries. General relative-dependency resolution rules **UNKNOWN** beyond that observed source. GitHub URL/SSH/shorthand forms normalize to one identity.

Cloud `env` secret references: `secret:org:NAME`, `secret:enterprise:NAME`, `secret:personal:NAME`, `secret:session:NAME`, `secret:repo:owner/repo:NAME`; optional `/ENTRY` for key-value secrets. Dependencies require their own entry/env; not inherited. [Plugin environment variables](https://docs.devin.ai/product-guides/plugins#plugin-environment-variables).

Install mechanics:

- `devin plugins install <source>`: user/personal manifest synced through Devin Cloud.
- `--local`: current machine only; required for local-folder source; direct live link.
- `list`, `info`, `update [name]`, `remove [name]`, `prune`.
- `remove --force` permits removal despite requirements; governance-required plugin returns next session.
- Removing plugin leaves auto-installed required plugins in place.
- Managed changes apply next session; active sessions retain loaded contents.
- Local-folder edits apply next session without update.
- Floating Git content refreshes through CLI update; cloud fetches at session start; SHA pins stay fixed.
- Web supports public/private Git, ZIP uploads and editable created plugins; uploaded content pinned to uploaded bundle.
- npm package sources, general archive-URL installation: **UNKNOWN/not documented**.
- Exact on-disk install registry, links, checkout cache, lockfile, plugin-data directory location, OAuth store, enable-state files/settings: **UNKNOWN**. No `enabledPlugins` key documented.

Governance scopes: **enterprise > organization > repository > user**. Repo declarations in `.devin/config.json`, discovered walking ancestors. Desktop/CLI use primary organization; cloud uses session organization.

- Same authority: deny wins across different manifests.
- A manifest exempts its own direct required/optional entries from its own forbids.
- Transitive dependencies are not automatically exempt.
- Lower authority cannot re-permit higher forbid or forbid higher requirement.
- Blocked required dependency makes installation fail atomically.
- Later-blocked installed plugins remain on disk and are skipped with warning.
- Transitive dependencies inherit highest requiring authority.
- Conflicting SHA pins require alignment; deterministic conflict-selection algorithm **UNKNOWN**.

Marketplace/catalog:

- Web combines official marketplace and organization/enterprise additions.
- Official catalog is itself `.devin-plugin/plugin.json` with `skills: []`, `optionalPlugins` listing relative bundled plugins and commit-pinned third-party sources—not a separate documented `marketplace.json` format. [Pinned official catalog](https://github.com/CognitionAI/devin-marketplace/blob/5ba4432afd2caf3b266361b1ba3df8e06dc23020/.devin-plugin/plugin.json).
- Admins can hide official marketplace and control MCP availability.
- Dedicated marketplace JSON Schema and complete catalog-specific metadata schema: **UNKNOWN**.

## Notable gaps and ambiguities

- **Do not model “Windsurf” as one writer:** Cascade and Devin Local disagree on skill invocation, workflow support, hook format/events, MCP approval and packaging. [Desktop differences](https://docs.devin.ai/desktop/devin-local).
- **Same spelling, incompatible meaning:** skill `allowed-tools` auto-approves; agent-profile `allowed-tools` restricts availability. They cannot safely share one canonical meaning. [Skill contract](https://docs.devin.ai/cli/extensibility/skills/creating-skills#auto-approved-tools), [agent contract](https://docs.devin.ai/cli/subagents#frontmatter-fields).
- Documentation is unversioned. Minimum Desktop/plugin versions and historical introduction dates are **UNKNOWN**. MCP relocation is explicitly v3000.3 / Local 3.6. [MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration).
- Desktop Local page still shows MCP in main `config.json`; current CLI references specify dedicated files and migration. Preserve legacy import compatibility; use dedicated files for current output. [Desktop table](https://docs.devin.ai/desktop/devin-local#mcp-server-configuration), [current reference](https://docs.devin.ai/cli/extensibility/mcp/configuration).
- General config reference says project config supports only permissions/imports/hooks, whereas plugin reference also documents repository governance lists there. This is a documentation inconsistency. [Config reference](https://docs.devin.ai/cli/reference/configuration/config-file), [plugin inheritance](https://docs.devin.ai/cli/extensibility/plugins/overview#inheritance-and-levels).
- Cascade duplicate-rule/skill resolution, Local duplicate skills/agents, hook ordering/rewrite arbitration, command interpolation and Markdown includes remain **UNKNOWN**.
- Local `agent` versus `model_decision` rule triggers and `PostCompaction` context-injection contract remain **UNKNOWN** despite listed support/prose. [Rules](https://docs.devin.ai/cli/extensibility/rules), [hooks](https://docs.devin.ai/cli/extensibility/hooks/overview).
- Plugin beta/fail-open behavior and managed-policy-fetch fail-open undermine use as mandatory security enforcement. [Template status](https://github.com/CognitionAI/plugin-template), [plugin reference](https://docs.devin.ai/cli/extensibility/plugins/overview).
- Exact installed state/cache paths and formal complete schemas are not documented in inspected sources. Lossless same-format handling therefore requires retaining unknown manifest/frontmatter/config keys and ancillary files, rather than assuming the documented tables exhaust implementation behavior.
