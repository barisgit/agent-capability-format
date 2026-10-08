# Facet: hooks (snapshot 2026-10-01)

Scope: lifecycle hooks, meaning author-supplied handlers that the agent runtime calls at defined points (session, prompt, tool call, permission prompt, stop, subagent, compaction, notification) and that may observe, inject context, or change control flow. Covered: event vocabulary, matchers, handler kinds (command, HTTP, MCP tool, LLM prompt), the stdin/stdout/exit-code wire protocol, effects and their aggregation, failure and timeout polarity, placeholders and environment, ordering, and package locations. Code-registered listeners inside executable extension modules (Pi `pi.on`, OpenCode plugin hooks, Amp `amp.on`, Lume `ctx.hooks.on`, Cline SDK plugin callbacks) belong to the extension-module facet; they appear here as hook *targets* because ACF can only reach them through a generated bridge module.

Evidence: the 15 inventories under `../tools/` (each cites its sources; Devin Local is in `windsurf.md`, Goose and Kiro in `goose-kiro.md`, Cline and Roo in `cline-roo.md`), `../advice-core-vs-extras.md`, SPEC §7, §13, §14.3 to §14.5, §22.3, §22.6, §24, §25, and the code paths cited in section 6. Spot checks for this facet on 2026-10-01 against [Claude hooks reference](https://code.claude.com/docs/en/hooks) (handler `if` holds exactly one permission rule, is evaluated only on tool events, and is best-effort; `shell` accepts `bash` or `powershell`) and [Codex hooks](https://learn.chatgpt.com/docs/hooks) (`ask` is not implemented; `PermissionRequest` `updatedInput`, `updatedPermissions`, and `interrupt` fail closed; `PreCompact` exists).

Cell and status legend used throughout (same as the commands and instructions facets):

| Mark | Meaning |
|---|---|
| **N**(spelling) | Native: the target has the same meaning; writer emits that spelling. |
| **T**(how) | Translated: a deterministic rewrite preserves the meaning. `shim` means the ACF hook runner (section 2.6) performs the rewrite at run time. `bridge` means a generated extension module hosts the command hook (section 2.7). |
| **D**(how) | Degraded: meaning is weakened in a declared way; writer emits the named `lossy` diagnostic. Allowed only for non-enforcing meanings. |
| **E** | Refused: writer does not emit the hook for that target (`error` diagnostic, activation blocked) because every available degradation would fail open on an enforcement effect. |
| **U** | Unsupported and nothing to emit. When the canonical field is set this becomes D (non-enforcing) or E (enforcing). |
| **?** | Unverified: documentation does not establish the behavior; writer treats it as U until a fixture proves it (section 7). |
| — | Not applicable. |

Abbreviations in column headers: CC Claude Code, CX Codex, CU Cursor, OC OpenCode, PI Pi, AP Agent Plugins 1.0, CP Copilot CLI, VS VS Code Local harness, GE Gemini CLI, AM Amp, WS Windsurf Cascade, DV Devin Local, GO Goose, KI Kiro, CL Cline (VS Code file hooks), LU Lume. Roo Code, Agent Skills, AGENTS.md, and MCPB have no hook surface and are omitted from the tables.

## 1. Concept map

### 1.1 Three hook architectures

| Architecture | Tools | Consequence for ACF |
|---|---|---|
| **Declarative process hooks**: JSON or TOML config maps an event to handlers; the runtime spawns a process (or calls HTTP or an MCP tool), writes a JSON payload to stdin, and reads exit code plus optional JSON stdout. | Claude Code, Codex, Copilot CLI, VS Code, Cursor, Gemini CLI, Windsurf, Devin, Goose, Kiro, Cline | Writer emits native config. One script can serve several targets only if something normalizes payload and output dialects (section 2.6). |
| **In-process listeners**: JS/TS module code subscribes to events and mutates objects or returns values. | Pi, OpenCode, Amp, Lume, Cline SDK plugins | No config surface exists. ACF reaches these only by generating a bridge module that spawns the command (section 2.7), or not at all. |
| **Package format without hooks**: hooks live only in client-owned namespace directories. | Agent Plugins 1.0 (`<namespace>/hooks/hooks.json`, e.g. `com.github.copilot/hooks/hooks.json`) | Agent Plugins is a carrier, not a hook dialect. The writer fills each client namespace with that client's dialect. |

### 1.2 The Claude dialect is the de facto interchange format

Claude's `{hooks:{Event:[{matcher, hooks:[handler]}]}}` shape, PascalCase event names, snake_case payload (`session_id`, `cwd`, `transcript_path`, `hook_event_name`, `tool_name`, `tool_input`), and `hookSpecificOutput` output are accepted, fully or partly, by Codex (same event names and output keys, sets `CLAUDE_PLUGIN_ROOT`), Copilot CLI (PascalCase compatibility events with Claude-compatible payload and matchers), VS Code (reads `.claude/settings*.json` and Claude plugin `hooks/hooks.json`; matcher values ignored), Cursor (imports `.claude` settings, maps 8 events and `permissionDecision`/`updatedInput`), Devin Local (reads Claude settings sources; same envelope with `approve/block`), Goose (Open Plugins `hooks/hooks.json` with the same nesting), and Gemini (similar output keys, different event names). Every one of them diverges somewhere (section 4), so "emit Claude format everywhere" is not lossless, but it makes Claude-dialect scripts the largest pool of existing native hooks that ACF must import and re-emit.

### 1.3 Shared meanings and their spellings

Events (rows) by tool. Empty means no equivalent.

| Canonical event | Meaning | Spellings |
|---|---|---|
| `session_start` | Session begins, resumes, clears, compacts, or forks | CC/CX/VS/GE/DV/GO/KI `SessionStart`; CP/CU `sessionStart`; PI `session_start`; AM `session.start`; CL `TaskStart` (+`TaskResume`); OC event `session.created` (unawaited); LU `turn_start` is not equivalent |
| `session_end` | Session ends | CC/CX/GE/DV/GO `SessionEnd`; KI `SessionEnd` (CLI); CP/CU `sessionEnd`; PI `session_shutdown`; CL SDK `SessionShutdown` |
| `user_prompt_submit` | User prompt accepted, before the model sees it | CC/CX/VS/DV/GO/KI/CL `UserPromptSubmit`; CP `userPromptSubmitted`; CU `beforeSubmitPrompt`; GE `BeforeAgent`; WS `pre_user_prompt`; PI `input` / `before_agent_start`; AM `agent.start`; OC `chat.message` |
| `pre_tool` | Before a tool call executes | CC/CX/VS/DV/GO/KI/CL `PreToolUse`; CP/CU `preToolUse`; GE `BeforeTool`; PI `tool_call`; AM `tool.call`; OC `tool.execute.before`; category-specific: CU `beforeShellExecution`/`beforeMCPExecution`/`beforeReadFile`, GO `BeforeShellExecution`/`BeforeReadFile`, WS `pre_run_command`/`pre_read_code`/`pre_write_code`/`pre_mcp_tool_use`; LU `tool_start` (observer) |
| `permission_request` | The runtime is about to show a permission prompt | CC/CX/DV `PermissionRequest`; CP `permissionRequest`; OC `permission.ask`; GE `Notification` type `ToolPermission` (observe only) |
| `post_tool` | After a tool call returns (`outcome` success or failure) | CC/CX/VS/DV/GO/KI/CL `PostToolUse`; CC/GO `PostToolUseFailure`; CP/CU `postToolUse` + `postToolUseFailure`; GE `AfterTool`; PI `tool_result`; AM `tool.result`; OC `tool.execute.after`; CU `afterShellExecution`/`afterMCPExecution`/`afterFileEdit`, GO `AfterShellExecution`/`AfterFileEdit`, WS `post_*`; LU `tool_end` |
| `stop` | Main agent is about to finish its turn (`outcome` completed, aborted, error) | CC/CX/VS/DV/GO/KI `Stop`; CC `StopFailure` (error); CX `Interrupt` (aborted); CP `agentStop`; CU `stop` (`status`); GE `AfterAgent`; PI `agent_before_settle` (`outcome`); AM `agent.end`; WS `post_cascade_response`; CL `TaskComplete`/`TaskCancel`/SDK `TaskError`; OC event `session.idle`; LU `turn_end` |
| `subagent_start` | A subagent is spawned | CC/CX/VS `SubagentStart`; CP/CU `subagentStart` |
| `subagent_stop` | A subagent is about to finish | CC/CX/VS `SubagentStop`; CP/CU `subagentStop` |
| `pre_compact` | Before context compaction | CC/CX/VS/CL `PreCompact`; CP/CU `preCompact`; GE `PreCompress`; PI `session_before_compact`; OC `experimental.session.compacting` |
| `post_compact` | After compaction | CC/CX `PostCompact`; DV `PostCompaction`; PI `session_compact`; OC event `session.compacted` |
| `notification` | Runtime raises a user-facing notification | CC `Notification`; CP `notification`; GE `Notification`; CL `Notification` |

Effects (what a handler may cause) and their spellings:

| Canonical effect | Spellings |
|---|---|
| `observe` | Exit 0 with no recognized output, everywhere |
| `add_context` | `hookSpecificOutput.additionalContext` (CC, CX, VS, GE, DV); `additionalContext` (CP); `additional_context` (CU); `contextModification` (CL); plain stdout (CC on SessionStart/UserPromptSubmit, KI IDE); `message` (PI `before_agent_start`, AM `agent.start`) |
| `block` | `permissionDecision: deny` (CC, CX, CP, VS); `permission: deny` (CU); `decision: block`/`deny` (CC top-level, GE, DV, GO); exit 2 (CC, CX, CP, VS, CU, GE, WS, DV, GO, KI CLI); `cancel: true` (CL); `{block:true}` (PI); `reject-and-continue` (AM); throw (OC) |
| `ask` | `permissionDecision: ask` (CC, CP, VS); `permission: ask` (CU, enforced only on `beforeShellExecution`/`beforeMCPExecution`); `status: ask` (OC `permission.ask`) |
| `allow` | `permissionDecision: allow` (CC, CP, VS); `permission: allow` (CU); `decision: approve` (DV); `decision.behavior: allow` (CC, CX, CP `PermissionRequest`); `status: allow` (OC) |
| `rewrite_input` | `updatedInput` (CC replace, CX with `allow`, VS, DV merge); `modifiedArgs` (CP); `updated_input` (CU); `tool_input` (GE merge); mutate `event.input` (PI); `modify{input}` (AM); mutate `output.args` (OC); `overrideInput` (CL SDK) |
| `rewrite_output` | `updatedToolOutput` / `updatedMCPToolOutput` (CC); `modifiedResult` (CP); `updated_mcp_tool_output` (CU, MCP only); patch `content` (PI); `replacement` (AM); mutate `output` (OC) |
| `block_result` | `decision: block` + `reason` on PostToolUse (CC, CX, VS); `deny` on AfterTool (GE) |
| `continue` | `decision: block` + `reason` on Stop/SubagentStop (CC, CX, VS, GO, KI CLI); `decision: block` on `agentStop` (CP); `followup_message` (CU); `deny` on AfterAgent (GE); `continue` (PI); `{action:'continue'}` (AM) |
| `halt` | `continue: false` + `stopReason` (CC, CX, VS, GE); `{terminate:true}` (PI) |
| `set_env` | `CLAUDE_ENV_FILE` writes (CC SessionStart); `env` output (CU sessionStart); `shell.env` (OC) |
| `rewrite_prompt` | `modifiedPrompt` (CP, SDK only); `input` `transform` (PI); mutate message (OC `chat.message`) |

### 1.4 Tool-only meanings (single tool; not core)

Claude: `Setup`, `UserPromptExpansion`, `PermissionDenied`, `PostToolBatch`, `MessageDisplay`, `TaskCreated`/`TaskCompleted`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`/`WorktreeRemove`, `PreModelSwitch`/`PostModelSwitch`, `Elicitation`/`ElicitationResult`; handler type `agent`; `once`, `asyncRewake`, `continueOnBlock`, `defer`, `updatedPermissions`, `interrupt` (also CP), `terminalSequence`, `classifierContext`. Codex: `additionalContextLimit`. Copilot: `userPromptTransformed`, `errorOccurred`, `modifiedResponse`. Cursor: `beforeTabFileRead`, `afterTabFileEdit`, `afterAgentResponse`, `afterAgentThought`, `workspaceOpen`, separate `user_message`/`agent_message`, `subagentStart` deny. Gemini: `BeforeModel`, `AfterModel`, `BeforeToolSelection`, `tailToolCallRequest`, `hooks.disabled`. Windsurf: `show_output`, `post_setup_worktree`, `post_cascade_response_with_transcript`. Goose: `PreToolUseResult`. Kiro: `Manual`, `PreTaskExec`/`PostTaskExec`, `PostFileCreate`/`PostFileSave`/`PostFileDelete`, `confirm`, `cache_ttl_seconds`. Amp: `synthesize{result}`, `changes.prompt`. Cline: `review`, `HOOK_CONTROL`. Pi, OpenCode, Lume: every listener not listed in 1.3.

## 2. Proposed canonical ACF core schema

File stays `hooks/hooks.yml` (SPEC §13), but entries become a list so one event can carry several hooks without key collisions, and every field below is defined by at least two tools with the same meaning.

### 2.1 Entry fields

| Field | Type | Meaning | Origin tools | Canonical names and enums |
|---|---|---|---|---|
| `name` | kebab-case string, unique in capability | Identity for diagnostics, ownership markers, and round-trip matching | GE `name`, KI `name`, ACF today | — |
| `description` | string | Human description | CX, GE, KI, ACF | — |
| `event` | enum | When the hook fires | all (section 1.3) | `session_start`, `session_end`, `user_prompt_submit`, `pre_tool`, `permission_request`, `post_tool`, `stop`, `subagent_start`, `subagent_stop`, `pre_compact`, `post_compact`, `notification` |
| `match` | object (2.3) | Narrows when the hook fires | CC/CX/CP/CU/GE/DV/GO/KI `matcher`, CC `if` | Structured, compiled per target; never a raw matcher string |
| `effects` | non-empty list of enum | Declared effects the handler may exercise; the writer checks each against the target before activation, and the shim drops undeclared outputs with a warning | all (section 1.3) | `observe`, `add_context`, `block`, `ask`, `allow`, `rewrite_input`, `rewrite_output`, `block_result`, `continue`, `halt`, `set_env`, `rewrite_prompt` (matrix in 2.2) |
| `handler` | tagged object (2.4) | What runs | all | `type`: `command`, `http`, `mcp_tool`, `prompt` |
| `timeout` | positive integer, milliseconds | Handler time limit | all declarative tools (CC/CX/CU/CP/VS/DV/GO/KI seconds; GE ms; KI CLI `timeout_ms`) | Default 30000 (ACF today). Writer always emits it explicitly, converted with ceiling to seconds where needed. |
| `failure` | enum | What a crash, invalid output, or timeout means | GO `on_failure: allow/block`, CU `failClosed`, CL SDK `failureMode`, CP implicit (pre-tool fails closed) | `open` (proceed) or `closed` (treated as `block`). Default `open` when `effects` is `[observe]` or only context effects; **required** when `effects` contains `block`, `ask`, `allow`, or `rewrite_input`. |
| `async` | boolean | Fire and forget; runtime does not wait | CC `async`, CX `async`, ACF `runInBackground` extension | Allowed only with `effects: [observe]`. |
| `status_message` | string | Spinner text while running | CC `statusMessage`, CX `statusMessage` | — |
| `max_continuations` | positive integer | Cap on consecutive `continue` effects | CU `loop_limit` (5), AM `maxContinuations` (5), GO `GOOSE_STOP_HOOK_BLOCK_CAP`, CC/GE `stop_hook_active` input | Valid only with `continue`; default 5. Shim enforces it on targets without a native cap. |
| `protocol` | enum | Wire dialect the handler speaks (2.5) | — (ACF concept; needed for lossless import) | `acf` (default), `claude`, `native` |
| `only` / `except` | target list | Target selection | ACF today | unchanged |

Scope binding (core candidate, not in the core table yet): hooks declared in agent frontmatter are active only while that agent runs (CC agent and skill frontmatter, VS `.agent.md`). Two tools share it, so it qualifies; it is deferred to the agents facet because it lives in agent files, not `hooks.yml`.

### 2.2 Event and effect matrix

| Event | Allowed effects | Notes |
|---|---|---|
| `session_start` | observe, add_context, set_env | `match.source` |
| `session_end` | observe | Several tools do not await it (GE, CX 1 to 3 s budget, CC 1.5 s) |
| `user_prompt_submit` | observe, add_context, block, rewrite_prompt, halt | |
| `pre_tool` | observe, add_context, block, ask, allow, rewrite_input, halt | `match.operation` required (ACF today) |
| `permission_request` | observe, allow, block | Fires only when a prompt would appear; distinct from `pre_tool` |
| `post_tool` | observe, add_context, block_result, rewrite_output, halt | `match.outcome` |
| `stop` | observe, continue, halt | `match.outcome` |
| `subagent_start` | observe, add_context | Blocking is CU-only |
| `subagent_stop` | observe, continue | |
| `pre_compact` | observe, block | ACF today allows add_context here; no process-hook target supports it (CC PreCompact has no additionalContext, CX ignores plain stdout, CU only `user_message`). Moved to extras. |
| `post_compact` | observe | |
| `notification` | observe | `match.notification` |

Aggregation when several hooks answer the same event (canonical, matches CC, CX, CU, VS and CP pre-tool): the most restrictive decision wins, `block` > `ask` > `allow`; every `add_context` is concatenated; `rewrite_input` from more than one hook on the same call is a conflict the shim resolves by refusing the call (`block` with reason) because no target defines a merge order. Hooks are **unordered**; authors who need ordering put the steps in one handler.

### 2.3 `match`

| Field | Type | Meaning | Origin tools | Compiled to |
|---|---|---|---|---|
| `operation` | operation or list | Portable tool category from SPEC §24 (`shell`, `file_read`, `file_write`, `file_edit`, `web_fetch`, `web_search`, `code_search`, `doc_search`, `agent_delegate`, `task_management`, `mcp`, `context`, `any`) | every matcher-bearing tool matches tool identity; CU/WS/GO category events | Per-target native tool-name tables (CC `Bash`, CX `Bash` for `shell` and `Edit/Write` for `apply_patch`, CU `Shell`/`Read`/`Write`, GE `run_shell_command`, ...) or a category event |
| `mcp` | `{server, tool?}` | A specific MCP server or tool | CC/CX `mcp__server__tool`, CU `MCP:`, WS `pre_mcp_tool_use` | Native MCP name; CC plugin servers become `mcp__plugin_<plugin>_<server>__<tool>` |
| `command` | glob | Shell command pattern for `operation: shell` | CC `if: Bash(<glob>)`, CU shell-hook command text, KI matcher | CC `if`; CU anchored regex; elsewhere shim filter |
| `paths` | glob list | File path filter for file operations | CC `if: Edit(<glob>)` (one glob per handler), ACF today | CC one handler per glob; elsewhere shim filter |
| `source` | enum list | `session_start` cause | CC, CX, GE, PI, CP | `startup`, `resume`, `clear`, `compact`, `fork` |
| `trigger` | enum list | `pre_compact`/`post_compact` cause | CC, CX (PostCompact matcher), VS (always auto), PI (`threshold`/`overflow` = auto) | `manual`, `auto` |
| `outcome` | enum list | Tool or turn result | CC/CP/CU/GO failure events, CU `status`, PI `outcome`, AM `status`, CL `success` | post_tool: `success`, `failure`; stop: `completed`, `aborted`, `error` |
| `notification` | enum list | Notification type | CC, CP (GE only `ToolPermission`) | `permission_prompt`, `elicitation`, `idle`, `agent_completed` |

The ACF `conditions` regex (SPEC §13) is dropped: its subject is unspecified and no target has a same-meaning field; `command` and `paths` cover the shared uses.

### 2.4 `handler`

| Field | Type | Meaning | Origin tools |
|---|---|---|---|
| `type: command` | — | Spawn a process | all declarative tools |
| `command` | string | Command line (shell form) | all |
| `args` | string list | Direct exec without a shell; mutually exclusive with `shell` (ACF today) | CC `args`, CP `exec`+`args` |
| `shell` | `bash`, `powershell` | Interpreter for the shell form | CC `shell`, CP `bash`/`powershell` keys, WS `command`/`powershell`, ACF today |
| `os` | `{linux?, macos?, windows?}` command overrides | Per-platform command | CX `commandWindows`, VS `linux`/`osx`/`windows`, CP `bash`/`powershell` |
| `cwd` | path, placeholders allowed | Working directory | CP `cwd`, VS `cwd`, WS `working_directory`, ACF today |
| `env` | string map | Extra environment | CP `env`, VS `env`, ACF today |
| `type: http` | — | POST payload to URL | CC, CP |
| `url`, `headers`, `allowed_env_vars` | string, map, list | Endpoint and header interpolation allow-list | CC (`allowedEnvVars`), CP |
| `type: mcp_tool` | — | Call an MCP tool with templated input | CC, CX |
| `server`, `tool`, `input` | string, string, object | Target tool and input template | CC, CX |
| `type: prompt` | — | LLM evaluator returning `{ok, reason}` | CC, CU, DV (CX parses and skips) |
| `prompt`, `model` | string, string | Prompt with `$ARGUMENTS` placeholder; optional model | CC, CU |

### 2.5 Wire protocol (`protocol`)

- `acf` (default): the handler reads the **ACF envelope** on stdin and writes the **ACF result** on stdout; exit codes follow SPEC §13.6.6 (0 parse, 2 block, other non-blocking error). The shim translates both directions per target. Envelope fields, each shared by at least two tools: `event`, `session_id` (CU `conversation_id`), `cwd`, `transcript_path`, `project_dir` (CC/CU/GE/DV env, CU `workspace_roots`), `turn_id` (CX `turn_id`, CC/DV `prompt_id`, CU `generation_id`), `model` (CX, CU), `permission_mode` (CC, CX), `tool {operation, name, input, call_id}`, `tool_result {output, success}`, `prompt`, `source`, `trigger`, `outcome`, `reason` (session_end), `continuation_count` (CC/GE `stop_hook_active`), `agent {id, type}` (CC, subagent events), `target` (ACF). Result fields: `decision` (`allow`, `deny`, `ask`), `reason`, `context`, `updated_input` (full replacement), `updated_output`, `continue_reason`, `halt_reason`, `user_message` (CC/CX/VS/GE `systemMessage`, CU `user_message`), `env`.
- `claude`: the handler speaks the Claude dialect. The writer emits it unchanged to Claude and to targets that accept the dialect for that event and effect (section 3 marks these), and runs it through the shim in Claude-compatibility mode elsewhere. This is the import default for Claude, Codex, Devin, and Goose hooks.
- `native`: the handler speaks one target's dialect and is emitted only to that target (`only` required). Import default for everything that cannot be projected.

### 2.6 Hook runner (resolves SPEC §25 "whether ACF ships a hook runner")

Portable hooks are impossible without one: tool identity, payload keys, output keys, exit-code meaning, and failure polarity differ per target (section 4). The writer therefore emits each `protocol: acf` hook as an invocation of an ACF-owned runner (`caplet hook run --target <t> --event <native> --hook <cap>/<name>`, or the generated wrapper script that already exists in the emitter calling it). The runner: normalizes the native payload into the envelope; applies `match` fields the target cannot express (runtime filtering exits 0 without spawning the handler); enforces `timeout` below the native timeout so `failure: closed` can turn a timeout into a native block; strips results outside the declared `effects`; enforces `max_continuations`; translates the result into the native output and exit code. Cost: a runtime dependency on the runner binary at every hook site and one extra process start per event (open question 7.1).

### 2.7 Bridge modules (Pi, OpenCode, Amp, Lume)

These runtimes read no hook config. A target writer may generate a small extension module per capability that subscribes to the native listeners and calls the runner, which returns the result in the module's native form (`{block, reason}` for Pi, throw for OpenCode, `reject-and-continue` for Amp). Until such a writer exists and is fixture-tested, hooks for these targets are **E** for enforcing effects and **D** (`hook.target_without_hook_config`) otherwise. Lume listeners cannot alter the turn, so only `observe` is ever reachable there.

### 2.8 Placeholders and environment

| Canonical | Meaning | Native spellings |
|---|---|---|
| `${ACF_CAPABILITY_DIR}` (`${ACF_HOOK_DIR}`, `${ACF_PACKAGE_DIR}` unchanged) | Installed capability root | CC/CX/VS `${CLAUDE_PLUGIN_ROOT}`; CX/VS/GO `${PLUGIN_ROOT}`; GE `${extensionPath}` |
| `${ACF_DATA_DIR}` (new) | Persistent per-capability data directory | CC `CLAUDE_PLUGIN_DATA`, CX `PLUGIN_DATA`, CP `COPILOT_PLUGIN_DATA` |
| `${ACF_PROJECT_DIR}` (new) | Project root | CC `CLAUDE_PROJECT_DIR`, CU `CURSOR_PROJECT_DIR`, GE `GEMINI_PROJECT_DIR`, DV `DEVIN_PROJECT_DIR` |

In plugin installs the writer emits the native plugin-root variable instead of an absolute path so cached or relocated plugins keep working. Default `cwd` becomes the project directory, which is what every target uses natively (CX and CC run in the session cwd; VS and CP default to the repository root), replacing SPEC §13.6.5's capability-root default.

### 2.9 Size of the core

12 events, 12 effects, 13 entry fields, 8 match fields, 4 handler types with 13 handler fields, 3 placeholders, one envelope and result shape. Per event the matrix allows 1 to 7 effects.

## 3. Field-level support tables

Cells describe what the target writer does for a canonical value. Event cells give the native spelling; effect cells assume the event row's mapping.

### 3.1 Current ACF targets and package formats

| Canonical | CC | CX | CU | OC | PI | AP |
|---|---|---|---|---|---|---|
| `session_start` | N(SessionStart) | N(SessionStart) | N(sessionStart; fire-and-forget) | D(bridge on event `session.created`, unawaited) | T(bridge, `session_start`) | U (client namespace only) |
| `session_end` | N(SessionEnd; 1.5 s budget) | N(SessionEnd; main session only, 1 to 3 s) | N(sessionEnd) | U | T(bridge, `session_shutdown`) | U |
| `user_prompt_submit` | N(UserPromptSubmit) | N(UserPromptSubmit) | N(beforeSubmitPrompt) | T(bridge, `chat.message`) | T(bridge, `input`) | U |
| `pre_tool` | N(PreToolUse) | D(PreToolUse covers local function tools only; hosted web search unhooked: `hook.partial_tool_coverage`) | N(preToolUse; category events for shell, mcp, file_read) | T(bridge, `tool.execute.before`) | T(bridge, `tool_call`) | U |
| `permission_request` | N(PermissionRequest) | N(PermissionRequest) | U | T(bridge, `permission.ask`) | U | U |
| `post_tool` | N(PostToolUse + PostToolUseFailure) | T(PostToolUse fires for both outcomes; shim filters `outcome`) | N(postToolUse + postToolUseFailure) | T(bridge, `tool.execute.after`) | T(bridge, `tool_result`, `isError`) | U |
| `stop` | N(Stop; `StopFailure` for error; aborted U) | N(Stop; `Interrupt` for aborted, observe only) | N(stop, `status`) | D(bridge on event `session.idle`, observe only) | T(bridge, `agent_before_settle`, `outcome`) | U |
| `subagent_start` | N(SubagentStart) | N(SubagentStart) | N(subagentStart) | U | U | U |
| `subagent_stop` | N(SubagentStop) | N(SubagentStop) | N(subagentStop) | U | U | U |
| `pre_compact` | N(PreCompact) | N(PreCompact) | N(preCompact; cannot block) | T(bridge, `experimental.session.compacting`) | T(bridge, `session_before_compact`) | U |
| `post_compact` | N(PostCompact) | N(PostCompact) | U | D(bridge on event `session.compacted`) | T(bridge, `session_compact`) | U |
| `notification` | N(Notification) | U | U | U | U | U |
| effect `add_context` | N(additionalContext; plain stdout on SessionStart/UPS) | N(additionalContext; spills past `additionalContextLimit`) | N(additional_context) | T(bridge; prompt events only) | T(bridge, `before_agent_start` message) | U |
| effect `block` on pre_tool | N(permissionDecision deny / exit 2) | N(permissionDecision deny / exit 2) | N(permission deny / exit 2) | T(bridge, throw) | T(bridge, `{block}`) | U |
| effect `block` on user_prompt_submit | N(decision block) | N(decision block) | N(continue false) | ? (throw in `chat.message`) | T(bridge, `input` handled) | U |
| effect `block` on pre_compact | N(decision block / exit 2) | N(continue false) | E | ? | T(bridge, `cancel`) | U |
| effect `block` on permission_request | N(decision.behavior deny; exit 2 not honored, shim emits JSON) | N(behavior deny) | — | T(bridge, status deny) | — | U |
| effect `ask` | N(permissionDecision ask) | E (not implemented; tool continues) | N on shell/mcp via category events; E otherwise (ask not enforced on preToolUse) | T(bridge, `permission.ask` status ask) | E | U |
| effect `allow` | N(permissionDecision allow; behavior allow) | ? on pre_tool; N(behavior allow) on permission_request | N(permission allow) | T(bridge, status allow) | U | U |
| effect `rewrite_input` | N(updatedInput, full replacement) | N(allow + updatedInput; shell needs string command); E on permission_request (fails closed) | N(updated_input) | T(bridge, mutate args) | T(bridge, mutate input) | U |
| effect `rewrite_output` | N(updatedToolOutput / updatedMCPToolOutput) | E (unsupported) | D(MCP only: updated_mcp_tool_output) | T(bridge, mutate output) | T(bridge, patch content) | U |
| effect `block_result` | N(decision block + reason) | N(decision block / continue false) | E | ? | T(bridge, replace content) | U |
| effect `continue` | N(decision block + reason) | N(decision block) | T(followup_message; becomes a user message) | U | T(bridge, `continue`) | U |
| effect `halt` | N(continue false) | N(continue false) | U | U | T(bridge, `terminate`) | U |
| effect `set_env` | N(write `CLAUDE_ENV_FILE`) | U | N(sessionStart `env`) | ? (`shell.env` differs: per shell call) | U | U |
| effect `rewrite_prompt` | U | U | U | T(bridge, mutate message) | T(bridge, `input` transform) | U |
| `match.operation` | T(tool-name matcher) | T(regex; `apply_patch` reported as Edit/Write) | T(tool-type matcher or category event) | T(bridge filters) | T(bridge filters) | U |
| `match.mcp` | T(`mcp__server__tool`) | T(`mcp__server__tool`) | T(`MCP:` matcher) | T(bridge) | — | U |
| `match.command` | T(`if: Bash(glob)`, best-effort; shim re-checks when `failure: closed`) | T(shim filter) | T(beforeShellExecution matcher, anchored regex) | T(bridge) | T(bridge) | U |
| `match.paths` | T(one handler per glob with `if: Edit(glob)`) | T(shim filter) | T(shim filter) | T(bridge) | T(bridge) | U |
| `match.source` | N(matcher) | N(matcher) | T(shim filter) | ? | T(bridge, `reason`) | U |
| `match.trigger` | N(matcher) | N(PostCompact matcher; PreCompact via shim) | T(shim filter) | ? | T(bridge; threshold/overflow = auto) | U |
| `match.outcome` | N(event choice) | T(shim filter / Interrupt) | N(event choice / status) | T(bridge) | T(bridge) | U |
| `match.notification` | N(matcher) | — | — | — | — | U |
| `handler command` | N | N | N | T(bridge spawns) | T(bridge spawns) | U |
| `handler args` | N(args) | T(shell-quoted into command) | T(shell-quoted) | T(bridge) | T(bridge) | U |
| `handler shell` | N(shell) | T(wrapper script) | T(wrapper script) | T(bridge) | T(bridge) | U |
| `handler os` | T(wrapper script selects) | N(commandWindows) | T(wrapper script) | T(bridge) | T(bridge) | U |
| `handler cwd` | T(wrapper `cd`) | T(wrapper `cd`) | T(wrapper `cd`) | T(bridge) | T(bridge) | U |
| `handler env` | T(wrapper exports) | T(wrapper exports) | T(wrapper exports) | T(bridge) | T(bridge) | U |
| `handler http` | N(type http) | T(runner posts; no native http) | T(runner posts) | T(bridge) | T(bridge) | U |
| `handler mcp_tool` | N(type mcp_tool) | N(type mcp_tool) | E (runner cannot reach the session's MCP servers) | E | E | U |
| `handler prompt` | N(type prompt) | E (parsed, skipped) | N(type prompt) | E | E | U |
| `timeout` | T(ceil seconds; default 600 otherwise) | T(ceil seconds) | T(ceil seconds; native default ?) | T(bridge timer) | T(bridge timer) | U |
| `failure: closed` | T(shim: own timer, crash and timeout become exit 2; native timeout is fail-open) | T(shim; non-2 exit meaning ?) | N(failClosed) | T(bridge) | T(bridge) | U |
| `async` | N(async) | N(async; max 8) | T(sessionStart is already async; otherwise wrapper backgrounds) | T(bridge, unawaited) | T(bridge) | U |
| `status_message` | N(statusMessage) | N(statusMessage) | D(dropped: `hook.status_message_dropped`) | D | D | U |
| `max_continuations` | T(shim counts via `stop_hook_active`) | T(shim counts) | N(loop_limit) | — | T(bridge counts) | U |
| `${ACF_CAPABILITY_DIR}` | N(`${CLAUDE_PLUGIN_ROOT}`) | N(`${PLUGIN_ROOT}`) | T(absolute path; plugin root variable ?) | T(bridge) | T(bridge) | U |
| `${ACF_DATA_DIR}` | N(`CLAUDE_PLUGIN_DATA`) | N(`PLUGIN_DATA`) | ? | ? | ? | U |
| `${ACF_PROJECT_DIR}` | N(`CLAUDE_PROJECT_DIR`) | T(envelope `cwd`) | N(`CURSOR_PROJECT_DIR`) | T(bridge) | T(bridge) | U |
| `protocol: claude` | N | N for shared events and effects (no `ask`, no `updatedMCPToolOutput`) | T(shim; CU import maps 8 events only) | T(bridge) | T(bridge) | U |

AP note: Agent Plugins carries hooks only as client-namespace files. The writer places each client's dialect where that client documents it (`com.github.copilot/hooks/hooks.json` for CP and VS); Codex and Cursor namespace hook locations are unverified (7.6), so the Codex and Cursor writers keep their native plugin `hooks/hooks.json`.

### 3.2 Other inventoried tools

| Canonical | CP | VS | GE | AM | WS | DV | GO | KI | CL | LU |
|---|---|---|---|---|---|---|---|---|---|---|
| `session_start` | N(sessionStart) | D(SessionStart fires at first prompt; `source` always new) | N(SessionStart) | T(bridge, `session.start`) | U | N(SessionStart) | N(SessionStart) | N(SessionStart) | N(TaskStart; resume = TaskResume) | D(bridge observer) |
| `session_end` | N(sessionEnd; output ignored) | U | N(SessionEnd; not awaited) | U | U | N(SessionEnd) | N(SessionEnd) | N(SessionEnd, CLI only) | U (SDK SessionShutdown) | U |
| `user_prompt_submit` | N(userPromptSubmitted; command output dropped) | N(UserPromptSubmit) | N(BeforeAgent) | T(bridge, `agent.start`) | N(pre_user_prompt) | N(UserPromptSubmit) | N(UserPromptSubmit; observe only) | N(UserPromptSubmit) | N(UserPromptSubmit) | U |
| `pre_tool` | N(preToolUse) | N(PreToolUse) | N(BeforeTool) | T(bridge, `tool.call`) | T(pre_run_command, pre_read_code, pre_write_code, pre_mcp_tool_use by operation; other operations U) | N(PreToolUse) | N(PreToolUse; category events) | N(PreToolUse) | N(PreToolUse) | D(bridge observer) |
| `permission_request` | ? (payload undocumented) | U | D(Notification ToolPermission, observe only) | U | U | N(PermissionRequest) | U | U | U | U |
| `post_tool` | N(postToolUse + postToolUseFailure) | N(PostToolUse) | N(AfterTool) | T(bridge, `tool.result`) | N(post_* by operation) | N(PostToolUse; `tool_response.success`) | N(PostToolUse + PostToolUseFailure) | N(PostToolUse) | N(PostToolUse; `success`) | D(bridge observer) |
| `stop` | N(agentStop) | N(Stop) | N(AfterAgent) | T(bridge, `agent.end`) | D(post_cascade_response, async observe) | N(Stop) | N(Stop) | N(Stop) | N(TaskComplete; TaskCancel aborted) | D(bridge observer) |
| `subagent_start` | N(subagentStart) | N(SubagentStart) | U | U | U | U | U | ? (AgentSpawn alias) | U | U |
| `subagent_stop` | N(subagentStop) | N(SubagentStop) | U | U | U | U | U | U | U | U |
| `pre_compact` | D(preCompact output not processed) | D(PreCompact, observe) | D(PreCompress, async advisory) | U | U | U | U | U | N(PreCompact) | U |
| `post_compact` | U | U | U | U | U | N(PostCompaction) | U | U | U | U |
| `notification` | N(notification) | U | D(Notification, ToolPermission only) | U | U | U | U | U | N(Notification) | U |
| effect `add_context` | N(additionalContext, 10 KB on postToolUse; not on prompt submit) | N(additionalContext) | N(additionalContext) | T(bridge, message) | E/D (no JSON output: `hook.context_unsupported`) | N(additionalContext on UPS, SessionStart, PostToolUse) | D(observational events) | N(stdout, IDE) | N(contextModification, 50k cap) | U |
| effect `block` on pre_tool | N(permissionDecision deny, reason required) | N(permissionDecision deny) | N(decision deny) | T(bridge, reject-and-continue) | N(exit 2) | N(decision block) | N(exit 2 / decision block) | N(exit 2) | T(shim: exit 2 becomes `cancel: true`) | E |
| effect `block` on user_prompt_submit | E (command output dropped) | ? | N(decision deny) | ? | N(exit 2) | N(decision block) | E | N(exit 2) | T(shim, cancel) | E |
| effect `ask` | N(permissionDecision ask; cloud turns it into deny) | N(permissionDecision ask) | E | E | E | E | E | ? (`confirm` is pre-run user confirmation, different) | E | E |
| effect `allow` | N(permissionDecision allow; behavior allow) | N(permissionDecision allow) | D(allow means proceed, no prompt bypass) | U | U | N(decision approve) | U | U | U | U |
| effect `rewrite_input` | N(modifiedArgs) | N(updatedInput) | T(tool_input merge; key removal impossible: `hook.input_merge`) | T(bridge, modify) | E | T(updatedInput merge) | E | E | E (SDK overrideInput only) | E |
| effect `rewrite_output` | N(modifiedResult) | E | E | T(bridge, replacement) | E | E | E | E | E | E |
| effect `block_result` | ? | N(decision block) | N(decision deny) | T(bridge, replacement) | E | ? | E | E | E | E |
| effect `continue` | N(decision block) | N(decision block + reason) | N(decision deny = retry) | T(bridge, continue) | E | ? | N(decision block) | N(decision block, CLI) | E | E |
| effect `halt` | U | N(continue false) | N(continue false) | U | U | U | U | U | U | U |
| effect `set_env` | U | U | U | U | U | U | U | U | U | U |
| effect `rewrite_prompt` | E (SDK only) | U | U | ? | U | U | U | U | U | U |
| `match.operation` | T(anchored regex on native camelCase names, or PascalCase compat with Claude names) | T(shim filter; matcher values ignored) | T(regex on tool names) | T(bridge) | T(event choice; no matchers) | T(regex on tool_name) | T(unanchored regex; `*` invalid) | T(regex) | T(shim filter) | T(bridge) |
| `match.command`, `match.paths` | T(shim filter) | T(shim filter) | T(shim filter) | T(bridge) | T(shim filter) | T(shim filter) | T(shim filter) | T(shim filter) | T(shim filter) | T(bridge) |
| `match.source`, `trigger`, `outcome`, `notification` | T(event choice or shim filter) | T(shim filter) | N(exact matcher on lifecycle events) | T(bridge) | T(shim) | T(shim) | T(event choice or shim) | T(shim) | T(event choice or shim) | — |
| `handler command` | N(command) | N(command) | N(command) | T(bridge) | N(command, `bash -c`) | N(command) | N(command, `sh -c`) | N(action command) | T(file named after event; shim fans out to every ACF hook for that event) | E |
| `handler args` | N(exec + args) | T(quoted) | T(quoted) | T(bridge) | T(quoted) | T(quoted) | T(quoted) | T(quoted) | T(shim) | — |
| `handler shell` | N(bash / powershell keys) | T(os overrides) | T(wrapper) | T(bridge) | N(command / powershell) | T(wrapper) | T(wrapper) | T(wrapper) | T(wrapper) | — |
| `handler os` | T(bash / powershell keys) | N(linux, osx, windows) | T(wrapper) | T(bridge) | T(wrapper) | T(wrapper) | T(wrapper) | T(wrapper) | T(wrapper) | — |
| `handler cwd`, `env` | N(cwd, env) | N(cwd, env) | T(wrapper) | T(bridge) | N(working_directory) / T(env) | T(wrapper) | T(wrapper) | T(wrapper) | T(wrapper) | — |
| `handler http` | N(type http; HTTPS required) | T(runner posts) | T(runner) | T(bridge) | T(runner) | T(runner) | T(runner) | T(runner) | T(runner) | — |
| `handler mcp_tool` | E | E | E | E | E | E | E | E | E | E |
| `handler prompt` | E (CP `prompt` means auto-submit text) | E | E | E | E | N(type prompt) | E | ? (action type agent differs) | E | E |
| `timeout` | T(timeoutSec) | T(seconds) | N(ms) | T(bridge) | T(shim timer; no native timeout) | T(seconds) | T(seconds) | T(seconds; CLI `timeout_ms` ?) | D(fixed 30 s; longer values clamp: `hook.timeout_clamped`) | — |
| `failure: closed` | N for pre-tool commands (fail closed); T(shim) elsewhere; timeouts always fail open natively | T(shim) | T(shim; invalid stdout is allow natively) | T(bridge) | T(shim) | T(shim; plugin hooks fail open natively ?) | N(on_failure block, PreToolUse only) / T(shim) | T(shim) | T(shim) | — |
| `async` | T(wrapper backgrounds) | T(wrapper) | N on PreCompress only; T otherwise | T(bridge) | N(post_cascade_response) / T | T | T | T | T | N(observer) |
| `status_message` | D | D | D | D | D | D | D | D | D | D |
| `max_continuations` | T(shim) | T(shim) | T(shim, `stop_hook_active`) | N(maxContinuations) | — | T(shim) | N(GOOSE_STOP_HOOK_BLOCK_CAP env, user-level) / T | T(shim) | — | — |
| `${ACF_CAPABILITY_DIR}` | ? (plugin root variable undocumented) | N(`${CLAUDE_PLUGIN_ROOT}` / `${PLUGIN_ROOT}`) | N(`${extensionPath}`) | T(bridge) | T(absolute path) | T(absolute path) | N(`${PLUGIN_ROOT}`) | T(absolute path) | T(absolute path) | T(bridge) |
| `${ACF_DATA_DIR}` | N(`COPILOT_PLUGIN_DATA`) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `${ACF_PROJECT_DIR}` | T(envelope `cwd`) | T(envelope `cwd`) | N(`GEMINI_PROJECT_DIR`) | T(bridge) | T(shim) | N(`DEVIN_PROJECT_DIR`) | T(`working_dir`) | T(shim) | T(shim) | T(bridge) |
| `protocol: claude` | N via PascalCase compat events (no SubagentStart compat) | N for its 8 events (matchers ignored, shim filters) | T(shim) | T(bridge) | T(shim) | N for its 8 events (`approve` for allow) | N for shared events (only PreToolUse and Stop control) | T(shim) | T(shim) | E |

### 3.3 Diagnostics for D and E cells

| Code | Severity | Raised when |
|---|---|---|
| `hook.effect_unenforceable` | error, blocks activation | A declared enforcing effect (`block`, `ask`, `allow`, `rewrite_input`, `rewrite_output`, `block_result`, `continue`, `halt`) has an E cell for the target. Replaces silent degradation to `observe`. |
| `hook.event_unsupported` | error if `effects` has an enforcing effect, otherwise lossy | Event row is U for the target. |
| `hook.partial_tool_coverage` | lossy (error when `failure: closed`) | Target hooks only some tools in the matched operation (CX hosted web search, WS operations other than shell/file/mcp). |
| `hook.target_without_hook_config` | error or lossy as above | Target needs a bridge module and none is generated. |
| `hook.input_merge` | lossy | `rewrite_input` on a merge-semantics target (GE, DV); removed keys survive. |
| `hook.context_unsupported` | lossy | `add_context` on a target or event with no model-visible channel. |
| `hook.timeout_clamped` | lossy | Target caps timeout below the requested value (CL 30 s, CX SessionEnd 3 s). |
| `hook.observe_timing` | lossy | Event is not awaited or fires at a different time (VS SessionStart on first prompt, GE SessionEnd, CU sessionStart). |
| `hook.status_message_dropped` | info | `status_message` on a target without one. |
| `hook.duplicate_owner` | error | The same hook would be installed through two channels the target merges (plugin plus settings), which runs it twice. |

## 4. Conflicts that must not be unioned

| Conflict | Evidence | Handling |
|---|---|---|
| **Tool identity.** Native tool names differ (`Bash`, `shell`, `run_shell_command`, `Shell`, `pre_run_command`), CX reports `apply_patch` as `Edit`/`Write`, CP native events report camelCase names while PascalCase compat events report Claude names. | Inventories CC, CX, CP, CU, GE, WS | Core matches only SPEC §24 operations plus `mcp`. Native names live in per-target mapping tables and in `protocol: native` hooks (SPEC §14.5 already forbids them in portable vocabulary). |
| **Matcher dialects.** CC exact-or-list for `[A-Za-z0-9_\- ,\|]` else unanchored JS regex; CP anchored `^(?:P)$`; CX regex; GO unanchored with `*` invalid; CU tool types; VS accepts syntax but ignores values; WS has none. | Inventories | No matcher string in core. `match` is compiled per target; what the target cannot express is filtered by the runner. A raw matcher survives only in the native remainder. |
| **Permission vocabulary.** `allow` bypasses the prompt on CC, CP, VS, CU, DV but means "proceed normally" on GE; `ask` is unimplemented on CX (hook fails, tool continues), accepted but not enforced on CU `preToolUse`, converted to deny on CP cloud; CC adds `defer`. | CX spot check; CU, CP, GE inventories | `ask` and `allow` are emitted only where the cell is N or T; otherwise E. Never degrade `ask` to `allow` or to observe. `defer` stays Claude-only. |
| **Failure and timeout polarity.** CC timeouts give no decision (PreToolUse proceeds); CP pre-tool command crashes fail closed but timeouts fail open; CU invalid JSON blocks permission hooks; GE invalid stdout allows; CL processes JSON even on nonzero exit and has no exit-2 rule. | Inventories | Canonical `failure` with required value on enforcing hooks; the runner owns the timer and converts. Native defaults are never relied on. |
| **Input rewrite semantics.** CC replaces the entire input; GE and DV merge; CX requires a string `command` for shell and accepts rewrites only with `allow`; CX `PermissionRequest` `updatedInput` fails closed. | CC, CX spot checks; GE, DV inventories | Canonical `updated_input` is a full replacement. Merge targets get the full object plus `hook.input_merge`. `rewrite_input` on `permission_request` is not core. |
| **"Stop block" means continue, but in different roles.** CC/CX/VS feed `reason` to the model; CU `followup_message` arrives as a user message; GE `deny` retries the turn; AM sends a new user message with a cap. | Inventories | One canonical `continue` with `continue_reason`; CU is marked T with the role difference noted. Loop caps unified as `max_continuations`. |
| **`prompt` homonym.** CC, CU, DV `prompt` handlers are LLM evaluators returning `{ok, reason}`; CP `prompt` auto-submits text at session start; KI action `agent` sends a prompt to the agent. | CC, CU, CP, KI inventories | Core `prompt` handler is the evaluator only. CP and KI forms stay in native extras; a future "inject prompt" concept would need its own name. |
| **`permission_request` vs `pre_tool` + ask.** SPEC §22.3 maps CC `permission_request` to "PreToolUse with ask", which fires on every call instead of only when a prompt would appear. CC exit 2 is not honored on PermissionRequest. | SPEC §22.3; CC docs | Separate events. CC uses native `PermissionRequest`; the runner emits JSON `decision.behavior` instead of exit 2. |
| **Ordering.** CC, CX, CL, CU run matching hooks in parallel; GE (`sequential`), GO, WS, PI, OC run in order; LU orders by number; CP permissionRequest lets later answers override earlier ones. | Inventories | Hooks are unordered in core (section 2.2), replacing SPEC §13.8's "YAML order is canonical, lossy when concurrent", which would put a lossy diagnostic on nearly every target. CP's last-wins is masked by the runner aggregating per capability only; cross-capability last-wins is reported as open question 7.3. |
| **Event granularity.** CU, GO, WS split tool hooks by category; CC `FileChanged` and KI `PostFileSave` are file-watcher events that also fire on user edits. | Inventories | Category events are compilation targets for `pre_tool`/`post_tool` with `match.operation`. Watcher events are not `post_tool` and stay native. |
| **Timeout units and defaults.** Seconds on most tools, ms on GE and KI CLI; defaults 30 s (CP, VS, GO, CL), 60 s (GE, KI), 600 s (CC, CX), unknown (CU); hard caps (CX SessionEnd 3 s, CL 30 s). | Inventories | Canonical ms, always emitted explicitly, rounded up, clamped with `hook.timeout_clamped`. |
| **`session_start` source values.** CP `new` vs PI `new` (the `/new` command) vs VS always `new`; GE lacks `compact`; PI adds `reload`. | Inventories | Core enum is the shared five; CP `new` maps to `startup`, PI `new` to `clear`, PI `reload` stays native; VS gets `hook.observe_timing`. |
| **Duplicate channels.** CC deduplicates identical handlers only across settings files; plugin and skill copies run separately, so a hook installed both in settings and in a plugin runs twice. Several tools read Claude locations (CP, VS, CU, DV), so a Claude settings write can also activate in those tools. | CC docs; advisor | One owner per output path; `hook.duplicate_owner` when a target would merge two channels. Writers for CP, VS, CU, DV check whether a Claude-location file already carries the hook. |

## 5. Per-target extras and lossless round trips

### 5.1 What stays raw

`targets.<t>.hooks` (SPEC §13.9) is replaced by `targets.<t>.native_hooks`: the target's own hook document fragment, stored verbatim and validated only by that target's schema. It holds everything in section 1.4 plus any entry the reader could not project (for example a CC `if` with two permission rules split across handlers, a CP `prompt` auto-submit, a CU `beforeTabFileRead`, KI `confirm`, GE `sequential: true`, CX `additionalContextLimit`). Handler fields that refine a projected hook (`asyncRewake`, `continueOnBlock`, `once`, `additionalContextLimit`) attach as `targets.<t>.handler_extra` on that entry instead of forking it.

### 5.2 Round-trip contract

For a native package P read from target t: `write(read(P), t)` equals P up to JSON key order and whitespace. Mechanism: the reader records for each projected entry its origin (`target`, file, JSON pointer, `protocol: claude` or `native`), rewrites only reversible placeholders (`${CLAUDE_PLUGIN_ROOT}` to `${ACF_CAPABILITY_DIR}` and back, from a fixed table), and keeps the handler's command string otherwise untouched; it does not wrap imported handlers in the runner. On writing back to t, projected entries are rendered in t's dialect and spliced at their recorded pointers; the native remainder is emitted unchanged. Cross-target writes of an imported hook use `protocol: claude` through the runner and are never claimed lossless.

### 5.3 Reader rules

- A hook that maps to a canonical event but uses an effect outside the matrix stays native in full; partial projection would split one handler's behavior across two places.
- A matcher that compiles to `match` exactly (a tool-name list that maps one-to-one to operations, `mcp__server__tool`) is projected; any regex beyond that stays native.
- Imported handlers default to `failure: open` because that is the native behavior they were written against; the reader emits `hook.imported_fail_open` so the author can choose.

## 6. Delta vs current ACF SPEC and code

### 6.1 Exists today

SPEC §13 defines `hooks/hooks.yml` keyed by 7 canonical types (`session_start`, `user_prompt_submit`, `pre_tool`, `permission_request`, `post_tool`, `stop`, `pre_compact`), a single `effect` per entry with a per-type matrix (`packages/core/src/types/model.ts` `hookEffectMatrix`), `match {operation, paths, conditions}` required on tool events (`hookMatchRequired`), `run {command, args or shell, env}`, `timeout` in ms defaulting to 30000 (`defaultHookTimeoutMs`), placeholders `${ACF_CAPABILITY_DIR}`/`${ACF_PACKAGE_DIR}`/`${ACF_HOOK_DIR}`, and the stdin JSON plus exit 0/2/other protocol (§13.6.6). Event names live in `packages/runtime-taxonomy/src/index.ts` (`canonicalHookTypes`). The shared emitter is `packages/adapters/src/common/emitter.ts` (`emitHooks` from line 227).

### 6.2 Defects found (current behavior, verified in code)

| Location | Defect | Consequence |
|---|---|---|
| `packages/adapters/src/common/emitter.ts` `hookSettingsEntry` (549 to 582) | Writes ACF-shaped objects `{acfMarker, name, type, event, effect, timeoutMs, run, match}` under `/hooks/<NativeEvent>/<i>` in `<installRoot>/settings.json` for every target. Claude expects matcher groups `{matcher, hooks:[{type:"command", command}]}`. | On Claude the entries carry no runnable handler; whether Claude rejects or ignores them needs a fixture (7.2). Either way no hook runs. |
| same, `placeholders.capabilityDir: cap.root` | Substitutes absolute source paths. | Breaks relocated or cached plugin installs; should emit native plugin-root variables (2.8). |
| `emitter.ts` `degradeEffectIfNeeded` (504 onward) and SPEC §22.6 | Partial-support targets degrade any effect to `observe` with a lossy diagnostic. | A `block` hook installs and silently fails open. Replace with `hook.effect_unenforceable` (error, activation blocked). |
| `packages/core/src/targets/registry.ts:83` | Claude `permission_request` maps to `PreToolUse`. | Fires on every tool call; Claude has native `PermissionRequest`. |
| `registry.ts:126` | Codex `pre_compact: []`. | Codex now has `PreCompact` (spot check). |
| `registry.ts:149` to 161 | Cursor `hook: "none"`, every event empty; `packages/adapters/src/cursor/index.ts:33` sets `skipUnsupportedHooks`. | Cursor has one of the richest hook systems (section 3.1); every hook is dropped. |
| `registry.ts:185` to 201 | OpenCode `hook: "partial"` with invented names (`permission.asked` is an observer event, not the `permission.ask` trigger; `session.start`, `prompt.before`, `agent.stop`, `session.compact.before` do not exist). | Emitted config is never read; OpenCode has no hook config at all. |
| `registry.ts:228` to 244 | Pi `hook: "full"` with names (`prompt_submit`, `tool_call_before`, ...) that are not Pi events; the emitter writes `hooks/` and `settings.json`, which Pi does not read. | Hooks marked fully supported are silently inert. Should be E/D until a bridge writer exists (2.7). |
| `packages/core/src/schemas/index.ts:144` to 151 | `hookRunSchema` is `.passthrough()`. | Misspelled `run` keys validate and vanish. Make it strict. |
| `schemas/index.ts` `hookFileSchema` and `packages/core/src/targets/extensions.ts` `hookExtension` | `targets.<t>.hooks` reuses the canonical entry schema. | Native-only fields (`http`, `prompt`, `if`, `statusMessage`, native events with native effects) cannot be expressed; lossless import is impossible. |
| SPEC §13.6.6 | "Non-JSON stdout is `add_context`" for every event. | True on CC only for SessionStart and UserPromptSubmit; CX ignores plain stdout on PreCompact. The runner must own this rule. |

### 6.3 Changes and additions

1. Keyed map becomes a list with `event` field; `effect` becomes `effects` list; `run` becomes `handler` with `type` (`command` keeps `command`, `args`, `shell`, `env`, `cwd`, adds `os`).
2. New events `session_end`, `subagent_start`, `subagent_stop`, `post_compact`, `notification`; new effects `ask`, `allow`, `rewrite_input`, `rewrite_output`, `halt`, `set_env`, `rewrite_prompt`; `decide` is replaced by `allow` and `block` on `permission_request`; `add_context` leaves `pre_compact`.
3. New fields `failure`, `async` (absorbs the `runInBackground` extension), `status_message`, `max_continuations`, `protocol`; new handler types `http`, `mcp_tool`, `prompt`.
4. `match`: `operation` accepts a list; new `mcp`, `command`, `source`, `trigger`, `outcome`, `notification`; `conditions` removed.
5. Placeholders `${ACF_DATA_DIR}`, `${ACF_PROJECT_DIR}`; default `cwd` becomes the project directory.
6. SPEC §13.8: hooks unordered; drop the ordering lossy diagnostic.
7. SPEC §22.3 and `registry.ts`: replace the 5-target mapping with per-target compiled tables generated from one source (event, effect, and match support per target as in section 3), so the registry and the SPEC table cannot drift again.
8. SPEC §22.6: degradation allowed only for non-enforcing meanings; enforcing effects refuse.
9. SPEC §25: ACF ships a hook runner (2.6); the generated wrapper scripts call it.
10. `targets.<t>.native_hooks` and `handler_extra` replace `targets.<t>.hooks` (5.1).
11. Targets Copilot CLI, VS Code, Gemini, Devin, Goose share the Claude-dialect writer with per-target tables; Windsurf, Kiro, Cline get thin writers; Pi, OpenCode, Amp need bridge writers before claiming support.

## 7. Open questions and unverified claims

1. **Runner cost and packaging.** One extra process per hook event (on CC every tool call when `pre_tool` matches `any`) plus a runtime dependency on `caplet` being on PATH inside the agent's environment, including sandboxes, cloud agents (CP cloud, CU cloud run only commands) and Windows. Alternatives: a self-contained generated script per target (needs a JSON tool in the shell), or limiting the runner to hooks whose cells are T(shim). Needs a latency measurement.
2. **Current Claude output.** Whether Claude rejects the settings file or skips entries lacking `hooks` arrays when it reads ACF's current `settings.json` output; requires a fixture install.
3. **Copilot `permissionRequest`** payload is undocumented and later answers override earlier ones; aggregation across capabilities on CP is unverified.
4. **Codex** meaning of non-2 nonzero exits on control events; whether `allow` without `updatedInput` on PreToolUse is accepted or an error.
5. **Cursor** default timeout; plugin-root variable; whether `preToolUse` `ask` becomes enforced (documented as accepted but not enforced).
6. **Agent Plugins namespaces** for Codex (`com.openai`) and Cursor hooks; only `com.github.copilot/hooks/hooks.json` is documented (CP, VS), and whether its schema equals the CP/VS `.github/hooks` schema is unverified.
7. **Claude `prompt` handler** result shape (`{ok, reason}` assumed from CU parity) and Claude `mcp_tool` `input` templating syntax relative to CX's `${field.nested}`.
8. **VS Code** ignoring matcher values: confirmed only by documentation; if a later release honors them the runner filter becomes redundant but harmless.
9. **Devin** effect of `decision: block` on Stop (continue or end) and failure polarity of plugin hooks; **Kiro** IDE vs CLI contradictions (timeout units, `AgentSpawn`, which events block); **Copilot** `postToolUse` `decision: block`.
10. **Bridge feasibility.** Whether Pi, OpenCode, and Amp extension modules can be generated per capability without conflicting with user modules, and whether OpenCode `chat.message` and `experimental.session.compacting` can block.
11. **Scope binding** (agent-frontmatter hooks, CC and VS) is deferred to the agents facet; CC ignores hook frontmatter on plugin agents, so the binding cannot ride on plugin agents for Claude.
12. **Tool coverage.** CX PreToolUse excludes hosted tools; which other targets skip MCP or built-in tools in `pre_tool` is not documented for GE, DV, KI.

## Assessment for the union-without-sacrifice rule

The core is a superset of every hook meaning shared by two or more tools, so nothing shared is dropped. The rule is still sacrificed in reach, never in safety: enforcing effects (`ask`, `allow`, `rewrite_input`, `rewrite_output`, `block_result`, `continue`, `halt`) cannot be emulated where the runtime has no channel for them, so those cells are refusals, and a hook that declares them simply does not activate there. Three things threaten the rule more than any single field: (1) the runner, without which portable matching, failure polarity, and payload normalization cannot exist, but which adds latency and a runtime dependency; (2) module-only runtimes (Pi, OpenCode, Amp, Lume), which need generated bridge modules before any cell becomes T; (3) the number of `?` cells on Copilot, Kiro, Devin, and Cursor, each of which must stay E for enforcing effects until a fixture proves it.
