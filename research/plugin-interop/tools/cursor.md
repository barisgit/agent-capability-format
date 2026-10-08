# Cursor - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence date:** 2026-10-01. Cursor documentation is rolling and exposes no document revision date. Features below are **shipped/documented**, unless explicitly marked otherwise; documentation presence is not runtime verification. Sources: [Skills](https://cursor.com/docs/skills), [Plugin reference](https://cursor.com/docs/reference/plugins). Agent Plugins schemas are explicitly **1.0.0**.

### Files and discovery

| Path | Scope / behavior |
|---|---|
| `.agents/skills/`, `.cursor/skills/` | Project skills. Recursively discover `SKILL.md`. |
| `~/.agents/skills/`, `~/.cursor/skills/` | User skills. |
| `.claude/skills/`, `.codex/skills/`, their `~/` equivalents | Compatibility discovery. |
| Nested project `.cursor/skills/`, `.agents/skills/` | Automatically scoped to the containing directory and descendants. |
| Plugin `skills/<name>/SKILL.md` | Default plugin discovery. Explicit manifest `skills` replaces default discovery. |
| Plugin-root `SKILL.md` | Single-skill fallback only when neither `skills/` nor manifest `skills` exists. |

Sources: [Skills—directories and nesting](https://cursor.com/docs/skills#skill-directories), [Plugin discovery](https://cursor.com/docs/reference/plugins#cursor-plugin-component-discovery).

Category directories do not contribute to identity: the folder containing `SKILL.md` supplies the identity. Duplicate-name precedence between skill roots, plugin skills, and built-ins is **UNKNOWN**. The skills guide documents recursive discovery more explicitly than the plugin reference, which says “each subdirectory.” [Skills](https://cursor.com/docs/skills)

### `SKILL.md` YAML frontmatter

| Field | Type | Meaning |
|---|---|---|
| `name` | string, required | Lowercase letters, numbers, hyphens; must match containing folder. |
| `description` | string, required | Capability and relevance signal for automatic selection. |
| `paths` | string or string[] | File scope; string accepts comma-separated globs. Only surfaced while working with matching files. |
| `globs` | legacy glob field | Accepted fallback for `paths`; new skills should use `paths`. Exact conflict handling beyond “fallback” is not specified. |
| `disable-model-invocation` | boolean | `true`: explicit `/skill-name` only; not automatically selected. |
| `icon` | string | Custom Mode badge icon from Cursor’s icon set; unknown values fall back. Exhaustive icon enum is **UNKNOWN**. |
| `color` | enum string | `default`, `green`, `cyan`, `blue`, `purple`, `magenta`, `orange`, `yellow`, `red`, `brand`. |
| `metadata` | mapping | Arbitrary additional key/value metadata; value-type restrictions are **UNKNOWN**. |

Sources: [Frontmatter](https://cursor.com/docs/skills#frontmatter-fields), [File scoping](https://cursor.com/docs/skills#scoping-a-skill-to-specific-files), [Custom Modes](https://cursor.com/docs/skills#using-a-skill-as-a-custom-mode).

`allowed-tools`, `user-invocable`, `argument-hint`, skill-level `model`, `context`, `agent`, `license`, and `compatibility` are **not documented as Cursor-interpreted fields** on these pages. Acceptance, preservation, and enforcement are **UNKNOWN**, not established as unsupported. No Cursor-specific companion metadata file is documented. [Skills](https://cursor.com/docs/skills)

### Invocation and resources

- Agent selects skills using their descriptions. `/skill-name` explicitly attaches a skill to **one message**; using it as a Custom Mode keeps it active for the session. [Skills—how skills work](https://cursor.com/docs/skills#how-skills-work)
- `scripts/`: executable resources; `references/`: on-demand documentation; `assets/`: templates, images, data. Script references are relative to the skill root. Execution uses Agent tools, not a separate skill-module runtime. [Skills—scripts and optional directories](https://cursor.com/docs/skills#including-scripts-in-skills)
- Only `~/.cursor/skills/` participates in optional personal Cloud Agent sync. `~/.agents/skills/`, compatibility roots, and unsynced local skills are not copied to cloud/remote workers. Project skills travel with the repository. Team admins can prohibit personal sync. [Skills—Cloud Agents](https://cursor.com/docs/skills#use-personal-skills-with-cloud-agents)
- Publishing a personal skill creates **one plugin named after that skill**; referenced skills are not bundled automatically. [Publishing](https://cursor.com/docs/plugins#publish-a-skill-to-your-team)

## Instructions and rules

Sources: [Rules](https://cursor.com/docs/rules), [Plugin rules](https://cursor.com/docs/reference/plugins#rules-format).

### Files and fields

| File / source | Fields / semantics |
|---|---|
| `.cursor/rules/**/*.mdc` | Markdown with YAML `description: string`, `globs: string|string[]`, `alwaysApply: boolean`. |
| Project-root or nested `AGENTS.md` | Plain Markdown; no frontmatter contract. Applies to directory and descendants; nested instructions combine with parents and more specific instructions take precedence. |
| User Rules | Free-form text managed through Customize; global Agent Chat preferences, not a documented package file. |
| Team Rules | Dashboard-managed free-form text, optional file globs, enable/draft and enforcement controls. |
| Plugin `rules/` | Discovery accepts `.md`, `.mdc`, `.markdown`; explicit manifest `rules` replaces discovery. |

Sources: [Project rules](https://cursor.com/docs/rules#project-rules), [AGENTS.md](https://cursor.com/docs/rules#agentsmd), [Team Rules](https://cursor.com/docs/rules#team-rules), [Plugin discovery](https://cursor.com/docs/reference/plugins#cursor-plugin-component-discovery).

**Important discrepancy:** `.md` inside project `.cursor/rules/` is explicitly ignored; plugin discovery explicitly accepts `.md` and `.markdown`. Do not normalize those paths as equivalent without retaining origin. [Rules—file structure](https://cursor.com/docs/rules#rule-file-structure), [Plugin reference](https://cursor.com/docs/reference/plugins#cursor-plugin-component-discovery)

### Activation

| Exact UI mode | Frontmatter combination | Behavior |
|---|---|---|
| `Always Apply` | `alwaysApply: true` | Always included; `description` and `globs` ignored for activation. |
| `Apply to Specific Files` | `alwaysApply: false`, globs supplied | Attached when a matching file is in context. |
| `Apply Intelligently` | `alwaysApply: false`, description supplied, no globs | Agent decides using description. |
| `Apply Manually` | `alwaysApply: false`, no description or globs | Only through `@rule-name`. |

Source: [Rule anatomy](https://cursor.com/docs/rules#rule-anatomy).

- Multiple glob strings may be comma-separated; plugin reference also permits an array. [Glob examples](https://cursor.com/docs/rules#glob-pattern-examples), [Plugin rule fields](https://cursor.com/docs/reference/plugins#rule-frontmatter-fields)
- Team → Project → User: all applicable instructions merge; earlier sources take precedence for conflicts. The relative placement of plugin rules and `AGENTS.md` within that hierarchy is **UNKNOWN**. [Team rule precedence](https://cursor.com/docs/rules#format-and-how-team-rules-are-applied)
- `@file` references are **not imports/includes**: text reaches Agent unchanged; Agent reads referenced files with tools when needed. No documented eager include directive. [Referencing files](https://cursor.com/docs/rules#referencing-files-from-a-rule)
- Rules do not apply to Tab. User Rules do not apply to Inline Edit. [Rules FAQ](https://cursor.com/docs/rules#faq)
- Current researched pages do not establish `CLAUDE.md`, `GEMINI.md`, steering-file discovery, or legacy `.cursorrules` semantics. **UNKNOWN**; do not infer instruction-file support from Claude skill/agent/hook compatibility. [Rules](https://cursor.com/docs/rules), [Third-party imports](https://cursor.com/docs/reference/third-party-hooks)

## Subagents and custom agents

Sources: [Subagents](https://cursor.com/docs/subagents), [Plugin agents](https://cursor.com/docs/reference/plugins#agents-format).

### Files and precedence

- Project: `.cursor/agents/`, `.claude/agents/`, `.codex/agents/`.
- User: corresponding `~/.cursor/agents/`, `~/.claude/agents/`, `~/.codex/agents/`.
- Project wins over user for equal names; `.cursor/` wins over `.claude/` or `.codex/`. Claude-versus-Codex tie-breaking is **UNKNOWN**.
- Plugins discover `agents/*` with `.md`, `.mdc`, `.markdown`; explicit `agents` overrides discovery. Plugin-versus-project precedence is **UNKNOWN**.

Sources: [File locations](https://cursor.com/docs/subagents#file-locations), [Plugin discovery](https://cursor.com/docs/reference/plugins#cursor-plugin-component-discovery).

### YAML frontmatter

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | filename-derived | Identifier/display name; lowercase letters and hyphens advised. |
| `description` | string | unspecified | Task-tool hints and automatic delegation signal. |
| `model` | string | `inherit` | Parent model or exact model ID, optionally with bracket parameters. |
| `readonly` | boolean | `false` | Restricts file edits and state-changing shell commands. |
| `is_background` | boolean | `false` | Background execution instead of blocking parent. |

All are optional in the subagent guide; plugin reference says agents require frontmatter and lists `name`/`description`, without reconciling requiredness. [Configuration fields](https://cursor.com/docs/subagents#configuration-fields), [Plugin agents](https://cursor.com/docs/reference/plugins#agents-format)

- Model syntax: `model-id[id=value,id=value]`; documented parameter examples include `fast`, `effort`, `context`. Available options depend on the selected model; `[]` pins its standard variant in the documented example. [Model configuration](https://cursor.com/docs/subagents#model-configuration)
- Team restrictions, plan availability, and legacy Max Mode can cause model fallback; therefore the requested model is not an unconditional execution guarantee. [Model configuration](https://cursor.com/docs/subagents#model-configuration)
- `tools`, `disallowedTools`, permission modes, `color`, and agent-scoped skills/hooks are **UNKNOWN** as frontmatter. Despite introductory “tool access” language, the field table exposes no tool-list field. [Subagents](https://cursor.com/docs/subagents)

### Invocation and delegation

- Automatic Task-tool delegation, explicit `/name`, or natural-language request.
- Separate context; parent supplies relevant context. Local subagents inherit parent tools including MCP.
- Share checkout by default; requested isolation can provide separate worktrees or cloud environments.
- Main agent and direct children may spawn children; grandchildren cannot spawn further. Documented as shipped since **Cursor 2.5**.
- Cloud subagents use team/cloud MCP configuration rather than local inherited MCP.
- Background state/output lives in `~/.cursor/subagents/`; execution returns an ID usable for resume.

Sources: [Using subagents](https://cursor.com/docs/subagents#using-subagents), [Cloud subagents](https://cursor.com/docs/subagents#cloud-subagents), [Resume](https://cursor.com/docs/subagents#resuming-subagents), [FAQ](https://cursor.com/docs/subagents#faq).

## Commands and prompts

Sources: [Plugin commands](https://cursor.com/docs/reference/plugins#commands-format), [Skills migration](https://cursor.com/docs/skills#migrating-rules-and-commands-to-skills).

| Surface | Layout / fields |
|---|---|
| Cursor Plugin commands | `commands/`; `.md`, `.mdc`, `.markdown`, `.txt`. Optional YAML `name: string`, `description: string`; body supplies action instructions. |
| Explicit manifest `commands` | string or array of paths; replaces folder discovery. |
| Legacy local commands | Current skills guide confirms both workspace-level and user-level slash commands exist; exact current path contract is **UNKNOWN** from successfully retrieved current pages. |
| Skill replacement | `skills/<name>/SKILL.md` with `disable-model-invocation: true`. |

- `/migrate-to-skills`, documented since **2.4**, converts eligible dynamic rules and both command scopes. Migration is an available workflow, **not automatic removal of commands**: plugin commands remain documented. [Migration](https://cursor.com/docs/skills#migrating-rules-and-commands-to-skills)
- Command argument placeholders, positional substitutions, `$ARGUMENTS`, shell interpolation, eager file interpolation, `argument-hint`, tool restrictions, and model overrides are **UNKNOWN**. `$ARGUMENTS` is documented for **prompt hooks**, not established for command files. [Commands](https://cursor.com/docs/reference/plugins#commands-format), [Prompt hooks](https://cursor.com/docs/hooks#prompt-based-hooks)
- The old official command URL no longer yielded a usable current command reference during research; do not use its historical schema as current evidence.

## Hooks

Source for all native fields, events, contracts, and execution semantics below: [Hooks reference](https://cursor.com/docs/hooks).

### Files, handler fields, scope

| Key | Type / default | Meaning |
|---|---|---|
| `version` | positive integer, required | Config schema; documented value `1`. |
| `hooks` | object | Exact event name → handler array. |
| `command` | string | Shell command, absolute path, or source-relative path for command handlers. |
| `type` | `"command"` or `"prompt"`; default `"command"` | Execution type. |
| `timeout` | number | Seconds; platform default value **UNKNOWN**. |
| `loop_limit` | number or null; default `5` | Per-script `stop`/`subagentStop` follow-up limit; null unlimited. Imported Claude default is null. |
| `failClosed` | boolean; default `false` | Failures block rather than permit where blocking applies. |
| `matcher` | regex string | Empty string or `"*"` matches all. |
| `prompt` | string | LLM policy prompt for prompt handler. |
| `model` | optional string | Override fast default prompt-hook model. |

Prompt handlers return `{ok: boolean, reason?: string}`. `$ARGUMENTS` is replaced with input JSON; without it input is appended. HTTP handlers and JS/TS module handlers are **not documented**; Bun/Node/Python scripts can be executed through `command`. The generic field table describes `command` as required but examples omit it for prompt handlers. [Hook types](https://cursor.com/docs/hooks#hook-types), [Configuration](https://cursor.com/docs/hooks#configuration)

| Source | File / execution directory |
|---|---|
| Enterprise macOS | `/Library/Application Support/Cursor/hooks.json`; enterprise config directory |
| Enterprise Linux/WSL | `/etc/cursor/hooks.json`; enterprise config directory |
| Enterprise Windows | `C:\ProgramData\Cursor\hooks.json`; enterprise config directory |
| Team | Enterprise dashboard distribution; managed hooks directory |
| Project | `<project>/.cursor/hooks.json`; project root |
| User | `~/.cursor/hooks.json`; `~/.cursor/` |
| Plugin | `hooks/hooks.json`, or manifest path/inline object; exact execution directory **UNKNOWN** |

All matching sources run. Native reference gives Enterprise → Team → Project → User merge order: `deny` beats `ask` beats `allow`; `user_message`/`agent_message` concatenate; other fields are last-wins, so a **lower-priority** source can override them. Execution seriality/concurrency and full event ordering are **UNKNOWN**. Files reload on change. Project hooks require trusted workspaces. [Configuration](https://cursor.com/docs/hooks#configuration)

### Common input

`conversation_id: string`, `generation_id: string`, `model: string`, optional `model_id: string`, optional `model_params: {id:string,value:string}[]`, `hook_event_name: string`, `cursor_version: string`, `workspace_roots: string[]`, `user_email: string|null`, `transcript_path: string|null`.

`workspaceOpen` has only app fields: no conversation/generation/model/session/transcript fields. [Common schema](https://cursor.com/docs/hooks#common-schema)

### Every native event and payload

Fields below are additional to common input; unspecified output means no documented response fields.

| Event | Trigger; input fields | Output / decisions |
|---|---|---|
| `sessionStart` | New composer conversation; `session_id:string`, `is_background_agent:boolean`, optional `composer_mode:"agent"|"ask"|"edit"` | `env:Record<string,string>`, `additional_context:string`. Fire-and-forget; accepted `continue`/`user_message` do **not** block creation. |
| `sessionEnd` | Composer ends; `session_id:string`, `reason:"completed"|"aborted"|"error"|"window_close"|"user_close"`, `duration_ms:number`, `is_background_agent:boolean`, `final_status:string`, optional `error_message:string` | None; fire-and-forget. |
| `preToolUse` | Before every tool; `tool_name:string`, `tool_input:object`, `tool_use_id:string`, `cwd:string`; example also `agent_message:string` | `permission:"allow"|"deny"`, optional `user_message:string`, `agent_message:string`, `updated_input:object`. Schema accepts `"ask"` but callers do not enforce it today. |
| `postToolUse` | Successful tool; `tool_name:string`, `tool_input:object`, `tool_output:string` containing JSON-stringified result, `tool_use_id:string`, `cwd:string`, `duration:number` milliseconds | Optional `updated_mcp_tool_output:object` for MCP only; `additional_context:string`. |
| `postToolUseFailure` | Failed/timed-out/denied tool; tool identifiers/input/cwd, `error_message:string`, `failure_type:"timeout"|"error"|"permission_denied"`, `duration:number` milliseconds, `is_interrupt:boolean` | Optional `additional_context:string`. |
| `subagentStart` | Before Task spawn; `subagent_id:string`, `subagent_type:string`, `task:string`, `parent_conversation_id:string`, `tool_call_id:string`, `subagent_model:string`, `is_parallel_worker:boolean`, optional `git_branch:string` | `permission:"allow"|"deny"`, optional `user_message:string`; `"ask"` treated as deny. |
| `subagentStop` | Child completes/errors/aborts; `subagent_type:string`, `status:"completed"|"error"|"aborted"`, `task:string`, `description:string`, `summary:string`, `duration_ms:number`, `message_count:number`, `tool_call_count:number`, `loop_count:number`, `modified_files:string[]`, `agent_transcript_path:string|null` | `followup_message:string`; consumed only for completed status; loop-limited. |
| `beforeShellExecution` | Before command; `command:string`, `cwd:string`, `sandbox:boolean` | `permission:"allow"|"deny"|"ask"`, `user_message:string`, `agent_message:string`. |
| `afterShellExecution` | After command; `command:string`, `output:string`, `duration:number` milliseconds excluding approval wait, `sandbox:boolean` | No documented fields. |
| `beforeMCPExecution` | Before MCP call; `tool_name:string`, `tool_input:string` JSON parameters, `mcp_server_name:string`; remote `url:string`, `mcp_server_url:string`; stdio `command:string` joined launch command/args | `permission:"allow"|"deny"|"ask"`, `user_message:string`, `agent_message:string`. |
| `afterMCPExecution` | After MCP call; `tool_name:string`, `tool_input:string`, `mcp_server_name:string`, remote `mcp_server_url:string`, `result_json:string`, `duration:number` milliseconds excluding approval wait | No documented fields. |
| `beforeReadFile` | Before Agent read; `file_path:string` absolute, `content:string`, `attachments:{type:"file"|"rule",file_path:string}[]` | `permission:"allow"|"deny"`, optional `user_message:string`. No documented replacement/redaction field. |
| `afterFileEdit` | After Agent edit; `file_path:string`, `edits:{old_string:string,new_string:string}[]` | No documented fields. |
| `beforeTabFileRead` | Before Tab read; `file_path:string`, `content:string`; no attachments | `permission:"allow"|"deny"`. |
| `afterTabFileEdit` | After Tab edit; file path; edits add `range:{start_line_number:number,start_column:number,end_line_number:number,end_column:number}`, `old_line:string`, `new_line:string` to old/new strings | No supported output fields. |
| `beforeSubmitPrompt` | After Send, before request; `prompt:string`, attachments as above | `continue:boolean`, optional `user_message:string`. |
| `preCompact` | Before summarization; `trigger:"auto"|"manual"`, `context_usage_percent:number`, `context_tokens:number`, `context_window_size:number`, `message_count:number`, `messages_to_compact:number`, `is_first_compaction:boolean` | Optional `user_message:string`; cannot block/modify compaction. |
| `stop` | Agent loop ends; `status:"completed"|"aborted"|"error"`, `loop_count:number` | Optional `followup_message:string`, automatically submitted as next user message; loop-limited. |
| `afterAgentResponse` | Completed assistant message; `text:string` | No documented fields. |
| `afterAgentThought` | Completed thinking block; `text:string`, optional `duration_ms:number` | No supported output fields. |
| `workspaceOpen` | Workspace opens or folder set changes; skipped with zero folders; desktop and CLI | Optional `pluginPaths:string[]` of absolute plugin directories. |

Source: [Hook events](https://cursor.com/docs/hooks#hook-events).

### Matchers, exits, environment

- Tool hooks match tool types: `Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task`, MCP tools with `MCP:` format; complete MCP matcher grammar **UNKNOWN**.
- Subagent hooks match `subagent_type`, e.g. `generalPurpose`, `explore`, `shell`; not a closed enum.
- Shell hooks match full command text.
- Fixed matcher inputs: `beforeReadFile` → `Read`; `afterFileEdit` → `Write`; Tab read/edit → `TabRead`/`TabWrite`; prompt submission → `UserPromptSubmit`; stop → `Stop`; response/thought → `AgentResponse`/`AgentThought`.
- Matcher behavior for other events is **UNKNOWN**. [Matchers](https://cursor.com/docs/hooks#matcher-configuration)

Exit `0`: consume JSON. For permission hooks, invalid JSON/schema blocks. Exit `2`: block. Other failures, crashes, timeout: fail-open by default; `failClosed:true` blocks. Observational/fire-and-forget events do not thereby become blocking. [Command hooks](https://cursor.com/docs/hooks#command-based-hooks)

Environment: `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CLAUDE_PROJECT_DIR` always; `CURSOR_USER_EMAIL` when logged in; `CURSOR_TRANSCRIPT_PATH` when transcripts enabled; `CURSOR_CODE_REMOTE="true"` for remote workspaces. `sessionStart.env` propagates to subsequent session hooks. Plugin-root expansion in hook commands is **UNKNOWN** from the native hook reference. [Environment](https://cursor.com/docs/hooks#environment-variables)

### Claude compatibility and cloud differences

Third-party imports setting defaults on. Loads `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json` after native sources. Mappings: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact` to corresponding native events. `Notification` and `PermissionRequest` explicitly unsupported. Nested `hookSpecificOutput` is accepted; `permissionDecision`, `permissionDecisionReason`, `updatedInput` map to native fields. Stop `decision:"block"` plus `reason` becomes a follow-up. [Third-party hooks](https://cursor.com/docs/reference/third-party-hooks)

Cloud agents run command hooks only. Regular cloud execution excludes `sessionStart`, `sessionEnd`, MCP-specific hooks, Tab hooks, and `workspaceOpen`; other listed Agent events are supported. Hooks begin after writable environment availability. Self-hosted workers additionally fire session boundaries when claiming/releasing workers. [Cloud support](https://cursor.com/docs/hooks#cloud-agent-support)

## MCP servers

Sources: [MCP](https://cursor.com/docs/mcp), [Plugin MCP](https://cursor.com/docs/reference/plugins#mcp-servers), [Agent Plugins MCP schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json).

### Files and fields

Project `.cursor/mcp.json`; user `~/.cursor/mcp.json`; plugin-root `mcp.json`. Server names are keys under `mcpServers`. Plugin manifest `mcpServers` overrides default discovery. Same-name precedence across scopes and extension registrations is **UNKNOWN**.

| Key | Type | Meaning / limits |
|---|---|---|
| `mcpServers` | server-name → object | Server map. |
| `type` | string | Cursor STDIO table requires `"stdio"`; Cursor Plugin reference permits transport inference from command/URL. Agent Plugins requires exact `"stdio"`, `"streamable-http"`, `"sse"`. |
| `command` | string | Executable on PATH or full path; plugin root variables supported. |
| `args` | string[] | Executable arguments. |
| `env` | string-valued mapping | Process environment. |
| `envFile` | string | Environment-file path; STDIO only. Relative resolution and precedence against `env` **UNKNOWN**. |
| `cwd` | string | Plugin MCP working directory; plugin-root expansion documented. General non-plugin behavior **UNKNOWN**. |
| `url` | string | Remote HTTP/SSE endpoint. |
| `headers` | string-valued mapping | Remote request headers. |
| `auth` | object | Static OAuth credentials for remote URL servers. |
| `auth.CLIENT_ID` | string, required | OAuth client ID. |
| `auth.CLIENT_SECRET` | string, optional | Confidential-client secret. |
| `auth.scopes` | string[], optional | Requested scopes; omission discovers `scopes_supported` through authorization-server metadata. |

Sources: [STDIO configuration](https://cursor.com/docs/mcp#stdio-server-configuration), [Static OAuth](https://cursor.com/docs/mcp#static-oauth-for-remote-servers), [Plugin MCP](https://cursor.com/docs/reference/plugins#mcp-servers).

Timeout keys, retry controls, per-server tool enable/disable lists, `trust`, `disabled`, and persisted UI enable flags are **UNKNOWN** as config fields. Customize toggles servers; disabled servers do not load or appear in chat. [MCP FAQ](https://cursor.com/docs/mcp#faq)

### Expansion and transport differences

- General expansion: `${env:NAME}`, `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`, `${/}` in `command`, `args`, `env`, `url`, `headers`; `auth` also supports interpolation. `${workspaceFolder}` is the folder containing project `.cursor/mcp.json`. [Interpolation](https://cursor.com/docs/mcp#config-interpolation)
- Plugin expansion: `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in `command`, `args`, `env` values, `cwd`. **`${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are not expanded**, including Agent Plugins packages. [Plugin MCP](https://cursor.com/docs/reference/plugins#mcp-servers)
- Cursor Plugin declared variables use `${VAR}` placeholders; dashboard supplies values. Supported expansion fields beyond the documented examples are **UNKNOWN**. [Variables](https://cursor.com/docs/reference/plugins#variables)
- Agent Plugins schema permits `cwd` starting `./`, `${PLUGIN_ROOT}`, or `${PLUGIN_DATA}`; Cursor’s own example uses `${CURSOR_PLUGIN_ROOT}`, which does **not** match that schema. Standards support therefore has a concrete portability/schema caveat. [Schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json), [Cursor example](https://cursor.com/docs/reference/plugins#mcp-servers)
- STDIO, SSE, Streamable HTTP are shipped. OAuth supports static credentials and dynamic-registration workflows. Redirects: web `https://www.cursor.com/agents/mcp/oauth/callback`; desktop `http://localhost:8787/callback`. [MCP](https://cursor.com/docs/mcp)

## Other native capability types

| Capability | Cursor package support |
|---|---|
| Plugin variables/settings | Shipped `variables` JSON Schema; details below. |
| MCP Apps | Shipped MCP extension for interactive UI returned by tools; not a separate plugin manifest component. |
| Plugin canvases | Shipped prebuilt reusable setup canvases; no authoring file/schema exposed on researched plugin pages. |
| Arbitrary scripts/assets | Supporting files used by skills/hooks/MCP; not automatically executable modules. |
| JS/TS extension modules | Separate VS Code extension surface can register MCP servers and plugin paths; no equivalent Cursor Plugin code-module field. |
| LSP servers, output styles, themes, monitors, custom providers/models, statusline, keybindings | **Not supported as documented Cursor Plugin manifest component types.** Support through other Cursor/VS Code surfaces is not equivalent to plugin-package support. |
| Connectors | MCP servers can expose external integrations; separate connector manifest schema **UNKNOWN**. |

Sources: [Plugin component table/canvases](https://cursor.com/docs/plugins), [Manifest fields](https://cursor.com/docs/reference/plugins), [MCP Apps](https://cursor.com/docs/mcp#mcp-apps), [Extension API](https://cursor.com/docs/extension-api).

### `variables`

Top-level schema requires `type:"object"` and `properties:object`. Documented accepted keywords:

`type`, `title`, `description`, `default`, `enum`, `const`, `properties`, `required`, `items`, and unspecified “common length/numeric constraints.”

Values are configured by team admins in dashboard Plugins → Configure; secrets are not stored in the package. Exhaustive constraint keywords, type restrictions, secret masking/storage, and user/project variable precedence are **UNKNOWN**. [Variables](https://cursor.com/docs/reference/plugins#variables)

### Separate extension API

- `vscode.cursor.mcp.registerServer({name:string,server:{command:string,args:string[],env:Record<string,string>}})`
- Remote alternative: `{name:string,server:{url:string,headers?:Record<string,string>}}`.
- `unregisterServer(serverName:string)`.
- `vscode.cursor.plugins.registerPath(path:string)` / `unregisterPath(path:string)`: absolute plugin directory.
- Registered directories can use discovery **without a manifest**; this exception differs from marketplace packaging requirements.

Source: [Extension API](https://cursor.com/docs/extension-api).

## Permissions, trust and security

Sources: [Permissions reference](https://cursor.com/docs/reference/permissions), [Marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security), [MCP admin controls](https://cursor.com/docs/mcp#enterprise-admin-controls), [Local imports](https://cursor.com/docs/plugins#test-plugins-locally).

### Permission configuration—not a plugin manifest component

`~/.cursor/permissions.json` and `<workspace>/.cursor/permissions.json`; JSONC supported; hot-reloaded; unknown keys ignored.

| Key | Type | Meaning |
|---|---|---|
| `mcpAllowlist` | string[] | Tools eligible to run without approval. |
| `terminalAllowlist` | string[] | Command/prefix eligibility without approval. |
| `autoRun` | object | Auto-review classifier steering. |
| `autoRun.allow_instructions` | string[] | Natural-language preference toward allowing calls. |
| `autoRun.block_instructions` | string[] | Preference toward approval prompts; not enforced deny rules. |

User/project arrays concatenate. Admin settings override file settings; a present file allowlist replaces the corresponding IDE allowlist. Empty arrays remain empty, not IDE fallback. Non-string entries drop silently. MCP entries use case-insensitive `server:tool` with `*`; missing `:` ignored. Terminal matching is case-sensitive; documented forms include `git`, `git status`, `npm:install*`. [Permissions](https://cursor.com/docs/reference/permissions)

- Applies with Run Mode enabled; `autoRun` only in Auto-review. Allowlists are convenience, **not a security boundary**. CLI permissions are separate and must not be treated as this schema. [Permissions notes](https://cursor.com/docs/reference/permissions#notes)
- Cursor Plugin manifest exposes no permission or allow-deny settings field. Native hooks can gate actions; `readonly` restricts subagents. Whether arbitrary packaged permission files are consumed during install is **UNKNOWN**; discovery does not list them. [Manifest](https://cursor.com/docs/reference/plugins), [Hooks](https://cursor.com/docs/hooks), [Subagents](https://cursor.com/docs/subagents)
- Enterprise MCP policy: command/URL patterns, tool allowlists, local network modes `Allow all`, `Allowlist`, `Deny all`, `No sandbox`; optional user MCP extensions and network denylist. Distribution and approval are separate. [MCP controls](https://cursor.com/docs/mcp#enterprise-admin-controls)
- Public marketplace plugins are open source, manually reviewed, ship no binaries according to marketplace security policy, and every public update is reviewed. Blocked MCP servers can remain installed but cannot make calls. Signatures, cryptographic attestations, and client-verifiable provenance formats are **UNKNOWN**. [Marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security)
- Local plugin imports require organizational permission; **Allow Local Plugin Imports** defaults off on Enterprise. Local symlinks resolving outside `~/.cursor/plugins/local` are skipped. [Local testing](https://cursor.com/docs/plugins#test-plugins-locally)
- Required team plugins cannot be uninstalled; enforced team rules cannot be disabled. Exact installation trust-prompt text and sandbox treatment of hook processes are **UNKNOWN**. [Team installation modes](https://cursor.com/docs/plugins#plugin-installation-modes), [Team rules](https://cursor.com/docs/rules#activation-and-enforcement)

## Packaging, install and scopes

Sources: [Plugin reference](https://cursor.com/docs/reference/plugins), [Plugins/install/team marketplaces](https://cursor.com/docs/plugins).

### Cursor Plugin manifest: `.cursor-plugin/plugin.json`

| Field | Type | Meaning |
|---|---|---|
| `name` | string, required | Lowercase identifier using alphanumerics, hyphens, periods; starts/ends alphanumeric. |
| `description` | string | Description. |
| `version` | string | Semantic version. |
| `author` | object | `name:string` required, `email:string` optional. |
| `homepage` | string | Homepage URL. |
| `repository` | string | Repository URL. |
| `license` | string | License identifier. |
| `keywords` | array | Discovery tags; item type not explicitly tabulated. |
| `logo` | string | Relative asset path or absolute URL; relative logos resolve through repository/commit-specific `raw.githubusercontent.com` URLs. |
| `rules` | string or array | Rule paths. |
| `agents` | string or array | Agent paths. |
| `skills` | string or array | Skill directory paths. |
| `commands` | string or array | Command paths. |
| `hooks` | string or object | Config path or inline hook configuration. |
| `mcpServers` | string, object, or array | Config paths/inline configurations; array can combine them. |
| `variables` | object | Restricted JSON Schema for dashboard configuration. |

Explicit component paths **replace**, rather than augment, default discovery. Submission requires valid relative paths: no absolute paths or `..`. Default assets: `skills/`, `rules/`, `agents/`, `commands/`, `hooks/hooks.json`, root `mcp.json`. [Manifest/discovery/checklist](https://cursor.com/docs/reference/plugins)

### Agent Plugins 1.0: root `plugin.json`

Required `$schema:"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`, `name:string`. Optional `version`, `description`, `homepage`, `repository`, `license`: strings; `keywords:string[]`; `author:{name?:string,email?:string,url?:string}`; `extensions:Record<string,object>`. Unknown top-level/author fields forbidden. Name maximum 64 characters, no consecutive `--` or `..`, alphanumeric endpoints. Cursor documents support for **skills and MCP**, not automatic interpretation of arbitrary extension namespaces. [Schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), [Cursor formats](https://cursor.com/docs/reference/plugins#supported-plugin-formats)

### Cursor marketplace: `.cursor-plugin/marketplace.json`

| Key | Type | Meaning |
|---|---|---|
| `name` | string, required | Marketplace identifier. |
| `owner` | object, required | `name:string` required; `email:string` optional. |
| `plugins` | array, required | Plugin entries; whole file ≤10 MB. |
| `metadata` | object | Optional `description`, `version`, `pluginRoot` source-prefix path; precise member types not explicitly tabulated. |

Every documented plugin-entry key:

- Required `name:string`.
- `source:string|object`: plugin-directory path, or object with `path` and unspecified options.
- `description`, `version`, `homepage`, `repository`, `license`, `logo`, `category`: strings.
- `author:object`; `keywords`, `tags`: arrays.
- `skills`, `rules`, `agents`, `commands`: string or array.
- `hooks`: string or object.
- `mcpServers`: string or object—unlike the standalone manifest table, array is not listed.
- `variables:object`.

For an entry source, Cursor loads `<source>/.cursor-plugin/plugin.json`; merges it with the entry; **plugin manifest wins**; discovers components within that source directory. Complete `source` object fields, author member constraints, and Agent Plugins marketplace-entry resolution are **UNKNOWN**. [Marketplace manifest](https://cursor.com/docs/reference/plugins#cursor-multi-plugin-repositories)

Official template evidence: [cursor/plugin-template](https://github.com/cursor/plugin-template/tree/46216072ac5750f782f95bb325b4d12b7c3ae9c9), observed commit `46216072ac5750f782f95bb325b4d12b7c3ae9c9`, containing marketplace plus nested plugin manifests.

### Installation, scopes, updates

- Install through Customize from marketplace; choose **project or user** scope. Management filters user/workspace/team. Exact written registration files, settings keys such as `enabledPlugins`, installed package directories, lockfiles, and caches are **UNKNOWN**. [Installation](https://cursor.com/docs/plugins#installing-plugins)
- Local development: `~/.cursor/plugins/local/<plugin>/`, root Agent Plugins manifest or `.cursor-plugin/plugin.json`; reload/restart. Marketplace-installed same-name plugin wins over local copy. [Local testing](https://cursor.com/docs/plugins#test-plugins-locally)
- Additional plugin paths can come from `workspaceOpen.pluginPaths` or extension API registration. Persistence and precedence are **UNKNOWN**. [Workspace hook](https://cursor.com/docs/hooks#workspaceopen), [Extension API](https://cursor.com/docs/extension-api)
- Public publication: public Git repository, submission, review. Team repo import accepts GitHub, GitLab, Bitbucket, Azure DevOps. npm/zip distribution, arbitrary git ref/SHA selectors, and path install CLI contracts are **UNKNOWN**. MCP commands using npm are not npm plugin distribution. [Publishing](https://cursor.com/docs/reference/plugins#submitting-a-plugin), [Team imports](https://cursor.com/docs/plugins#add-a-team-marketplace)
- Teams: one team marketplace; Enterprise: unlimited. Access defaults team-wide and can be restricted to Organization Groups; admins retain access. [Team marketplaces](https://cursor.com/docs/plugins#team-marketplaces)
- Exact distribution modes: `Default Off` opt-in; `Default On` default install with opt-out; `Required` install without uninstall. [Installation modes](https://cursor.com/docs/plugins#plugin-installation-modes)
- GitHub team **Auto Refresh** tracks a branch, requires Cursor GitHub App, reindexes at most once per ten minutes. Full repo imports discover newly added entries; individually added plugins only refresh existing entries until reimport. Other sources can refresh manually. [Updates](https://cursor.com/docs/plugins#keep-plugins-up-to-date)
- GitHub **Serve marketplace from Cursor** serves a synced repository copy without developer GitHub access; GitLab/Bitbucket/Azure DevOps continue source-repository serving. [Serving](https://cursor.com/docs/plugins#serve-marketplace-from-cursor)
- Public marketplace updates are separately reviewed, not directly automatic from source. Client update cadence, version pinning, rollback, dependencies, transitive imports, and dependency resolution are **UNKNOWN**. [Marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security)

## Notable gaps and ambiguities

- **Agent Plugins portability is incomplete:** Cursor explicitly does not expand standard `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`; its suggested `${CURSOR_PLUGIN_ROOT}` `cwd` conflicts with the published 1.0.0 schema pattern. Preserve original transport/path syntax and declare target degradation rather than claiming transparent standards round trips. [Cursor MCP](https://cursor.com/docs/reference/plugins#mcp-servers), [Schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- **Hook merge documentation conflicts:** native reference says last-wins fields can be overridden by lower-priority sources; third-party reference says higher-priority sources win conflicts. Deny dominance is clear; scalar overwrite behavior across imported sources needs runtime verification. [Native merge](https://cursor.com/docs/hooks#configuration), [Imported merge](https://cursor.com/docs/reference/third-party-hooks#priority-order)
- **Schema gaps:** no authoritative complete Cursor parser schema/source was established. Variable constraint keywords and marketplace `source` object options are not exhaustive in docs; unknown-field preservation cannot be guaranteed from these sources. [Plugin reference](https://cursor.com/docs/reference/plugins)
- **Different surfaces are not interchangeable:** project rules require `.mdc`, plugin discovery accepts other Markdown extensions; registered extension paths may omit manifests, marketplace packages require manifests. [Rules](https://cursor.com/docs/rules#rule-file-structure), [Discovery](https://cursor.com/docs/reference/plugins#cursor-plugin-component-discovery), [Extension API](https://cursor.com/docs/extension-api)
- **Permissions are not package metadata:** project/user permissions, enterprise policy, subagent readonly, and hook decisions are distinct contracts. Mapping them into one generic allow/deny field would lose semantics. [Permissions](https://cursor.com/docs/reference/permissions), [Hooks](https://cursor.com/docs/hooks), [Subagents](https://cursor.com/docs/subagents)
- **Unresolved installation internals:** on-disk marketplace installation records/cache, enable keys, version pins, dependencies, ref/SHA selectors, duplicate component precedence, and exact install trust prompts remain **UNKNOWN**. [Plugins](https://cursor.com/docs/plugins)
- **Legacy command/instruction compatibility:** current command reference retrieval failed or redirected; `CLAUDE.md`, `GEMINI.md`, and legacy `.cursorrules` behavior was not established. Do not inherit another tool’s contract by assumption. [Rules](https://cursor.com/docs/rules), [Plugin commands](https://cursor.com/docs/reference/plugins#commands-format)
- All listed native features are documented as available; none of the successfully retrieved primary pages labels these package surfaces experimental. No runtime Cursor installation or round-trip test was performed. Next evidence needed: current Cursor runtime fixtures covering discovery precedence, imported hook merges, standards-variable handling, and installer disk state.
