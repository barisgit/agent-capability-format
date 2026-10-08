# Anthropic Claude Code - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence/date convention.** Sources below are official, rolling Claude Code documentation, consulted for this inventory. The requested cutoff is **2026-10-01, Claude Code v2.1.287**. The retrieved changelog also contains releases through **2026-10-08, v2.1.294**: consequently, this is not an authenticated historical documentation snapshot. Explicitly later additions are marked **post-cutoff**; the introduction date of other unversioned behavior is **UNKNOWN**. “Shipped” means documented functionality, not an independent runtime verification. Experimental features are marked separately. [Changelog](https://code.claude.com/docs/en/changelog)

### Files, discovery and precedence

| Location | Meaning |
|---|---|
| `<skill-directory>/SKILL.md` | Markdown body plus optional YAML frontmatter; canonical skill entry point. |
| `~/.claude/skills/<name>/SKILL.md` | Personal skills. |
| `.claude/skills/<name>/SKILL.md` | Project skills. |
| Nested `.claude/skills/` directories | Discovered as Claude works in the corresponding subtree. |
| Additional working directories’ `.claude/skills/` | Additional-directory skills. |
| `<plugin>/skills/<name>/SKILL.md` | Plugin skills; manifest can add other skill directories. |
| Enterprise-managed skill directories | Managed skills, with highest collision priority. Exact deployment paths depend on platform/policy. |
| Claude account-synced skills | Separate discovery mechanism; local execution restrictions apply. |

Same-name precedence is **enterprise > personal > project**. Plugin skills have plugin-qualified names, rather than simply participating in that collision order. Skills beat legacy commands with the same name. Nested names can acquire directory-qualified names. [Skills](https://code.claude.com/docs/en/skills)

### Frontmatter inventory

All fields below are documented Claude Code fields; they are not necessarily portable Agent Skills fields. [Skills reference](https://code.claude.com/docs/en/skills#frontmatter-reference)

| Key | Type / values | Meaning and pitfalls |
|---|---|---|
| `name` | string | Invocation name; defaults to directory name. Naming restrictions apply. |
| `description` | string | Model-facing discovery description; omission falls back to the first nonempty body line. |
| `when_to_use` | string | Additional invocation guidance appended to description; combined description has a documented length limit. |
| `argument-hint` | string | Argument help displayed in the command interface. |
| `arguments` | space-separated string or string[] | Names positional arguments for named substitutions. |
| `disable-model-invocation` | boolean; default `false` | Prevents autonomous model invocation; also affects model discovery/preloading and scheduled invocation. |
| `user-invocable` | boolean; default `true` | Controls user invocation. `false` is not merely a menu-hiding flag: typed invocation is also disallowed. |
| `allowed-tools` | comma/space-separated string or string[] | Turn-scoped permission grants. **Not a tool-availability whitelist.** |
| `disallowed-tools` | comma/space-separated string or string[] | Removes tools from the available pool. Different semantics from `allowed-tools`. |
| `model` | string: alias, full model ID, or `inherit` | Model override for invocation; subject to managed model restrictions. |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` | Invocation effort override; actual availability depends on model. |
| `context` | `fork` | Execute skill in a subagent context. |
| `agent` | string | Agent used with `context: fork`; default general-purpose agent. |
| `background` | boolean | Forked execution behavior; documented default `true` for forked skills. |
| `hooks` | hook configuration object | Registers hooks. **Skill hooks persist for the session, not just the skill call.** |
| `paths` | comma-separated string or string[] | File globs controlling automatic loading. |
| `shell` | `bash`, `powershell` | Shell for skill command interpolation. |
| `metadata` | object | Accepted metadata; not operational skill configuration. Non-object values are discarded. |
| `license` | string | Accepted; no documented execution effect. |
| `compatibility` | string, maximum 500 characters | Accepted; no documented execution effect. |

Claude account uploads accept a narrower frontmatter subset than Claude Code: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Do not equate account-upload validation with the CLI schema. [Skills](https://code.claude.com/docs/en/skills)

### Body, resources and invocation

| Syntax / resource | Meaning |
|---|---|
| `scripts/`, `references/`, `assets/`, other neighboring files | Bundled resources; referenced and read on demand, not automatically concatenated into the prompt. |
| `/skill-name` | User invocation. |
| `/plugin-name:skill-name` | Namespaced plugin invocation. |
| `$ARGUMENTS` | Entire argument text. If no argument placeholder exists, arguments are appended automatically. |
| `$ARGUMENTS[N]`, `$N` | Zero-based positional argument substitution. |
| `$argument_name` | Named positional substitution declared by `arguments`. |
| `${CLAUDE_SKILL_DIR}` | Skill directory. |
| `${CLAUDE_PROJECT_DIR}` | Project directory. |
| `${CLAUDE_SESSION_ID}` | Session ID. |
| `${CLAUDE_EFFORT}` | Current effort. |
| `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` | Plugin installation and persistent-data directories. |
| `!` followed by a backtick-delimited command | Execute before presenting the skill to the model; insert stdout. |
| A fenced block opened with ` ```! ` | Multiline shell interpolation. |
| `@path` | File reference/inclusion syntax. |

Shell expansion runs **once over the original skill**, not recursively over inserted command output. Inline shell syntax requires the documented whitespace/start-of-line positioning. Missing named and indexed arguments have different substitution behavior; preserve the original body rather than rewriting placeholders mechanically. Synced skills do not have the same local-shell execution privileges as disk skills. No additional per-skill Claude metadata file is required. [Skills](https://code.claude.com/docs/en/skills)

## Instructions and rules

### Files and activation

| File | Scope / activation |
|---|---|
| `~/.claude/CLAUDE.md` | Personal, always loaded. |
| `CLAUDE.md`, `.claude/CLAUDE.md` | Project instructions; ancestor discovery at startup, nested discovery during file work. |
| `CLAUDE.local.md` | Local project instructions. |
| `~/.claude/rules/**/*.md` | Personal rules. |
| `.claude/rules/**/*.md` | Project rules; recursive directory support. |
| Managed `CLAUDE.md` | Enterprise instructions. |
| `AGENTS.md`, `.claude/AGENTS.md` | Native support, subject to the instruction-file selection policy below. |
| `GEMINI.md`, Cursor `.mdc`, steering files | **Not supported as native instruction discovery formats.** Migration/import into Claude instructions is separate. |
| `<plugin>/CLAUDE.md` | **Not automatically loaded merely because it is at plugin root.** |

Managed locations include `/Library/Application Support/ClaudeCode/CLAUDE.md` on macOS, `/etc/claude-code/CLAUDE.md` on Linux, and `C:\Program Files\ClaudeCode\CLAUDE.md` on Windows. Instruction content is accumulated context, not a settings-object replacement hierarchy. [Memory](https://code.claude.com/docs/en/memory)

| Rule frontmatter | Type | Meaning |
|---|---|---|
| `paths` | string or string[] | File-path globs; rule loads when matching files are worked on. |
| No `paths` | — | Unconditional rule. |

Claude’s documented rule modes are unconditional and file-scoped. There is no equivalent documented `.mdc` frontmatter schema with `alwaysApply` or a separate model-decided/manual rule activation enum. [Memory: modular rules](https://code.claude.com/docs/en/memory)

### AGENTS.md selection

Native AGENTS support shipped before the cutoff. The default falls back to AGENTS only when no relevant ancestor/current-directory `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` takes precedence. Personal/managed CLAUDE instructions and rules do not themselves suppress that fallback. [Memory: AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)

Configuration:

```json
{
  "pluginConfigs": {
    "cc-plugin-agents-md@builtin": {
      "options": {
        "instructionFiles": "claude-md-or-agents-md"
      }
    }
  }
}
```

| `instructionFiles` value | Meaning |
|---|---|
| `claude-md-or-agents-md` | Default CLAUDE-first fallback. |
| `claude-md-and-agents-md` | Load both formats. |
| `claude-md` | CLAUDE selection. |
| `managed-only` | Restricts startup instruction loading; **does not prohibit later nested instruction loading**. |

Read from user, managed, or explicit settings—not project/local settings. Older spelling `agents-md@builtin` is documented as an alias after the rename. No documented `AGENTS.local.md`, `AGENTS.override.md`, or `.agents/` instruction discovery. Direct AGENTS loading does not fire `InstructionsLoaded`; importing it through CLAUDE does. Additional-directory behavior is not identical to CLAUDE discovery. [Memory](https://code.claude.com/docs/en/memory#agents-md)

### Includes and exclusions

| Mechanism | Contract |
|---|---|
| `@relative/path`, `@/absolute/path`, `@~/path` in CLAUDE instructions | Imports; relative to the containing file. |
| Recursive imports | Maximum five levels. |
| Imports inside code spans/fences | Not interpreted as imports. |
| External-file imports | Approval/trust restrictions apply; AGENTS external imports have additional documented restrictions. |
| `claudeMdExcludes` | string[] patterns excluding eligible instruction files; managed instructions cannot be excluded. |

There is no general plugin-manifest instruction component. A plugin must deliver instructions through skills, agents, output styles, hooks, or another documented component rather than relying on root CLAUDE discovery. [Memory](https://code.claude.com/docs/en/memory), [Plugin components](https://code.claude.com/docs/en/plugins/components)

## Subagents and custom agents

### Files and scopes

`.claude/agents/*.md`, `~/.claude/agents/*.md`, managed agent definitions, plugin `agents/`, and session definitions supplied by `--agents`. Plugin agent subdirectories are supported and contribute colon-qualified names. Definition precedence: **managed > CLI > project > user > plugin**. [Subagents](https://code.claude.com/docs/en/sub-agents)

### Frontmatter

| Key | Type / enum | Meaning |
|---|---|---|
| `name` | required string | Identifier; documented length and colon restrictions. |
| `description` | required string | Delegation-selection guidance. |
| `tools` | comma-separated string or string[] | Available tool subset; omission inherits eligible parent tools. |
| `disallowedTools` | comma-separated string or string[] | Remove tools. A parameterized specifier removes the **whole tool**, not just matching calls. |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, full ID, `inherit` | Agent model. |
| `permissionMode` | `default`, `manual`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` | Agent permission mode; `manual` aliases `default`. Managed restrictions still apply. |
| `maxTurns` | integer | Turn limit; may return partial work. |
| `skills` | string[] | Preload full skill contents. Not an exclusive list of invocable skills. |
| `mcpServers` | array of server-name strings and/or inline server definitions | Agent MCP selection/configuration. |
| `hooks` | object | Agent-lifetime hook configuration. |
| `memory` | `user`, `project`, `local` | Persistent agent memory scope. |
| `background` | boolean | Background execution. |
| `omitClaudeMd` | boolean | Omit ordinary CLAUDE instructions; managed instructions remain; not applicable in the same way to the main agent. |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` | Effort override. |
| `isolation` | `worktree` | Isolated working tree. |
| `color` | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` | UI color. |
| `initialPrompt` | string | Initial prompt when used as the main agent. |
| `experimental.cacheTtl` | `5m`, `1h` | Experimental cache TTL preference. |

**Plugin agents ignore `permissionMode`, `hooks`, `mcpServers`, and `initialPrompt`.** These are consequential authoring-vs-emission differences: accepting a field in the canonical agent model must not imply that Claude plugin agents honor it. [Subagent reference](https://code.claude.com/docs/en/sub-agents)

### Invocation and memory

Model delegation uses the `Agent` tool and the agent description; users can select agents explicitly, including plugin-qualified agents. An agent can also serve as the main agent through the documented main-agent setting/CLI selection. Do not assume main-agent and delegated-agent behavior are interchangeable. [Subagents](https://code.claude.com/docs/en/sub-agents)

| Memory scope | Directory |
|---|---|
| `user` | `~/.claude/agent-memory/<agent-name>/` |
| `project` | `.claude/agent-memory/<agent-name>/` |
| `local` | `.claude/agent-memory-local/<agent-name>/` |

Agent memory uses `MEMORY.md` and supporting files. Built-in agents have additional tool/model/context restrictions; their behavior is not a portable custom-agent default. Worktree isolation can be replaced by worktree hooks. [Subagents](https://code.claude.com/docs/en/sub-agents)

## Commands and prompts

### Custom commands are skills

Legacy `.claude/commands/<name>.md`, `~/.claude/commands/<name>.md`, and plugin `commands/**/*.md` remain supported. Commands use the skill processing/frontmatter model; directory skills add bundled resources. A same-name skill takes precedence. Plugin commands are namespaced; recursive command directories add name segments. [Skills](https://code.claude.com/docs/en/skills), [Commands](https://code.claude.com/docs/en/commands)

Frontmatter, model/effort/tool overrides, `$ARGUMENTS`, indexed/named arguments, shell execution, file references, invocation controls, and forked execution are therefore the fields described in **Skills**, not a separate portable prompt schema. Legacy spelling and disk layout should be preserved for same-format round trips. [Skills](https://code.claude.com/docs/en/skills)

### Manifest-defined command map

The plugin `commands` key can instead contain a map of command names to objects. [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

| Field | Type | Meaning |
|---|---|---|
| `source` | string path | Markdown source file. |
| `content` | string | Inline command content. |
| `description` | string | Discovery/help text. |
| `argumentHint` | string | Argument help; camelCase here versus frontmatter `argument-hint`. |
| `model` | string | Model override. |
| `allowedTools` | string[] | Tool grants; camelCase here versus frontmatter `allowed-tools`. |

Setting the manifest `commands` component replaces automatic discovery of the default `commands/` directory unless that directory is listed explicitly. [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

### MCP prompts

MCP prompts become commands: displayed `/servername:promptname`, with `/mcp__servername__promptname` also accepted. Prompt arguments are supplied through MCP prompt invocation, not necessarily through Markdown placeholder processing. The name `anthropic-skills` is reserved for synced skills, and prompts from a server with that name do not appear. [MCP prompts](https://code.claude.com/docs/en/mcp#use-mcp-prompts-as-commands)

## Hooks

### Configuration, scope and handler fields

Settings use:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "example" }
        ]
      }
    ]
  }
}
```

Locations: user/project/local/managed settings, plugin `hooks/hooks.json` or manifest hook configuration, skill frontmatter, and agent frontmatter. Skill hooks can remain registered for the session; agent hooks follow the agent lifetime; plugin-agent hook frontmatter is ignored. [Hooks](https://code.claude.com/docs/en/hooks)

| Field | Type / values | Contract |
|---|---|---|
| Event key | exact event string | Tables below. |
| `matcher` | string | Event-dependent filter. |
| Group `hooks` | handler[] | Handlers for that matcher. |
| Handler `type` | `command`, `http`, `mcp_tool`, `prompt`, `agent` | Execution mechanism. |
| `if` | string | One permission-rule expression; evaluated only on tool events. On other events, the handler does not run. |
| `timeout` | number, seconds | Handler timeout, with event/type defaults below. |
| `statusMessage` | string | Spinner text. |
| `once` | boolean | Only honored in **skill** frontmatter; removed after first successful run. |
| `command` | string | Shell command, or executable with `args`. |
| `args` | string[] | Direct-exec form; bypasses shell parsing. |
| `shell` | `bash`, `powershell` | Command shell; not the execution mechanism when direct-exec `args` is used. |
| `async` | boolean | Background command; cannot synchronously block. |
| `asyncRewake` | boolean | Background command with documented reawakening behavior. |
| HTTP `url` | string | POST destination. |
| HTTP `headers` | string→string object | Request headers. |
| HTTP `allowedEnvVars` | string[] | Allowlist for `$VAR`/`${VAR}` header expansion; other variables become empty. |
| MCP `server` | string | Server name; plugin server names are scoped. |
| MCP `tool` | string | MCP tool name. |
| MCP `input` | object | Arguments; supports documented payload substitutions. |
| Prompt/agent `prompt` | string | Evaluation instructions; `$ARGUMENTS` represents hook input JSON. |
| Prompt/agent `model` | string | Evaluation model. |
| Prompt `continueOnBlock` | boolean | Documented handling of a blocking prompt result. |

Prompt/agent evaluators return `ok: boolean` and optional `reason: string`; supported blocking capabilities depend on the event. They are not arbitrary script-module handlers. JS/TS Mods are a separate extension mechanism. [Hook handler reference](https://code.claude.com/docs/en/hooks)

### Lifecycle inventory

All rows are from the [official hooks reference](https://code.claude.com/docs/en/hooks); introduction dates for unversioned rows are **UNKNOWN**.

| Exact event | Meaning | Matcher / distinguishing input |
|---|---|---|
| `SessionStart` | Session begins/resumes/reinitializes | `source`: `startup`, `resume`, `clear`, `compact`, `fork`; `model`, `session_title` when supplied; resume cache/context metadata. |
| `Setup` | Explicit initialization/maintenance | `trigger`: `init`, `maintenance`; command handlers only. |
| `UserPromptSubmit` | User submits prompt | No matcher; `prompt`. |
| `UserPromptExpansion` | Slash-command prompt expansion | `expansion_type`, `command_name`, `args`, `source`, `prompt`; documented expansion type `slash_command`. |
| `PreToolUse` | Before permission processing/tool execution | Tool-name matcher; `tool_name`, `tool_input`, `tool_use_id`, optional `mcp_server`. |
| `PermissionRequest` | Tool needs a permission decision | Tool-name matcher; `tool_name`, `tool_input`, optional `permission_suggestions`, optional `mcp_server`; **no `tool_use_id`**. |
| `PermissionDenied` | Permission denial | Tool/denial details; supports documented retry behavior. |
| `PostToolUse` | Successful tool execution | Tool-name matcher; tool identity/input, structured `tool_response`, `duration_ms`. |
| `PostToolUseFailure` | Failed tool execution | Tool-name matcher; tool identity/input, `error`, `is_interrupt`, `duration_ms`. |
| `PostToolBatch` | Entire parallel tool batch completes | No matcher; `tool_calls[]` with `tool_name`, `tool_input`, `tool_use_id`, `tool_response`. |
| `Notification` | Notification emitted | `notification_type`; `message`, optional `title`. |
| `MessageDisplay` | Assistant text displayed | `turn_id`, `message_id`, `index`, `final`, `delta`. |
| `SubagentStart` | Subagent spawned | Agent-type matcher; `agent_id`, `agent_type`. |
| `SubagentStop` | Subagent finishes | Agent-type matcher; agent IDs, `agent_transcript_path`, `stop_hook_active`, `last_assistant_message`, outstanding-task/cron data. |
| `TaskCreated` | `TaskCreate` creates task | `task_id`, `task_subject`, optional task description/teammate data. |
| `TaskCompleted` | Task marked completed | Task identity/subject, optional description/teammate data. |
| `Stop` | Main agent finishes response | `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`. |
| `StopFailure` | Turn ends on API failure | `error`, `error_details`, `last_assistant_message`. |
| `TeammateIdle` | Team member about to idle | `teammate_name`; legacy `team_name` is deprecated. |
| `InstructionsLoaded` | Instruction/rule loaded | `load_reason`; `file_path`, `memory_type`, optional `globs`, `trigger_file_path`, `parent_file_path`. |
| `ConfigChange` | Configuration changes | `source`, `file_path`. |
| `CwdChanged` | Current working directory changes | No matcher; `old_cwd`, `new_cwd`. |
| `DirectoryAdded` | Directory added mid-session | `directory`, `source`: `slash_command`, `register_repo_root`. |
| `FileChanged` | Watched file changes | Literal filename matcher; `file_path`, `event`: `change`, `add`, `unlink`. |
| `WorktreeCreate` | Isolated working tree requested | `name`; handler replaces built-in worktree creation. |
| `WorktreeRemove` | Hook-created worktree removed | `worktree_path`. |
| `PreCompact` | Before compaction | `trigger`: `manual`, `auto`; `custom_instructions`. |
| `PostCompact` | After compaction | `trigger`, `compact_summary`. |
| `PreModelSwitch` | Before requested model switch | `from_model`, `to_model`, `requested_model`, `source`, cache/context/cost metadata. |
| `PostModelSwitch` | After model changes | Model transition metadata, including changes initiated by Claude. |
| `Elicitation` | MCP asks user for input | Server-name matcher; `mcp_server_name`, `message`, `mode`: `form`/`url`, schema or URL. |
| `ElicitationResult` | MCP elicitation result | Server-name matcher; `mcp_server_name`, `action`, `content`, `mode`, `elicitation_id`. |
| `SessionEnd` | Session exits | `reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other`. |

`InstructionsLoaded.memory_type`: `User`, `Project`, `Local`, `Managed`; `load_reason`: `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact`. `ConfigChange.source`: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`. Model-switch requested sources include `command`, `picker`, `sdk`; documented cache TTL values are `5m`, `1h`, and pricing sources `configured`, `catalog`, `default`. [Hooks](https://code.claude.com/docs/en/hooks)

`StopFailure.error`: `rate_limit`, `overloaded`, `authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`, `billing_error`, `invalid_request`, `model_not_found`, `server_error`, `max_output_tokens`, `cloud_credential_error`, `unknown`. [Hooks: StopFailure](https://code.claude.com/docs/en/hooks#stopfailure)

Notification types documented include `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired`, `quota_auto_resume_stale`, `quota_auto_resume_disabled`. [Hooks: Notification](https://code.claude.com/docs/en/hooks#notification)

### Common input and outputs

| Common input | Type |
|---|---|
| `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `hook_event_name` | strings, subject to availability documented per event/version |
| `effort` | object with `level` |
| `agent_id`, `agent_type` | conditional strings |

Do not presume every event contains every optional/common field. Tool input and response objects retain their native tool schemas. `PostToolBatch.tool_response` is serialized model-visible tool-result content; **not** the structured `PostToolUse.tool_response` object. [Hooks: input](https://code.claude.com/docs/en/hooks)

| Global JSON output | Type / meaning |
|---|---|
| `continue` | boolean; stop ongoing execution where honored. |
| `stopReason` | string; accompanying stop explanation. |
| `suppressOutput` | boolean; accepted but documented as having no effect. |
| `systemMessage` | string; user-facing notification, not generally model context. |
| `terminalSequence` | string; restricted terminal-control output. |
| `hookSpecificOutput` | object; requires matching `hookEventName`. |
| Top-level `decision`, `reason` | Event-specific blocking contract, not universal permission decisions. |

Observational events discard some or all global outputs. `Setup` discards all JSON decision/context outputs. `InstructionsLoaded` cannot block loading. `CwdChanged`/`FileChanged` honor watch-list updates and notifications, not `continue`. [Hooks: JSON output](https://code.claude.com/docs/en/hooks#json-output)

| Event-specific output | Contract |
|---|---|
| `PreToolUse.permissionDecision` | `allow`, `deny`, `ask`, `defer`. |
| `PreToolUse.permissionDecisionReason` | string. |
| `PreToolUse.updatedInput` | object; **replaces entire input**, not a patch. |
| `PreToolUse.additionalContext` | string. |
| `PermissionRequest.decision` | `{behavior: "allow"|"deny", updatedInput?, updatedPermissions?, message?, interrupt?}`. |
| `PermissionDenied.retry` | boolean; documented retry path. |
| `PostToolUse.updatedToolOutput` | Replace model-facing tool output. |
| `PostToolUse.updatedMCPToolOutput` | Legacy MCP-specific output replacement. |
| `PostToolUse.classifierContext` | Classifier context. |
| `additionalContext` | Supported on specific session/prompt/tool/stop/compaction events; not universal. |
| `SessionStart.initialUserMessage` | Initial user prompt. |
| `SessionStart.sessionTitle` | Session title. |
| `SessionStart.watchPaths`, `reloadSkills` | Watch-list setup / skill reload control. |
| `UserPromptSubmit.sessionTitle`, `suppressOriginalPrompt` | Title and prompt-delivery control. |
| `CwdChanged.watchPaths`, `FileChanged.watchPaths` | Absolute-path string[]; replaces dynamic watch list, not statically configured watches. |
| `MessageDisplay.displayContent` | Display-only text replacement; original transcript/model content remains. |
| Elicitation `action`, `content` | `accept`, `decline`, `cancel`; response object where applicable. |
| `WorktreeCreate` result | Command stdout absolute directory path; HTTP uses `worktreePath`. |

Top-level `decision: "block"`/`reason` is documented for particular prompt/tool/stop/configuration/compaction events. Do not translate it indiscriminately to `permissionDecision: "deny"`. `Stop`/`SubagentStop` feedback can cause continued work; guard against loops using `stop_hook_active`. [Hooks: decision control](https://code.claude.com/docs/en/hooks)

Permission updates are typed objects:

| `type` | Fields |
|---|---|
| `addRules`, `replaceRules`, `removeRules` | `rules: {toolName: string, ruleContent?: string}[]`, `behavior: "allow"|"deny"|"ask"`, `destination`. |
| `setMode` | `mode`, `destination`. |
| `addDirectories`, `removeDirectories` | `directories: string[]`, `destination`. |

Destinations: `session`, `localSettings`, `projectSettings`, `userSettings`. `bypassPermissions` updates cannot enable unavailable/managed-disabled bypass mode and are never persisted as default mode. Hook permission grants do not override matching deny/ask restrictions. [Permission update entries](https://code.claude.com/docs/en/hooks#permission-update-entries)

### Exit codes, matching, ordering and environment

- Command exit `0`: successful output processing; exit `2`: blocking only where that event supports it; other nonzero exits generally report nonblocking errors. **`PermissionRequest` exit `2` alone does not deny: JSON `decision` is required.** Worktree creation treats failure differently. [Exit-code reference](https://code.claude.com/docs/en/hooks)
- Matchers use documented exact/list/JavaScript-regex behavior; regex matching is unanchored unless explicitly anchored. Empty/`*` match broadly. `FileChanged` is literal-path matching, not the usual regex semantics. [Matchers](https://code.claude.com/docs/en/hooks)
- Matching handlers run **in parallel**. Identical handlers across settings files are deduplicated; plugin/skill copies remain separate. No general sequential ordering contract. [Hooks](https://code.claude.com/docs/en/hooks)
- Defaults: command/HTTP/MCP 600 seconds; prompt 30; agent 60. Command/HTTP/MCP defaults drop to 30 seconds for `UserPromptSubmit`/model-switch events and 10 for `MessageDisplay`. `SessionEnd` shares a 1.5-second budget, extendable by explicit timeout up to 60 seconds. Async command timeouts are not enforced the same way. [Timeouts](https://code.claude.com/docs/en/hooks)
- Environment includes `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PLUGIN_OPTION_<UPPERCASE_KEY>`, `CLAUDE_EFFORT`, conditional `CLAUDE_CODE_REMOTE`, `CLAUDE_CODE_BRIDGE_SESSION_ID`. `CLAUDE_ENV_FILE` is available on `SessionStart`, `Setup`, `CwdChanged`, `FileChanged`; write export statements to persist shell environment. Directory-change lifecycle clears the reactive environment layer. [Hook environment](https://code.claude.com/docs/en/hooks)

## MCP servers

### Files, scopes and names

| File / setting | Scope |
|---|---|
| `.mcp.json` with `mcpServers` map | Project servers. |
| `<plugin>/.mcp.json` or manifest `mcpServers` | Plugin servers. |
| `~/.claude.json` top-level MCP configuration | User servers. |
| `~/.claude.json` project-specific records | Local servers. |
| `managed-mcp.json`, managed MCP settings | Enterprise administration. |

Ordinary same-name precedence is **local > project > user**; desktop behavior has documented exceptions. Plugin server names are `plugin:<plugin-name>:<server-name>` and exposed tool names use `mcp__plugin_<plugin-name>_<server-name>__<tool>`. Server configuration, approval, and session enable/disable state are distinct records. [MCP](https://code.claude.com/docs/en/mcp)

### Server fields

| Key | Type / enum | Meaning |
|---|---|---|
| `type` | `stdio`, `http`, `streamable-http`, `sse`, `ws` | `stdio` default; `streamable-http` alias; SSE deprecated. SDK-hosted servers are a separate runtime mechanism, not ordinary authored file servers. |
| `command` | string | Stdio executable. |
| `args` | string[] | Stdio arguments. |
| `env` | string→string object | Stdio process environment. |
| `url` | string | Remote endpoint. |
| `headers` | string→string object | Remote request headers. |
| `headersHelper` | string | Shell helper producing JSON headers. |
| `timeout` | number, milliseconds; minimum 1000 | Per-server tool timeout. |
| `alwaysLoad` | boolean | Load all server tools upfront instead of tool-search deferral. |
| `bareElicitationCapability` | boolean | Compatibility workaround for URL elicitation; documented in v2.1.287. |
| `oauth` | object | OAuth customization below. |
| `oauth.clientId` | string | OAuth client identifier. |
| `oauth.callbackPort` | number | Callback port. |
| `oauth.authServerMetadataUrl` | string | Explicit authorization-server metadata URL. |
| `oauth.scopes` | space-separated string | Requested scopes. |
| `cwd`, `envFile` | **UNKNOWN** | No supported authored fields established in consulted official reference. |
| Per-server `enabledTools`, `disabledTools` | **UNKNOWN** | No documented authored fields established; tool permission rules are separate. |

Client secrets are supplied through the documented CLI/authentication flow and secure storage, not a documented plain configuration `clientSecret` field. OAuth support is transport-dependent; WebSocket custom headers do not imply OAuth support. HTTP has documented SSE fallback behavior. [MCP configuration/authentication](https://code.claude.com/docs/en/mcp)

### Expansion, trust and runtime controls

| Syntax / setting | Meaning |
|---|---|
| `${VAR}` | Environment substitution. |
| `${VAR:-default}` | Defaulted environment substitution. |
| `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}` | Plugin/project path substitutions. |
| `${user_config.KEY}` | Plugin option substitution in supported config fields. |
| `MCP_TIMEOUT` | Startup timeout. |
| `MCP_TOOL_TIMEOUT` | Default tool timeout. |
| `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` | Idle-time behavior. |
| `ENABLE_TOOL_SEARCH` | Deferred/upfront/threshold tool loading. |
| `enableAllProjectMcpServers` | Project-server approval setting. |
| `enabledMcpjsonServers`, `disabledMcpjsonServers` | Project MCP approval selection. |
| `enabledMcpServers`, `disabledMcpServers` | Separate per-project enable/disable records in Claude configuration. |

Expansion is supported in documented command/argument/environment/URL/header fields; preserve literal templates until the target runtime performs substitution. Sensitive credential variables have additional remote-session restrictions. Tool progress does not indefinitely extend the hard timeout. [MCP](https://code.claude.com/docs/en/mcp)

`headersHelper` executes through a shell and cannot safely accept `${user_config.*}` interpolation. Its environment includes `CLAUDE_CODE_MCP_SERVER_NAME`, `CLAUDE_CODE_MCP_SERVER_URL`, and plugin-root context where applicable, but not plugin option values. Project/local helpers require explicit trust for the exact folder, including headless sessions; this differs from ordinary settings-hook trust behavior. [Dynamic headers](https://code.claude.com/docs/en/mcp#use-dynamic-headers-for-custom-authentication), [Plugin user configuration](https://code.claude.com/docs/en/plugins-reference)

## Other native capability types

### LSP

Default `<plugin>/.lsp.json`, or manifest `lspServers`, maps server names to strict server objects. [LSP plugin reference](https://code.claude.com/docs/en/plugins-reference)

| Field | Type | Meaning |
|---|---|---|
| `command` | required string | Language-server executable. |
| `extensionToLanguage` | required object | Dot-prefixed file extension → language ID; nonempty. |
| `args` | string[] | Process arguments. |
| `transport` | `stdio`, `socket` | Both accepted, but documented implementation uses stdio. |
| `env` | string→string object | Process environment. |
| `initializationOptions` | object | LSP initialization payload. |
| `settings` | object | Server settings. |
| `workspaceFolder` | string | Workspace root override. |
| `startupTimeout` | positive integer, milliseconds | Startup budget. |
| `shutdownTimeout` | positive integer, milliseconds | Shutdown budget. |
| `restartOnCrash` | boolean; default `true` | Restart behavior. |
| `maxRestarts` | integer ≥ 0 | Restart limit. |
| `diagnostics` | boolean; default `true` | Diagnostics delivery. |
| `requestTimeout` | milliseconds | **Post-cutoff: v2.1.288**, default 60000. |

The plugin does not automatically install arbitrary LSP binaries. Environment/plugin-option substitution support has version-specific fixes: initialization/settings substitution fixes are documented after the cutoff. [Plugin reference](https://code.claude.com/docs/en/plugins-reference), [Changelog](https://code.claude.com/docs/en/changelog)

### Output styles

Files: `~/.claude/output-styles/*.md`, `.claude/output-styles/*.md`, plugin `output-styles/*.md` or manifest paths. Styles modify the system-prompt presentation/instructions rather than acting as invocable skills. [Output styles](https://code.claude.com/docs/en/output-styles)

| Frontmatter | Type | Meaning |
|---|---|---|
| `name` | string | Display name. |
| `description` | string | Selection description. |
| `keep-coding-instructions` | boolean; default `false` | Retain normal coding instructions. |
| `force-for-plugin` | boolean; default `false` | Plugin forces style selection; first applicable loaded forcing style wins. |

### Themes

User files: `~/.claude/themes/*.json`. Plugins use experimental theme components. [Terminal themes](https://code.claude.com/docs/en/terminal-config)

| Field | Type / values |
|---|---|
| `name` | string; defaults to filename slug. |
| `base` | `dark`, `light`, `dark-daltonized`, `light-daltonized`, `dark-ansi`, `light-ansi`; default `dark`. |
| `overrides` | Color-token → color-value map. |

Values: `#rgb`, `#rrggbb`, `rgb(r,g,b)`, `ansi256(n)`, `ansi:<standard-color-name>`. Invalid values/unknown tokens are ignored. Documented tokens include ordinary text/status colors, prompt/plan/tool borders, diff colors, message backgrounds, selection colors, subagent colors, effort/rainbow/shimmer colors, and usage-meter colors. The docs explicitly omit additional editor-exposed tokens: a complete authoritative token enumeration is **UNKNOWN**. [Theme token reference](https://code.claude.com/docs/en/terminal-config)

### Monitors, workflows, channels, evals and executables

| Component | Files / fields / contract |
|---|---|
| **Experimental monitors** | Manifest `experimental.monitors`, default monitor component files; definitions contain required `name`, `command`, `description` strings and optional `when`: `always` or `on-skill-invoke:<skill>`. Background processes, interactive-session restrictions, provider restrictions; no plugin-option environment injection. |
| Workflows | JavaScript workflow components, including plugin `workflows/` and manifest paths. Orchestration runtime is not unrestricted Node: no ordinary imports/direct filesystem/shell access. Preserve source modules. |
| Channels | Manifest `channels[]`: required `server` string, optional `displayName` string, optional `userConfig` option map. Associated MCP server supplies channel functionality; policy can restrict allowed channel plugins. |
| **Experimental evals** | Default plugin `evals/`, manifest `experimental.evals`, CLI eval-directory override. For manifest arrays only the first directory is used. Complete case schema is **UNKNOWN in this inventory**. |
| Executables | Plugin `bin/` contributes commands to Bash PATH; this is packaged executable content, not a JS extension API. Account/Cowork ingestion has additional restrictions. |
| Apps/connectors | MCP/channel/account integration mechanisms exist; a generic installable app/connector manifest component beyond these is **not documented**. |

[Plugin components](https://code.claude.com/docs/en/plugins/components), [Workflows](https://code.claude.com/docs/en/workflows), [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

### Plugin options and settings

`userConfig` is a strict option-name → definition object. Option identifiers contain letters/digits/underscores and cannot begin with a digit. [Plugin user configuration](https://code.claude.com/docs/en/plugins-reference)

| Field | Type / meaning |
|---|---|
| `type` | Required: `string`, `number`, `boolean`, `directory`, `file`. |
| `title`, `description` | Required strings. |
| `required` | boolean. |
| `default` | string, number, boolean, or string[]. |
| `options` | string[]; fixed choices for eligible single, nonsensitive string fields; labels 1–64 characters. |
| `multiple` | boolean; string-list input. |
| `sensitive` | boolean; masked input and secure storage. |
| `min`, `max` | number bounds. |

Non-sensitive values: user/managed `pluginConfigs["plugin@marketplace"].options`. Sensitive values: platform secure credential storage. Supported references: `${user_config.KEY}` in MCP/LSP configuration, exec-form hook arguments, skill/agent content; content receives only non-sensitive values. Hook processes also receive `CLAUDE_PLUGIN_OPTION_<KEY>`. Shell hook commands, monitor commands, and MCP header helpers reject direct option interpolation. [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

A plugin’s `settings.json`/inline `settings` supports **only `agent` and `subagentStatusLine`**; other settings are dropped. A root settings file containing supported keys takes precedence over inline plugin defaults. Plugin defaults have lower precedence than normal user/project/managed settings. [Plugin settings](https://code.claude.com/docs/en/plugins-reference)

### Status line and keybindings

| Capability | Configuration |
|---|---|
| Main status line | Settings `statusLine`: `type: "command"`, `command: string`, optional `padding: number`, `refreshInterval: number` in seconds. Command reads session JSON and emits display text. |
| Subagent status line | `subagentStatusLine` command configuration; can be a plugin default. Input/output differ from the main status line. `agentType` input is **post-cutoff v2.1.293**. |
| Keybindings | `~/.claude/keybindings.json`; top-level `$schema`, `$docs`, `bindings[]`; groups contain `context: string`, `bindings: {key-sequence: action-string|null}`. Not a documented plugin component. |

The complete status-line input schema and action/context enum are maintained in their dedicated references; packages cannot simply ship an arbitrary settings fragment and expect these settings to be applied. [Status line](https://code.claude.com/docs/en/statusline), [Keybindings](https://code.claude.com/docs/en/keybindings), [Changelog](https://code.claude.com/docs/en/changelog)

### Claude Mods: JS/TS extension modules

**Shipped v2.1.287 on the cutoff date; early-access API.** Official source type declarations also label the API early access. Later rolling references contain post-cutoff additions. [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview), [Official declarations](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts), [Changelog](https://code.claude.com/docs/en/changelog)

- Requires a plugin manifest; `hooks/hooks.json` declares `modules`, currently one relative module path. Extensions include `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`. Module exports `register(on, options)`. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
- In-process middleware handlers receive the extension API, event, and continuation; event inputs are immutable. This is not ordinary Node/DOM execution. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
- API namespaces include plugin/UI/command/tool/agent/model/prompt/turn/session/config/settings/environment/filesystem/store/state/clock/HTTP/process/MCP/audio/telemetry capabilities. Event families include tool, prompt, command, configuration, turn, session, agent, UI, plugin, engine, telemetry, and classic-hook adapters. Exact exported types should be preserved/pinned from the official declaration rather than flattened into a portable hook enum. [Official declarations](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts)
- Middleware tiers include prepend, user, append, builtin, core; managed controls include `prependPlugins`, `appendPlugins`, `allowManagedModsOnly`, `allowModsToOverrideDenyRules`. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
- Manifest `types` supplies declaration augmentation; plugin `test.ts`/`test.tsx` participates in documented mod testing. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
- `ui.fault`, `prompt.mention`, and tool-registration `isDeferred` are **post-cutoff**, respectively documented in later releases. [Changelog](https://code.claude.com/docs/en/changelog)

Custom model/provider runtime registration is possible in the Mods surface, but a portable declarative provider/model manifest schema is **not documented**. Ordinary model/provider settings are not general-purpose plugin defaults. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference), [Plugin settings](https://code.claude.com/docs/en/plugins-reference)

## Permissions, trust and security

| Surface | Contract / consequence |
|---|---|
| `permissions.allow`, `.ask`, `.deny` | Rule arrays; deny precedes ask, then allow. Rules are not a portable tool-list schema. |
| `permissions.defaultMode` | Permission mode; managed restrictions and launch conditions constrain bypass mode. |
| Skill `allowed-tools` | Temporary permission grants, not tool filtering. |
| Agent `tools` | Availability filtering, not equivalent to permission grants. |
| Plugin settings | Cannot set arbitrary permissions; unsupported plugin settings are dropped. |
| Hook grants | Subject to deny/ask re-evaluation, including modified tool inputs. |
| Mods | Can intercept runtime behavior; explicit managed override controls matter. |

[Permissions](https://code.claude.com/docs/en/permissions), [Skills](https://code.claude.com/docs/en/skills), [Plugin reference](https://code.claude.com/docs/en/plugins-reference), [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)

**Trust differs by execution surface.** Interactive sessions hold settings hooks until workspace trust is accepted—even personal settings hooks. `-p`/SDK sessions do not show the trust dialog and treat settings-hook execution as trusted. MCP project/local header helpers still require their separate exact-directory approval. Plugin installation/enabling warns about executable capabilities; marketplace listing does not establish safety. [Hooks security](https://code.claude.com/docs/en/hooks#security-considerations), [MCP](https://code.claude.com/docs/en/mcp), [Plugin installation](https://code.claude.com/docs/en/discover-plugins)

**Sandboxing is not a plugin sandbox.** Supported OS environments include macOS, Linux, WSL2, not native Windows. Shell/tool sandboxing does not automatically constrain hooks, MCP servers, ordinary file tools, or all extension execution. Review code packages as user-privileged code. [Sandboxing](https://code.claude.com/docs/en/sandboxing), [Hooks security](https://code.claude.com/docs/en/hooks#security-considerations)

### Managed policy controls relevant to packages

| Key | Type / purpose |
|---|---|
| `enabledPlugins` | plugin-ID → boolean; force/disable packages. |
| `strictKnownMarketplaces` | Allowed marketplace source definitions; `allowedMarketplaces` alias. |
| `blockedMarketplaces` | Blocked source definitions; blocking takes precedence. |
| `disableSideloadFlags` | boolean; restrict plugin sideloading flags. |
| `disableCommandPluginSources` | boolean; disable executable source resolvers. |
| `allowManagedHooksOnly` | boolean. |
| `allowManagedPermissionRulesOnly` | boolean. |
| `strictPluginOnlyCustomization` | boolean or array selecting `skills`, `agents`, `hooks`, `mcp`. |
| `syncClaudeAiPlugins` | boolean; account-plugin sync policy. |
| `pluginSuggestionMarketplaces` | Marketplace-selection policy. |
| `pluginTrustMessage` | string; organization trust/install message. |
| `allowedChannelPlugins` | Channel plugin allowlist. |
| `allowManagedModsOnly` | boolean. |
| `allowModsToOverrideDenyRules` | boolean. |
| `prependPlugins`, `appendPlugins` | Middleware tier assignment. |

These are administrator/runtime settings, not powers a plugin grants itself. Other managed settings can restrict models, MCP servers, permissions and bypass behavior. [Organization plugins](https://code.claude.com/docs/en/plugins/org), [Managed settings](https://code.claude.com/docs/en/managed-settings), [Settings reference](https://code.claude.com/docs/en/settings-reference)

Git commit pins and archive SHA-256 checks provide source/integrity constraints. A publisher-signature verification or mandatory signed-plugin provenance schema is **UNKNOWN** in the consulted official documentation. Do not label checksum support “signed plugins.” [Marketplace sources](https://code.claude.com/docs/en/plugin-marketplaces)

## Packaging, install and scopes

### Plugin layout and manifest

`.claude-plugin/plugin.json` is optional for automatic component discovery; when present, `name` is required. Components reside at plugin root—not inside `.claude-plugin/`. [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

| Manifest key | Type / meaning |
|---|---|
| `$schema` | string; schema reference. |
| `name` | required string; stable identifier, reserved-name restrictions. |
| `displayName` | string; human-readable label. |
| `version` | string; plugin version/update identity. |
| `description` | string. |
| `author` | `{name: string, email?: string, url?: string}`. |
| `homepage` | URL string. |
| `repository` | string. |
| `license` | string. |
| `keywords` | string[]. |
| `metadata` | arbitrary object. |
| `icon` | string. |
| `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl` | strings; directory/listing metadata, not execution components. |
| `defaultEnabled` | boolean; documented default `true`. |
| `dependencies` | string[] or `{name: string, version?: string, marketplace?: string}[]`; semver constraints where applicable. |
| `settings` | object; supported plugin defaults only. |
| `userConfig` | option-definition map. |
| `types` | string path; Mods declaration augmentation. |
| `channels` | channel-definition array. |
| `skills` | path or path[]; additional skill roots. |
| `commands` | path, path[], or command-definition map. |
| `agents` | path or path[]; agent components. |
| `hooks` | path, inline configuration, or supported array combination. |
| `mcpServers` | config path, bundle path/HTTPS bundle, inline map, or supported array combination. |
| `lspServers` | JSON path, inline map, or supported array combination. |
| `outputStyles` | path or path[]. |
| `workflows` | path or path[]. |
| `experimental` | object containing `themes`, `monitors`, `evals`. |
| `experimental.themes` | path or path[]. |
| `experimental.monitors` | component path or supported inline monitor definitions. |
| `experimental.evals` | directory path or path[]; first array entry used. |
| Legacy `themes`, `monitors` | Accepted legacy top-level spellings with warnings. |

Unknown top-level keys are stripped with warnings; strict nested component/option schemas can reject unknown keys. Therefore **Claude’s own normalized manifest is not a lossless raw manifest archive**. [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

### Paths and merge semantics

Component paths must start `./`, exist, and remain inside the plugin root. `skills` additionally accepts `.`; MCP components additionally accept HTTPS bundle URLs. Evals have separate directory rules. [Path rules](https://code.claude.com/docs/en/plugins-reference)

| Component | Interaction with default discovery |
|---|---|
| `skills` | Adds to default `skills/`. |
| `commands`, `agents`, `outputStyles`, `workflows`, experimental themes/monitors | Replaces default component discovery. |
| `hooks`, `mcpServers`, `lspServers` | Merges with default files; later MCP/LSP names override earlier definitions. |

Default files include `hooks/hooks.json`, `.mcp.json`, `.lsp.json`; default directories include `commands/`, `skills/`, `agents/`, `output-styles/`, `workflows/`. Referencing files outside the plugin root is not a supported resource-sharing mechanism. [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

### Marketplace schema

File: `.claude-plugin/marketplace.json`; catalogs can also be served remotely or configured inline. [Marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces)

| Catalog field | Type / meaning |
|---|---|
| `$schema` | string. |
| `name` | required string; marketplace identifier. |
| `owner` | required `{name: string, email?: string, url?: string}`. |
| `plugins` | required plugin-entry[]. |
| `description`, `version` | strings. |
| `metadata` | object; documented `description`, `version`, `pluginRoot`. |
| `metadata.pluginRoot` | string; relative source root. |
| `forceRemoveDeletedPlugins` | boolean; removal behavior for deleted entries. |
| `allowCrossMarketplaceDependenciesOn` | string[]; allowed dependency marketplaces. |
| `renames` | old-name → new-name or `null` map. |

| Plugin entry field | Type / meaning |
|---|---|
| `name` | required string. |
| `source` | required relative path or source object. |
| `description`, `version`, `category` | strings. |
| `tags` | string[]. |
| `strict` | boolean; default `true`; controls manifest/catalog combination. |
| `displayName`, `metadata`, `defaultEnabled`, `dependencies` | Corresponding manifest metadata/behavior. |
| Component fields | Corresponding plugin component declarations. |
| `headers` | string→string object for applicable source downloads. |
| `headersHelper` | string helper for applicable downloads. |
| `relevance` | object below. |

`relevance.topic` is a string, maximum 64 characters. `relevance.signals` contains `cwd`, `cli`, `hosts`, `filesRead` string arrays and `manifestDeps: {file: string, pattern: string}[]`, where dependency patterns are regexes. [Plugin relevance](https://code.claude.com/docs/en/plugins/relevance)

With `strict: true`, entry components and plugin-manifest components have documented additive combination, **except hooks replace by event**. With `strict: false`, declaring conflicting components in both places can fail loading. Manifest version wins over entry version; entry `defaultEnabled` wins. [Marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces)

### Plugin source union

| Source | Fields |
|---|---|
| Relative/local path | string; `./…` or path relative to configured `pluginRoot`. |
| `github` | `source`, `repo`, optional `ref`, `sha`. |
| `url` | `source`, Git `url`, optional `ref`, `sha`. |
| `git-subdir` | `source`, `url`, `path`, optional `ref`, `sha`. |
| `npm` | `source`, `package`, optional `version`, `registry`. |
| `archive` | `source`, HTTPS `url`, optional `sha256`. |
| `command` | `source`, `command`, optional `timeout`, `mode`: `copy`/`link`. |

Archive sources are documented before the cutoff; command sources execute code and have distinct trust/policy controls. A generic bare zip path is not equivalent to the documented HTTPS archive source. [Marketplace sources](https://code.claude.com/docs/en/plugin-marketplaces)

Marketplace-source objects are a **different union**:

| Marketplace `source` | Fields / caveat |
|---|---|
| `url` | JSON catalog `url`, optional `headers`, `headersHelper`. |
| `github` | `repo`, optional `ref`, `path`, `sparsePaths`. |
| `git` | `url`, optional `ref`, `path`, `sparsePaths`. |
| `file`, `directory` | `path`. |
| `settings` | Inline `name`, `plugins`, `owner`. |
| `npm` | Parsed but documented as not implemented for marketplace loading. |
| `hostPattern`, `pathPattern`, `skills-dir` | Policy source forms, not ordinary loadable marketplaces. |
| `skipLfs` | Accepted legacy/no-effect field. |

[Marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces), [Organization plugins](https://code.claude.com/docs/en/plugins/org)

### Installation, settings and disk records

Typical mechanics: `claude plugin marketplace add …`, `claude plugin install name@marketplace --scope …`, enable/disable/uninstall/update commands, `/plugin`, and session sideloading through `--plugin-dir`/documented plugin URL support. Sideloaded packages are not ordinary persistent installations. `.claude/plugins/` is **not** a general automatically scanned project plugin directory. Plugins inside documented skill-discovery locations require their manifest and applicable trust handling. [Installation](https://code.claude.com/docs/en/discover-plugins), [Loading](https://code.claude.com/docs/en/plugins/loading)

| Scope / file | Purpose |
|---|---|
| User `~/.claude/settings.json` | Personal activation/settings. |
| Project `.claude/settings.json` | Shared project activation/settings. |
| Local `.claude/settings.local.json` | Private project activation/settings. |
| Managed settings | Organization-controlled policy/activation; not an ordinary user install scope. |
| `enabledPlugins["name@marketplace"]` | boolean activation record. |
| `extraKnownMarketplaces` | name → `{source, autoUpdate?}`; `additionalMarketplaces` alias. |
| `~/.claude/plugins/installed_plugins.json` | Installation registry; scope, install path, version and associated installation records. |
| `~/.claude/plugins/known_marketplaces.json` | Sources, install locations, update timestamps, auto-update state. |
| `~/.claude/plugins/marketplaces/<marketplace>/` | Marketplace checkout/cache. |
| `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` | Cached plugin payload. |
| `~/.claude/plugins/data/<sanitized-plugin-id>/` | Persistent plugin data. |
| `~/.claude/plugins/synced/` | Synced plugin material. |
| `~/.claude/plugins/.trash/` | Deferred cleanup material. |

Other documented internal records cover account marketplaces and flagged plugins; these are implementation records, not public authoring manifests. The complete persisted registry schemas are not established as stable authoring contracts. [Loading](https://code.claude.com/docs/en/plugins/loading), [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

Settings precedence: **managed > explicit CLI settings > local > project > user > additional-directory settings**, with component-specific exceptions. Plugin activation in shared project settings does **not universally imply immediate remote package installation**; source availability, existing installations, seeding and policy matter. [Settings](https://code.claude.com/docs/en/settings), [Loading](https://code.claude.com/docs/en/plugins/loading)

### Versions, updates, dependencies and cache behavior

- Local relative-path marketplace plugins can load **in place**; other source types are copied/cached. Do not assume every installed plugin runs from a versioned cache. [Loading](https://code.claude.com/docs/en/plugins/loading) Superseded for `claude` 2.1.97 by the runtime verification below: a directory marketplace's `./plugins/<name>` plugin is copied into a version-keyed cache on install.
- Version identity uses manifest version first, entry version next, with source-derived fallback where documented—for example short Git commit identity or archive hash. Exact fallback for every local/npm case is **UNKNOWN**. Reusing the same version can prevent expected payload refresh; bump versions for changed releases. [Loading](https://code.claude.com/docs/en/plugins/loading)
- Official marketplace auto-updates default on; other marketplace auto-updates require configuration. Updating a marketplace and refreshing plugin payloads are related but distinct operations. [Installation/update](https://code.claude.com/docs/en/discover-plugins)
- Persistent plugin data survives version updates; the final uninstall removes it unless retention is requested. [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Dependencies install/enable transitively in the applicable scope. Cross-marketplace resolution is constrained by the root marketplace allowlist across the dependency chain, with documented exceptions for already-enabled dependencies. Semver Git resolution selects compatible tags; inline/local sources do not provide identical constraint enforcement. [Dependencies](https://code.claude.com/docs/en/plugins/dependencies)
- Eligible plugin Node dependencies can be installed from `package.json` with supported lockfiles: `bun.lock`, `npm-shrinkwrap.json`, `package-lock.json`. Installation uses frozen/registry-constrained behavior and disables lifecycle scripts; unsupported override/patch/lockfile mechanisms do not silently acquire equivalent support. In-place source packages have different installation handling. [Loading: dependencies](https://code.claude.com/docs/en/plugins/loading)

## Notable gaps and ambiguities

- **Historical certainty:** retrieved official rolling docs contain post-2026-10-01 releases. Explicit later fields are marked above; unversioned behavior’s exact availability in v2.1.287 is **UNKNOWN**. No pinned v2.1.287 schema/doc snapshot was established. [Changelog](https://code.claude.com/docs/en/changelog)
- **Exhaustiveness boundary:** manifest, skill, agent, MCP, LSP and option authoring fields are inventoried above. A complete pinned inventory of Mods API members, workflow runtime fields, eval case schemas, status-line payload variants, keybinding action/context enums, hook nested MCP metadata, and all theme tokens was **not established**. The theme reference explicitly omits some tokens. [Mods declarations](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts), [Hooks](https://code.claude.com/docs/en/hooks), [Terminal configuration](https://code.claude.com/docs/en/terminal-config)
- **MCP omissions:** `cwd`, `envFile`, and per-server enabled/disabled tool lists are **UNKNOWN**, not inferred from other MCP clients’ schemas. [MCP](https://code.claude.com/docs/en/mcp)
- **Signatures:** checksum/commit integrity is documented; publisher-signature verification is **UNKNOWN**. [Marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces)
- **Lossless round trips:** preserve raw manifests/frontmatter, source modules, bundled files, spelling variants and unknown fields before normalization. Claude strips some unknown fields, rejects others, and ignores some accepted agent/plugin settings; reserializing its effective configuration cannot reconstruct the original package. [Plugin reference](https://code.claude.com/docs/en/plugins-reference), [Subagents](https://code.claude.com/docs/en/sub-agents)
- **Canonical-model hazards:** permission grants versus tool availability; CLI agent fields versus ignored plugin-agent fields; command/frontmatter spelling differences; session-lived skill hooks; event-specific decision contracts; replacement versus additive component paths; catalog sources versus plugin sources; and in-place versus cached installs require separate meanings, not shared fields with contradictory semantics. Sources are cited in the corresponding sections.
- **Verification:** the sections above are documentation/source research only. Plugin and marketplace CLI mechanics, caching and the plugin MCP working directory were later run against `claude` 2.1.97; see the runtime verification section below.

## Runtime verification (claude 2.1.97, 2026-10-08)

Scope: tasks 5.1 and 5.2 of `openspec/changes/plugin-interop-foundation`. Every result below comes from `research/plugin-interop/tools/claude-spike.sh`, which runs the installed `claude` 2.1.97 (`~/.local/bin/claude`) with a throwaway `HOME` and `CLAUDE_CONFIG_DIR` under `/tmp/claude-spike.*`, an empty environment (`env -i`), `DISABLE_AUTOUPDATER=1`, `DISABLE_TELEMETRY=1` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, no credentials and no model session. It checks that the real `~/.claude/plugins` tree and `~/.claude/settings.json` are unchanged. Transcripts (argv, exit code, stdout, stderr) are replayable as fake-CLI fixtures in `apps/caplet/tests/fixtures/claude-cli/`; step names below (`core/06`) refer to the script's transcript names. Test layout: a directory marketplace `.claude-plugin/marketplace.json` listing plugins by `"source": "./plugins/<name>"`, each plugin with one skill and a stdio MCP probe that logs its `process.cwd()` and argv.

Evidence levels: **verified** = observed in a transcript or file snapshot of this run; **static** = read from strings in the 2.1.97 binary, not exercised; **UNKNOWN** = not established.

### CLI surface (verified, `claude plugin <cmd> --help`)

| Command | Flags |
|---|---|
| `plugin marketplace add <source>` | `--scope user\|project\|local` (default user), `--sparse <paths...>` |
| `plugin marketplace list` | `--json` |
| `plugin marketplace remove\|rm <name>` | none (no `--scope`) |
| `plugin marketplace update [name]` | none; all marketplaces without a name |
| `plugin install\|i <plugin>` | `-s, --scope user\|project\|local` (default user) |
| `plugin uninstall\|remove <plugin>` | `-s, --scope user\|project\|local` (default user), `--keep-data` |
| `plugin update <plugin>` | `-s, --scope user\|project\|local\|managed` (default user) |
| `plugin enable <plugin>` | `-s, --scope user\|project\|local` (default auto-detect) |
| `plugin disable [plugin]` | `-s, --scope ...` (default auto-detect), `-a, --all` |
| `plugin list` | `--json`, `--available` (requires `--json`) |
| `plugin validate <path>` | none; accepts a plugin or marketplace directory |

`--scope managed` is rejected by `marketplace add` and `install` with exit 1 (`failures/02`, `failures/14`). All successes exit 0 and print to stdout; all failures seen exit 1 and print one `✘ ...` line to stderr. Text output uses `✔`/`✘` glyphs; caplet should key on exit codes and `--json`, not on text.

### JSON shapes (verified)

- `plugin marketplace list --json` (`core/04`): array of `{name, source: "directory", path, installLocation}`. No scope field; one entry per name.
- `plugin list --json` (`core/07`, `project/05`): array of `{id: "<plugin>@<marketplace>", version, scope: "user"|"project"|"local", enabled, installPath, installedAt, lastUpdated, projectPath?, mcpServers?}`. `projectPath` (absolute) appears for project and local installs. `mcpServers` echoes the plugin's servers without a `cwd` key. Empty: `[]`.
- `plugin list --json --available` (`core/05`): object `{installed: [...], available: [{pluginId, name, description, marketplaceName, source}]}`.

### Files Claude writes (verified, file snapshots)

| Action | Files written |
|---|---|
| `marketplace add <dir> --scope user` | `~/.claude/settings.json` `extraKnownMarketplaces.<name> = {source: {source: "directory", path: <absolute dir>}}`; `~/.claude/plugins/known_marketplaces.json` `<name> = {source, installLocation: <the dir itself>, lastUpdated}`. The directory is not copied. |
| `marketplace add <dir> --scope project` | Same record in `<project>/.claude/settings.json`, plus the user-level `known_marketplaces.json` entry. |
| `marketplace add <dir> --scope local` | Same record in `<project>/.claude/settings.local.json`, plus `known_marketplaces.json`. |
| `install p@m --scope user` | `~/.claude/settings.json` `enabledPlugins["p@m"] = true`; `~/.claude/plugins/installed_plugins.json` `{version: 2, plugins: {"p@m": [{scope, installPath, version, installedAt, lastUpdated, projectPath?}]}}`; payload copy in `~/.claude/plugins/cache/<m>/<p>/<version>/`. |
| `install --scope project` | `enabledPlugins` in `<project>/.claude/settings.json`; install record (with `projectPath`) and cache under `~/.claude`. |
| `install --scope local` | `enabledPlugins` in `<project>/.claude/settings.local.json`; Claude also appends `**/.claude/settings.local.json` to the user's global git ignore (`$XDG_CONFIG_HOME/git/ignore`, normally `~/.config/git/ignore`). |
| `disable` / `enable` | Only `enabledPlugins["p@m"] = false/true` in the scope's settings file; install record and cache unchanged. |
| `uninstall` | Removes the `installed_plugins.json` record and the `enabledPlugins` key; cache directories stay with an `.orphaned_at` marker. |
| `marketplace remove <name>` | Removes `<name>` from `known_marketplaces.json` and from `extraKnownMarketplaces` in every scope's settings, and uninstalls that marketplace's plugins in every scope (`names/12`, `names/13`). Leaves empty `{"enabledPlugins": {}, "extraKnownMarketplaces": {}}` objects behind in settings files. |

Any CLI run also creates `~/.claude/.claude.json` and a backup; `install` fetched `~/.claude/plugins/install-counts-cache.json` (official-marketplace install counts) over the network despite `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.

### Facts and answers to the design's open technical questions

| Question | Answer | Evidence | Level |
|---|---|---|---|
| In-place loading or version cache | Copied. `install` copies the plugin into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, with `+` in the version replaced by `-` (`1.0.0+acf.aaa` -> `1.0.0-acf.aaa`); `installPath` and spawned servers use the copy. The docs' "local relative-path plugins load in place" does not hold for a directory marketplace. | `core/06`, `core/07`, `core/50` | verified |
| Content change, same version, `plugin update` | Not picked up: "already at the latest version", cache keeps old content, also after `marketplace update`. | `core/10`, `core/12` | verified |
| Content change, same version, `plugin install` again | Exit 0 and the same version's cache directory is refreshed with the new content; `uninstall` + `install` also refreshes. `install` re-enables a plugin the user disabled. | `core/13`, `core/15`, `core/69b`, `core/69c` | verified |
| Build metadata only (`1.0.0+acf.aaa` -> `1.0.0+acf.bbb`) | Picked up by `plugin update` alone (no `marketplace update` needed): new cache directory, new content, `version` updated. | `core/20`, `core/23` | verified |
| Base version change | Picked up by `plugin update`. | `core/31` | verified |
| Non-SemVer version (`banana`) | Accepted by `validate`, `update` and the cache (`cache/.../banana`). | `core/40`, `core/42`, `core/43` | verified |
| Old cache directories | Kept with `.orphaned_at` after update or uninstall; cleanup timing UNKNOWN. | snapshots after `core/42`, `core/70` | verified (cleanup UNKNOWN) |
| Directory marketplace refresh | `plugin update` reads the directory directly; `marketplace update` is not required for version or content pickup. An invalid `marketplace.json` makes `marketplace update` and `install` fail with exit 1. | `core/20`, `failures/15`, `failures/16` | verified |
| Are marketplace names global | Yes, per user. `known_marketplaces.json` holds one record per name. Adding another directory under an existing name at any scope silently replaces the on-disk record (exit 0), while each scope's settings keeps the path it was given, so user, project and local settings can disagree (`names/11`: user settings -> B, project -> A, local -> B, known -> A, the last added). Re-adding an existing name prints "already on disk — declared in <scope> settings" with exit 0. | `names/01`-`names/11` | verified |
| Update/uninstall scope | `update` and `uninstall` default to `user`; a project-scope plugin needs `--scope project` (`not installed at scope user`, exit 1); uninstall at the wrong scope names the right one. | `project/08`, `project/09`, `project/31` | verified |
| Native disable | `disable --scope <s>` writes `enabledPlugins[id] = false` in that scope's settings; `list --json` keeps the entry with `enabled: false`; `mcp list` no longer starts its servers; `update` still updates it and it stays disabled; disabling twice exits 1 ("already disabled"). | `core/60`-`core/66` | verified |
| Local disable of a project plugin | `disable --scope local` writes `false` to `settings.local.json`. `list --json` shows one entry, `scope: "project"`, `enabled: false`; the local origin is visible only in `settings.local.json`. | `project/06`, `project/07` | verified |
| enable/disable of a plugin that is not installed | Exit 0 and writes `enabledPlugins[id]` anyway. | `failures/09`, `failures/10` | verified |
| Unknown plugin or marketplace | `install` exits 1 with `Plugin "<p>" not found in marketplace "<m>"` for both an unknown plugin and an unknown marketplace. `uninstall`/`update` of a plugin that is not installed exit 1. `marketplace remove`/`update` of an unknown name exit 1. `marketplace add` of a missing path exits 1 (`Path does not exist`). `install <p>` without `@<m>` resolves through known marketplaces. | `failures/01`-`failures/13` | verified |
| Policy block output | Not inducible without root: `strictKnownMarketplaces`/`blockedMarketplaces` are read only from policy settings (`/etc/claude-code/managed-settings.json` or `managed-settings.d/`, or remote managed settings for authenticated team/enterprise accounts). In user settings they are ignored (`policy/01` adds the blocked marketplace, exit 0). `CLAUDE_CODE_REMOTE_SETTINGS_PATH` is compiled out (`Cn()` returns undefined), so `policy/03`/`policy/04` are not blocked either. Exit code and exact output UNKNOWN. Message templates in the binary: `Marketplace source '<src>' is blocked by enterprise policy.`, `Marketplace '<m>' is blocked by enterprise policy`, `Marketplace '<m>' is not in the allowed marketplace list`, `Plugin "<p>" is blocked by your organization's policy and cannot be installed`. | `policy/*`, binary strings | UNKNOWN (templates static) |
| Plugin stdio MCP working directory (D22) | Claude's own process working directory: the directory `claude` was started in, not the plugin root and not the git root (started from `<project>/sub`, servers ran in `<project>/sub`). Same for the `mcp list` health check and for session start (`claude -p` without credentials starts plugin servers before failing with "Not logged in"). | `core/50`, `session/03`, `session/04` and the spawn logs | verified |
| `cwd` key in a plugin `.mcp.json` server | Ignored: servers with `cwd: "${CLAUDE_PLUGIN_ROOT}"` and with an absolute `cwd` both ran in the launch directory, and `list --json` drops the key. A relative argument (`node ./server.js`) fails to connect. | `core/50`, `core/07` | verified |
| `${CLAUDE_PLUGIN_ROOT}` expansion | Expanded in `command` and `args` to the cache directory of the installed version. Servers receive `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` (`~/.claude/plugins/data/<plugin>-<marketplace>`) in their environment, not `CLAUDE_PROJECT_DIR`. | spawn logs | verified |
| Content update visible in a new session | Subsequent processes start servers from the new version's cache directory (`core/50` after the `banana` update). That a new model session loads the changed skill body needs an authenticated session. | `core/50` | verified for MCP; UNKNOWN for skills |

### Project-scope registration (task 5.2, open question 7)

- `claude plugin marketplace add ./.claude/.acf/marketplace --scope project` run from the project root writes the **absolute, machine-specific** path into the committed `<project>/.claude/settings.json` (`project/01`); passing the absolute path gives the same record (`project/10`):

  ```json
  {"extraKnownMarketplaces": {"acf-project-spike": {"source": {"source": "directory", "path": "/tmp/claude-spike.<id>/project/project/.claude/.acf/marketplace"}}}}
  ```

  It also records the marketplace in the user-level `~/.claude/plugins/known_marketplaces.json` (absolute `installLocation`).
- `install --scope project` adds `"enabledPlugins": {"probe@acf-project-spike": true}` to the committed `.claude/settings.json`; the install record (`installed_plugins.json`, with absolute `projectPath`) and the cache are user-level (`project/03`).
- `install --scope local` and `disable --scope local` write only `.claude/settings.local.json` `enabledPlugins`, and add `**/.claude/settings.local.json` to the user's global git ignore (`project/04`, `project/06`).
- A teammate who clones the project (committed `settings.json` only, fresh home) sees nothing through the CLI: `marketplace list --json` and `list --json` return `[]`, `list --json --available` lists nothing, and `install probe@acf-project-spike --scope project` exits 1 with `Plugin "probe" not found in marketplace "acf-project-spike"` (`project/20`-`project/24`). Whether the interactive trust flow would offer to add the project-declared marketplace is UNKNOWN (needs an interactive session).
- Uninstalling everything and removing the marketplace leaves `{"enabledPlugins": {}, "extraKnownMarketplaces": {}}` in the committed file (`project/33`).

Consequence for open question 7: Claude records a machine-specific absolute path in a committed file, so under `claude-plugin-output` "Scope mapping" default project registration stays off and project host state is `registration required` until the user answers the team-sharing question.

### Implications for the plugin interop change

- `+acf.<digest>` versions (D8) are required and sufficient: `claude plugin update <p>@<m> --scope <s>` picks up a build-metadata-only change, while a content change under an unchanged version is ignored by `update`.
- The `claude-plugin-output` rule that an unchanged foreign Claude plugin keeps its declared `version` and is refreshed with "the update command" does not work: `update` skips same-version content. `install` refreshes it but re-enables a plugin the user disabled (conflicts with D15), so a disabled plugin can only be refreshed by `install` followed by `disable`, or not at all.
- Read host state from `plugin list --json`, but a local-scope disable of a project plugin appears only as `enabled: false` on the project entry; telling `disabled by user (local scope)` apart needs `.claude/settings.local.json` (read only).
- `marketplace list --json` has no scope, and `marketplace add` is idempotent (exit 0), so "when the marketplace is not yet known for that scope" is cheapest as an unconditional `add`.
- Marketplace names are per-user global: the project marketplace name must differ from `acf-user` and between projects, otherwise one registration silently repoints the other.
- `marketplace remove` uninstalls every plugin of that marketplace in every scope; remove the caplet marketplace only when it has no desired plugins.
- D22: Claude starts plugin stdio servers in the directory `claude` was launched from and ignores `cwd`, so Claude cannot honor an explicit working directory; under D22 a server with `cwd: ${ACF_CAPABILITY_DIR}` (every Agent Plugins stdio server read with D22's default) is refused for Claude. Paths in `command` and `args` can use `${CLAUDE_PLUGIN_ROOT}`.

### Not established

- Policy-block exit code and output at runtime (needs root for `/etc/claude-code/managed-settings.json` or an authenticated managed account).
- Skill body reload in a model session after update, and the interactive trust prompt for project-declared marketplaces (need an authenticated interactive session).
- When Claude deletes `.orphaned_at` cache directories.
- Whether `cwd` is honored for non-plugin (project `.mcp.json` or `claude mcp add`) servers; only plugin servers were probed.
