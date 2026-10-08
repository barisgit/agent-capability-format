# GitHub Copilot (CLI, app, coding agent) - capability inventory (snapshot 2026-10-01)

Research snapshot: **2026-10-01**. Sources are GitHub’s rolling, unversioned documentation unless a schema version is specified; publication dates and exact CLI versions are **UNKNOWN**. “Documented” below means available in current documentation, not independently runtime-tested. Explicit experimental/preview/announced statuses are identified.

Source abbreviations, used as citations throughout:

- [P — CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
- [C — CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- [D — CLI configuration directory/settings](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)
- [H — Hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [A — Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [S — Adding skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [I — CLI custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
- [M — CLI MCP configuration](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [G — Cloud agent/repository MCP configuration](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers)
- [B — About plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)
- [App — App customization](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app), retrieved through an explicitly identified **2026-09-27 Internet Archive snapshot**; current direct retrieval failed.
- [Canvas — App canvas extensions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions)

“Coding agent” is called **Copilot cloud agent** in these current sources.

## Skills

**Documented:** CLI, app, cloud agent, code review; also supported IDE agent modes. Skills are instruction/script/resource directories, loaded when relevant. [S; [skills overview](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)]

### Files and fields

Exact entry filename: `SKILL.md`, with YAML frontmatter and Markdown instructions. Arbitrary supplementary files and subdirectories can accompany it; scripts, references, examples, and assets are not separately declared in a manifest. Copilot automatically discovers the skill directory’s files when the skill is invoked. [S]

| Field | Type | Meaning / documented variation |
|---|---|---|
| `name` | string, required | CLI: starts with letter or number; remaining characters may include letters, numbers, hyphens, underscores, periods, colons, spaces; maximum 64 characters. General authoring guide instead prescribes lowercase names with hyphens. |
| `description` | string, required | Purpose and selection conditions; CLI maximum 1,024 characters. |
| `license` | string, optional | Skill license description; documented by general skill guide, omitted from CLI’s field table. |
| `argument-hint` | string, optional | CLI picker hint for expected arguments. |
| `allowed-tools` | string or string[], optional | CLI comma-separated string or YAML array; automatically approves listed tools while active. `"*"` allows all. General guide demonstrates scalar `shell`. |
| `user-invocable` | boolean, optional | CLI: enables `/SKILL-NAME`; default `true`. |
| `disable-model-invocation` | boolean, optional | CLI: prevents automatic model invocation; default `false`. |

Sources: [C, Skills reference; S]. Acceptance/behavior of other Agent Skills standard metadata, including `compatibility` and `metadata`, is **UNKNOWN** from the Copilot-specific field tables inspected. [C; S]

### Discovery and precedence

CLI first-found-wins by **frontmatter `name`**, not directory name:

1. Project `.github/skills/`.
2. Project `.agents/skills/`.
3. Project `.claude/skills/`.
4. Inherited parent skill locations.
5. Personal `~/.copilot/skills/`.
6. Personal `~/.agents/skills/`.
7. Enabled plugin skills.
8. Custom directories from comma-separated `COPILOT_SKILLS_DIRS`; `skillDirectories: string[]` also adds locations.
9. Added-root `.github/skills/` from `--add-dir`, `/add-dir`, SDK `additionalDirectories`.
10. CLI-bundled skills.
11. Remote organization/enterprise skills projected through AHP, fetched on invocation.

The command reference lists these sources in priority order; the plugin reference has a shorter, older-looking diagram. Exact placement of `skillDirectories` relative to environment-provided custom directories is **UNKNOWN**. [C, Skill locations; P, Loading order; D]

`ignoredSkillsLocations: string[]` excludes directories and descendants; accepts home-relative paths. `disabledSkills: string[]` disables named discovered skills. `COPILOT_HOME` replaces the default personal configuration root. [C; D]

**Plugin collision exception:** two plugins’ same-name skills coexist as `/plugin-name/skill-name`; bare invocation selects the higher-priority plugin. Do not model this as unconditional destructive name deduplication. [C, Skill locations]

Agent Plugins skills must be immediate `skills/NAME/SKILL.md` children. No root `SKILL.md` fallback. Legacy plugins allow configured skill directories and fall back to root `SKILL.md` only when `skills/` does not exist. [P]

### Invocation, installation, metadata

- Model invocation injects the skill into the conversation; user invocation uses `/SKILL-NAME`, subject to the two invocation booleans. [C]
- App automatically exposes skills configured for repositories or CLI; app-specific collision precedence is **UNKNOWN**. [App]
- `copilot skill add FILE_OR_URL` copies content to personal skills; `--project` copies to `.github/skills`. Adding a **directory registers the directory**, rather than copying it. File/URL installation should not be assumed to preserve a multi-file bundle. [C]
- `copilot skill remove NAME` deletes eligible personal/project skill files; removing a registered directory unregisters it without deleting its files. Plugin/built-in skills must be disabled or managed through their owning package. [C]
- `gh skill` is **public preview**, requires GitHub CLI **2.90.0+**, supports skill installation pinned with `@TAG` or `@SHA`; GitHub explicitly says skills are not verified. [S]
- Copilot-specific supplementary skill metadata files: **UNKNOWN**; none required by these authoring references. [S; C]

## Instructions and rules

### Files, activation, fields

| File/location | Activation and meaning |
|---|---|
| `~/.copilot/copilot-instructions.md` | Personal, all sessions. |
| `~/.copilot/instructions/**/*.instructions.md` | Modular personal instructions; path applicability follows `applyTo`. |
| `.github/copilot-instructions.md` | Repository-wide Markdown instructions. |
| `.github/instructions/**/*.instructions.md` | File/glob-scoped instructions. |
| `AGENTS.md` | Agent instructions, including nested locations. |
| `CLAUDE.md`, `.claude/CLAUDE.md` | Cross-tool instruction compatibility. |
| `GEMINI.md` | Cross-tool instruction compatibility. |
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` | Comma-separated additional directories containing `AGENTS.md` and `*.instructions.md`. |
| Agent Plugins `com.github.copilot/rules/` | Client-specific plugin rules directory; rule file schema and activation semantics **UNKNOWN**. |

Sources: [I; P]

Standard CLI discovery locations: repository root, working directory, intermediate directories between them, and directories nested along a file being worked on. Modular repository instruction discovery excludes intermediate directories. [I]

| Frontmatter field | Type | Meaning |
|---|---|---|
| `applyTo` | string | Glob or comma-separated globs selecting files, e.g. `**/*.ts,**/*.tsx`. |
| `excludeAgent` | string | `"code-review"` or `"cloud-agent"` excludes that surface; absence allows both. |

[I]

Plain instruction files have no documented required frontmatter. Multiple applicable files are **combined**, with identical copies deduplicated; CLI explicitly documents **no general conflict precedence**. Thus “nearest always wins” would be incorrect for CLI instructions. `/instructions` exposes discovery and file enable/disable. [I]

### Includes and surface differences

`@relative/path` includes are read immediately and recursively in `.github/copilot-instructions.md`, `AGENTS.md`, and `CLAUDE.md`. Paths must remain inside the repository/custom instruction directory. Absolute paths and `~/` paths are not loaded. Includes are **not expanded** in `GEMINI.md` or `*.instructions.md`. [I]

CLI changes require restarting/resuming or a new session to take effect. [I]

App has global “App instructions” in Settings → Sessions and repository-specific Instructions in Settings → Projects. Their serialized paths, frontmatter, precedence against repository files, and export contract are **UNKNOWN**. [App]

Custom subagents do not receive repository instructions by default; `include-custom-instructions: true` opts in. Directly selected agents already follow them. [C; [CLI agent creation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)]

Native `.mdc` parsing, Cursor activation flags, steering-file schemas, model-decided rule activation, and manually invoked rule types: **UNKNOWN**. A documented `rules/` directory is insufficient evidence of Cursor-rule compatibility. [P; I]

## Subagents and custom agents

### Files and scopes

`.agent.md` is the recommended extension; CLI also recognizes `.md`. CLI IDs derive from relative paths: `agents/team/reviewer.agent.md` → `team--reviewer`; `name` is a display/selection alias, not the deduplication key. [C]

CLI precedence, highest first:

1. `~/.copilot/agents/`.
2. Project `.github/agents/`, working directory upward to Git root.
3. Project `.claude/agents/`, working directory upward to Git root.
4. Added-root `.github/agents/`.
5. Plugin agents: legacy configured/default `agents/`; Agent Plugins `com.github.copilot/agents/`.
6. Remote organization/enterprise agents.

Deepest directory wins within a project row; **all GitHub-location agents precede all Claude-location agents**. Personal agents beat project agents, unlike skill precedence. Built-in agents cannot be overridden. [C; P]

Cloud-agent repository profiles override organization profiles, which override enterprise profiles. Profile versioning uses Git commit SHAs; PR interactions retain the agent version used when the PR was created. [A]

### Frontmatter union, preserving surface differences

| Field | Type | Meaning / availability |
|---|---|---|
| `name` | string | Optional display name; CLI defaults to ID. |
| `description` | string, required | Purpose/capabilities; selection and delegation description. |
| `target` | string | `"vscode"` or `"github-copilot"`; unset means both. General agent reference. |
| `tools` | string[] or comma-separated string | General reference allows both; CLI table specifies string[]. Omitted/`["*"]` enables all; `[]` disables all. |
| `model` | string | Selected model; normally inherits parent/default when omitted. |
| `models` | string[] | CLI ordered candidate list; overrides `model`; first accessible candidate chosen. |
| `modelPolicy` | string | CLI `"preferred"` default or `"required"`; required prevents unauthored substitutions/overrides. |
| `reasoningEffort` | string | CLI authored effort, e.g. `"low"`, `"medium"`, `"high"`; inherits if absent. |
| `include-custom-instructions` | boolean | CLI subagent repository-instruction opt-in; default `false`. |
| `disable-model-invocation` | boolean | General/cloud reference: prevents automatic selection; default `false`; takes precedence over `infer`. |
| `user-invocable` | boolean | General/cloud reference: allows user selection; default `true`. |
| `infer` | boolean | General reference marks **retired**; inverse of `disable-model-invocation`. CLI still documents it as automatic delegation control, default `true`. |
| `mcp-servers` | object | Agent-specific MCP configurations; not used by IDE custom agents. |
| `metadata` | map<string,string> | Arbitrary annotations; not used by IDE custom agents. |

Sources: [A; C]

Markdown prompt maximum **30,000 characters** in general reference. `argument-hint` and `handoffs` from IDE agent formats are explicitly ignored by cloud agent. Permissions/frontmatter `color`, `permissionMode`, and maximum-turn fields: **UNKNOWN**, not in inspected Copilot tables. [A]

CLI model/effort priority: explicit call → user `subagents` override → authored frontmatter → parent. Unsupported preferred model/effort falls back; required model policy refuses dispatch. When the session uses server-selected Auto, CLI documentation says subagents inherit the resolved session model regardless of `model`. [C]

Tool aliases are case-insensitive:

| Primary | Accepted aliases |
|---|---|
| `execute` | `shell`, `Bash`, `powershell` |
| `read` | `Read`, `NotebookRead` |
| `edit` | `Edit`, `MultiEdit`, `Write`, `NotebookEdit` |
| `search` | `Grep`, `Glob` |
| `agent` | `custom-agent`, `Task` |
| `web` | `WebSearch`, `WebFetch` |
| `todo` | `TodoWrite` |

Unknown tool names are ignored. MCP selectors support `server/tool` and `server/*`. `web` and `todo` aliases currently have no cloud-agent mapping. [A]

Invocation: `/agent` picker, explicit natural-language request, inference, `copilot --agent ID_OR_NAME --prompt ...`; delegation uses independent-context subagents. App supports picker and `/agent`. [C; App; [CLI agent creation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)]

Custom agents are **public preview in JetBrains, Eclipse, and Xcode**; the same reference does not label CLI/cloud agents experimental. [A]

## Commands and prompts

### CLI commands as an alternative skill format

Exact loose-file layout: `.claude/commands/NAME.md`. Name derives from filename; no required `name`. Supported frontmatter: [C]

| Field | Type | Meaning |
|---|---|---|
| `description` | string | Description. |
| `argument-hint` | string | Picker argument hint. |
| `allowed-tools` | string or string[] | Skill-style automatic tool approval. |
| `disable-model-invocation` | boolean | Prevent automatic invocation. |

`user-invocable` is **not listed** for command files. Commands have lower priority than same-name skills; same-name plugin commands retain normal priority-based deduplication rather than qualified coexistence. [C]

Agent Plugins commands live in `com.github.copilot/commands/`; legacy manifest `commands` accepts string or string[] directory paths. Exact plugin-command extension/schema beyond the loose command format is **UNKNOWN**. [P; C]

Commands are documented as an **alternative skill format**, not announced as removed or universally migrated into skills. [C]

Argument binding syntax, `$ARGUMENTS`, `$1`, `${input:...}`, file interpolation, `!` shell interpolation, command-level `model`, and tool overrides beyond `allowed-tools`: **UNKNOWN** for CLI from these references. Do not infer Claude syntax support from `.claude/commands` discovery. [C]

### IDE prompt files

`.github/prompts/*.prompt.md` is the reusable prompt-file convention; prompt files are **public preview**, and GitHub explicitly limits them to VS Code, Visual Studio, and JetBrains. They are not documented as a CLI/app/cloud-agent portable component. Detailed IDE-specific frontmatter and interpolation are outside the inspected CLI/app/cloud contract and **UNKNOWN** here. [[prompt files](https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files); [customization cheat sheet](https://docs.github.com/en/copilot/reference/customization-cheat-sheet)]

## Hooks

**Documented:** CLI and cloud agent. App plugins may contain hooks, but app-specific event/payload differences are **UNKNOWN**. [H; App]

### Configuration and scopes

File envelope: `{ "version": 1, "hooks": { EVENT: [HANDLER, ...] } }`; optional top-level `disableAllHooks: boolean` disables hooks in that file. Settings have inline `hooks` and `disableAllHooks`. [H]

CLI combines sources in documented order **policy → user → project → plugins**, executing all same-event entries:

- Policy: `/etc/github-copilot/policy.d/*.json`; Windows `C:\ProgramData\GitHub\Copilot\policy.d\*.json`; Windows registry `HKLM\Software\Policies\GitHub\Copilot` subkeys containing `Policy` JSON strings.
- User `$COPILOT_HOME/hooks/*.json`, default `~/.copilot/hooks/*.json`; inline `~/.copilot/settings.json`.
- Project `.github/hooks/*.json`; inline `.github/copilot/settings.json`, `.github/copilot/settings.local.json`; compatibility `.claude/settings.json`, `.claude/settings.local.json`.
- Legacy plugin `hooks.json` or `hooks/hooks.json`, configured path or inline block.
- Agent Plugins `com.github.copilot/hooks/hooks.json`.

Policy files load alphabetically and cannot be disabled by `disableAllHooks`. Cloud-agent default discovery is repository `.github/hooks/*.json`; plugin activation is documented elsewhere, but exact cloud merging with plugin hooks is not reconciled. [H; P; B]

Directory-loaded malformed items are dropped individually; malformed JSON, invalid version, or non-array event lists reject the file. Inline settings hook validation is stricter: one invalid item rejects the whole hooks field. [H]

### Handler fields

| Field | Type | Meaning |
|---|---|---|
| `type` | `"command"` | Default if omitted. |
| `bash` | string | Unix shell command. |
| `powershell` | string | Windows shell command. |
| `command` | string | Cross-platform fallback; explicit platform fields win. |
| `exec` | string | CLI-only executable without shell; mutually exclusive with shell command fields. |
| `args` | string[] | CLI-only direct-executable arguments. |
| `cwd` | string | Absolute or repository-root-relative working directory. |
| `env` | object | Environment variables; expansion supported, exact complete grammar **UNKNOWN**. |
| `timeoutSec` | number | Seconds; default 30. |
| `timeout` | number | Seconds alias; `timeoutSec` wins. |
| `matcher` | string | Event-specific filter. |

Command payload arrives as JSON input; stdout contains final JSON output. Command and HTTP hook output is capped at **10 MiB**. Individual single-line `{"type":"progress", ...}` objects are removed from the decision stream and displayed; remaining output is parsed as **one JSON document**, not JSONL. [H]

HTTP fields: `type: "http"`, required `url: string`, optional `headers: object`, `allowedEnvVars: string[]`, `timeoutSec`, `timeout`, and event matcher. Sends JSON POST; response JSON is the hook output. HTTPS required by default; localhost HTTP exceptions require `COPILOT_HOOK_ALLOW_LOCALHOST=1`. Permission-affecting HTTP hooks require HTTPS. `allowedEnvVars` limits header expansion. [H]

Prompt fields: `type: "prompt"`, `prompt: string`. Supported only at `sessionStart`, auto-submits text or a slash command in **new interactive CLI sessions**, not resume or `-p`. This is **not an LLM-evaluated permission hook**. Cloud behavior is explicitly uncertain in the docs (“may not fire”). Script-module handlers are **not documented** as config-file handler types. [H]

### Complete lifecycle inventory and payloads

All native inputs contain `sessionId: string`, `timestamp: number` in epoch milliseconds, `cwd: string`. Additional fields below retain exact spelling. [H]

| Event / compatible spelling | Meaning; additional input |
|---|---|
| `sessionStart` / `SessionStart` | Start/resume/new; `source: "startup" \| "resume" \| "new"`, `initialPrompt?: string`. |
| `sessionEnd` / `SessionEnd` | Termination; `reason: "complete" \| "error" \| "abort" \| "timeout" \| "user_exit"`. |
| `userPromptSubmitted` / `UserPromptSubmit` | Prompt submission; `prompt: string`. |
| `userPromptTransformed` | Before model-facing transformed content is emitted/persisted; `prompt: string`, `transformedPrompt: string`. |
| `preToolUse` / `PreToolUse` | Before execution; `toolName: string`, `toolArgs: unknown`. |
| `postToolUse` / `PostToolUse` | After success; `toolName`, `toolArgs`, `toolResult: { resultType: "success", textResultForLlm: string }`. |
| `postToolUseFailure` / `PostToolUseFailure` | After failure; `toolName`, `toolArgs`, `error: string`. |
| `agentStop` / `Stop` | Main turn completes; `transcriptPath: string`, `stopReason: "end_turn"`, `stop_hook_active: boolean`. |
| `subagentStart` | Before spawn; `transcriptPath`, `agentName: string`, `agentDisplayName?: string`, `agentDescription?: string`. |
| `subagentStop` / `SubagentStop` | Before returning full response; `transcriptPath`, `agentId`, `agentType`, `agentName`, `agentDisplayName?`, `response: string`, `stopReason: "end_turn"`. |
| `errorOccurred` / `ErrorOccurred` | Execution error; `error: { message: string, name: string, stack?: string }`, `errorContext: "model_call" \| "tool_execution" \| "system" \| "user_input"`, `recoverable: boolean`. |
| `preCompact` / `PreCompact` | Before compaction; `transcriptPath`, `trigger: "manual" \| "auto"`, `customInstructions: string`. |
| `permissionRequest` / `PermissionRequest` | Before permission rules/approvals/prompting; documentation references `toolName` and `toolInput`, including `requestSandboxBypass`; complete typed payload **UNKNOWN**. |
| `notification` | Asynchronous notification; `hook_event_name: "Notification"`, `message: string`, `title?: string`, `notification_type: string`. |

[H]

PascalCase-configured compatible payloads use `hook_event_name`, `session_id`, ISO-8601 string `timestamp`, and snake_case equivalents. Specific nonmechanical substitutions: `toolArgs` → `tool_input`; `toolResult` → `tool_result` with `result_type`/`text_result_for_llm`; subagent `response` → `last_assistant_message`. `stop_hook_active` remains unchanged. No separate compatible spelling is documented for `userPromptTransformed` or `subagentStart`. [H]

Notification enum: `shell_completed`, `shell_detached_completed`, `agent_completed`, `agent_idle`, `permission_prompt`, `elicitation_dialog`. [H]

Matchers are anchored regex `^(?:PATTERN)$`; invalid regex skips the hook. Match target: `preToolUse`, `postToolUse`, `permissionRequest` → tool name; `notification` → notification type; `preCompact` → trigger; `subagentStart` → agent name. [H]

PascalCase `PreToolUse`/`PermissionRequest` instead support Claude-compatible `*`, `**`, empty matcher, literal/`|`-separated tool names, then anchored regex. Runtime-to-Claude mappings include `bash`/`powershell`→`Bash`, `view`→`Read`, `create`→`Write`, edit variants→`Edit`, `grep`/`rg`→`Grep`, `glob`→`Glob`, web tools→`WebFetch`/`WebSearch`, `ask_user`→`AskUserQuestion`, `update_todo`→`TodoWrite`, `task`→`Agent` (`Task` also accepted). PascalCase pre-tool payload reports the Claude tool name. [H]

### Output and decisions

| Event | Output contract |
|---|---|
| `sessionStart`, `subagentStart` | `additionalContext?: string`; accumulated in execution order with `"\n\n"` separators, bounded at 10 MiB; cannot block subagent creation. |
| `preToolUse` | `permissionDecision?: "allow" \| "deny" \| "ask"`, `permissionDecisionReason?: string` required for deny, `modifiedArgs?: object`. Any deny blocks. |
| `permissionRequest` | `behavior?: "allow" \| "deny"`, `message?: string`, `interrupt?: boolean`; later outputs override earlier. Sandbox bypass cannot be auto-approved by hook. |
| `postToolUse` | `modifiedResult?: object`, `additionalContext?: string`; context appended to LLM result, joined with double newline, capped at 10 KB. Failure replacement routes to failure hook. |
| `postToolUseFailure` | Recovery context; exit 2 stdout appended as `additionalContext`. |
| `agentStop`, `subagentStop` | `decision?: "block" \| "allow"`, `reason?: string`; block starts another turn. `modifiedResponse?: string` only for subagent stop. |
| `userPromptSubmitted` | `modifiedPrompt?: string` **SDK programmatic hooks only**; command/HTTP configured output is dropped. |
| `userPromptTransformed` | `modifiedTransformedPrompt?: string`; modifies persisted/model-facing content, not displayed user prompt. |
| `notification` | `additionalContext?: string`, injected as user message; asynchronous, nonblocking. |
| `sessionEnd`, `errorOccurred`, `preCompact` | Output not processed. |

[H]

Exit codes: `0` parses stdout; `2` normally warns, but denies pre-tool/permission requests and supplies recovery context after tool failure; other nonzero exits normally log/fail open, **except pre-tool command hooks fail closed**. **Timeouts always fail open**, including policy pre-tool hooks. HTTP pre-tool network errors/non-2xx/timeouts fail open. [H]

Cloud agent: Linux only, `bash` or fallback `command`; no useful interactive notification/permission-request flow; pre-tool `"ask"` becomes `"deny"`; automatic compaction only; user prompt submitted at most once. Hooks execute in ephemeral sandbox, working directory `/workspace` or `/root`, restricted outbound network. Environment includes `GITHUB_COPILOT_API_TOKEN`, `GITHUB_COPILOT_GIT_TOKEN`, `COPILOT_AGENT_PROMPT`, `HOME=/root`; **not `GITHUB_TOKEN`**. [H]

CLI sandbox places user/project/plugin command hooks inside the session sandbox; policy hooks always run on host. Plugin hooks may write `$COPILOT_PLUGIN_DATA`; `cwd`/`env` cannot widen sandbox grants. Built-in `general-purpose` does **not** emit subagent start/stop; other documented YAML-based/custom agents do. [H]

## MCP servers

### Configuration files and scopes

CLI:

- User `~/.copilot/mcp-config.json`.
- Workspace `.mcp.json` and `.github/mcp.json`, working directory upward to Git root.
- Legacy plugins `.mcp.json`, `.github/mcp.json`, manifest `mcpServers`.
- Agent Plugins root `mcp.json`.
- Agent frontmatter `mcp-servers`.
- Highest-priority `--additional-mcp-config`.

Native user envelope is `{ "mcpServers": { NAME: CONFIG } }`; workspace files also accept a bare server map. `.vscode/mcp.json` is **not read**; its `servers` envelope must be remapped. [M; C; P]

Priority: additional CLI config → plugin → workspace → user. Within workspace, deepest directory wins; `.mcp.json` wins over same-directory `.github/mcp.json`. Plugin collisions are last-loaded-wins with warnings. [C; M; P]

### Native CLI field inventory

| Field | Type | Meaning |
|---|---|---|
| `type` | string | Local `"local"`/`"stdio"`; remote `"http"`/`"streamable-http"`/`"sse"`. Local default `"local"`; streamable HTTP alias normalizes to `"http"`. |
| `command` | string | Required local executable. |
| `args` | string[] | Required local arguments in field table. |
| `env` | map<string,string> | Local environment; `$VAR`, `${VAR}`, `${VAR:-default}` expansion. |
| `cwd` | string | Local working directory. |
| `url` | string | Required remote endpoint. |
| `headers` | map<string,string> | Remote headers; native CLI variable expansion supported. |
| `tools` | string[] | Enabled tool allowlist; `"*"` all, `[]` none; required in reference tables. |
| `timeout` | number | Milliseconds for discovery/tool calls; default 30,000; connection budget has 60,000 ms floor. |
| `deferTools` | `"auto"` or `"never"` | Deferred search visibility; default auto. |
| `disableToolCache` | boolean | Local tool-snapshot cache opt-out. |
| `slowConnectionThresholdMs` | integer | Warning threshold, default 10,000; positive ≤2,147,483,647; does not change timeout. |
| `filterMapping` | string | `"none"`, `"markdown"`, `"hidden_characters"` default; transforms output. |
| `oauthClientId` | string | Remote static OAuth client ID; bypasses dynamic registration. |
| `oauthScopes` | string[] | Nonempty requested scopes, requires client ID; server challenge takes precedence. |
| `oauthPublicClient` | boolean | Default true; false for confidential client with stored secret. |
| `oauthGrantType` | string | `"authorization_code"` default or `"client_credentials"`. |
| `oidc` | boolean | Token injection; local referenced `GITHUB_COPILOT_OIDC_MCP_TOKEN[_SUFFIX]`, remote Bearer header. |

[C, MCP reference]

`envFile`, per-server `enabled`, `disabledTools`, explicit `trust`, and `oauthClientSecret` config fields: **UNKNOWN/not documented** in these tables. Disablement uses user `disabledMcpServers: string[]`, not a documented server boolean. [C; D]

OAuth secrets live in OS credential storage with `mcp-oauth-config/` fallback. `client_credentials` requires static client ID, confidential mode, and stored secret; `/mcp auth NAME` handles reauthentication. CLI registry search is **experimental**. [C; M; D]

### Agent Plugins 1.0 schema differs materially

Version-pinned [MCP schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json):

- Closed envelope: required `$schema` and `mcpServers`.
- Closed stdio entry: required `type: "stdio"`, `command: nonempty string`; optional `args: string[]`, `env: map<string,string>`, `cwd: string`.
- Closed remote entry: required `type: "streamable-http"` or `"sse"`, `url: nonempty string`; optional `headers: map<string,string>`.
- `env` cannot redefine `PLUGIN_ROOT` or `PLUGIN_DATA`.
- `cwd` must start `./`, `${PLUGIN_ROOT}` or `${PLUGIN_DATA}`; containment validated separately.
- Native fields such as `tools`, OAuth settings, and `timeout` are **not allowed in the 1.0 portable server schema**.

CLI requires MCP schema version matching plugin schema, skips invalid entries individually, and supports plugin versions 1.0.0 and 1.1.0. The 1.1 schema was **not independently inventoried** here. [P]

Stdio plugins receive `PLUGIN_ROOT` and `PLUGIN_DATA`; substitutions in `args`, `env` values, and `cwd`; data aliases `${CLAUDE_PLUGIN_DATA}`, `${COPILOT_PLUGIN_DATA}` also recognized. **Remote plugin config passes literally, with no environment/placeholder expansion.** [P]

Plugin agent frontmatter has a narrower special substitution: `${PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_ROOT}`, `${COPILOT_PLUGIN_ROOT}` in command/arguments; not plugin data or environment values. Workspace/personal agents have no plugin-root substitution. [P]

### Cloud agent and app

Cloud repository MCP is entered in GitHub **Settings → Copilot → MCP servers**, not inherently read from CLI user config. Fields: required `type`, `tools`; local required `command`, `args`, optional `env`; remote required `url`, optional `headers`. Types `"local"`, `"stdio"`, `"http"`, `"sse"`. [G]

Secrets/variables must be Agents values with `COPILOT_MCP_` prefix. All string/string-array fields except `tools`/`type` support `$VAR`, `${VAR}`, `${VAR:-default}`; custom-agent YAML additionally supports `${{ secrets.NAME }}` and `${{ vars.NAME }}`. [G; A]

Cloud agent supports **MCP tools only**, not resources/prompts, and **does not support OAuth-authenticated remote MCP**. Calls are autonomous without confirmation. Cloud agent MCP priority: built-ins → agent profile → repository settings. [G; A]

App automatically exposes repository/CLI configured MCP servers and has Customize → MCP installation UI; exact independent serialization/precedence is **UNKNOWN**. [App]

## Other native capability types

### LSP servers

Documented plugin capability. Agent Plugins `com.github.copilot/lsp.json`; legacy root `lsp.json`, `.github/lsp.json`, `lsp-config/servers.json` example, or manifest `lspServers` path/inline object. User `~/.copilot/lsp-config.json`. Envelope `{ "lspServers": { NAME: CONFIG } }`. [P; D]

| Field | Type | Meaning |
|---|---|---|
| `command` | string | Executable. |
| `bash` | string | Unix `bash -c` launcher. |
| `powershell` | string | Windows `pwsh -c` launcher. |
| `cwd` | string | Absolute/config-file-relative; `${PLUGIN_ROOT}` supported. |
| `args` | string[] | Command arguments; ignored for shell launchers. |
| `env` | object | Spawn environment. |
| `fileExtensions` | map<string,string>, required | Extension→language ID. |
| `rootUri` | string | Git-root-relative project root; default `"."`. |
| `initializationOptions` | any | LSP initialize options. |

At least one launcher required; platform-specific launcher chosen when both exist. Plugin-root references supported. App/cloud LSP behavior and collision precedence: **UNKNOWN**. [P]

### Executable CLI extensions

**Experimental**, separate Node.js processes; JavaScript only, **not TypeScript**. Entry `extension.mjs`, `extension.cjs`, or `extension.js` inside named directories at `.github/extensions/NAME/`, `~/.copilot/extensions/NAME/`, or enabled plugins. Directory name is extension name; no required manifest documented. Extensions add model-callable tools and user slash commands. [[extensions reference](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions)]

Legacy plugin `extensions`: string, string[], or `{ paths: string[], exclusive: boolean }`; exclusive suppresses built-in extensions. Agent Plugins `extensions` instead means namespaced metadata, **not this executable-path configuration**. Agent Plugins executable extension discovery contract is **UNKNOWN** from the documented component table. [P]

Modes: **Load & Augment**, **Load Only**, **Disabled**, selected through `/extensions mode`; Disabled stops extension processes and persists. Exact serialized enum/key and full extension SDK registration schemas are **UNKNOWN/not covered**. [[extensions reference](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions)]

### App canvas extensions

Documented package-shippable interactive UI/shared-state capabilities. Project `.github/extensions`, personal `~/.copilot/extensions`; commonly `package.json`, `extension.mjs`, optional persisted artifacts. `/create-canvas` skill creates them. Exact canvas manifest, SDK fields, plugin namespace, dependency-install contract, and security boundary: **UNKNOWN**. [Canvas]

### Settings, not established package components

- User `theme`: `"default"`, `"github"`, `"dim"`, `"high-contrast"`, `"colorblind"`; `colorMode` deprecated alias. Package-shipped themes **UNKNOWN**. [D]
- `statusLine`: `{ type: "command", command: string, padding?: number, refreshInterval?: integer }`; refresh range 1–2,147,483 seconds; receives session JSON stdin and outputs display text. Plugin-owned statusline declaration **UNKNOWN**. [D]
- `footer` boolean keys: `showModelEffort`, `showDirectory`, `showBranch`, `showContextWindow`, `showQuota`, `showAgent`, `showAiUsed`, `showCodeChanges`, `showUsername`, `showSandbox`, `showYolo`, `showCustom`. [D]
- Providers: personal `providers.json` with `providers`/`models`, override path `COPILOT_PROVIDERS_CONFIG`; complete provider/model record schema and plugin shipping support **not inventoried/UNKNOWN**. [D]
- `connectors: boolean`, default true, controls available Copilot Connectors; plugin-declared connector schema **UNKNOWN**. [D]
- Output styles, package-defined monitors, keybinding bundles, `userConfig` configuration schemas, and package settings UI: **UNKNOWN**, not established by inspected plugin manifest/component tables. [P; D]

## Permissions, trust and security

Native manifests do **not** document package permission/allow-deny settings or installation-time signature requirements. Package contents can nevertheless include permission-affecting skill `allowed-tools` and hooks; these are executable/security-sensitive, not merely descriptive metadata. [P; S; H]

CLI workspace MCP loads after folder trust. Prompt mode skips untrusted workspace MCP by default; `GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP=true` explicitly enables it. Added directories are a trust decision for their agents/skills. [M; C]

CLI MCP tool calls require explicit permission, including read-only external operations; cloud-agent configured MCP runs autonomously. Skill `allowed-tools` can bypass repeated confirmation. Exact plugin-install review/trust prompt contract is **UNKNOWN** in inspected installation docs. [C; G; S; [installation guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing)]

CLI saved approvals: `permissions-config.json`, `locations` map keyed by absolute project/location path. Each record has `tool_approvals` and `allowed_directories: string[]`. Approval kinds and fields: [D]

| `kind` | Additional fields |
|---|---|
| `commands` | `commandIdentifiers: string[]` |
| `read`, `write`, `memory` | None |
| `mcp` | `serverName: string`, `toolName: string \| null`; null approves all server tools |
| `mcp-sampling` | `serverName: string` |
| `custom-tool` | `toolName: string` |
| `extension-management` | `operation?: string` |
| `extension-permission-access` | `extensionName: string` |

These are user/application state, not documented plugin-owned settings. [D]

Managed policy can enforce:

- `enabledPlugins`: require/disable named plugins.
- `extraKnownMarketplaces`: pin marketplace entries.
- `strictKnownMarketplaces`: marketplace allowlist; `[]` blocks **all**, including built-ins.
- `allowedMcpServers`/`deniedMcpServers`: entries selecting exactly one `serverUrl`, `serverCommand`, `serverName`; deny wins; built-in first-party servers exempt.
- `permissions`: `deny`, `ask`, `allow` string-rule arrays; `limitTo` domain boundary; `disableBypassPermissionsMode: "disable" | "allow-auto-only"`.
- Sandbox policy floor: `enabled`, `failIfUnavailable`, `allowBypass`, `addCurrentWorkingDirectory`, `sandboxMcpServers`, `sandboxLspServers`, `auth.git`, `auth.gh`, `allowDevToolAccess`, `learningMode`, filesystem/network `userPolicy` constraints.

[D]

Rules recognize `Bash(...)`, `Shell(...)`, `PowerShell(...)`, `Read(...)`, `Edit(...)`, `Write(...)`, `Domain(...)`; deny→ask→allow precedence. Managed deny/ask merge by union, allow/domain boundaries by intersection. [D]

Device MDM wins over server settings per key; plugin/marketplace locks apply per map entry, not entire map. Settings refresh hourly. Managed files: Linux `/etc/github-copilot/managed-settings.json`; macOS `/Library/Application Support/GitHubCopilot/managed-settings.json` or `com.github.copilot` MDM plist; Windows `%ProgramFiles%\GitHubCopilot\managed-settings.json` or `HKLM\SOFTWARE\Policies\GitHubCopilot`. [D]

`policyHelper` registration fields `path`, optional `args`, `timeoutMs`, `refreshIntervalMs` are accepted, but **execution is announced for a future release**, not shipped. [D]

CLI executable extensions run with user privileges; ordinary hooks can be sandboxed, policy hooks run outside it. Native package signatures, verified publishers, content digests, provenance attestations, and mandatory review UI: **UNKNOWN**. GitHub explicitly warns skills are unverified. [H; S; [extensions reference](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions)]

## Packaging, install and scopes

### Format identification and layout

Copilot recognizes exact Agent Plugins `$schema` URLs for **1.0.0 and 1.1.0**. Missing schema uses legacy semantics; unsupported Agent Plugins version is rejected, contributing no components. Agent Plugins root manifest outranks alternate legacy manifests. [P]

Agent Plugins:

```text
plugin.json
skills/NAME/SKILL.md
mcp.json
com.github.copilot/
  agents/
  commands/
  rules/
  hooks/hooks.json
  lsp.json
```

Fixed portable locations cannot be overridden. Other client namespaces are ignored. [P]

Legacy manifest lookup order: `.plugin/plugin.json` → `plugin.json` → `.github/plugin/plugin.json` → `.claude-plugin/plugin.json`. [P]

### Manifest fields

Agent Plugins closed top level: [P]

| Field | Type | Meaning |
|---|---|---|
| `$schema` | string, required | Exact supported schema URL. |
| `name` | string, required | 1–64 lowercase ASCII letters/digits/hyphens/periods; alphanumeric ends; no consecutive hyphens or periods. |
| `version` | string | SemVer recommended. |
| `description` | string | Description. |
| `author` | object | Optional string `name`, `email`, `url`. |
| `homepage` | string | Homepage/docs. |
| `repository` | string | Source repository. |
| `license` | string | SPDX recommended. |
| `keywords` | string[] | Discovery terms. |
| `extensions` | object | Client data keyed by reverse-domain namespace. |

Unknown top-level fields are reported and ignored by Copilot. Schema closure therefore should not be confused with whole-package rejection for every unknown property. [P]

Legacy fields: [P]

| Field | Type | Meaning |
|---|---|---|
| `name` | string, required | Kebab-case; letters/numbers/hyphens; maximum 64. |
| `description` | string | Maximum 1,024 characters. |
| `version` | string | Semantic version. |
| `author` | object | Required string `name`; optional string `email`, `url`. |
| `homepage`, `repository`, `license`, `category` | string | Metadata. |
| `keywords`, `tags` | string[] | Metadata. |
| `agents` | string or string[] | Agent directory paths; default `agents/`. |
| `skills` | string or string[] | Skill directory paths; default `skills/`. |
| `commands` | string or string[] | Command directories. |
| `hooks` | string or object | Config path or inline hooks. |
| `mcpServers` | string or object | Config path or inline server definitions. |
| `lspServers` | string or object | Config path or inline servers. |
| `extensions` | string, string[], object | Executable extension paths; object `paths`, `exclusive`. |

No dependency/transitive import, engines, required client version, package permission, or user-configuration field is documented in these tables. [P]

### Marketplaces

Manifest lookup: `marketplace.json` → `.plugin/marketplace.json` → `.github/plugin/marketplace.json` → `.claude-plugin/marketplace.json`. Marketplace author guide recommends `.github/plugin/marketplace.json`. [P]

| Top-level field | Type | Meaning |
|---|---|---|
| `name` | string, required | Marketplace name; maximum 64, kebab-case; dots also documented as accepted. |
| `owner` | object, required | `name: string`, `email?: string`. |
| `plugins` | array, required | Plugin entries. |
| `metadata` | object | `description?: string`, `version?: string`, `pluginRoot?: string`. |

Plugin entry fields: required `name: string`, `source: string | object`; optional `description`, `version`, `homepage`, `repository`, `license`, `category` strings; `author { name, email?, url? }`; `keywords`, `tags` string arrays; `commands`, `agents`, `skills` string/string[]; `hooks`, `mcpServers`, `lspServers` string/object; `strict: boolean` default true. Entry `mcpServers` supplies configuration when source does not ship its own. `strict: false` relaxes legacy/direct validation. [P]

Relative source strings resolve against marketplace repository root; `./` is optional. Object source fields:

- GitHub: `source: "github"`, `repo: string`, optional `ref`, `sha`, `path`.
- Git URL: `source: "url"`, URL source; exact URL-property spelling/type table **UNKNOWN** from inspected reference.
- `sha` must be full 40-character commit SHA; supported for GitHub and URL sources.

npm or ZIP native plugin source types: **not documented**. ZIP manual skill extraction is not plugin ZIP-install support. [P; S]

### Install, enable, settings, disk state

Imperative sources: `plugin@marketplace`, `OWNER/REPO`, `OWNER/REPO:SUBDIR`, Git URL, local directory. Marketplace registration additionally documents `owner/repo#ref`. Direct install `#ref`/SHA syntax beyond marketplace source objects is **UNKNOWN**. [P]

Commands: `copilot plugin install`, `uninstall`, `list`, `update NAME|--all`, `enable`, `disable`; `/plugin` interactive equivalents. `copilot plugins` is legacy alias. `--plugin-dir` mounts are read-only, with no persisted activation to toggle. [P]

Declarative configuration:

| Key | Type | Meaning |
|---|---|---|
| `enabledPlugins` | map<string,boolean> | Plugin-spec keys; true enabled/auto-install, false disabled. |
| `extraKnownMarketplaces` | map<string,object> | Named registrations; required `source` describing directory/git/GitHub; optional `autoUpdate: boolean`. Complete source-object property inventory **UNKNOWN**. |
| `autoUpdate` | boolean | User CLI/first-party plugin auto-update default true. |

[D; P]

Settings scopes:

- User `~/.copilot/settings.json`, JSONC.
- Repository `.github/copilot/settings.json`.
- Local `.github/copilot/settings.local.json`, same allowed schema as repository, takes precedence.
- Organization/enterprise/device managed policy wins for pinned plugin/marketplace entries.

Repository map entries override same-key user entries; repository-only enabled plugins install but stay globally disabled. Changing repository deactivates those components. Cloud agent reads repository `enabledPlugins` and `extraKnownMarketplaces`; app has Customize → Plugins marketplace/install UI. [D; B; App]

Disk writes/storage:

- Marketplace plugins: `~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME`.
- Direct plugins: `~/.copilot/installed-plugins/_direct/SOURCE-ID/`.
- Installation metadata/application state: `~/.copilot/config.json`; exact internal field schema **UNKNOWN**.
- Persistent plugin data: `~/.copilot/plugin-data/`; exact identity/subdirectory derivation **UNKNOWN**.
- Marketplace cache: Linux `~/.cache/copilot/marketplaces/`, macOS `~/Library/Caches/copilot/marketplaces/`; `COPILOT_CACHE_HOME` override, independent of `COPILOT_HOME`.
- User settings activation: `settings.json`; repository/local overlays as above.

[P; D]

Installed local plugins are cached: reinstall to see changes. **Exception:** path plugins in local directory-source marketplaces load live; `/restart` or new session picks up edits without update. [P; [creation guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating)]

Current built-in marketplace is **`awesome-copilot` only**, cannot be removed. `github/copilot-plugins` is now ordinary/non-default; prior users get a migration entry with auto-update true. Overview page still lists both as defaults—prefer current CLI reference and installation guide. [P; B; [installation guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing)]

First-party plugins auto-update at session start in trusted directories; disabled by `autoUpdate: false` or `COPILOT_AUTO_UPDATE=false`; CI skips by default. User/managed marketplace `autoUpdate: true` opts in for interactive and `-p`, not SDK/server. Repository opt-in is accepted **but ignored**. Built-in registration wins same-name collision, then managed, then user. [P]

Semantic version enforcement, dependency resolution, lockfiles, rollback, install atomicity, cache eviction, Windows marketplace-cache location, and package content hashing: **UNKNOWN**. [P; D]

## Notable gaps and ambiguities

- **Critical portability distinction:** Agent Plugins portable MCP schema is closed and much narrower than native Copilot MCP. Native OAuth, tool allowlists, timeout/cache/filter controls cannot simply be copied into portable `mcp.json`. Preserve separately or declare degradation. [P; C; [schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)]
- CLI and cloud are not one agent schema: CLI adds `models`, `modelPolicy`, `reasoningEffort`, instruction inclusion; general/cloud adds target/invocation/metadata fields and calls `infer` retired while CLI still documents it. Acceptance of every cross-surface field must not be assumed. [A; C]
- Same-name plugin skills coexist qualified; agents and commands use deduplication; MCP uses last-wins. A single global collision policy would lose behavior. [C; P]
- Instructions have no documented general conflict precedence; includes are restricted by file type and containment. [I]
- Hook prompt handlers mean auto-submitted text, not model-evaluated decisions. Config-file submitted-prompt mutation is ignored despite SDK support. Timeout fail-open differs from command-error fail-closed. [H]
- Hook docs say cloud discovery defaults to repository hooks without installed plugins, while plugin docs support declarative cloud plugin installation. Exact merged cloud plugin-hook behavior needs runtime/source confirmation. [H; B; D]
- Agent Plugins `rules/` is documented without a field-level rule schema; executable extension discovery in that namespace is also unspecified. [P]
- Agent Plugins **1.1.0 support is documented**, but only **1.0.0 MCP schema** was independently inspected here; changes in 1.1 fields remain unresearched. [P]
- App-specific serialization, precedence, canvas SDK schema, and plugin-install trust prompts remain UNKNOWN. App customization evidence includes a clearly dated archive fallback rather than a verified current live page. [App; Canvas]
- Detailed executable-extension SDK fields, full providers/model registry records, complete marketplace registration/source objects, and package signatures/provenance were not established. Do not represent missing documentation as proof of unsupported functionality.
- No files, application configuration, installations, or external records were intentionally modified; this was documentation research, not runtime verification.
