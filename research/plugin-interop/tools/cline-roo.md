# Cline and Roo Code - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence snapshot:** researched 2026-10-01. Cline documentation is live and unversioned; source inspected at commit [`95e54e4`](https://github.com/cline/cline/tree/95e54e4a023567d5ec47a997b6ef1eac273e3e06). Roo documentation is live and unversioned; source inspected at [`b867ec9`](https://github.com/RooCodeInc/Roo-Code/tree/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16). Roo’s latest release endpoint reports [`v3.54.0`, published 2026-05-15](https://api.github.com/repos/RooCodeInc/Roo-Code/releases/latest). **Documented** below means presented as available by official documentation; **source-only** means implementation exists at the inspected commit, but its first shipped version is UNKNOWN. No announced-only capabilities were established.

### Cline

Documented: each skill is `<skill-name>/SKILL.md`, YAML frontmatter followed by Markdown instructions. Metadata is loaded initially; the model invokes the `skills` tool to load instructions. Users can explicitly invoke enabled skills through `/skill-name`. Skills have UI enable/disable toggles and are enabled by default. Bundled documentation, scripts and templates are accessed as needed, not eagerly loaded. [Cline skills](https://docs.cline.bot/customization/skills)

| Frontmatter key | Type | Contract |
|---|---|---|
| `name` | string, required | Must match directory name. |
| `description` | string, required | Trigger description; maximum 1,024 characters. |

These are the fields documented for ordinary Cline skills; documented support for `allowed-tools`, model overrides and invocation-control flags is UNKNOWN. [Cline skills](https://docs.cline.bot/customization/skills)

Discovery:

- Project: `.cline/skills/`, `.clinerules/skills/`, `.claude/skills/`. The configuration page additionally lists `.agents/skills/`.
- Global: `~/.cline/skills/`; configuration additionally lists `~/.agents/skills/`.
- **Documentation explicitly says global wins over project on identical skill names**, unlike Roo.
- Installed Cline code plugins can bundle top-level `skills/<name>/SKILL.md` beside `package.json`; those skills are discovered when installed or loaded through `pluginPaths`.
- Exact ordering among all project aliases and plugin-bundled skills: UNKNOWN from the cited documentation. [Skills](https://docs.cline.bot/customization/skills), [configuration](https://docs.cline.bot/getting-started/config), [bundled skills](https://docs.cline.bot/sdk/guides/writing-plugins#bundling-skills)

**Source-only, separate Agent Plugins lane:** skills loaded from Agent Plugins packages use a stricter parser than ordinary Cline skills. [Parser](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts)

| Frontmatter key | Type | Contract |
|---|---|---|
| `name` | string, required | NFKC-normalized; 1–64 characters; lowercase Unicode letters/numbers/hyphens; no edge or consecutive hyphens; matches directory. |
| `description` | string, required | Trimmed, nonempty, at most 1,024 characters. |
| `license` | string, optional | License metadata. |
| `compatibility` | string, optional | Trimmed, nonempty if supplied, at most 500 characters. |
| `metadata` | object<string,string>, optional | Arbitrary string-valued metadata. |
| `allowed-tools` | string, optional | Parsed metadata. Enforcement semantics UNKNOWN; do not equate parsing with a permission boundary. |

Unknown frontmatter fields reject that Agent Plugin skill. Ordinary Cline skills intentionally retain a more permissive path. Therefore these two ingestion lanes are not interchangeable. [Parser](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts)

Per-tool companion metadata such as `agents/openai.yaml`: UNKNOWN as a consumed Cline contract; no companion manifest is documented. [Skills](https://docs.cline.bot/customization/skills)

### Roo Code

Documented: `SKILL.md` with bundled scripts, templates and references; no resource manifest. Skills load on demand, with startup indexing, file watching, mode filtering and symlink support. [Roo skills](https://roocodeinc.github.io/Roo-Code/features/skills/)

| Frontmatter key | Type | Contract |
|---|---|---|
| `name` | string, required | Matches directory **or symlink name**; 1–64 lowercase letters/numbers/hyphens; no edge or consecutive hyphens. |
| `description` | string, required | Trimmed, 1–1,024 characters. |
| `modeSlugs` | string[], optional; source-only field | Restricts availability to listed modes. Non-string/empty entries are filtered; an empty resulting array means any mode. |
| `mode` | string, optional; legacy source field | Single-mode restriction; used if `modeSlugs` is not an array. |

Mode restriction precedence is `modeSlugs` → `mode` → containing `skills-{modeSlug}/` directory. The inspected parser consumes only these fields; `allowed-tools`, license, compatibility and other metadata do not become permissions or runtime overrides there. [SkillsManager](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/skills/SkillsManager.ts)

Documented discovery priority, highest first:

1. Project `.roo/skills-{modeSlug}/`
2. Project `.roo/skills/`
3. Project `.agents/skills-{modeSlug}/`
4. Project `.agents/skills/`
5. Global `~/.roo/skills-{modeSlug}/`
6. Global `~/.roo/skills/`
7. Global `~/.agents/skills-{modeSlug}/`
8. Global `~/.agents/skills/`

Project always beats global; `.roo` beats `.agents` within a scope—even a generic `.roo` skill beats a mode-specific `.agents` skill. [Roo skills](https://roocodeinc.github.io/Roo-Code/features/skills/#override-priority)

Documentation describes model-driven loading through `read_file`; inspected source also has a `skill` tool result/approval formatter, with `args` rendered as “Provided arguments,” not substituted into placeholders. User-facing skill slash-command behavior is UNKNOWN from the inspected documentation. No per-skill companion metadata file is documented. [Skills](https://roocodeinc.github.io/Roo-Code/features/skills/), [skill invocation](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/skills/skillInvocation.ts)

## Instructions and rules

### Cline

Documented sources: `.clinerules/`, `.cline/rules/`, legacy `.cursorrules`, `.windsurfrules`, project-root `AGENTS.md`, global `~/.agents/AGENTS.md`. Both workspace rule directories are searched and combined. Global directories include `~/.cline/rules`, `~/Documents/Cline/Rules`, `~/Cline/Rules`; Windows additionally searches configured OneDrive Documents locations. Workspace instructions take precedence over conflicting global instructions. Individual files can be toggled. [Cline rules](https://docs.cline.bot/customization/cline-rules)

| Frontmatter key | Type | Activation semantics |
|---|---|---|
| `paths` | string[] | OR across globs and context files. |
| No frontmatter | — | Always active, unless toggled off. |
| `paths: []` | empty array | Never activates. |
| Invalid YAML | — | **Fails open**: raw rule content remains active. |

Supported glob syntax: `*`, `**`, `?`, character classes `[abc]`, alternatives `{a,b}`. Matching context includes prompt-mentioned paths, open tabs, visible files, files edited during the task and pending edits. Activation can occur initially or mid-task. [Conditional rules](https://docs.cline.bot/customization/cline-rules#conditional-rules)

Native model-decided/manual rule frontmatter, nested `AGENTS.md` traversal, recursive includes/import directives, `CLAUDE.md`, `GEMINI.md`, Cursor `.mdc` metadata and steering-file compatibility: UNKNOWN. The documentation’s `.cursorrules` compatibility must not be generalized to `.cursor/rules/*.mdc`. [Supported rule types](https://docs.cline.bot/customization/cline-rules#supported-rule-types)

Cline code plugins can register rules with `id:string`, `content:string | (() => string | Promise<string>)`, `source?:string`, and source-only `whenToolAvailable?:string`, which gates inclusion on whether that named tool remains available after policy filtering. [Contribution registry](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/extensions/contribution-registry.ts)

### Roo Code

Documented files/directories:

| Scope | General | Mode-specific |
|---|---|---|
| Global | `~/.roo/rules/` | `~/.roo/rules-{modeSlug}/` |
| Project | `.roo/rules/` | `.roo/rules-{modeSlug}/` |
| Project legacy fallback | `.roorules`; documentation also names `.clinerules` | `.roorules-{modeSlug}` |

Directory contents are recursively aggregated; files sort by **case-insensitive basename**, not full relative path. Empty files and cache/temporary files are skipped. Symlinks are resolved, with maximum resolution depth 5. Directory-based rules suppress corresponding legacy fallbacks when applicable directory content was loaded. [Roo instructions](https://roocodeinc.github.io/Roo-Code/features/custom-instructions/)

Activation is always-on for general instructions and current-mode-scoped for `rules-{modeSlug}`. Native glob/model-decided/manual rule frontmatter: UNKNOWN. Mode scoping is not file scoping. [Roo instructions](https://roocodeinc.github.io/Roo-Code/features/custom-instructions/)

Documented prompt arrangement:

1. Language preference.
2. Global UI custom instructions.
3. Current-mode UI custom instructions.
4. Mode-specific rule directories or fallback.
5. `.rooignore` instructions.
6. Root `AGENTS.md`, or `AGENT.md` fallback.
7. Generic rule directories or fallback.

Within rule levels, global is loaded before project; project wins on conflicts. `roo-cline.useAgentRules:boolean`, default `true`, controls root agent-rule loading; `AGENTS.md` wins over `AGENT.md`. Nested agent-rule traversal is not documented. [Combination and AGENTS support](https://roocodeinc.github.io/Roo-Code/features/custom-instructions/#how-instructions-are-combined)

`CLAUDE.md`, `GEMINI.md`, `.mdc`, steering files and explicit includes/imports: UNKNOWN. Do not infer support from Markdown references in rule bodies. [Roo instructions](https://roocodeinc.github.io/Roo-Code/features/custom-instructions/)

## Subagents and custom agents

### Cline

Documented subagents: CLI and Desktop; **not VS Code or JetBrains**. `spawn_agent` starts an independent context, returns its final report and supports parallel work and nested spawning. Subagents inherit built-in tools for the current Plan/Act mode but do not receive MCP tools. Approving spawn approves subsequent subagent operations without individual approval prompts. Plan mode excludes editing tools and blocks recognized mutating shell commands, but is explicitly **not write-proof**. [Subagents](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/docs/features/subagents.mdx)

**Source-only configured-agent files:** `.cline/agents/*.yaml` or `*.yml`, and global `~/.cline/agents/`. Despite the extension, each file requires YAML frontmatter delimited by `---`, followed by a nonempty prompt body; it is not a plain YAML object. Project search precedes global; first case-insensitive normalized name wins. [Agent parser](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/tools/team/configured-agent-config.ts), [search paths](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/storage/paths.ts#L476-L485)

| Frontmatter key | Type | Meaning |
|---|---|---|
| `name` | nonempty trimmed string, required | Agent identity; deduplication is case-insensitive. |
| `description` | nonempty trimmed string, required | Agent description. |
| `tools` | string or string[], optional | Tool-name list; scalar splits on commas; entries trim/deduplicate. |
| `skills` | string or string[], optional | Skill-name list; same normalization. |
| `providerId` | nonempty trimmed string, optional | Provider override. |
| `modelId` | nonempty trimmed string, optional | Model override. |
| `maxIterations` | positive integer, optional | Iteration limit. |
| Body | nonempty Markdown/text | System prompt. |

`model`, permission mode and color fields are not consumed by this schema. Configured-agent invocation and inheritance details beyond the parser: UNKNOWN. [Agent parser](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/tools/team/configured-agent-config.ts)

Documented teams are a separate feature for SDK/CLI/Kanban, unavailable in VS Code/JetBrains; `/team` creates coordinator/task-board/mailbox/mission-log orchestration. Team state is documented at `~/.cline/data/db/teams.db`. Teams are unavailable with `--yolo`; tools settings can disable `teams` and `spawn_agent`. [Agent teams](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/docs/cli/agent-teams.mdx)

### Roo Code

Documented custom agents are **modes**, not Claude-style agent Markdown files. Global definitions: extension settings `custom_modes.yaml`, legacy `custom_modes.json`; project: `.roomodes`, YAML or JSON. Root object: `customModes:ModeConfig[]`. Project modes override global modes; imported matching slugs overwrite existing definitions. Modes support automated selection/switching and task delegation through `switch_mode`/`new_task`. [Custom modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes/)

Complete inspected mode schema:

| Key | Type | Meaning |
|---|---|---|
| `slug` | string, required | `/^[a-zA-Z0-9-]+$/`; unique within `customModes`. |
| `name` | nonempty string, required | Display name. |
| `roleDefinition` | nonempty string, required | Beginning-of-system-prompt identity. |
| `description` | string, optional | UI summary. |
| `whenToUse` | string, optional | Automated mode/delegation guidance; otherwise first sentence of role definition is used. |
| `customInstructions` | string, optional | Additional behavioral instructions. |
| `groups` | array, required | Tool groups or `[group, options]` tuples; duplicate groups rejected. |
| `source` | `"global" \| "project"`, optional | System-added provenance; docs say not to author it. |
| Tuple `fileRegex` | string, optional | Valid JavaScript regex; edit-file restriction. |
| Tuple `description` | string, optional | Restriction description. |

Source enum: `read`, `edit`, `command`, `mcp`, `modes`. Legacy `browser` entries are silently stripped before validation. This is broader than the documentation’s four-group list and important for round trips. [Mode schema](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/mode.ts), [tool-group enum](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/tool.ts)

Export/import packages add `rulesFiles:[{relativePath:string, content:string}]` to a mode entry. Import writes definitions and rule files under project `.roo/rules-{slug}/` or global `~/.roo/rules-{slug}/`; slug changes remap rule paths. Model selection is “sticky” host state, not a `model` property in the mode schema. Agent color, per-agent sandbox and independent permission-mode fields: Not supported by the inspected mode schema. [Custom modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes/), [schema](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/mode.ts)

## Commands and prompts

### Cline

Documented built-ins: `/newtask`, `/smol` alias `/compact`, `/newrule`, `/deep-planning`, `/reportbug`; enabled skills additionally become explicit slash invocations. This does **not** establish that workflow files were replaced by skills. [Commands](https://docs.cline.bot/core-workflows/using-commands)

Workflow directories remain documented: project `.cline/workflows/`, older `.clinerules/workflows/`; global `~/.cline/workflows/`, compatibility `~/Documents/Cline/Workflows`. Extension state uses `globalWorkflowToggles` and workspace `workflowToggles`. Complete workflow frontmatter, filename resolution, same-name precedence, argument placeholders, automatic shell/file interpolation and model/tool overrides: UNKNOWN in the current inspected material. The former `/customization/workflows` URL redirects to Rules. [Configuration](https://docs.cline.bot/getting-started/config), [workflow implementation](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/core/context/instructions/user-instructions/workflows.ts)

Code-plugin command fields:

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Command identifier. |
| `description` | string, optional | Description. |
| `handler` | function, optional | Receives raw `input:string`; returns synchronous/async result. |
| Result | string or object | Object fields `reply?:string`, `submitPrompt?:string`. |

This is executable registration, not prompt-file frontmatter. [Contribution registry](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/extensions/contribution-registry.ts#L8-L21)

### Roo Code

Documented files: `.roo/commands/<name>.md`, `~/.roo/commands/<name>.md`; filename supplies `/name`. Project wins over global, which wins over built-in commands. Commands remain distinct from skills. [Slash commands](https://roocodeinc.github.io/Roo-Code/features/slash-commands/), [loader](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/command/commands.ts)

| Frontmatter key | Type | Meaning |
|---|---|---|
| `description` | string, optional | Menu description. |
| `argument-hint` | string, optional | Visual guidance only; not inserted as arguments. |
| `mode` | string, optional | Mode slug to switch to before processing prompt. |
| Body | Markdown | Command prompt. |

Strings are trimmed; empty/non-string values are ignored. Invalid frontmatter falls back to the entire raw file as command content. Symlink handling has depth limit 5. Normal subdirectories are not recursively traversed by the inspected directory-entry handler; do not assume hierarchical command namespaces. [Loader](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/command/commands.ts)

`$ARGUMENTS`, positional replacement, shell execution interpolation, `@file` expansion inside definitions, model overrides and `allowed-tools`: UNKNOWN; they are not fields consumed by this loader. `mode` is an actual context switch, not merely descriptive metadata. [Loader](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/command/commands.ts)

## Hooks

### Cline

**Three distinct interfaces exist; do not flatten them into one event enum.** The current Hooks documentation only points to SDK Plugins. Source still contains extension file hooks and SDK file-hook adaptation. [Hooks](https://docs.cline.bot/customization/hooks), [SDK plugins](https://docs.cline.bot/sdk/plugins)

**VS Code file hooks, source-observed:**

| Exact event/file basename | Meaning |
|---|---|
| `PreToolUse` | Before tool execution. |
| `PostToolUse` | After tool execution. |
| `UserPromptSubmit` | User prompt submission. |
| `TaskStart` | Task starts. |
| `TaskResume` | Task resumes. |
| `TaskCancel` | Task cancellation. |
| `TaskComplete` | Task completion. |
| `Notification` | Notification envelope. |
| `PreCompact` | Before context compaction/truncation. |

These are the complete `Hooks` interface keys at the inspected commit. Scope paths include `.cline/hooks/`, `.clinerules/hooks/`, `~/.cline/hooks/`, `~/Documents/Cline/Hooks`; hooks have toggles and default enabled state. Matchers beyond event filename are UNKNOWN. [Factory](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/core/hooks/hook-factory.ts), [enabled state](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/core/hooks/hooks-utils.ts), [configuration](https://docs.cline.bot/getting-started/config)

Extension JSON input fields, using generated camelCase names:

- Common: `clineVersion:string`, `hookName:string`, `timestamp:string` containing epoch milliseconds, `taskId:string`, `workspaceRoots:string[]`, `userId:string`, `model:{provider:string,slug:string}`.
- `preToolUse:{toolName:string,parameters:Record<string,string>}`.
- `postToolUse`: preceding fields plus `result:string`, `success:boolean`, `executionTimeMs:number`.
- `userPromptSubmit:{prompt:string,attachments:string[]}`.
- `taskStart`, `taskCancel`, `taskComplete`: `{taskMetadata:Record<string,string>}`.
- `taskResume`: preceding metadata plus `previousState:Record<string,string>`.
- `notification`: string fields `event`, `source`, `message`, `eventVersion`, `eventId`, `sourceType`, `sourceId`, `severity`; booleans `waitingForUserInput`, `messageTruncated`, `requiresUserAction`.
- `preCompact`: strings `taskId`, `ulid`, `compactionStrategy`, `contextJsonPath`, `contextRawPath`; numbers `contextSize`, `previousApiReqIndex`, `tokensIn`, `tokensOut`, `tokensInCache`, `tokensOutCache`, `deletedRangeStart`, `deletedRangeEnd`. Temporary context files are cleaned up after hook execution. [Hook protobuf](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/proto/cline/hooks.proto), [input completion](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/core/hooks/hook-factory.ts)

Output: optional `cancel:boolean`, `contextModification:string`, `errorMessage:string`; `shouldContinue` is explicitly rejected as removed. Context modification is capped at 50,000 characters. Timeout is 30,000 ms. Multiple runners execute **in parallel**, not ordered middleware. Valid JSON is processed even with nonzero exit status, with warning; exit 0 without JSON succeeds; nonzero without valid output raises execution error. Do not map Claude’s special exit-2 blocking convention onto this interface. HTTP/prompt handlers and declarative allow/deny/ask/modify enums: Not supported by the inspected extension output contract. [Factory](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/core/hooks/hook-factory.ts)

**SDK/CLI file hooks, source-only differences:**

| File basename | Serialized `hookName` |
|---|---|
| `TaskStart` | `agent_start` |
| `TaskResume` | `agent_resume` |
| `TaskCancel` | `agent_abort` |
| `TaskComplete` | `agent_end` |
| `TaskError` | `agent_error` |
| `PreToolUse` | `tool_call` |
| `PostToolUse` | `tool_result` |
| `UserPromptSubmit` | `prompt_submit` |
| `PreCompact` | No generic event mapping; handled separately. |
| `SessionShutdown` | `session_shutdown` |

Recognized extensions: no extension, `.sh`, `.bash`, `.zsh`, `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.py`, `.ps1`; basename matching is case-insensitive. Entries sort by full path. [File configuration](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/hooks/hook-file-config.ts)

SDK payload adds `agent_id:string`, `parent_agent_id:string|null`, optional `sessionContext:{rootSessionId?:string,hookLogPath?:string}`, optional structured `workspaceInfo`, and uses ISO timestamp. Event-specific fields include `iteration:number`, `tool_call:{id,name,input}`, `tool_result:ToolCallRecord`, `turn:unknown`, `error:{name,message,stack?}`, `reason?:string`, plus compatibility fields listed above. [Event contracts](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/hooks/events.ts)

SDK subprocess input is JSON on stdin. Output is JSON or the last `HOOK_CONTROL<TAB><json>` line. Adapter consumes `cancel?:boolean`, `review?:boolean`, `context?:string` or `contextModification?:string`, `errorMessage?:string`, `overrideInput?:unknown`. Run-start hooks are detached by default unless the host enables blocking run-start behavior; selected blocking hooks default to 120,000 ms. Inherited process environment is used; source references `CLINE_USER_ID`, `CLINE_VERSION`, `CLINE_HOOKS_LOG_PATH`, `CLINE_HOOK_AGENT_RESUME`. These are not equivalent to the extension’s 30-second synchronous interface. [Adapter](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/hooks/hook-file-hooks.ts), [subprocess runner](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/hooks/subprocess-runner.ts)

**Documented executable plugin callbacks:** `beforeRun`, `afterRun`, `beforeModel`, `afterModel`, `beforeTool`, `afterTool`, `onEvent`. Respectively: run begins; terminal run finishes; model request; model response; tool begins; tool finishes; runtime event. Source guidance documents `{stop:true,reason:string}` for blocking before-tool behavior and result replacement after tools. These are typed callbacks, not shell exit-code contracts. [SDK plugins](https://docs.cline.bot/sdk/plugins), [repository reference](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/.agents/skills/cline-sdk/references/plugins/REFERENCE.md)

The SDK documentation additionally lists stage names `input`, `runtime_event`, `session_start`, `run_start`, `iteration_start`, `turn_start`, `before_agent_start`, `tool_call_before`, `tool_call_after`, `turn_end`, `stop_error`, `iteration_end`, `run_end`, `session_shutdown`, `error`; policy keys `mode:"blocking"|"async"`, `timeoutMs:number`, `retries:number`, `retryDelayMs:number`, `failureMode:"fail_open"|"fail_closed"`, `maxConcurrency:number`, `queueLimit:number`. A complete current public schema binding these stage policies to installable plugin manifests was not established; preserve separately rather than inventing a manifest mapping. [SDK plugins](https://docs.cline.bot/sdk/plugins)

### Roo Code

**Not supported as an established user-facing lifecycle-hook capability in the inspected evidence.** No lifecycle-hook implementation/configuration was found in the inspected repository tree; React `hooks/` directories are UI code, not agent hooks. Event enum, handler schemas, matchers, payloads, outputs, timeouts and scope: UNKNOWN. [Inspected tree](https://api.github.com/repos/RooCodeInc/Roo-Code/git/trees/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16?recursive=1)

## MCP servers

### Cline

Documented shared settings: `~/.cline/data/settings/cline_mcp_settings.json`, override `CLINE_MCP_SETTINGS_PATH`; root `mcpServers:Record<string,ServerConfig>`. CLI wizard supports browser OAuth. No project `.cline/mcp.json` contract was established. [MCP documentation](https://docs.cline.bot/mcp/mcp-overview)

Complete consumed settings fields across inspected extension and SDK parsers:

| Key | Type | Meaning / applicability |
|---|---|---|
| `type` | `"stdio"|"sse"|"streamableHttp"`, optional in flat form | Transport; command implies stdio; omitted URL type defaults to SSE. |
| `transportType` | legacy string / SDK enum | Legacy transport spelling; SDK maps `"http"` to `"streamableHttp"`. |
| `transport` | object, nested-format alternative | Required `type`; corresponding transport fields below. |
| `command` | string | Local executable. |
| `args` | string[], optional | Process arguments. |
| `cwd` | string, optional | Process working directory. |
| `env` | object<string,string>, optional | Process environment. |
| `url` | URL string | Remote endpoint. |
| `headers` | object<string,string>, optional | HTTP headers. |
| `disabled` | boolean, optional | Disable server. |
| `timeout` | number, optional | Seconds; tolerant reads normalize malformed values. |
| `autoApprove` | string[], optional; extension | Automatically approved tool names. |
| `remoteConfigured` | boolean, optional; extension | Server was synchronized from remote configuration. |
| `metadata` | arbitrary value in extension; object<string,unknown> in SDK | Runtime/source metadata. |
| `oauthClient` | object, SDK | `clientId:string`, `clientSecret?:string`. |
| `oauth` | opaque in extension; structured in SDK | Persisted OAuth state, not portable package credentials. |

SDK OAuth-state fields: optional objects `clientInformation`, `tokens`, `discoveryState`; strings `codeVerifier`, URL `redirectUrl`, `lastError`; positive integer `lastAuthenticatedAt`; boolean `authorizationRequired`. SDK unknown object fields are stripped. `envFile`, `watchPaths`, `disabledTools`, explicit trust key: not consumed by these inspected schemas. [Extension schema](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/services/mcp/schemas.ts), [SDK loader](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/mcp/config-loader.ts)

Extension expansion recursively replaces `${env:VAR_NAME}` in string values; missing variables remain unchanged and generate a warning. SDK equivalent environment expansion behavior is UNKNOWN from the inspected loader. [Expansion](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/utils/envExpansion.ts)

**Source-only Agent Plugins MCP lane:** package-root `mcp.json`, schema `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`. Stdio exact fields: `type`, `command`, `args`, `env`, `cwd`; `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expand, and corresponding reserved environment keys are injected and cannot be authored. Default cwd is plugin root; authored cwd must begin `./`, `${PLUGIN_ROOT}`, or `${PLUGIN_DATA}`, with containment checks. Runtime server name is `<plugin-name>.<server-name>`. Data path is instance-specific, based on plugin name and a hash of root path. This is a stricter, different contract from user MCP settings. [Agent Plugin loader](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/loader.ts)

### Roo Code

Documented global extension settings `mcp_settings.json`; project `.roo/mcp.json`. Both use `mcpServers:Record<string,ServerConfig>`; project wins on identical server names. [MCP documentation](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/)

| Key | Type | Meaning |
|---|---|---|
| `type` | `"stdio"|"sse"|"streamable-http"`, optional in source schema | Transport; command infers stdio; URL without type resolves through SSE-first union. |
| `command` | nonempty string | Stdio executable. |
| `args` | string[], optional | Arguments. |
| `cwd` | string | Defaults to first workspace folder or process cwd. |
| `env` | object<string,string>, optional | Process environment. |
| `url` | URL string | Remote endpoint. |
| `headers` | object<string,string>, optional | Remote headers/authentication. |
| `disabled` | boolean, optional | Disable server. |
| `timeout` | number, optional | 1–3,600 seconds; default 60. |
| `alwaysAllow` | string[] | Auto-approved tools; default `[]`. |
| `watchPaths` | string[], optional | Restart when watched files change; base schema accepts it for all transports. |
| `disabledTools` | string[] | Tools excluded from availability; default `[]`. |

Local and remote transport fields cannot be mixed. `envFile`, OAuth client/state fields, explicit trust and enabled-tools allowlist are not consumed by the inspected schema. OAuth as a user-facing remote-server feature: UNKNOWN. [Server schema](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/mcp/McpHub.ts)

Expansion is applied deeply to configuration: `${env:NAME}` and `${workspaceFolder}`. Missing environment variables warn and remain unresolved at this call site; workspace folder is the first workspace or empty string. No plugin-root variables were established. **Spelling pitfall:** Roo uses `streamable-http`; Cline uses `streamableHttp`. **Approval pitfall:** Roo uses `alwaysAllow`; Cline uses `autoApprove`. [Expansion call](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/mcp/McpHub.ts#L701-L704), [expander](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/utils/config.ts)

## Other native capability types

### Cline

Documented code plugins register tools, commands, rules, message builders, providers and automation events. Source additionally registers MCP servers. Exact capability enum includes `tools`, `commands`, `rules`, `messageBuilders`, `providers`, `automationEvents`, `hooks`, `mcp`. [SDK plugins](https://docs.cline.bot/sdk/plugins), [contribution registry](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/extensions/contribution-registry.ts)

| Contribution | Fields |
|---|---|
| Tool | `name:string`, `description:string`, `inputSchema:object`, `execute:function`; source runtime additionally `resultPolicy?:"cache-oversized"`, `lifecycle?:{completesRun?:boolean}`, `executionMode?:"sequential"|"parallel"`, `timeoutMs?:number`, `retryable?:boolean`, `maxRetries?:number`. |
| Message builder | `name:string`, `build:function`; transforms provider-bound messages. Multiple builders run in registration order. |
| Provider descriptor | `name:string`, `description?:string`, `metadata?:object`. Descriptor does not alone specify a complete provider adapter. |
| Automation event type | `eventType:string`, `source:string`, `description?:string`, `attributesSchema?:object`, `payloadSchema?:object`, `examples?:AutomationEventEnvelope[]`, `metadata?:object`. |

[Runtime tool types](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/agent.ts), [contribution types](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/extensions/contribution-registry.ts), [builders](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/.agents/skills/cline-sdk/references/plugins/REFERENCE.md)

LSP can be implemented as a code plugin—official documentation demonstrates `typescript-lsp-plugin`—but no declarative `lspServers` package facet was established. Themes, output styles, statuslines, keybindings, monitors and user-config declaration schemas as package contributions: UNKNOWN. A host `tuiTheme` setting is not evidence of a package theme API. [Plugin documentation](https://docs.cline.bot/customization/plugins), [global settings](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/services/global-settings.ts)

### Roo Code

**Experimental:** custom JS/TS tools, enabled through Experimental settings. Files: `.roo/tools/*.ts|*.js`, `~/.roo/tools/*.ts|*.js`; project tools override same-name global tools. Export a `defineCustomTool(...)` definition. npm dependencies can be installed beside tools. [Official experimental documentation](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/apps/docs/docs/features/experimental/custom-tools.md)

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Model-visible tool identifier. |
| `description` | string | Model-visible description. |
| `parameters` | Zod schema, optional | Argument validation/JSON Schema conversion. |
| `execute` | `(args, context) => Promise<string>` | String-only result. |
| Context `mode` | string | Current mode. |
| Context `task` | `TaskLike` | Task interface. |

Tools transpile through esbuild. `.env` and `.env.*` are copied to the tool cache but **not injected into `process.env`**; tool code must load them. Reload watching is unreliable; use Refresh Custom Tools. [Tool schema](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/custom-tool.ts), [experimental documentation](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/apps/docs/docs/features/experimental/custom-tools.md)

General plugin modules, declarative LSP packages, output styles, themes, apps/connectors, monitors, statuslines and package keybindings: UNKNOWN. Custom tools are executable tools, not a general lifecycle/plugin contribution system. [Custom-tool schema](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/custom-tool.ts)

## Permissions, trust and security

### Cline

- Rules/skills are instructions, not established permission sandboxes. MCP `autoApprove` is operational permission configuration; limit it to trusted tools. [MCP security](https://docs.cline.bot/mcp/mcp-overview#security-basics)
- Hooks and plugins execute code; documentation tells users to review them as executable artifacts. Documented install-time trust prompts, signatures and provenance verification: UNKNOWN. [Configuration security](https://docs.cline.bot/getting-started/config#security-notes)
- Plugin capability declarations constrain which registration APIs a plugin may use; they do not establish filesystem/network confinement. Source offers `"sandbox"` versus `"in_process"` loading, with a subprocess implementation, but an OS security sandbox guarantee was not established. [Registry](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/extensions/contribution-registry.ts), [plugin loading](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/plugin/plugin-config-loader.ts), [subprocess sandbox](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/plugin/plugin-sandbox.ts)
- Global host settings include `toolAutoApprove?:boolean`, `disabledTools?:string[]`, `tools?:{[tool]:{enabled:boolean}}`, `disabledPlugins?:string[]`, `disabledAgentPlugins?:string[]`. These are host settings, not permission fields packages may automatically impose. [Settings schema](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/services/global-settings.ts)
- Spawn approval covers all subagent operations; Plan mode is not write-proof. [Subagent approvals](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/docs/features/subagents.mdx)
- Agent Plugins source checks realpath containment and rejects escaping package paths/reserved environment assignments. It explicitly implements no client-extension namespace. [Loader](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/loader.ts)

Enterprise package allow/deny policy, mandatory installation, workspace-trust gating and signature schemas: UNKNOWN.

### Roo Code

- Modes author tool-group availability and edit `fileRegex` restrictions. MCP packages/settings can author `alwaysAllow` and `disabledTools`. These controls have different meanings and must not collapse into one “allowed tools” field. [Modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes/), [MCP](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/)
- **Experimental custom tools execute with automatic approval once enabled**; there is no per-call approval prompt. Documentation explicitly requires trusting the code. [Experimental tools](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/apps/docs/docs/features/experimental/custom-tools.md)
- Marketplace installation opens modified config for review; documentation does not establish signature verification or a security trust-consent protocol. [Marketplace](https://roocodeinc.github.io/Roo-Code/features/marketplace)

Workspace-trust enforcement, OS sandboxing, provenance/signature formats, enterprise package blocking/requiring and package-authored global allow/deny settings: UNKNOWN.

## Packaging, install and scopes

### Cline

**Documented Cline code-plugin lane:** SDK/CLI/Kanban; plugin installation documentation explicitly excludes VS Code and JetBrains. A repository SDK reference contradictorily says the same plugin runs in those extensions; retain this as unresolved host/version ambiguity. [Install documentation](https://docs.cline.bot/customization/plugins), [repository reference](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/.agents/skills/cline-sdk/references/plugins/REFERENCE.md)

`package.json` uses ordinary npm fields plus:

| Key | Type | Meaning |
|---|---|---|
| `cline` | object | Cline discovery namespace. |
| `cline.plugins` | array | String entry paths or descriptor objects. |
| Descriptor `paths` | string[] | `.ts`/`.js` plugin entry files. |
| Descriptor `capabilities` | string[] | Declared contribution capabilities. |
| Descriptor `providerIds` | string[], optional; source manifest | Provider targeting. |
| Descriptor `modelIds` | string[], optional; source manifest | Model targeting. |
| Runtime `name` | string | Plugin identifier. |
| Runtime `manifest` | object | Nonempty capabilities; optional paths/provider/model targeting. |
| Runtime `setup` | function, optional | One-time registration. |
| Runtime `hooks` | callback object, optional | Lifecycle callbacks. |
| Runtime `disabled` | boolean, optional; source base contract | Skip setup. |
| Runtime `type` | string, optional; source base contract | Extension discriminator. |

Entry exports may be default or named. Without `cline.plugins`, installer falls back to entry discovery/scanning. Single-file plugins may import Node built-ins and host-provided `@cline/*`; dependencies require a package. Host-provided packages should be optional peer dependencies. [Manifest documentation](https://docs.cline.bot/customization/plugins#plugin-manifest-format), [writing plugins](https://docs.cline.bot/sdk/guides/writing-plugins), [manifest contract](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/extensions/contribution-registry.ts)

Documented install sources: HTTPS `.ts`/`.js` file URL, Git URL/SSH with `@ref`, npm spec, local file/directory. ZIP install is not documented. CLI: `cline plugin install <source>`; `--force` replaces same-source installation; `--cwd` selects project plugin root. [Installation](https://docs.cline.bot/customization/plugins)

Disk:
- Global `~/.cline/plugins/_installed/{npm,git,remote,local}/...`.
- Project `.cline/plugins/`.
- Source installer creates a wrapper `package.json` with `cline.plugins[].paths`, installs/copies package contents and dependencies, uses `_installed/.tmp` staging, then renames into final location.
- npm installation uses `--omit=dev --omit=peer --legacy-peer-deps --no-audit --no-fund --package-lock=false`.
- Source installer can synchronize plugin MCP registrations into global MCP settings; installation is not necessarily confined to copying plugin files.
- Enable/disable state uses `disabledPlugins`, not `enabledPlugins`. [Directory layout](https://docs.cline.bot/customization/plugins#plugin-directory-structure), [installer](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/services/plugin-install.ts), [settings](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/services/global-settings.ts)

Package updates, dependency graph resolution between capability packages, lockfiles, organizational scope and exact install-cache naming contract: UNKNOWN. Host `autoUpdateEnabled` must not be assumed to update installed plugins. [Settings](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/services/global-settings.ts)

**Source-only Agent Plugins 1.0 lane:** separate from executable Cline plugins. Required root `plugin.json`; optional `skills/` and `mcp.json`. Automatic root is **global `~/.agents/plugins/` only** in the inspected resolver; explicit `pluginPaths` are supported. Cline module discovery stops at `plugin.json` and will not recursively execute such a package’s JS/TS assets. [Storage contract](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/storage/paths.ts), [Agent Plugin loader](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/loader.ts)

Complete Agent Plugin manifest:
- `$schema:string`, required exact `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.
- `name:string`, required, 1–64 lowercase alphanumeric/hyphen/period characters; starts/ends alphanumeric; no `--` or `..`.
- Optional strings `version`, `description`, `homepage`, `repository`, `license`.
- `author?:{name?:string,email?:string,url?:string}`.
- `keywords?:string[]`.
- `extensions?:Record<string,unknown>`; no Cline extension namespace is implemented.
- Unknown top-level fields warn and are ignored; unknown author fields reject.
- Explicit roots precede discovery; first accepted manifest name reserves precedence, including disabled names. Host disable key: `disabledAgentPlugins`. [Manifest types](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/types.ts), [loader](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/loader.ts)

Cline source also has a marketplace action interface: `id:string`, `type:"mcp"|"skill"|"plugin"`, `name?:string`, `install?:{args?:string[]}`. This is an action input, **not a verified complete public catalog schema**. Catalog versioning, external marketplace schema and Agent Plugin installation source mechanics remain UNKNOWN. [Marketplace implementation](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/services/marketplace.ts)

### Roo Code

Documented marketplace ships **MCP configurations and custom modes**, not a general plugin package. Installation chooses project/global scope, writes `.roo/mcp.json`/global `mcp_settings.json` or `.roomodes`/global `custom_modes.yaml`, and opens the file for review. MCP installation methods include NPX and Docker; parameterized entries request configuration such as API keys. Invalid config prevents modification. Removal edits the appropriate config immediately. [Marketplace](https://roocodeinc.github.io/Roo-Code/features/marketplace)

Portable mode export/import uses `customModes` plus `rulesFiles`; import additionally writes `.roo/rules-{slug}/` or `~/.roo/rules-{slug}/` files. Skills, commands and custom tools use the loose directories already listed. [Custom modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes/), [skills](https://roocodeinc.github.io/Roo-Code/features/skills/), [commands](https://roocodeinc.github.io/Roo-Code/features/slash-commands/), [custom tools](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/apps/docs/docs/features/experimental/custom-tools.md)

General plugin manifest, Agent Plugins 1.0 package ingestion, arbitrary Git/ref/SHA/ZIP/package install specification, capability-package dependencies, `enabledPlugins`, local-only/org scopes, package versions/update behavior, complete catalog schema and exact custom-tool cache location: UNKNOWN. Global mode/MCP files live in extension storage settings, **not simply `~/.roo/`**, whose documented role is loose skills/rules/commands/tools. [Custom modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes/), [MCP](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/)

## Notable gaps and ambiguities

- **Do not claim release-level exhaustiveness.** Documentation is unversioned; source-only additions were not traced to first released versions. Roo latest release was identified, but the entire inspected main tree was not compared with that tag. Cline’s repository has multiple product release trains; `releases/latest` is not a reliable extension/CLI version selector. [Cline releases](https://api.github.com/repos/cline/cline/releases/latest), [Roo releases](https://api.github.com/repos/RooCodeInc/Roo-Code/releases/latest)
- Cline has **two package lanes**: executable `package.json`/`cline.plugins` modules and declarative Agent Plugins `plugin.json`. Their manifests, discovery, validation, skills and MCP behavior differ. Source support must not be mistaken for universal released-host support. [Storage discriminator](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/shared/src/storage/paths.ts)
- Cline plugin host support conflicts between current install documentation and repository SDK reference. Extension file hooks also remain implemented despite the Hooks page containing only an SDK link. [Plugin docs](https://docs.cline.bot/customization/plugins), [SDK reference](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/.agents/skills/cline-sdk/references/plugins/REFERENCE.md), [extension hook factory](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/apps/vscode/src/core/hooks/hook-factory.ts)
- Cline ordinary skill documentation says **global overrides project**; Roo explicitly does the reverse. Cline alias/plugin-skill precedence remains unresolved. [Cline skills](https://docs.cline.bot/customization/skills), [Roo skills](https://roocodeinc.github.io/Roo-Code/features/skills/)
- Roo source consumes `modeSlugs` and legacy `mode` skill metadata beyond its basic documented frontmatter. Source tool-group enum additionally includes `modes` and strips legacy `browser`. Preserve these as target-specific fields rather than silently dropping them. [Skill parser](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/services/skills/SkillsManager.ts), [tool enum](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/tool.ts)
- Complete Cline workflow interpolation/frontmatter, complete runtime-hook policy schema, full marketplace catalogs, enterprise/security policies and exact package/tool cache layouts were not established. They remain UNKNOWN, not “unsupported.”
- **ACF implication:** same-format losslessness requires retaining original frontmatter, unknown JSON keys, source lane, companion assets and host-specific state separately from interpreted portable fields. The observed parsers normalize, strip or reject fields; merely reserializing their parsed objects cannot satisfy a lossless round-trip contract. [Cline strict skill parser](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts), [Cline MCP parser](https://github.com/cline/cline/blob/95e54e4a023567d5ec47a997b6ef1eac273e3e06/sdk/packages/core/src/extensions/mcp/config-loader.ts), [Roo mode parser](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/mode.ts)
