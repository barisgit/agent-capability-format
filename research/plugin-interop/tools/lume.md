# Lume (the user's own agent runtime; local) - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence baseline:** local checkout `/home/blaz/code/lume`, HEAD `52f04222`, commit dated **2026-10-08**, later than the requested **2026-10-01** reference date. Inventory describes implemented behavior in that checkout, **not verified availability as of October 1**. Docs are unversioned; extension manifest/settings document versions are `1`. “Implemented” below means present in local source/docs, not independently verified released distribution.

Sources: `/home/blaz/code/lume/apps/coding-agent/docs/context-and-skills.md:20-71`; parser: `/home/blaz/code/lume/packages/agent-config/src/node/guidance/skills.ts:298-331`.

| `SKILL.md` field | Type | Meaning / validation |
|---|---|---|
| `name` | required string | Maximum 64 characters; `^[a-z0-9]+(?:-[a-z0-9]+)*$`; must equal containing directory basename. |
| `description` | required string | Nonblank; maximum 1,024 characters; exposed in model listing. |
| `disable-model-invocation` | boolean, default `false` | Excludes skill from model listing, not user `/skill` invocation. Quoted `"true"` is invalid. |
| Other YAML keys | arbitrary, ignored | Parser extracts only the three fields above. **`allowed-tools` has no enforcement or retained-model meaning.** |

Parser normalizes BOM and CRLF, requires leading fenced YAML, rejects YAML warnings/errors and duplicate keys, and limits alias expansion to 100. Unknown metadata is ignored rather than rejected. Source: `packages/agent-config/src/node/guidance/skills.ts:298-331`; explicit `allowed-tools` test: `packages/agent-config/test/guidance-discovery.test.ts:125-142`.

Discovery, highest precedence first:

1. `~/.agents/skills`
2. `<config>/skills`
3. `<workspace>/.agents/skills`, then ancestors up to Git root; outside Git, filesystem root
4. `<workspace>/.lume/skills`

**First name wins: global skills override repository skills.** Search respects `.gitignore`/`.ignore`, stops descending beneath a directory containing `SKILL.md`, and reports invalid skills. Source: `apps/coding-agent/docs/context-and-skills.md:20-43`.

- Model sees names/descriptions, then reads `SKILL.md` through ordinary `read`; bodies are not automatically loaded.
- `/skill:<name> [text]` requests reading/following the skill; text limit 16 KiB, outer whitespace removed; bare `/skill` opens picker. Requires an existing session.
- Session references retain the original skill path across resume/branch.
- Role `skills` selector filters both model listing **and user picker**.
- `scripts/`, `references/`, `assets/`: no declared layout/schema or automatic loading; ordinary files can accompany the directory. Automatic execution **not supported**.
- Per-tool metadata files: **UNKNOWN**; inspected discovery only parses `SKILL.md`.
- Listing budget default 16,384 bytes; omitted entries remain user-invocable unless role-filtered. Refresh on session creation/resume/attach and `/reload`; no watcher.

Sources: `apps/coding-agent/docs/context-and-skills.md:35-71`; `apps/coding-agent/docs/roles-and-presets.md:68-81`.

## Instructions and rules

Implemented plain Markdown context, **not** frontmatter-driven rules.

| File / location | Activation / precedence |
|---|---|
| `<config>/AGENTS.md` | First global context file. |
| Each directory from filesystem root through workspace | One selected file per directory. |
| `AGENTS.override.md` | First candidate in each directory. |
| `AGENTS.md` | Second candidate. |
| `CLAUDE.md` | Third candidate; fallback only, not an additional file. |

Selected files are assembled global-first, then outer-to-inner directories, including directories above Git root. Unreadable selected files produce diagnostics without falling back. Duplicate file identities are included once. In nested Git worktrees, worktree copy replaces main-checkout file of the same name. Source: `apps/coding-agent/docs/context-and-skills.md:3-18`.

- Activation: always included after workspace trust; not model-decided or manual.
- Nesting follows **session workspace**, not subsequently touched file paths; no documented per-file rule activation.
- Default context budget 65,536 bytes. Overflow omits whole files: retain global, repository root, then outer directories.
- `GEMINI.md`, `.mdc`, steering-file discovery, glob conditions, Markdown imports/includes: **Not supported by the documented context loader**.
- Role prompt appends after base system prompt/context.
- Extensions can replace guidance rendering or add context/system interventions; these are code APIs, not rule-file frontmatter.

Sources: `apps/coding-agent/docs/context-and-skills.md:5-18,56-71`; `apps/coding-agent/docs/roles-and-presets.md:7-23`; `packages/extension-sdk/src/authoring/definition.ts:24-55`.

## Subagents and custom agents

Native concept: **role**, optionally adjusted by a **preset**.

Files: `<config>/roles/<name>.md` and `<workspace>/.lume/roles/<name>.md`; filename determines name, using lowercase letters/digits/hyphens. Config role overrides repository role. Repository roles require trusted workspace and are discovered only at workspace root. Source: `apps/coding-agent/docs/roles-and-presets.md:7-66`.

| Frontmatter field | Type / values | Meaning |
|---|---|---|
| `description` | required nonblank string | Picker/delegation description. |
| `mode` | `all` / `root` / `subagent`; default `all` | Top-level/child admission. |
| `model` | model-spec string or ordered string list | `<provider>/<model>[:<thinking>]`; list provides fallback chain. |
| `tools` | selector string; default `*` | Tool admission. |
| `skills` | selector string; default `*` | Skill listing and user invocation admission. |
| `mcp` | selector string; default `*` | Server listing/call admission. |
| `color` | `red`, `orange`, `yellow`, `green`, `cyan`, `sky`, `blue`, `purple`, `magenta` | Semantic palette color; `main` default `sky`, others stable name-derived color. |
| `<installed-extension-id>` | JSON value | Extension-owned role configuration; unknown/noninstalled keys invalidate role. |
| `agents.delegates` | comma-separated role names or `*` | Bundled agents extension restricts delegate roles; default `*`. |

Body is system-prompt addition; frontmatter-only roles are allowed. Built-in `main` always exists with description `Default agent`. No native `name`, `permissions`, `maxTurns`, `hooks` or sandbox fields documented. Sources: `apps/coding-agent/docs/roles-and-presets.md:7-44`; `apps/coding-agent/docs/agents.md:169-190`.

Selectors: comma-separated tokens, `!` exclusion, `*` wildcard, **last matching token wins**; unmatched names excluded; empty string selects nothing. `run` always remains with mixed/meta-only exposure, while its callable tools are filtered. Source: `apps/coding-agent/docs/roles-and-presets.md:68-81`.

Presets in `<config>/settings.json`:

| Field | Type / meaning |
|---|---|
| `preset` | Selected preset name; default implicit `default`. |
| `presets` | Object keyed by preset name. |
| `presets.<name>.include` | `all` or `listed`; default `all`. |
| `presets.<name>.root` | Root role name; default `main`; cannot be `subagent`. |
| `presets.<name>.roles` | Object keyed by role name; entries accept role fields plus `from`. |
| `roles.<name>.from` | Existing file-role name, not another preset entry; inherits that file’s body/fields. |

Whole-field precedence: preset entry → role file → defaults; extension-owned JSON is also replaced whole. Prompt comes only from file. Source: `apps/coding-agent/docs/roles-and-presets.md:102-159`.

Invocation: `/role`, `/preset`, launch `--role`/`--preset`, or model `agent` tool supplied by enabled `builtin:agents`.

| `agent` input | Type / meaning |
|---|---|
| `run` | Required array, 1–8 entries. |
| `message` | Optional string containing `{task}`; wraps each task. |
| `cwd` | Optional directory string, absolute or session-relative. |
| `run[].role` | Role string for new child; mutually exclusive with `to`. |
| `run[].task` | Required task/message string. |
| `run[].label` | Optional display name; new children only. |
| `run[].cwd` | Optional directory string, relative to call-level `cwd`; new children only. |
| `run[].to` | Existing child identifier; steer running or continue completed child. |

Children get parent preset/extensions, selected role model—not parent’s model override—and their own workspace guidance. Four running agents per session; excess queue; depth limit 3; no agent-specific timeout. Source: `apps/coding-agent/docs/agents.md:20-55,159-190,230-247`; `apps/coding-agent/docs/extensions.md:178-203`.

## Commands and prompts

**Prompt-file commands: Not supported in inspected docs/source.** Commands remain distinct from skills; skills provide `/skill:<name>`, not arbitrary prompt-file slash commands.

Implemented custom commands are JS/TS extension registrations, canonical `/ext.<extension-id>:<name>`, with explicitly requested short aliases. Source: `apps/coding-agent/docs/extensions.md:89-147`.

Complete registration fields: `packages/extension-sdk/src/authoring/commands.ts:89-128`.

| Field | Type / meaning |
|---|---|
| `name`, `title` | Required strings; command identity/display title. |
| `description`, `category` | Optional strings. |
| `aliases`, `hiddenAliases` | Optional string arrays. |
| `requiredGrants` | Optional capability-name string array. |
| `arguments` | Optional Zod object; positional fields annotated with `positional`; other fields options; validated before execution. |
| `availability` | Optional async/sync function of scope and context returning command availability. |
| `complete` | Optional async/sync completion callback. |
| `run` | Required callback receiving parsed arguments, scope and extension context. |

Scope: optional `workspace`; optional attachment `{attachmentId, workspaceId?, sessionId, materializationId}`. Completion input: `rawText`, `cursor`, `query`, `replace:{start,end}`, `scope`. Sources: `packages/extension-sdk/src/authoring/commands.ts:13-40`.

Outcome enums:

- `completed`: optional `message`, JSON `ui`, `sessionTarget:{sessionId}`.
- `needs_input`: required JSON `ui`, optional 1–4-segment `title`, required continuation callback.
- `cancelled`.

Aliases may be rejected as `reserved` or `conflict`. Source: `packages/extension-sdk/src/authoring/commands.ts:42-78,130-146`.

`$ARGUMENTS`, `$1`, shell `!` interpolation, file interpolation and declarative command model/tool overrides: **Not supported**. Extension code may implement arbitrary behavior; that is not an equivalent declarative field.

## Hooks

Implemented **in-process JS/TS observer hooks**, not shell/HTTP/prompt-handler configuration.

`ctx.hooks.on(name, handler, {order?})`; handler receives typed event and fresh extension context; returns event or `undefined`, synchronously or asynchronously. Returned event feeds later observers but **does not alter running turn**. Ascending `order` default `0`, then extension id; serial delivery; exceptions logged/skipped. Source: `packages/extension-sdk/docs/communication.md:229-249`; `packages/extension-sdk/src/authoring/hooks.ts:5-19`.

Complete event inventory: `packages/agent-core/src/turn/events.ts:19-180`.

| Exact event | Meaning / payload beyond `type` |
|---|---|
| `turn_start` | Turn begins; `model:string`. |
| `steering_injected` | Steering enters model input; `messages:ModelMessage[]`, `inputEntryIds?:string[]`. |
| `context_transformed` | Context transform summary; `stepIndex:number`, `messagesIn:number`, `messagesOut:number`. |
| `step_start` | Attempt begins; `stepIndex:number`, `responseId:string`. |
| `assistant_text_update` | Replaceable text snapshot; assistant snapshot fields below. |
| `assistant_reasoning_update` | Reasoning snapshot; snapshot fields plus `durationMs?:number`. |
| `answer_repair` | Repair attempt; `attempt:number`, `maxRepairs:number`. |
| `tool_input_start` | Input begins; `stepIndex`, tool identity. |
| `tool_input_update` | Input snapshot; `stepIndex`, tool identity, `rawSnapshot:string`, `parsedSnapshot?:unknown`, `bounds:ToolInputSnapshotBounds`, `activity?:ToolActivityFact[]`. |
| `tool_input_end` | Input terminal; `stepIndex`, tool identity, `terminal:ToolInputTerminal`, `input?:unknown`. |
| `tool_start` | Execution starts; `stepIndex`, tool identity, `input:unknown`, `activity?`. |
| `tool_link` | Child-session links; `stepIndex`, tool identity, required `childSessionIds:string[]`. |
| `tool_update` | Output snapshot; `stepIndex`, tool identity, `input:unknown`, `partial:unknown`, `bounds:ToolSnapshotBounds`, `activity?`. |
| `tool_end` | Execution terminal; `stepIndex`, tool identity, `outcome:ToolCallOutcome`, optional model-visible `result`, `activity?`. |
| `step_end` | Attempt ends; `stepIndex:number`, `responseId:string`, `step:Step`. |
| `step_retry` | Discarded transiently failed attempt retries; `stepIndex`, `responseId`, `attempt`, `maxRetries`, `delayMs`, optional `errorMessage:string`, `failureKind:FailureKind`. |
| `model_fallback` | Discarded attempt switches model; `stepIndex`, `responseId`, `from/to:ModelChoice`, `failureKind`, `retries:number`, `errorMessage?`. |
| `turn_end` | Final turn result; `turn:Turn`. |

Shared tool identity: required `toolCallId`, `toolId`, `toolName` strings and `revision:number`; optional `parentToolCallId:string`, `childSessionIds:string[]`, `target:string`. Assistant snapshot: `stepIndex`, `responseId`, `contentIndex`, `revision`, `textSnapshot`, `bounds:AssistantTextSnapshotBounds`. Source: `packages/agent-core/src/turn/events.ts:19-41`.

Ordering: `turn_start` first, `turn_end` last exactly once except pre-turn thrown config errors; nested step boundaries; tool events within steps; retries/fallback/repair between attempts. Source: same file `:44-56`.

- Matchers: event name only; tool filtering must be implemented in callback.
- Command exit-code contract, hook stdin JSON, `allow`/`deny`/`ask`, declarative timeout/env/cwd: **Not supported**.
- Hook timeout: **UNKNOWN** in inspected hook contract.
- Scope: extension activation per session; registrations removed at deactivation.
- Context injection is separate: `interventions.guidance.render`, `interventions.context.{order?,handler}`, `interventions.system.{order?,handler}` receive `guidance?`, `records`, `budget`, `stepIndex`, `signal`. Context handler returns string array; system handler optional string.
- Tool modification is separate `tools.middleware`, granted only to bundled extensions in coding app; selection order, first extension outermost.
- Cleanup `ctx.lifecycle.onDispose` runs reverse registration order after signal abort, has **no timeout**, and logs errors without stopping remaining cleanup.

Sources: `packages/extension-sdk/src/authoring/definition.ts:13-55`; `apps/coding-agent/docs/extensions.md:155-172`; `packages/extension-sdk/docs/lifecycle.md:3-40`.

## MCP servers

Config: `<config>/settings.json`, `mcp:Record<serverId,server>`. **Not `.mcp.json` or `mcpServers`.** Strict schemas; unknown keys rejected.

Canonical schema: `packages/mcp-adapter/src/host/config.ts:15-39,95-174`; behavior: `apps/coding-agent/docs/mcp.md:44-123`.

| Field | Type / transport / meaning |
|---|---|
| `transport` | Required `stdio`, `http`, `sse`; `http` means Streamable HTTP; no automatic SSE fallback. |
| `command` | Required stdio string, 1–4,096 chars. |
| `args` | Optional stdio string array, maximum 128; each 1–4,096 chars. |
| `cwd` | Optional stdio string, 1–4,096 chars. Absolute path recommended. |
| `env` | Optional stdio string map; added to default child environment. |
| `url` | Required remote string, maximum 8,192 chars. |
| `headers` | Optional remote string map, sent on every request. |
| `oauth` | Optional remote object; fields below. |
| `description` | Optional string, 1–200 chars; model-facing annotation. |
| `promotedTools` | Optional string array, maximum 16; each name 1–128 chars; exposes schemas/descriptions, **not allowlisting**. |
| `oauth.clientId` | Required string, maximum 4,096 chars. |
| `oauth.authorizationUrl` | Required endpoint string. |
| `oauth.tokenUrl` | Required endpoint string. |
| `oauth.redirectUrl` | Required endpoint string. |
| `oauth.scope` | Optional string, maximum 4,096 chars. |

Server ids: maximum 128 chars, `^[a-z0-9][a-z0-9._-]*$`; maximum 32 servers. `env`/`headers`: maximum 64 entries, names maximum 256 chars, values 1–4,096 chars; env names reject `=`/NUL; header names HTTP tokens. Endpoints require HTTPS or HTTP on `localhost`, `127.0.0.1`, `[::1]`; no credentials or fragment. Source: `packages/mcp-adapter/src/host/config.ts:48-174`.

Secret syntax applies **only env/header values**:

| Value | Resolution |
|---|---|
| `env://NAME` | Product environment variable. |
| `file:///absolute/path` | File contents, trimmed. |
| Other string | Literal. |

Resolved each connection; never persisted resolved. OAuth authorization overrides configured `Authorization`. Authenticated/header-bearing requests do not follow redirects. `${VAR}`, `${pluginRoot}`, `envFile`: **Not supported**. Source: `apps/coding-agent/docs/mcp.md:90-115`.

OAuth: preregistered public-client authorization-code PKCE; explicit `/mcp authorize <id>` and manual paste of redirect URL; no dynamic registration, secret, device flow, callback listener, or automatic browser launch. Pending flow expires after ten minutes. Tokens stored plaintext under `<state>/credentials`, bound to config identity/server id. Source: `apps/coding-agent/docs/mcp.md:146-179`.

Precedence: defaults `{}` → entire persisted object → entire embedder `launch.mcp`; **no merging**, no project MCP file. `/reload` applies valid changes while idle; invalid config preserves current servers. Source: `apps/coding-agent/docs/mcp.md:86-88,181-187`.

No config fields for connection timeout, enabled/disabled tools, trust, or enable flag. Role `mcp` selects servers, not individual tools. Connection/listing limits 10 seconds each; call input `timeout` integer seconds 1–86,400, default 900. Gateway input `action:"list"|"call"`, optional list `server/query`; call `server`, `tool`, `args` default `{}`, `timeout`. Source: `apps/coding-agent/docs/mcp.md:125-136`; `apps/coding-agent/docs/roles-and-presets.md:68-81`.

Cache `<cache>/mcp-tools/`, identity hash excludes `description/promotedTools`. Only tools used; resources/prompts/sampling/elicitation/list-change notifications **not supported**. Source: `apps/coding-agent/docs/mcp.md:138-144,195-199`.

## Other native capability types

Implemented extension definition inventory: `packages/extension-sdk/src/authoring/definition.ts:57-72`.

| Definition key | Type / meaning |
|---|---|
| `id`, `version` | Required strings, must match manifest identity/version. |
| `capabilities.requires`, `.optional` | Optional string arrays; API grants requested. |
| `settings.schema` | Zod schema for JSON-representable settings. |
| `entryTypes` | Map of durable entry declarations with version and data schema. |
| `tools` | Tool declaration array. |
| `interventions` | Guidance/context/system callbacks described above. |
| `activate` | Required async/sync callback, registers dynamic behavior. |

Tool declarations: required `name:string`, `description:string`, `inputSchema:ZodType`, `effectClass:ToolEffectClass`, `execute` callback; optional `requiredGrants:string[]`, `activity:{kinds,classify}`, `subject(input):Subject|SubjectTree`, `background(input):{service:true}|{deadlineMs:number}|undefined`. Source: `packages/extension-sdk/src/authoring/tools.ts:65-139`. Exact referenced `ToolEffectClass`/activity enum spellings **not expanded in this inspection**.

Other extension-native contributions: commands, tools, reminders, durable entries, namespaced storage, typed/versioned inter-extension services, live namespaced JSON broadcasts, UI surfaces/dialogs/actions/presenters, child sessions, AI decisions/images/search, workspace/fetch/assets APIs. Sources: `apps/coding-agent/docs/extensions.md:149-178,205-251`; `packages/extension-sdk/docs/communication.md:251-327`.

Run-script files: `<config>/run-scripts/<name>.js`, **never discovered from workspace**. Metadata `meta.description`, `meta.usage`, `meta.constants.required`, `meta.constants.properties`; body uses `constants`. Config scripts loaded with session tools and reload; malformed metadata disables only that script. Source: `apps/coding-agent/docs/run.md:71-94`. Complete metadata sub-schema beyond these documented keys: **UNKNOWN**.

Native extension settings: `<config>/extensions/<id>.jsonc`, schema-defined arbitrary JSON keys; defaults until file exists; first UI save creates commented defaults with `// extension-settings-version: 1`. Runtime overrides `<state>/extension-settings/` win over file; opted-in nonempty `LUME_<EXTENSION>_<FIELD>` wins over both. Source: `apps/coding-agent/docs/extensions.md:217-251`.

Settings APIs: `read()→{value,version}`, `update({expectedVersion,value})`, `onChange`; whole-value replacement with optimistic concurrency. Change sources `update`, `runtime_override`, `reload`. Source: `packages/extension-sdk/src/authoring/settings.ts:8-51`.

App configuration can carry models/fallback roles/presets, guidance budgets, keybindings, compaction, logging/output limits and tool exposure; these are **app settings**, not extension-manifest contribution keys. Sources: `apps/coding-agent/docs/configuration.md:138-198`.

Keybinding maps:

- `composerKeys:Record<action,string[]>`
- `paneKeys:Record<pane-command,string[]>`
- `extensionKeys:Record<extensionId,Record<action,string[]>>`

Empty arrays disable; reserved/conflicting keys rejected. Source: `apps/coding-agent/docs/configuration.md:235-313`.

LSP-server manifests, output-style files, theme packages, app/connector manifests, declarative monitors, provider packages and configurable statusline files: **Not supported as documented package types**. Extensions can implement code/UI behavior, but that is not evidence of equivalent native schemas. Theme/provider package contribution APIs: **UNKNOWN**.

## Permissions, trust and security

**No sandbox and no default per-call approval.** File tools/shell/extensions run with user authority; role selectors are focus controls, not containment. Source: `apps/coding-agent/docs/security.md:3-32`.

| Surface | Policy |
|---|---|
| Workspace trust | Required before session/guidance/repository roles; realpath identity; exact directory, not parents/subdirectories. |
| Trust state | `<state>/workspace-trust/`; settings cannot grant trust. |
| TUI trust | Explicit screen; `--trust-workspace` does not bypass TUI screen. |
| Headless trust | `--trust-workspace` records trust without prompt. |
| Extension enable | `/extensions` names exact directory and requests confirmation; discovery imports no code. |
| Extension capabilities | App API access only; cannot restrict imported Node/Bun APIs. |
| MCP | No separate trust list or normal approval prompt. |
| Embedded authorizer | Optional `createApp()` effect authorizer governs calls/extension exec/fetch. |
| Confined file target | Optional embedder safeguard; does not confine shell. |

Sources: `apps/coding-agent/docs/sessions.md:166-178`; `apps/coding-agent/docs/extensions.md:3-33`; `apps/coding-agent/docs/security.md:18-32`; `apps/coding-agent/docs/mcp.md:117-123`.

Coding app grants declared `workspace`, `storage`, `context.transform`, `context.system`, `ui.surfaces`, `ui.dialogs`, `fetch`, `assets.publish`, `executor`, `decisions`, `session.name`, `ai.search`, `ai.image`. `tools.middleware`/`exec` only bundled extensions, based on load origin **not id**. No `executor.detach`. Missing required grants block load; missing optional grants omitted. Source: `apps/coding-agent/docs/extensions.md:155-157`.

Packages cannot declaratively grant workspace trust or install native allow/deny permission policies through manifest; no such fields exist in strict manifest. Executable extension code remains unrestricted. Source: `packages/agent-host/src/node/discovery-manifest.ts:15-41`; `apps/coding-agent/docs/security.md:18-32`.

Signatures/provenance verification, publisher trust, organization/enterprise policy, managed required/blocked extensions: **UNKNOWN; not documented in inspected selection/security contracts**. Manifest/entrypoint symlink refusal is integrity validation, not sandboxing. Sources: `apps/coding-agent/docs/extensions.md:61-82,253-273`.

## Packaging, install and scopes

Native extension layout:

```text
<extension-directory>/
  extension.json
  <entrypoint>
  [package.json / node_modules / other module resources]
```

Module must default-export a valid extension definition; JS/TS imported directly, no TS build required. Runtime imports must resolve from extension directory. Source: `apps/coding-agent/docs/extensions.md:61-147`.

Complete strict `extension.json` schema: `packages/agent-host/src/node/discovery-manifest.ts:15-41`.

| Field | Type / meaning |
|---|---|
| `version` | Required literal number `1`; manifest document version. |
| `id` | Required string 1–128 chars, `^[a-z0-9][a-z0-9-_.]*$`; must equal definition id. |
| `extensionVersion` | Required nonempty string, maximum 64 chars; must equal definition version. **Schema does not require SemVer.** |
| `hostContract` | Required nonempty string; integer contract or inclusive `min-max`; must include current contract `1`. |
| `entrypoint` | Required nonempty string; regular file within directory, no symlink. |
| `displayName` | Optional trimmed string 1–64 chars; presentation only; control/invisible formatting/line-separator characters rejected. |

No manifest author/license/repository/dependencies/skills/agents/commands/MCP/hooks fields. Unknown fields invalidate manifest. Host range syntax: `packages/agent-host/src/node/discovery-manifest.ts:72-84`.

References in `<config>/settings.json` `extensions:string[]`, maximum 64:

- `builtin:fetch`, `builtin:agents`, `builtin:remote-ssh`, `builtin:web-search`
- `./dir`, `../dir`: relative to **config**, not workspace
- `/absolute/dir`

Package/import specifiers rejected. Git URL/ref/SHA, npm specifier, ZIP, marketplace/catalog/dependency resolver: **Not supported by selection system**; manually provision directory/dependencies. Sources: `apps/coding-agent/docs/extensions.md:7-33`; `apps/coding-agent/docs/configuration.md:138-198`.

Discovery: builtins, selected directories, immediate child directories of `<config>/extensions/`. Selection determines execution; copying there alone does not enable. `/extensions` enable adds reference to `settings.json`, disable removes it; changes apply idle. Duplicate ids rejected. `/reload` rereads selection/settings but does not reimport modified modules; restart for code edits. Source: `apps/coding-agent/docs/extensions.md:7-33,137-147,253-273`.

Files/state written:

| Path | Meaning |
|---|---|
| `<config>/settings.json` | Extension source selection/MCP/app settings; first-launch document lists `builtin:agents`, `builtin:fetch` if absent. |
| `<config>/extensions/<id>.jsonc` | Deliberate extension settings, first created on save. |
| `<state>/extension-settings/` | Runtime settings overrides. |
| `<state>/extension-storage/<id>/sessions/<session-id>/` | Session extension storage; branches start empty. |
| `<state>/extension-storage/<id>/workspaces/<workspace-sha256>/` | Workspace-shared extension state. |
| `<state>/extension-storage/<id>/global/` | Global extension-created state. |
| `<state>/settings.lock` | Serializes settings writers, not configuration data. |
| `<cache>/mcp-tools/` | MCP discovery cache, not extension-package cache. |

Sources: `apps/coding-agent/docs/configuration.md:29-57,102-136`; `apps/coding-agent/docs/extensions.md:205-233`.

Scopes:

- Extension selection/settings/MCP: app-wide config only; no project/local/org extension-selection layers.
- Guidance: global plus ancestors/workspace as described.
- Roles: config wins workspace `.lume/roles`; preset overrides whole fields.
- Extension storage: session/workspace/global, distinct from installation scope.

Sources: `apps/coding-agent/docs/extensions.md:178-233`; `apps/coding-agent/docs/roles-and-presets.md:46-66,138-147`; `apps/coding-agent/docs/mcp.md:86-88`.

Linux roots: config `~/.config/lume`, data `~/.local/share/lume`, state `~/.local/state/lume`, cache `~/.cache/lume`; absolute XDG variables override corresponding root, `--config-dir` beats XDG config. `coding:local` uses checkout `.lume/{config,data,state,cache}`; existence of `.lume` **does not select local mode**. Source: `apps/coding-agent/docs/configuration.md:10-70`.

Updates/version pinning/package caches/transitive package imports: **No native mechanism documented**. Host contract and definition identity checks exist; service-version compatibility is an inter-extension runtime API, not installation dependency resolution. Sources: `apps/coding-agent/docs/extensions.md:61-82,137-147`; `packages/extension-sdk/docs/communication.md:251-291`.

## Notable gaps and ambiguities

- **Date mismatch:** HEAD is dated October 8, 2026. Historical October 1 behavior was not reconstructed; treat this as checkout evidence, not an October 1 release inventory.
- No runtime tests executed; all findings are read-only docs/source inspection.
- No documented announced/experimental labels found for the inventoried contracts; they are implemented in checkout. Public shipping/version status **UNKNOWN**.
- Skill parser ignores unsupported metadata: preserving `allowed-tools` in generated YAML does **not** preserve its security meaning.
- Native extension manifest cannot bundle declarative skills/roles/MCP/rules via contribution fields; ACF installation would need explicit separate placements/settings edits.
- Hook events are observers, not Claude-like approval/decision hooks; direct semantic mapping of deny/ask/modify is invalid.
- Extension capabilities are host-API gates, not executable-code confinement.
- Global skill/role precedence protects user choices but can silently change a repository package’s effective behavior through name shadowing.
- Declarative project MCP and project extension selection are absent; `.lume/roles`/`.lume/skills` must not be confused with development `.lume/config`.
- Exact referenced event payload internals (`Step`, `Turn`, bounds, outcome/failure/model-choice types), tool-effect/activity enums, full run-script metadata schema, and every dynamic UI/service/reminder API field were not expanded. Their cited canonical types are the next inspection points if ACF plans to serialize executable SDK contributions.
- Lossless same-format round trips require retaining arbitrary ignored skill metadata, extension-owned role JSON, module/source resources and JSONC comments; the parsed runtime model alone cannot preserve all source bytes.
