# Pi coding agent (the harness this project targets; local) - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence/version:** Research date 2026-10-01. The supplied `dist/Claude Code-package/` path does not exist. Available documentation is `/home/blaz/.bun/install/global/node_modules/fo-coding-agent/dist/pi-package/docs/`; its package metadata says `fo-coding-agent` **0.85.0**, while the launcher's installed Pi dependency is **0.87.1**, released **2026-09-22**. Distinguish the documentation snapshot from current installed types. Below, **D** denotes that absolute documentation directory; **P** denotes `/home/blaz/.bun/install/global/node_modules/fo-coding-agent/node_modules/@earendil-works/pi-coding-agent`. These abbreviations are local-path citations, not URLs. Sources: `dist/pi-package/package.json:1-10`; `P/package.json:1-4`; `P/CHANGELOG.md:1-18`.

Shipped native skill support implements Agent Skills with lenient validation. `allowed-tools` is explicitly **experimental**. (`D/skills.md:3-7,138-189`)

| Frontmatter field | Type | Meaning / behavior |
|---|---|---|
| `name` | string | Declared required; 1–64 lowercase letters, digits, hyphens; no leading/trailing or consecutive hyphens. Unlike Agent Skills, need not match directory name. Implementation accepts missing/non-string name and derives a name. |
| `description` | string | Required, non-empty; maximum 1,024 characters recommended/validated. Missing description prevents loading. |
| `license` | string | License name or bundled-file reference. |
| `compatibility` | string | Environment requirements; maximum 500 characters declared. |
| `metadata` | mapping | Arbitrary key/value metadata. |
| `allowed-tools` | string | Space-delimited pre-approved tool names; experimental declaration, **not established as an enforced permission boundary**. |
| `disable-model-invocation` | boolean | Only literal `true` hides skill from the system-prompt inventory; user can invoke `/skill:name`. |

Sources: `D/skills.md:138-189`; `P/dist/core/skills.js:231-262`. The runtime extraction inspected reads `name`, `description`, and `disable-model-invocation`; do not assume the remaining metadata becomes runtime policy.

**Discovery:**

- User: `~/.pi/agent/skills/`, `~/.agents/skills/`.
- Trusted project: `.pi/skills/`; `.agents/skills/` in cwd and ancestors through Git root, or filesystem root outside Git.
- Packages: conventional `skills/` or `package.json` → `pi.skills`.
- Settings: `skills: string[]` of files/directories.
- CLI: repeatable `--skill <path>`; explicit paths remain additive with `--no-skills`.
- Recursive `SKILL.md` directories; direct root Markdown skills supported in `.pi` skill locations when frontmatter has a description.
- Shared `.agents/skills` ignores arbitrary root Markdown, but accepts frontmatter-bearing nested Markdown in grouping folders.
- Duplicate names warn and retain **first discovered**, not “project always overrides user.”
  
Sources: `D/skills.md:20-63,177-189`; default Pi skill-directory loading appears in `P/dist/core/skills.js:350-351`. Complete cross-source discovery precedence is **UNKNOWN** from the cited docs.

**Bundling/invocation:** Everything beside `SKILL.md` is freeform; `scripts/`, `references/`, `assets/` are conventions, not mandatory manifest fields. Resolve references relative to skill directory. Names/descriptions enter system context; model reads full instructions on demand. `/skill:name args` expands skill content and appends `User: <args>`. `enableSkillCommands: boolean` defaults true. No Pi-specific supplementary skill metadata file is documented. (`D/skills.md:65-106,129-150`; `D/settings.md:277-292`)

## Instructions and rules

Shipped plain-Markdown context files; **no native frontmatter rule schema** is documented. (`D/usage.md:99-118`)

| File | Activation / precedence |
|---|---|
| `~/.pi/agent/AGENTS.md` | Global context at startup. Runtime also applies candidate fallback names below within agent directory. |
| `AGENTS.override.md` | First candidate within each directory; shadows that directory’s ordinary context file. |
| `AGENTS.md`, `AGENTS.MD` | Next candidates, in this order. |
| `CLAUDE.md`, `CLAUDE.MD` | Fallback candidates after AGENTS variants. |
| `.pi/SYSTEM.md` | Trusted cwd project replacement for default system prompt; wins over global counterpart. |
| `~/.pi/agent/SYSTEM.md` | Global replacement if no eligible project file. |
| `.pi/APPEND_SYSTEM.md` | Trusted project append text; selected instead of global counterpart when present. |
| `~/.pi/agent/APPEND_SYSTEM.md` | Global append fallback. |

Sources: `P/dist/core/resource-loader.js:32-51,813-834`; `D/usage.md:99-118`.

Context ordering is **global, filesystem ancestors outer-to-inner, cwd**. Only one context candidate per directory loads. Discovery walks to filesystem root, not merely repository root. Nested linked worktrees can shadow duplicated main-worktree context from the same logical repository scope. (`P/dist/core/resource-loader.js:53-108`)

- Always-loaded context, not file-access-triggered nested rules.
- Disable context with `--no-context-files` / `-nc`.
- Context files load **even when project trust is declined**; protected system-prompt files do not.
- Native `GEMINI.md`, `.mdc`, steering-file discovery, glob/file-scoped activation, model-decided/manual rule metadata, and imports/includes: **Not supported by the documented context loader**. Markdown references are not loader includes.
  
Sources: `D/usage.md:99-118`; `D/security.md:7-29`; `P/dist/core/resource-loader.js:32-51`.

**ACF discrepancy:** Generic Pi layout has no `alwaysInstructionFile`; it uses `.acf/instructions` for other instruction output, which these native discovery docs do not recognize. (`packages/adapters/src/common/emitter.ts:56-68,134-177`)

## Subagents and custom agents

**Not supported natively.** Pi explicitly excludes built-in subagents; extensions/packages can implement them. Consequently there is no core agent-definition file, frontmatter inventory, delegation permission schema, agent scope, or native `agents/` discovery contract. (`D/usage.md:309`)

The Fo launcher acknowledges an installed extension such as `pi-subagents`; its session policy also affects extension-created in-process `AgentSession`s, and a persona `tools:` allowlist can constrain dispatch. This is **extension-specific**, not Pi’s portable native agent schema. (`/home/blaz/.bun/install/global/node_modules/fo-coding-agent/README.md`, “fo vs pi” and session-policy paragraphs)

**ACF discrepancy:** Registry declares Pi agent support `"full"` and the generic emitter writes `agents/<name>.md`; neither establishes native Pi consumption. A concrete subagent-extension dependency and its versioned schema would be needed. (`packages/core/src/targets/registry.ts:220-230`; `packages/adapters/src/common/emitter.ts:56-60,85-91,105-118`)

## Commands and prompts

Shipped prompt templates remain distinct from skills; **commands have not become skills**. (`D/prompt-templates.md:3-17`; `D/extensions.md:1560-1591`)

| Native file / field | Type / meaning |
|---|---|
| `~/.pi/agent/prompts/*.md` | User prompt templates. |
| `.pi/prompts/*.md` | Trusted project templates. |
| `package.json` → `pi.prompts` | Package template paths. |
| Settings `prompts` | `string[]`; additional files/directories. |
| `description` frontmatter | Optional string; fallback is first non-empty body line. |
| `argument-hint` frontmatter | Optional string; autocomplete hint, not argument validation. |
| Filename stem | Command name: `review.md` → `/review`. |

Discovery is non-recursive unless nested files/directories are explicitly configured. Repeatable `--prompt-template <path>` adds paths; `--no-prompt-templates` disables discovery. (`D/prompt-templates.md:7-53,93-96`)

**Exact argument syntax:** `$1`, `$2`, …; `$@` and `$ARGUMENTS`; `${1:-default}`; `${@:-default}`, `${ARGUMENTS:-default}`; `${@:N}`; `${@:N:L}`. Positions are one-indexed; quoted arguments are supported. No documented shell-command substitution, automatic file-content interpolation, template-level model override, or tool override. (`D/prompt-templates.md:55-91`)

**Code commands:** `pi.registerCommand(name, options)`:

| Key | Type / meaning |
|---|---|
| `name` | string argument; slash command without `/`. |
| `description` | optional string. |
| `getArgumentCompletions` | optional function of string prefix; returns autocomplete items/null, optionally Promise in installed types. |
| `handler` | async function `(args: string, ctx: ExtensionCommandContext) => Promise<void>`. |

Same-name extension commands receive numeric invocation suffixes in load order, e.g. `/review:1`, `/review:2`. Extension command handling precedes `input`, skill expansion, and template expansion. (`D/extensions.md:911-958,1525-1591`; `P/dist/core/extensions/types.d.ts:963-976`)

`sendUserMessage` does **not** expand commands/templates by default: `expandPromptTemplates: true` opts in. Streaming delivery requires `deliverAs: "steer" | "followUp"`. (`D/extensions.md:1439-1469`)

**ACF discrepancy:** Adapter writes `commands/`, but native templates live under `prompts/`. (`packages/adapters/src/common/emitter.ts:60,89-92`; `D/prompt-templates.md:7-17`)

## Hooks

Shipped hooks are **JS/TS extension subscriptions**, not declarative hook manifests. Module default export is a sync/async factory receiving `ExtensionAPI`; `pi.on(event, handler)` subscribes. No native command/http/prompt handler enum, declarative matcher, hook-specific subprocess environment, exit-code decision protocol, or standardized hook timeout is documented. Extensions may implement those behaviors themselves. (`D/extensions.md:154-181,273-349,1361-1363`)

All payloads have `type` equal to the event spelling. Types below use `?` for optional fields. Return nothing for observation unless otherwise listed.

| Event | Payload fields / meaning | Return contract |
|---|---|---|
| `project_trust` | `cwd: string`; before protected project resources load | `trusted: "yes" \| "no" \| "undecided"`, `remember?: boolean`; first yes/no wins |
| `resources_discover` | `cwd: string`, `reason: "startup" \| "reload"` | `skillPaths?`, `promptPaths?`, `themePaths?`: string arrays |
| `session_start` | `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`, `previousSessionFile?: string` | Observation |
| `session_info_changed` | `name: string \| undefined` | Observation |
| `session_before_switch` | `reason: "new" \| "resume"`, `targetSessionFile?: string` | `cancel?: boolean` |
| `session_before_fork` | `entryId: string`, `position: "before" \| "at"` | `cancel?`, `skipConversationRestore?`: boolean; latter documented reserved |
| `session_before_compact` | `preparation: CompactionPreparation`, `branchEntries: SessionEntry[]`, `customInstructions?: string`, `reason: "manual" \| "threshold" \| "overflow"`, `willRetry: boolean`, `signal: AbortSignal` | `cancel?: boolean`, `compaction?: CompactionResult` |
| `session_compact` | `compactionEntry: CompactionEntry`, `fromExtension: boolean`, same `reason`, `willRetry: boolean` | Observation |
| `session_compact_failed` | same `reason`, `errorMessage?: string`, `aborted`, `willRetry`, `fromExtension`: boolean | Observation |
| `session_shutdown` | `reason: "quit" \| "reload" \| "new" \| "resume" \| "fork"`, `targetSessionFile?: string` | Cleanup |
| `session_before_tree` | `preparation: TreePreparation`, `signal: AbortSignal` | `cancel?: boolean`, `summary?: {summary: string, details?: unknown, usage?: Usage}`, `customInstructions?: string`, `replaceInstructions?: boolean`, `label?: string` |
| `session_tree` | `newLeafId`, `oldLeafId`: string/null; `summaryEntry?: BranchSummaryEntry`, `fromExtension?: boolean` | Observation |
| `before_agent_start` | `prompt: string`, `images?: ImageContent[]`, readonly `systemPrompt: string`, mutable `systemPromptOptions` | `message?: {customType, content, display, details?}`, `systemPrompt?: string` |
| `agent_start` | No additional fields | Observation |
| `agent_end` | `messages: AgentMessage[]`; low-level run ended, not necessarily settled | Observation |
| `agent_before_settle` | Boundary fields below; before final settlement | `entries?: SessionBoundaryDraft[]`, `continue?: boolean` |
| `agent_settled` | No additional fields; no automatic continuation remains | Observation |
| `ui_prompt_start`, `ui_prompt_end` | `reason: "ui_prompt"`, `kind: "select" \| "confirm" \| "input" \| "editor" \| "custom"`, `title?: string` | Notification; best-effort, not awaited |
| `turn_start` | `turnIndex: number`, `timestamp: number` | Observation |
| `turn_end` | Boundary fields plus `turnIndex: number`, `message: AgentMessage`, `toolResults: ToolResultMessage[]`, `messageEntryId: string`, `toolResultEntryIds: string[]` | Boundary result |
| `message_start` | `message: AgentMessage` | Observation |
| `message_update` | `message`, `assistantMessageEvent: AssistantMessageEvent` | Observation |
| `message_end` | `message: AgentMessage` | `message?: AgentMessage`; must preserve role |
| `tool_execution_start` | `toolCallId: string`, `toolName: string`, `args: any` | Observation |
| `tool_execution_update` | same identifiers/args, `partialResult: any` | Observation |
| `tool_execution_end` | identifiers, `result: any`, `isError: boolean` | Observation |
| `context` | `messages: AgentMessage[]`; conversation without system messages | `messages?: AgentMessage[]`; Pi restores prompt/tool state |
| `context_with_system` | `messages: AgentMessage[]`; full transcript after `context` | Same result; extension owns system/tool declarations |
| `before_provider_headers` | `headers: ProviderHeaders` | Mutate in place; string adds/replaces, null removes; return ignored |
| `before_provider_request` | `payload: unknown` | Undefined retains; any other value replaces |
| `after_provider_response` | `status: number`, `headers: Record<string,string>` | Observation before stream consumption |
| `model_select` | `model`, `previousModel: Model \| undefined`, `source: "set" \| "cycle" \| "restore"` | Observation |
| `thinking_level_select` | `level`, `previousLevel`: ThinkingLevel | Observation |
| `tool_call` | `toolCallId: string`, `toolName: string`, `input: tool-specific object` | Mutate input; `{block?: boolean, reason?: string, terminate?: boolean}` |
| `tool_result` | identifiers/input, `content: (TextContent \| ImageContent)[]`, `details`, `isError: boolean`, `usage?: Usage` | Partial patch of `content`, `details`, `isError`, `usage` |
| `user_bash` | `command: string`, `excludeFromContext: boolean` (`!!`), `cwd: string` | Either `operations: BashOperations` or `result: BashResult` |
| `input` | `text: string`, `images?: ImageContent[]`, `source: "interactive" \| "rpc" \| "extension"`, `streamingBehavior?: "steer" \| "followUp"` | `{action:"continue"}`, `{action:"transform",text,images?}`, or `{action:"handled"}` |
| `cache_warming_decision` | `warmCost`, `missCost`, `continuationProbability`: number; `action: "warm" \| "stop"` | `action?: "warm" \| "stop"` |

Sources: `D/extensions.md:353-958`; newer installed contracts: `P/dist/core/extensions/types.d.ts:388-744,879-948`; cache contract: `P/dist/core/cache-warmer.d.ts:22-50`. `context_with_system`, boundary events/results, and cache-warming event are present in installed shipped types but omitted from the inspected documentation event inventory.

**Nested payload structures:**

- `TreePreparation`: `targetId: string`, `oldLeafId`, `commonAncestorId`: string/null; `entriesToSummarize: SessionEntry[]`, `userWantsSummary: boolean`, `customInstructions?: string`, `replaceInstructions?: boolean`, `label?: string`. (`P/dist/core/extensions/types.d.ts:485-499`)
- Boundary: `entries: SessionBoundaryDraft[]`, `continue: boolean`, `context: {contextEntries, contextMessages, llmMessages, pendingMessages, canContinue: boolean}`, `outcome: "completed" | "aborted" | "error"`.
- Boundary draft variants: `custom {customType,data?}`; `custom_message {customType,content,display,details?}`; `context_edit {targetId,replacement}`; `compaction {summary,firstKeptEntryId:string|null,details?,usage?}`. (`P/dist/core/extensions/types.d.ts:575-623`)
- Structured prompt options expose `customPrompt`, `selectedTools`, `toolSnippets`, `promptGuidelines`, `appendSystemPrompt`, `cwd`, `contextFiles`, `skills`. (`D/extensions.md:530-565`)
- Documented custom compaction fields include `summary`, `firstKeptEntryId`, `tokensBefore`, optional `usage`. (`D/extensions.md:452-491`)

**Ordering/security pitfalls:**

- `tool_call` input mutation is **not revalidated**; later handlers see mutations.
- Sibling tool calls preflight sequentially, execute concurrently by default; handlers must not assume sibling results already exist.
- Execution updates/results interleave; final tool-result messages preserve assistant source order.
- `tool_result`, provider-payload changes, and input transforms chain in extension load order.
- Blocking returns a tool failure, not a standardized `"deny"`/`"ask"` decision. User confirmation is extension UI code.
- `terminate` requires every finalized result in the batch to be terminating.
- Trust hooks run only in user/global and CLI extensions before project extensions load.
  
Sources: `D/extensions.md:353-368,651-673,705-736,778-875,911-958`.

**ACF discrepancy:** Registry maps `prompt_submit`, `tool_call_before`, `tool_call_after`, `stop`, `pre_compact`; these are not the corresponding native Pi spellings (`input`/`before_agent_start`, `tool_call`, `tool_result`, `agent_end`/`agent_settled`, `session_before_compact`). Generic emitter writes `hooks/` and `settings.json` hook entries, whereas native subscription requires executable extensions. (`packages/core/src/targets/registry.ts:240-248`; `packages/adapters/src/common/emitter.ts:63-64,233-291`)

## MCP servers

**Not supported natively.** Pi explicitly excludes built-in MCP. MCP integration can be provided by an extension, but no extension-specific schema was assigned here. (`D/usage.md:309`)

Consequently native config file and fields `command`, `args`, `env`, `cwd`, `envFile`, `url`, `headers`, transport, auth/OAuth, timeout, enabled/disabled tools, trust, variable expansion, plugin-root variables, scopes, and precedence are **not applicable to Pi core**; specific third-party-extension behavior is **UNKNOWN**.

**ACF discrepancy:** Pi registry advertises MCP `"full"` and targets `~/.pi/agent/mcp.json` / `.pi/mcp.json`; generic emitter writes `/mcpServers/<name>`. These files do not establish native MCP support. (`packages/core/src/targets/registry.ts:224-230,255-258`; `packages/adapters/src/common/emitter.ts:304-317`)

## Other native capability types

Packages natively declare only **extensions, skills, prompts, themes**. LSP manifests, output-style files, apps/connectors, monitors, statusline command files, and package-level `userConfig` schemas are **Not supported as documented native resource types**. Arbitrary integrations/UI are possible through extension code. (`D/packages.md:3-5,116-165`; `D/extensions.md:3-28`)

**Extensions — shipped:**

Discovery: `~/.pi/agent/extensions/*.ts`, `extensions/*/index.ts`; trusted `.pi/extensions` counterparts; package manifest; settings; CLI `-e`. Convention package directories also load `.js`. Default sync/async factory; Jiti executes TS without compilation. Runtime npm dependencies resolve from extension/package directory. `/reload` supports discovered resources. (`D/extensions.md:109-181,226-271`; `D/packages.md:158-165`)

| Tool-definition key | Type / meaning |
|---|---|
| `name`, `label`, `description` | strings: tool identity, UI label, model description |
| `promptSnippet` | optional string; system-prompt one-line tool entry |
| `promptGuidelines` | optional string[]; appended when active |
| `parameters` | TypeBox schema |
| `constrainedSampling` | optional false or `ConstrainedSamplingConfig`; provider-side constrained sampling |
| `renderShell` | optional `"default" \| "self"`; UI framing owner |
| `prepareArguments` | optional function; transforms raw args before validation |
| `executionMode` | optional `"sequential" \| "parallel"` |
| `execute` | async `(toolCallId, params, signal, onUpdate, ctx)` |
| `renderCall`, `renderResult` | optional rendering functions |

Source: `P/dist/core/extensions/types.d.ts:345-378`.

Result: `content` text/image blocks, optional `details`, `usage`, `terminate`. Throw to signal execution failure; returning `isError` from the tool itself is not the documented failure mechanism. Tools may override built-ins by name; renderer inheritance is per slot, prompt metadata is not inherited. (`D/extensions.md:1955-2111`)

Other extension registrations:

- Commands: described above.
- `registerShortcut(shortcut, {description?,handler})`.
- `registerFlag(name, {description?,type:"boolean"|"string",default?})`.
- Message/entry renderers, Markdown transformers, custom editor/autocomplete, status widgets/footer.
- `setStatus`, `setWidget`, `setFooter` are code APIs, not package manifest capabilities.
- Custom UI overlay mode is explicitly **experimental**.
  
Sources: `D/extensions.md:1593-1666,2502-2847`.

**Themes — shipped:** `~/.pi/agent/themes/*.json`, trusted `.pi/themes/*.json`, package/configured paths; repeatable `--theme`, `--no-themes`; select `theme` setting or `/settings`; active file hot-reloads. (`D/themes.md:17-57,139-166`)

| Theme key | Type / meaning |
|---|---|
| `$schema` | optional string; editor schema URL |
| `name` | required unique string; cannot contain `/` |
| `vars` | optional mapping of color names to values |
| `colors` | required token mapping |
| `export.pageBg`, `export.cardBg`, `export.infoBg` | optional HTML-export colors |

Color value: six-digit RGB string, integer 0–255, variable-reference string, or `""` for terminal default. (`D/themes.md:143-168,265-288`)

Exact tokens:

- Core: `accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`, `scrollbarTrack`, `scrollbarThumb`.
- Content: `selectedBg`, `userMessageBg`, `userMessageText`, `customMessageBg`, `customMessageText`, `customMessageLabel`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `toolTitle`, `toolOutput`.
- Optional search: `searchMatchBg` → fallback `selectedBg`; `searchMatchText` → `text`.
- Markdown: `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`.
- Diff: `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`.
- Syntax: `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`.
- Thinking: `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`; optional `thinkingMax` → `thinkingXhigh`.
- `bashMode`.

Source: `D/themes.md:168-263`.

**Models/providers — shipped:** User `~/.pi/agent/models.json`, root `providers: Record<string,ProviderConfig>`. Reloaded when opening `/model`. Not a native package resource; an extension can register providers. (`D/models.md:1-3,65-92`; `D/extensions.md:1738-1862`)

| JSON provider key | Type / meaning |
|---|---|
| `baseUrl` | string endpoint |
| `api` | string API selector |
| `apiKey` | optional string credential expression |
| `oauth` | string; documented dynamic provider `"radius"` |
| `headers` | string-value mapping |
| `authHeader` | boolean; emit bearer authorization |
| `models` | model array |
| `modelOverrides` | ID-keyed partial model mapping |
| `compat` | compatibility mapping; documented provider defaults |

Source: `D/models.md:121-176,439-461`.

Documented APIs: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`; sampling documentation also mentions `azure-openai-responses`. (`D/models.md:121-130,239-257`)

Model fields: `id:string` required; `name?:string`; `api?:string`; `reasoning?:boolean`; `thinkingLevelMap?:Record<level,string|null>`; `input?:("text"|"image")[]`; `contextWindow?:number`; `maxTokens?:number`; `samplingParams?:object`; `cost?:{input,output,cacheRead,cacheWrite:number,tiers?:{inputTokensAbove,input,output,cacheRead,cacheWrite:number}[]}`; `compat?:object`. `modelOverrides` additionally supports `headers`, and partial cost. (`D/models.md:197-300,339-387`)

Thinking-level enum: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Missing extended mappings mean unsupported; null explicitly disables; string enables/maps. `samplingParams` is verbatim request-body data whose keys override named fields on supported OpenAI APIs. (`D/models.md:239-300`)

Exact compatibility keys:

- Boolean: `supportsEagerToolInputStreaming`, `supportsLongCacheRetention`, `sendSessionAffinityHeaders`, `supportsCacheControlOnTools`, `forceAdaptiveThinking`, `supportsMidConvoEffort`, `allowEmptySignature`, `supportsStrictTools`, `supportsStore`, `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsUsageInStreaming`, `supportsFinishReason`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages`, `supportsThinkingTokenBudget`, `supportsStrictMode`, `supportsOpenAIGrammarTools`.
- `maxTokensField`: `"max_completion_tokens" | "max_tokens"`.
- `thinkingFormat`: `"reasoning_effort" | "openrouter" | "deepseek" | "together" | "baseten" | "zai" | "qwen" | "chat-template" | "qwen-chat-template"`.
- `chatTemplateKwargs`, `chatTemplateArgs`: objects; dynamic values `{ "$var": "thinking.enabled" | "thinking.effort" | "thinking.budget" }`.
- `thinkingTokenBudgetField`: string request-field name.
- `cacheControlFormat`: `"anthropic"`.
- `sessionAffinityFormat`: `"openai" | "openai-nosession" | "openrouter"`.
- `deferredToolsMode`: `"kimi"`.
- `openRouterRouting`, `vercelGatewayRouting`: raw routing objects.

Sources: `D/models.md:389-437,439-499`.

Credential/header expressions: leading `!command`, `$ENV_VAR`, `${ENV_VAR}`, embedded interpolation; `$$` literal dollar, `$!` literal bang. Missing variable makes value unresolved. Shell commands execute at request time with no built-in TTL/stale recovery. **These are model credential expressions, not plugin-root or MCP expansion.** (`D/models.md:147-176`)

Extension provider schema differs: `name?`, `baseUrl?`, `apiKey?`, `api?`, `streamSimple?`, `headers?`, `authHeader?`, `models?`, `refreshModels?`, `oauth?` object with `name`, `isSubscription?`, deprecated `usesCallbackServer?`, `login`, `refreshToken`, `getApiKey`, `modifyModels?`. Extension model fields additionally include `baseUrl?`, `inputLimits?`, `promptCache?`, `headers?`; several fields optional in JSON are required in code. (`P/dist/core/extensions/types.d.ts:1161-1245`)

**Keybindings — shipped:** `~/.pi/agent/keybindings.json`, mapping action ID → string or string[]; `[]` disables; overrides defaults; `/reload` applies; old non-namespaced IDs migrate. Not a package manifest resource. Modifiers `ctrl`, `shift`, `alt`, `super`; letters/digits/symbols, documented special keys, `f1`–`f12`. (`D/keybindings.md:1-23,195-209`)

Exact configurable action IDs, grouped by prefix:

- `tui.editor.`: `cursorUp`, `cursorDown`, `historyPrevious`, `historyNext`, `cursorLeft`, `cursorRight`, `cursorWordLeft`, `cursorWordRight`, `cursorLineStart`, `cursorLineEnd`, `jumpForward`, `jumpBackward`, `pageUp`, `pageDown`, `deleteCharBackward`, `deleteCharForward`, `deleteWordBackward`, `deleteWordForward`, `deleteToLineStart`, `deleteToLineEnd`, `yank`, `yankPop`, `undo`.
- `tui.input.`: `newLine`, `submit`, `tab`, `copy`.
- `tui.select.`: `up`, `down`, `pageUp`, `pageDown`, `confirm`, `cancel`.
- `tui.altScreen.`: `pageUp`, `pageDown`, `halfPageUp`, `halfPageDown`, `lineUp`, `lineDown`, `previousPrompt`, `nextPrompt`, `search`, `searchNext`, `searchPrevious`, `searchClose`, `top`, `bottom`.
- `app.`: `interrupt`, `clear`, `exit`, `suspend`, `editor.external`, `clipboard.pasteImage`.
- `app.session.`: `new`, `tree`, `fork`, `resume`, `togglePath`, `toggleSort`, `toggleNamedFilter`, `rename`, `delete`, `deleteNoninvasive`.
- `app.model.`: `select`, `cycleForward`, `cycleBackward`.
- `app.thinking.`: `cycle`, `toggle`.
- `app.tools.expand`; `app.message.copy`, `app.message.followUp`, `app.message.dequeue`.
- `app.tree.`: `foldOrUp`, `unfoldOrDown`, `editLabel`, `toggleLabelTimestamp`, `filter.default`, `filter.noTools`, `filter.userOnly`, `filter.labeledOnly`, `filter.all`, `filter.cycleForward`, `filter.cycleBackward`.
- `app.models.`: `save`, `enableAll`, `clearAll`, `toggleProvider`, `reorderUp`, `reorderDown`.

Sources: `D/keybindings.md:27-193`. Fullscreen bindings take precedence over editor bindings; explicit editor-history bindings can supersede application actions in main-editor focus. (`D/keybindings.md:46,87-119`)

## Permissions, trust and security

**Shipped project trust; no built-in sandbox or permission-pop-up system.** Pi and extensions run with invoking user’s system permissions. Trust controls input loading, not subsequent tool actions. (`D/security.md:3-37`; `D/usage.md:309`)

| Setting/file | Type / behavior |
|---|---|
| `~/.pi/agent/trust.json` | Saved decisions keyed by canonical directory; closest cwd/ancestor decision applies. Full serialized schema **UNKNOWN** from cited docs. |
| Global `defaultProjectTrust` | `"ask" \| "always" \| "never"`; default ask |
| `--approve` / `-a` | One-run project trust override |
| `--no-approve` / `-na` | One-run rejection override |
| `/trust` | Saves decision, optionally immediate parent; does not reload current session |
| `defaultTools` | string[] of built-ins; not an extension security boundary |

Trust triggers: `.pi/settings.json`; `.pi/extensions`, `skills`, `prompts`, `themes`; `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`; project ancestor `.agents/skills`. Bare `.pi` does not trigger. Noninteractive ask/never skips protected project resources without saved approval. Context files still load. (`D/security.md:7-29`; `D/settings.md:12-22`)

Tool controls: built-ins `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`; project `defaultTools` replaces global array; extension/SDK tools remain enabled. `--tools` is strict all-tool allowlist; `--no-tools` disables all; `--no-builtin-tools` removes built-ins; `--exclude-tools` filters selection. (`D/settings.md:222-244`)

Packages cannot declaratively request/set Claude-style permission allow/deny rules through a Pi manifest; they can execute arbitrary extension code and implement gates. Skills’ experimental `allowed-tools` must not be translated into guaranteed enforcement. (`D/packages.md:18-21,116-133`; `D/extensions.md:15-28`; `P/dist/core/skills.js:231-262`)

Signature verification, package provenance enforcement, organization scopes, enterprise-managed required/blocked packages, and a mandatory per-package install trust prompt: **UNKNOWN / not documented**. The documented install warning recommends source review; project trust is a separate folder decision. (`D/packages.md:18-50`; `D/security.md:5-37`)

## Packaging, install and scopes

**Shipped Pi packages**, distributed through npm, Git, or local paths. They are not Claude plugins or Agent Plugins manifests. (`D/packages.md:3-5,52-114`)

| `package.json` field | Type / meaning |
|---|---|
| `name` | string; npm package identity |
| `version` | npm package version; examples use versioned npm installation |
| `keywords` | string[]; `"pi-package"` makes gallery discoverable |
| `pi` | optional Pi resource manifest |
| `pi.extensions` | string[] paths/globs |
| `pi.skills` | string[] paths/globs |
| `pi.prompts` | string[] paths/globs |
| `pi.themes` | string[] paths/globs |
| `pi.video` | optional string URL; MP4 gallery preview |
| `pi.image` | optional string URL; PNG/JPEG/GIF/WebP preview; video wins |
| `dependencies` | npm dependency mapping; runtime dependencies |
| `peerDependencies` | npm dependency mapping; bundled Pi libraries should use `"*"` |
| `bundledDependencies` | string[]; other Pi packages bundled into tarball |

Sources: `D/packages.md:56-74,116-188`. Standard npm metadata beyond these fields is npm’s schema, not additional Pi manifest capability fields.

**Layout:** If no `pi` manifest, conventional `extensions/` (`.ts`, `.js`), `skills/` (recursive `SKILL.md`, top-level skill Markdown), `prompts/` (`.md`), `themes/` (`.json`). Manifest paths resolve from package root; positive globs discover visible paths lexically; `!` excludes. Dot-prefixed roots and symlink roots may need explicit listing. (`D/packages.md:116-165`)

**Settings installation records:**

```json
{
  "packages": [
    "npm:example",
    {
      "source": "git:github.com/org/repo@v1",
      "autoload": false,
      "extensions": [],
      "skills": ["+skills/example"],
      "prompts": [],
      "themes": []
    }
  ]
}
```

| Package-entry key | Type / meaning |
|---|---|
| String entry | source specification; default resource loading |
| `source` | string; package source |
| `autoload` | optional boolean; false starts empty and applies explicit resource patterns |
| `extensions`, `skills`, `prompts`, `themes` | optional string[]; resource filters |

Omitted category loads all eligible resources; `[]` loads none; `!pattern` excludes; `+path` exact force-include; `-path` exact force-exclude. Paths relative package root. (`D/packages.md:190-216`; `P/dist/core/settings-manager.d.ts:65-78`)

**Sources and locations:**

| Source | Pinning / on-disk behavior |
|---|---|
| `npm:pkg`, `npm:@scope/pkg@1.2.3` | Versioned specs pinned; user under `~/.pi/agent/npm/`, project `.pi/npm/` |
| `git:github.com/user/repo@v1` | Shorthand accepted with `git:` |
| `git:git@host:user/repo@ref` | SSH shorthand |
| `https://…`, `http://…`, `ssh://…`, `git://…` | Protocol URLs accepted without `git:` |
| Git tag/commit | Pinned; update reconciles configured ref, does not move it |
| Git checkout | `~/.pi/agent/git/<host>/<path>` or `.pi/git/<host>/<path>` |
| Absolute/relative local path | Added without copying; relative to owning settings file; file is single extension, directory follows package rules |

Git reconciliation can reset/clean checkout and install dependencies; do not treat managed clones as safe places for local edits. SSH uses normal keys/config; CI may set `GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND`. Native ZIP source: **UNKNOWN**, not among documented source types. (`D/packages.md:52-114`)

**Install/enable/update:**

- `pi install <source>` / `pi remove <source>` modify `~/.pi/agent/settings.json` by default.
- `-l` targets `.pi/settings.json`; trusted project startup automatically installs missing configured packages.
- `pi -e <package>` installs temporarily for current run; temporary directory exact location **UNKNOWN**.
- `pi config` toggles resources globally; Tab switches scope; `pi config -l` starts project override mode.
- No `enabledPlugins` key; resource arrays/package filters encode selection.
- `pi update`: Pi itself; `--all`: Pi and packages; `--extensions`: packages; `--models`: catalogs; `--self`: Pi; source argument/`--extension`: one package.
- Versioned npm stays pinned; pinned Git checkout reconciles to chosen ref. New ref requires new install specification.
- Experimental installer-managed Pi updates stage/verify lockfile-backed releases; that is not a package lockfile contract.
  
Sources: `D/packages.md:18-50,56-105,218-228`.

**Scopes/precedence:** User, trusted project, temporary CLI resources. Project package entry wins for same identity unless `autoload:false`, which is a delta over global. Identity: npm package name; Git repository URL without ref; resolved absolute local path. Project settings override global; nested objects merge. Resource paths resolve relative to settings-file directory and support absolute paths/`~`. No native org/local-private scope or marketplace manifest schema documented. (`D/packages.md:222-228`; `D/settings.md:277-318,348-373`; `D/extensions.md:1560-1591`)

**Dependencies:** npm/Git installs run dependency installation; production installs omit dev dependencies by default. Pi core libraries belong in peer dependencies, not bundled: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`. Other resource-bearing Pi dependencies require bundled tarball resources explicitly referenced through `node_modules/` manifest paths; separate installations have separate module roots. (`D/packages.md:167-188`; `D/extensions.md:139-152`)

**Catalog:** Gallery uses npm keyword `pi-package`, optional preview metadata. Marketplace/catalog JSON schema, transitive capability imports, package signature schema, universal lockfile/cache contract: **UNKNOWN**. (`D/packages.md:116-154`)

## Notable gaps and ambiguities

- **Critical adapter mismatch:** ACF advertises full native agent/MCP/hook support, but current Pi docs explicitly exclude built-in agents/MCP, and hooks require extension modules. Adapter-generated `agents/`, `commands/`, `hooks/`, hook settings, and `mcp.json` need concrete extension dependencies or corrected native emission/degradation. (`packages/core/src/targets/registry.ts:220-258`; `packages/adapters/src/pi/index.ts:14-36`; `packages/adapters/src/common/emitter.ts:56-68,85-100`; `D/usage.md:309`)
- **Version skew:** Fo’s copied docs/package metadata say 0.85.0; installed Pi is 0.87.1. New events and tool/provider fields exist in installed types but are absent from copied documentation. Treat current types as authoritative for installed API shape; do not silently conflate snapshots. (`dist/pi-package/package.json:1-10`; `P/package.json:1-4`; `P/dist/core/extensions/types.d.ts:345-378,521-655`)
- **Lossless transport:** Skill unknown frontmatter is ignored by runtime, not necessarily preserved by import/export. Pi-native JS/TS modules, theme tokens, raw provider compatibility, and package globs require preservation rather than reduction to generic hooks/MCP/agents. (`D/skills.md:177-189`; `D/packages.md:116-165`; `P/dist/core/extensions/types.d.ts:345-378`)
- **Skills:** Docs call name required while runtime permits derived name. `allowed-tools` is experimental metadata, not demonstrated enforcement. Cross-source collision precedence beyond “first wins” remains UNKNOWN. (`D/skills.md:138-189`; `P/dist/core/skills.js:231-262`)
- **Nested payloads:** Complete recursively expanded schemas for imported `CompactionPreparation`, session entries/messages, `Usage`, `ConstrainedSamplingConfig`, model `inputLimits`, and `promptCache` were not exhaustively traced here; cited installed declarations identify exact points of contact. Do not invent flattened portable fields.
- **Settings are not package manifests:** Arbitrary settings/model/keybinding files are not four additional package resource families. Extension code can implement custom config, but no universal package-owned settings schema exists in cited docs. (`D/packages.md:116-165`; `D/settings.md:277-318`)
- **Security:** Project trust is an input guard, context still loads without trust, extensions are unrestricted local code. Sandbox, signature/provenance enforcement, enterprise policy, install-level trust, and native MCP schema remain absent or UNKNOWN as noted above. (`D/security.md:3-37`)
- **Next design step:** Correct the Pi support table and writer contracts first; represent shipped native extension code/package metadata as target-specific preserved extras, and require explicit versioned extension contracts before claiming agent/MCP support. No files or application state were changed.
