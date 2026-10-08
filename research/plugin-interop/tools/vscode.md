# VS Code agent customization - capability inventory (snapshot 2026-10-01)

Research cutoff: **2026-10-01**. VS Code documentation is pinned to [`c642b585b02a55cbc28508a56c927d34262fded6`](https://github.com/microsoft/vscode-docs/commit/c642b585b02a55cbc28508a56c927d34262fded6), committed 2026-10-01; customization/reference pages below have `DateApproved: 9/30/2026`. References link to that snapshot, not subsequently changed live pages.

**Status terminology:** “documented” means available according to this snapshot, not independently runtime-tested. Preview/Experimental labels are retained explicitly. No runtime, source-code implementation, or release-artifact verification was performed.

**Critical distinction:** VS Code is a client for multiple **harnesses**. Local runs in the extension host; Copilot, Claude, and Codex use their own runtime contracts through Agent Host. File discovery compatibility does **not** imply identical lifecycle, payload, permissions, or frontmatter interpretation. [Hooks documentation][H]

## Skills

**Documented:** Agent Skills for Copilot. Codex integration through Agent Host is **Experimental**. [Skills documentation][S]

| Location/scope | Exact path |
|---|---|
| Workspace | `.github/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md` |
| Personal | `~/.copilot/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md` |
| Agent Plugins package | `skills/<name>/SKILL.md` |
| VS Code extension | `contributes.chatSkills[]` in `package.json`, each entry containing `path` to `SKILL.md` |

Sources: [S], [P].

Documented VS Code frontmatter:

| Key | Type | Meaning/default |
|---|---|---|
| `name` | string, required | Unique identifier; lowercase letters, digits, hyphens; maximum 64 characters; matches containing directory. No dots, slashes, colons, or namespace prefixes. |
| `description` | string, required | Capability and invocation conditions; maximum 1024 characters. |
| `argument-hint` | string | Chat-input hint. |
| `user-invocable` | boolean | Default `true`; controls slash-menu visibility. |
| `disable-model-invocation` | boolean | Default `false`; `true` prevents relevance-based automatic invocation. |
| `context` | string | Omitted: inline; `fork`: dedicated subagent, returning only final result. Requires `github.copilot.chat.skillTool.enabled`. Feature-marked; exact release/default lifecycle status UNKNOWN. |

Source: [S].

- Default: model and user invocation. `user-invocable: false`: model only. `disable-model-invocation: true`: user only. Both restrictions: neither. Additional user text can follow `/skill-name`. Plugin commands receive `/plugin-name:skill-name`; do not encode that namespace into `name`. [S]
- Discovery loads name/description; invocation loads body; referenced resources load on demand. Supporting scripts, examples, references, assets can accompany `SKILL.md`; no execution merely from inclusion. Markdown links and `#file:./path` resolve relative to `SKILL.md`; `~/` references home. [S]
- `allowed-tools`, `license`, `compatibility`, `metadata`, an `agent` field for fork selection, and tool-specific auxiliary skill metadata files: **VS Code consumption semantics UNKNOWN**; not enumerated in the VS Code frontmatter table. The page references the Agent Skills standard, but that alone does not prove runtime enforcement of every standard field. [S]
- General duplicate-name precedence across workspace/personal/plugin/extension sources: **UNKNOWN**. For Codex discovery of `.github/skills` across multiple workspace roots, primary root wins. [S]
- `chat.agentSkillsLocations` is deprecated, Local-only. `chat.useCustomizationsInParentRepositories` enables parent-repository discovery. [S]
- Extension documentation contradicts itself: introductory text says contribution path points to a directory; registration example and following text specify `./skills/my-skill/SKILL.md`. Treat the file-path example as documented, but verify implementation before emitting an extension. [S]

## Instructions and rules

**Documented:** always-on, file-scoped, relevance-selected, and manually attached instructions. Not applied to inline editor suggestions. Harness-specific discovery remains significant. [Instructions documentation][I]

| File/location | Activation and scope |
|---|---|
| `.github/copilot-instructions.md` | Repository-wide Copilot guidance; Local loads when `github.copilot.chat.codeGeneration.useInstructionFiles` enabled. |
| `~/.copilot/copilot-instructions.md` | Personal always-on Copilot Agent Host guidance. |
| Root `AGENTS.md` | Shared project guidance; Local controlled by `chat.useAgentsMdFile`. |
| Nested `AGENTS.md` | Local discovery controlled by `chat.useNestedAgentsMdFiles`, disabled by default; files listed with locations for relevant model loading. Feature-marked. |
| `.github/instructions/**/*.instructions.md` | Recursively discovered targeted instructions. |
| `~/.copilot/instructions` | Copilot Agent Host personal targeted instructions. |
| Local profile storage | Local personal instruction files; exact OS-independent directory UNKNOWN. |
| Root `CLAUDE.md`, `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md`, `CLAUDE.local.md` | Local compatibility discovery controlled by `chat.useClaudeMdFile`; Claude Agent Host has native discovery rules. |
| `.claude/rules/**/*.md`, `~/.claude/rules` | Claude-format targeted guidance. |
| Plugin `com.github.copilot/rules/` | Client-specific rules location; exhaustive rule discovery/format semantics UNKNOWN. |
| `GEMINI.md`, Cursor `.mdc`, steering files | Native discovery **not documented** in examined sources; support UNKNOWN, not established absent. |

Sources: [I], [P].

| Frontmatter key | Type | Meaning |
|---|---|---|
| `name` | string | Optional UI name; defaults to filename. |
| `description` | string | Optional task-relevance discovery description. |
| `applyTo` | string | Optional glob relative to workspace root; `**` matches all files. Attaches when agent creates/modifies matching files. |
| Claude `paths` | string[] | Claude-rule alternative to `applyTo`; defaults to `**` when omitted. |

Source: [I].

- Without `description` and `applyTo`, `.instructions.md` is manually attached. Applicable instruction sources are **additive**; documentation explicitly says not to depend on ordering or precedence to resolve contradictions. This is not a guaranteed “nearest nested file overrides parent” contract. [I]
- Markdown links reference files/URLs; relative paths resolve from instruction file. Local `chat.includeReferencedInstructions` controls linked instructions; `chat.includeApplyingInstructions` controls pattern application. Exact recursive include-depth, cycle behavior, and Claude `@import` interpretation by Local: **UNKNOWN**. [I]
- Organization instructions are additive, discovered with `github.copilot.chat.organizationInstructions.enabled`. [I]
- `chat.instructionsFilesLocations` is deprecated and Local-only; parent discovery uses `chat.useCustomizationsInParentRepositories`. Profile instructions can roam with Settings Sync; harness folders such as `~/.copilot/instructions` do not. [I]
- Generated-content settings accept arrays of `{text: string}` or `{file: string}`: `github.copilot.chat.reviewSelection.instructions`, `github.copilot.chat.commitMessageGeneration.instructions`, `github.copilot.chat.pullRequestDescriptionGeneration.instructions`. Code/test-generation settings-based instructions deprecated since 1.102. [I]

## Subagents and custom agents

**Documented:** `.agent.md` definitions, picker invocation, subagent delegation, handoffs. Agent-scoped hooks are **Preview**, Local-only. [Custom agents documentation][A]

| Scope | Exact path |
|---|---|
| Workspace | `.github/agents/*.agent.md`; documentation also recognizes any `.md` in `.github/agents`. |
| Claude workspace compatibility | `.claude/agents/*.md` |
| Personal Agent Host | `~/.copilot/agents`, `~/.claude/agents` |
| Agent Plugins | `com.github.copilot/agents/` |
| Organization/extension/plugin | Contributions supported; conflict precedence UNKNOWN. |

Sources: [A], [P].

Optional YAML header; body is Markdown instructions:

| Key | Type | Meaning/default |
|---|---|---|
| `name` | string | Defaults to filename. |
| `description` | string | Role description; chat-input placeholder. |
| `argument-hint` | string | Chat-input usage hint. |
| `tools` | string[] | Built-in tools, tool sets, MCP or extension tools; `<server>/*` selects all server tools. Unavailable tools ignored. |
| `agents` | string[] | Allowed delegate names; `['*']` allows all; `[]` prevents delegation. Include `agent` in `tools`. |
| `model` | string or string[] | Single model or prioritized fallback list; omitted uses picker selection. |
| `user-invocable` | boolean | Default `true`; picker visibility, not delegation permission. |
| `disable-model-invocation` | boolean | Default `false`; prevents invocation as subagent. |
| `infer` | legacy; exact type UNKNOWN in table | Deprecated; replaced by two invocation controls. |
| `target` | enum string | `vscode`, `github-copilot`. |
| `mcp-servers` | list of server configuration JSON | Documented for GitHub Copilot custom agents with `target: github-copilot`; not established as Local server definitions. |
| `handoffs` | object[] | Suggested next-agent transitions. |
| `handoffs[].label` | string | Button label. |
| `handoffs[].agent` | string | Destination agent identifier. |
| `handoffs[].prompt` | string | Destination prompt. |
| `handoffs[].send` | boolean | Default `false`; auto-submits when true. |
| `handoffs[].model` | string | Qualified model `Model Name (vendor)`. |
| `hooks` | event-to-command-array map | Preview; Local-only, active agent only, including subagent use. |

Source: [A].

Claude compatibility fields:

| Key | Type | Meaning |
|---|---|---|
| `name` | string, required | Agent name. |
| `description` | string | Role description. |
| `tools` | comma-separated string | Allowed Claude tool names, mapped to VS Code tool names. |
| `disallowedTools` | comma-separated string | Blocked tool names. |

Other Claude fields such as `permissionMode`, `color`, `memory`, `maxTurns`, `skills`, and native Claude model aliases: **Local interpretation UNKNOWN**; do not infer full Claude support from the compatible directory. [A]

- Body references: Markdown links, `#file:`, home-relative paths; `#tool:<tool-name>` references tools. Body prepended to user prompt. [A]
- Handoff switches agent while retaining conversation context; it is not itself isolated subagent delegation. [A]
- Self-referential/nested delegation requires `chat.subagents.allowInvocationsFromSubagents`. General maximum depth/concurrency and inheritance rules were not investigated. [A]
- `.chatmode.md` is previous terminology/format; docs instruct renaming to `.agent.md`. `chat.agentFilesLocations` and `chat.modeFilesLocations` deprecated, Local-only. [A]

## Commands and prompts

**Documented but deprecated for Agent Host:** prompt files continue with Local, which docs say will be removed in a future release. Agent Host does **not** load prompt files. Prompt-to-skill migration is **Experimental**, enabled by default. [Prompt documentation][Q]

| Layout | Meaning |
|---|---|
| `.github/prompts/*.prompt.md` | Workspace Local prompt files. |
| User-profile prompt storage | Personal Local prompts; exact directory UNKNOWN. |
| Plugin `com.github.copilot/commands/` | Agent Plugins client-specific slash commands; exact per-command schema and harness support matrix UNKNOWN. |

Sources: [Q], [P].

| Frontmatter key | Type | Meaning/default |
|---|---|---|
| `name` | string | Slash name; defaults to filename. |
| `description` | string | Brief task description. |
| `argument-hint` | string | Usage hint. |
| `agent` | string | `ask`, `agent`, `plan`, or custom agent; omitted uses current agent, except specifying tools defaults to `agent`. |
| `model` | model name string | Omitted uses picker model. |
| `tools` | string[] | Built-in/tool-set/MCP/extension tools; `<server>/*`; unavailable tools ignored. |

Source: [Q].

- Manual invocation via `/name additional text`, **Chat: Run Prompt**, or editor play button. Tools priority: prompt `tools` → referenced custom-agent `tools` → selected-agent defaults. [Q]
- Markdown links and `#file:` reference files relative to prompt file; `~/` resolves home. `#tool:` references tools. [Q]
- `${selection}` is documented as a built-in variable. `${input:name}` and `${input:name:placeholder}` are described as syntax models can understand and ask about—not a guaranteed deterministic substitution engine. [Q]
- `$ARGUMENTS`, numbered argument substitution, Claude ``!`shell` `` pre-execution, and universal shell/file interpolation: **UNKNOWN/not documented** for native prompt files. [Q]
- Commands have **not uniformly become skills**: Local prompt files remain usable; Agent Host migration recommends skills; plugins still document client-specific slash commands. [Q], [P]

## Hooks

**Preview:** VS Code hook experience and agent-scoped hooks. Copilot SDK hooks separately described as **GA**. The following field inventory is **Local-specific**; Agent Host Copilot/Claude/Codex contracts are not interchangeable. [H]

Discovery:

| Scope | Exact files/settings |
|---|---|
| Workspace | `.github/hooks/*.json` |
| Personal | `~/.copilot/hooks/*.json` |
| Claude compatibility | `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`; requires `chat.useClaudeHooks`, off by default. |
| Agent | `.agent.md` frontmatter `hooks` |
| Agent Plugins | `com.github.copilot/hooks/hooks.json` |
| Claude plugin | `hooks/hooks.json` |
| Legacy Copilot plugin | Root `hooks.json` |
| Additional/disabled locations | `chat.hookFilesLocations: Record<string, boolean>`; folder or JSON file, workspace-relative or `~/`. |

`chat.useHooks` is on by default for Local; workspace hooks require Workspace Trust. Sources: [H], [P].

Native configuration: `{hooks: {EventName: CommandEntry[]}}`.

| Command key | Type | Contract |
|---|---|---|
| `type` | literal string | `"command"` only. HTTP/prompt/script-module handlers **not supported by documented Local schema**. |
| `command` | string | Default shell command. |
| `windows`, `linux`, `osx` | string | Platform overrides selected from extension-host OS, not necessarily UI OS. |
| `cwd` | string | Relative to repository root. |
| `env` | object | Additional environment variables; value-type restrictions UNKNOWN in reference. |
| `timeout` | number | Seconds; default 30. |

At least one command property required. Numeric `version` plus lower-camel events identifies Copilot compatibility configuration; parser maps names but still emits Local payloads. Claude matcher/nested-hook syntax is accepted, but **matcher values are ignored**: every nested command for the event runs. Exact compatibility alias enumeration/defaults UNKNOWN. [H], [R], [P]

Common stdin JSON:

| Field | Type | Meaning |
|---|---|---|
| `timestamp` | string | ISO 8601 event time. |
| `cwd` | string, optional | Agent working directory. |
| `session_id` | string, optional | Session identifier. |
| `hook_event_name` | string | Exact lifecycle event. |
| `transcript_path` | string, optional | Absolute transcript path; transcript format explicitly unstable. |

Source: [R].

Every documented Local event:

| Exact event | Meaning | Additional input |
|---|---|---|
| `SessionStart` | First prompt starts session | `source: string`, currently always `"new"` |
| `UserPromptSubmit` | User submits prompt | `prompt: string` |
| `PreToolUse` | Before tool invocation | `tool_name: string`, `tool_input: object`, `tool_use_id: string` |
| `PostToolUse` | After successful tool completion | Above fields plus `tool_response: string \| object` |
| `PreCompact` | Before context compaction | `trigger: string`, documented `"auto"` |
| `SubagentStart` | Subagent starts | `agent_id: string`, `agent_type: string` |
| `SubagentStop` | Subagent about to stop | Above plus `stop_hook_active: boolean` |
| `Stop` | Current execution about to stop, not session termination | `stop_hook_active: boolean` |

Source: [R]. No documented Local `SessionEnd`, `PostToolUseFailure`, notification, permission-request, configuration-change, worktree, or task-completion lifecycle event.

Common stdout JSON:

| Field | Type | Meaning |
|---|---|---|
| `continue` | boolean | Default true; false stops entire agent execution. |
| `stopReason` | string | User-visible reason when stopped. |
| `systemMessage` | string | User-visible warning. |

Event-specific outputs:

| Event | Exact fields/contracts |
|---|---|
| `PreToolUse` | `hookSpecificOutput.hookEventName: "PreToolUse"`; `permissionDecision: "allow" \| "deny" \| "ask"`; `permissionDecisionReason: string`; `updatedInput: object`; `additionalContext: string`. Invalid replacement input ignored. |
| `PostToolUse` | Top-level `decision: "block"`, `reason: string`; `hookSpecificOutput.hookEventName: "PostToolUse"` and `additionalContext: string`. Blocks further processing, not an undo of completed tool. |
| `SessionStart` | `hookSpecificOutput.hookEventName: "SessionStart"` and `additionalContext: string`. |
| `SubagentStart` | `hookSpecificOutput.hookEventName: "SubagentStart"` and `additionalContext: string`. |
| `Stop` | `hookSpecificOutput.hookEventName: "Stop"`, `decision: "block"`, required `reason: string`; requires more execution. |
| `SubagentStop` | Top-level `decision: "block"`, required `reason: string`. |
| `UserPromptSubmit`, `PreCompact` | Common output only documented. |

Source: [R].

- Exit `0`: parse stdout; `2`: stderr becomes blocking error supplied to model; any other exit: nonblocking user warning, continue. More restrictive outputs win; `continue: false` overrides tool permission allowance. Multiple permission decisions: `deny` > `ask` > `allow`. [R]
- All applicable user/workspace/plugin/agent hooks execute; ordering, parallelism, duplicate suppression, timeout-failure semantics, and competing `updatedInput` resolution: **UNKNOWN**. Agent-scoped `Stop` becomes `SubagentStop` when agent delegates. Inspect `stop_hook_active` to avoid endless continuation. [H], [R], [P]
- Claude plugin `${CLAUDE_PLUGIN_ROOT}` and legacy OpenPlugin `${PLUGIN_ROOT}` expand in commands/platform commands and `env` values; command paths shell-quoted; matching environment variable injected. Agent Plugins/Copilot root tokens are documented generally, but detailed Local-hook section only enumerates Claude/OpenPlugin rows. Other guaranteed hook environment variables: **UNKNOWN**. [P]

## MCP servers

**Documented:** native VS Code MCP, portable workspace/user configurations, and plugin MCP. Enterprise-managed OAuth is **Preview**. [MCP reference][M], [MCP overview][MC]

| Scope/format | Exact path/top-level server key |
|---|---|
| Workspace VS Code | `.vscode/mcp.json`, `servers` |
| Workspace portable | Root `.mcp.json`, `mcpServers` |
| VS Code user profile | Profile `mcp.json`, `servers` |
| Remote user | **MCP: Open Remote User Configuration**; exact platform path UNKNOWN |
| Copilot portable user | `$COPILOT_HOME/mcp-config.json`, otherwise `~/.copilot/mcp-config.json`, `mcpServers` |
| Agent Plugins | Root `mcp.json`; portable Agent Plugins schema |
| Copilot/Claude plugin | Root `.mcp.json`, `mcpServers` |
| Dev Container | `devcontainer.json`: `customizations.vscode.mcp`; written into remote `mcp.json` |

Sources: [M], [MC], [P].

Native VS Code root fields: `servers: Record<string, Server>`, optional `inputs: Input[]`, optional `sandbox: object`. [M]

| Native server key | Type | Meaning |
|---|---|---|
| `type` | `"stdio"`, `"http"`, `"sse"` | Transport. Table marks required, examples omit it for stdio: inference behavior is documentation ambiguity. |
| `command` | string | Stdio executable on PATH or full path. |
| `args` | string[] | Executable arguments. |
| `cwd` | string | Stdio working directory; defaults to workspace folder in workspace. |
| `env` | map of string/number/null | Stdio process environment. |
| `envFile` | string | Environment-file path. |
| `sandboxEnabled` | boolean | Stdio sandbox; macOS/Linux only. |
| `dev` | object | Development watching/debugging; watch available all server types. |
| `dev.watch` | string or string[] | Restart-on-change glob(s). |
| `dev.debug` | UNKNOWN exact schema | Node.js/Python debugging, stdio only. |
| `url` | string | HTTP/SSE endpoint; also `unix:///path.sock` or Windows `pipe:///pipe/name`; fragment can identify subpath. |
| `headers` | object of header values | HTTP authentication/configuration headers; exact value typing not stated in table. |
| `oauth` | object | Automatic browser authorization flow. |
| `oauth.clientId` | string, required | OAuth client ID. |
| `oauth.enterpriseManaged` | boolean | Preview; default false; ID-JAG via `mcp.enterpriseManagedAuth.idp`. |

Native HTTP first attempts HTTP Stream transport and falls back to SSE. Source: [M].

Inputs:

| Variant | Fields |
|---|---|
| All | Required `id: string`, `type: "promptString" \| "pickString" \| "command"` |
| `promptString` | Required `description: string`; optional `default: string`, `password: boolean` default false |
| `pickString` | Required `description: string`, `options: (string \| {label: string, value: string})[]`; optional `default: string` |
| `command` | Required `command: string` VS Code command ID; optional `args: string \| array \| object` |

`${input:id}` prompts at first startup and securely stores value. Predefined VS Code variables supported, including `${workspaceFolder}` and `${userHome}`; exhaustive variable list is delegated to [VS Code variable reference](https://code.visualstudio.com/docs/reference/variables-reference). [M]

Sandbox root keys, all `string[]`: `filesystem.allowWrite`, `filesystem.denyRead`, `filesystem.denyWrite`, `network.allowedDomains`, `network.deniedDomains`. Allowed-domain wildcards supported. Rules apply to all sandbox-enabled servers; confirmations auto-approved. Windows unsupported for this MCP sandbox. [M]

**Agent Plugins portable MCP differs materially.** VS Code points to Agent Plugins 1.0; the inspected published spec is [AP], but its repository `main` was **not date-pinned**:

| Portable fields | Contract |
|---|---|
| Root `$schema` | Required `"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"` |
| Root `mcpServers` | Required server map; no other root keys |
| Stdio | Required `type: "stdio"`, `command: string`; optional `args: string[]`, `env: Record<string,string>`, `cwd: string` |
| Remote | Required `type: "streamable-http" \| "sse"`, `url: string`; optional `headers: Record<string,string>` |

Portable `command` is one executable token, bare name or `./` plugin-relative path, **no interpolation**. Default cwd is plugin root. `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` expand only in args/env-values/cwd; no other expansion. Explicit cwd must be plugin-relative or rooted in those placeholders and contained within respective root. No portable OAuth, input variables, envFile, sandbox, timeout, or enabled-tools fields. Remote URL/header expansion prohibited. `PLUGIN_ROOT` and persistent writable `PLUGIN_DATA` injected and reserved. These are normative portable-format requirements, not independent proof of every VS Code runtime behavior. [AP], [P]

- Claude plugin root expands in `command`, `args`, `cwd`, `env`, `envFile`, `url`, `headers`; `CLAUDE_PLUGIN_ROOT` injected. **Do not apply this permissive expansion contract to Agent Plugins MCP.** [P]
- Server enablement is separate persisted state, globally/workspace scoped, not `enabled` in configuration. Tool selection is through Configure Tools. No documented native per-server tool allow/deny or timeout keys. [MC], [M]
- Agent Host reads portable configurations directly; native `.vscode/mcp.json` is forwarded except interactive-input-dependent servers. Native autostart controls do not prevent Agent Host-owned startup. Duplicate-server precedence UNKNOWN. [M], [MC]

## Other native capability types

| Capability | Agent-plugin status and fields |
|---|---|
| Automation templates | Documented VS Code-specific capability; root `automations/*.automation.md`. |
| Tool sets | Documented native customization; `.jsonc` map of set name → `{tools: string[], description: string, icon: string}`. Package discovery not documented. |
| MCP resources/prompts/apps | Documented MCP-provided capabilities; prompts invoked `/<server>.<prompt>`, apps rendered inline. |
| LSP servers, themes, keybindings, output styles, statusline, providers, JS/TS extension modules | **Not documented as agent-plugin components**. VS Code extension capabilities must not be conflated with agent-plugin manifest capabilities. |
| Monitors, connectors, `userConfig`, package-managed permissions/settings | Agent-plugin schema/consumption UNKNOWN. |

Sources: [P], [T], [MC].

Automation template frontmatter:

| Key | Type | Contract |
|---|---|---|
| `version` | integer | Required `1`. |
| `id` | string | Required; plugin-unique; lowercase letters/digits/periods/hyphens; maximum 64 characters. |
| `name` | string | Required display name. |
| `description` | string | Optional purpose. |
| `schedule` | object | Required. |
| `schedule.kind` | enum | `manual`, `hourly`, `cron`. |
| `schedule.expression` | string | Five-field cron; only daily/weekly schedules supported. |
| `schedule.timeZone` | string | Documented `local` for cron. |

Markdown body is prompt. `extensions.com.github.copilot.automations.paths: string[]` adds directories relative to `com.github.copilot/`; sibling `exclusive: boolean` skips default root folder when true. Invalid templates ignored. Templates cannot specify workspace, provider, model, permissions, enabled state, or run history; installation does not activate automations. Creation opens review dialog with Enabled cleared. Disabling plugin removes templates, not previously created automations. [P]

VS Code extensions separately contribute skills via `contributes.chatSkills[].path`; a full extension `package.json`/API inventory was not investigated. [S]

## Permissions, trust and security

- Marketplace trust prompt on first installation from a marketplace. Plugin MCP servers implicitly trusted on installation, without separate startup trust prompt. Plugins can run local code via hooks/MCP; review publisher and contents. [P]
- Workspace MCP inherits Workspace Trust: trusted workspace allows startup, including changed configuration, without separate MCP prompt; restricted mode blocks workspace MCP. Other sources may require first-start/configuration-change trust. **MCP: Reset Trust** does not reset Workspace Trust. [MC]
- Custom-agent `tools` restricts availability, not a universal permission grant. Hook `allow`/`ask`/`deny` is event-specific. Package manifests have no portable permission-grant field. Signature/provenance enforcement for agent plugins: **UNKNOWN**. [A], [R], [P]
- MCP sandbox is opt-in, macOS/Linux; portable package containment is not subprocess sandboxing. [M], [AP]

Enterprise controls:

| Key/policy | Type/meaning |
|---|---|
| `ChatEnabledPlugins` → `chat.plugins.enabledPlugins` / managed `enabledPlugins` | Map `plugin@marketplace` → boolean; force-enable/disable; omitted remains user-controlled; not allowlist. |
| `ChatExtraMarketplaces` / managed `extraKnownMarketplaces` | Additional managed sources; policy-only setting `chat.plugins.extraMarketplaces`. |
| `ChatStrictMarketplaces` / `strictKnownMarketplaces` | Source-object list; empty blocks marketplace installs; not retroactive disablement. |
| `allowManagedHooksOnly` | boolean, since 1.132; only managed hooks and policy-force-enabled plugin hooks; does not install/enable plugins itself. |
| `strictPluginOnlyCustomization` | boolean, since 1.132; blocks standalone skills/agents/hooks/instructions/MCP. |
| `ChatHooks` | boolean; Local hook execution only. |
| `ChatMCP` → `chat.mcp.access` | `all`, `registry`, `none`. |
| `allowedMcpServers`, `deniedMcpServers` | Arrays of selectors: `serverName: string`, `serverUrl: string` with wildcards, or `serverCommand: string[]` exact command/args; deny wins. Since 1.130. |
| `allowManagedMcpServersOnly` | boolean, since 1.132; managed allowlist only. |
| `ChatToolsAutoApprove` | Can prevent global auto-approval. |
| `ChatToolsEligibleForAutoApproval` | Tool-name-to-boolean map; false requires manual approval. |
| `ChatToolsTerminalEnableAutoApprove` | Controls terminal rule-based approval. |

Source: [E].

**Documentation contradiction:** same enterprise page says fine-grained managed `permissions.allow/ask/deny` are CLI-only, VS Code support “coming soon”, but its final managed-settings table says they apply to Copilot Agent Host runtime. Shipped VS Code support is **UNKNOWN pending implementation verification**. [E]

## Packaging, install and scopes

**Documented:** agent plugins enabled through `chat.plugins.enabled`; accepted formats below. Not globally labelled Preview in pinned plugin page. [P]

| Format | Manifest/discovery |
|---|---|
| Agent Plugins 1.0 | Root `plugin.json` with canonical `$schema`; `skills/`, root `mcp.json`; `com.github.copilot/{agents,commands,rules,hooks}` |
| Copilot legacy | Root `plugin.json` without Agent Plugins marker |
| Claude | `.claude-plugin/plugin.json` |
| Legacy OpenPlugin | `.plugin/plugin.json` |

Root Agent Plugins manifest fields:

| Key | Type | Meaning |
|---|---|---|
| `$schema` | string, required | `"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` |
| `name` | string, required | Package identifier. |
| `version` | string | SemVer recommended, not required. |
| `description` | string | Purpose. |
| `author` | object | Optional `name`, `email`, `url`, each string. |
| `homepage` | string | Homepage/documentation. |
| `repository` | string | Source repository. |
| `license` | string | SPDX recommended. |
| `keywords` | string[] | Discovery terms. |
| `extensions` | namespace-to-object map | Client-specific data. |

Source: [P]; detailed constraints in [AP], inspected unpinned.

Portable name: 1–64 characters, lowercase digits/letters/hyphens/periods; starts/ends alphanumeric; no `--` or `..`. Closed portable manifest does not permit top-level `agents`, `hooks`, `commands`, `mcpServers`, dependencies, or component path overrides. Unknown root fields reported/ignored under portable spec; other validation failures generally fatal. Skills fixed to immediate child directories of `skills/`; spec forbids recursive skill discovery. [AP]

**Install/enable settings and mechanics:**

| Surface/key | Contract |
|---|---|
| Extensions `@agentPlugins` | Browse/install/manage plugins. |
| **Chat: Install Plugin From Source** | Git repository URL cloned and installed. |
| `chat.plugins.marketplaces` | string[] repository references. |
| `chat.pluginLocations` | Map local plugin directory → boolean enabled state. |
| Workspace recommendations | `.claude/settings.json` or `.github/copilot/settings.json`. |
| `enabledPlugins` | Map qualified `plugin@marketplace` → boolean recommendation/default enablement. |
| `extraKnownMarketplaces` | Map name → marketplace configuration; documented example `source: {source: "github", repo: "owner/repo"}`. |

Sources and update behavior:

- Default catalogs: `github/copilot-plugins`, `github/awesome-copilot`. Marketplace references accept GitHub `owner/repo`, HTTPS `.git`, SCP-style SSH, and `file:///` repository URI. Private repositories supported through direct cloning fallback. Exact ref/SHA syntax was **not documented in pinned page**; later live page adds it, so do not backdate that evidence. [P]
- External marketplace sources may be npm or PyPI. Exhaustive marketplace schema/source union, zip handling, Git ref/sha support at cutoff, and legacy manifest fields: **UNKNOWN in this investigation**. VS Code page delegates to [Claude marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces) and [Copilot plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference). [P]
- Automatically discovers Copilot CLI installs at `~/.copilot/installed-plugins/<marketplace>/<plugin>/`; direct Git installs under `_direct`, example `_direct/github--moda-linter--copilot-plugin/`. [P]
- Documented VS Code cache roots: macOS `~/Library/Application Support/Code/agentPlugins/github.com/{org}/{repo}`; Linux `~/.config/Code/agentPlugins/github.com/{org}/{repo}`; Windows `%APPDATA%\Code\agentPlugins\github.com\{org}\{repo}`. Full install-state/enable-state files and locking metadata **UNKNOWN**. [P]
- Enable/disable globally or per workspace; persisted separately from plugin configuration, not shared workspace settings. Disable removes provided skills/agents/hooks/MCP/commands/templates. Managed policy overrides ordinary activation. Scope collision precedence UNKNOWN. [P], [E]
- Checks updates via **Extensions: Check for Extension Updates**, or every 24 hours with `extensions.autoUpdate`. Updates cloned repositories and checks externally sourced versions. npm/PyPI updates require explicit confirmation, never unattended automatic installation. Version should be bumped in manifest and marketplace entry where applicable. [P]
- Uninstall deletes external-source installs; marketplace-inline contents remain on disk but become inactive. No package dependency-resolution/transitive-import contract documented. [P]

## Notable gaps and ambiguities

- **Harness is a necessary compatibility dimension.** A single “VS Code hooks” or “VS Code prompts” capability flag loses materially different Agent Host and Local behavior. [H], [Q]
- **Cutoff matters:** live plugin documentation inspected initially was approved 2026-10-07, after cutoff. Its `/plugin` command inventory, separate-inventory warning, additional marketplace ref/SHA behavior, and experimental Discover UI were excluded from cutoff claims. Pinned 2026-10-01 documentation is the basis above. [P]
- **Exhaustiveness limits:** legacy Copilot/Claude/OpenPlugin manifest fields; marketplace schema; VS Code extension manifest/API fields; Copilot SDK lifecycle/payload inventory; implementation-specific collision precedence and install-state files were not inspected. These are UNKNOWN, not unsupported.
- `allowed-tools`/standard skill metadata enforcement, complete Claude agent-field compatibility, plugin rules/commands schema, extension contribution conflicts, hook ordering/input-modification conflicts, exact MCP dev-debug schema, and package-set permissions remain UNKNOWN. [S], [A], [P], [R], [M]
- Enterprise permissions documentation contradicts itself; skill extension contribution path and native stdio `type` requirements also contain inconsistencies. Verify source/runtime rather than canonicalizing either side silently. [E], [S], [M]
- Agent Plugins portable MCP prohibits expansions/fields accepted by native VS Code or Claude-compatible MCP. Preserve original format and target-specific data rather than rewriting all MCP configurations using one syntactic schema. [P], [AP], [M]
- The portable Agent Plugins spec inspected is published 1.0.0 but fetched from unpinned `main`; detailed constraints must be date-verified before asserting they were normative on 2026-10-01. [AP]
- No repository files or application state changed. Most useful follow-up: inspect the cutoff VS Code/Copilot implementation for `com.github.copilot` discovery/schema and installed-plugin persistence, then separately inventory Copilot SDK hook contracts.

[S]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/agent-skills.md
[I]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/custom-instructions.md
[A]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/custom-agents.md
[Q]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/prompt-files.md
[H]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/hooks.md
[R]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agents/reference/hooks-reference.md
[M]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agents/reference/mcp-configuration.md
[MC]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/mcp-servers.md
[P]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/agent-plugins.md
[T]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/agent-customization/tool-sets.md
[E]: https://github.com/microsoft/vscode-docs/blob/c642b585b02a55cbc28508a56c927d34262fded6/docs/enterprise/manage-ai-settings.md
[AP]: https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
