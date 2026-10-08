# Amp (Sourcegraph) - capability inventory (snapshot 2026-10-01)

## Skills

**Evidence/date:** Live, unversioned official documentation retrieved **2026-10-01**. Features below are documented as shipped unless marked otherwise. No CLI release number or documentation revision is supplied. [Skills](https://ampcode.com/docs/customize/skills), [Plugin API](https://ampcode.com/docs/plugin-api).

**Layout:** `<skill-directory>/SKILL.md`, YAML frontmatter followed by Markdown instructions; optional scripts, templates, references and other resources alongside it. Relative resource paths resolve against the skill directory; official examples use `{baseDir}/reference/checklist.md`. Hosted repositories require immediate-child skill directories whose names match frontmatter `name`; local discovery recurses five directories below each root. [Skills](https://ampcode.com/docs/customize/skills), [bundled skill example](https://ampcode.com/docs/plugin-api#example-plugin-bundled-skill).

| Frontmatter key | Type | Meaning |
|---|---|---|
| `name` | string | Discovery identity; first matching name wins. Must match directory name for hosted and plugin-bundled skills. |
| `description` | string | Model-visible explanation used to select the skill. |
| `mcpServers` | map of server names to configurations | Skill-contributed MCP servers; overrides sibling `mcp.json` completely. |
| `builtin-tools` | string[] | For plugin-bundled skills: names of tools registered by the same plugin that become model-visible/callable only after loading the skill. Not an allowlist or execution permission. |

Sources for all rows: [Skills](https://ampcode.com/docs/customize/skills), [Plugin API bundled skills](https://ampcode.com/docs/plugin-api#example-plugin-bundled-skill).

`allowed-tools`, `license`, `compatibility`, arbitrary `metadata`, `disable-model-invocation`, `user-invocable`, argument metadata and unknown-frontmatter retention: **UNKNOWN**; no Amp field contract for these appears in the reviewed skill documentation. A complete standalone `SKILL.md` schema is not published there. [Skills](https://ampcode.com/docs/customize/skills).

**Discovery precedence, highest first:**

1. `~/.config/agents/skills/`
2. `~/.agents/skills/`
3. `~/.config/amp/skills/`
4. `.agents/skills/` in project and searched parents
5. `.claude/skills/` in those directories
6. `~/.claude/skills/`
7. `~/.claude/plugins/cache/`
8. Directories configured in `amp.skills.path`, in configured order
9. Personal hosted skills repository
10. Active workspace hosted skills repository
11. Official Amp skills

This is first-wins by frontmatter name, notably **machine-global skills precede project skills**. Parent-directory tie ordering and the exact Claude plugin cache traversal are **UNKNOWN**. [Skills](https://ampcode.com/docs/customize/skills).

| Setting | Type | Meaning |
|---|---|---|
| `amp.skills.path` | string | Additional roots; colon-separated, or semicolon-separated on Windows; `~` supported; relative paths resolve against workspace root. |
| `amp.skills.disableClaudeCodeSkills` | boolean, default `false` | Skip all three Claude-compatible locations. |
| `amp.skills.disableGlobalAgentsSkills` | boolean, default `false` | Skip the first two global agent-agnostic locations. |

[Configuration](https://ampcode.com/docs/cli/settings).

**Invocation:** Model sees every discovered skill’s name/description; full instructions load on invocation. User-invokable skills were explicitly removed in the **2026-05-06** rebuild announcement; current skill documentation describes model invocation, not a slash invocation contract. The earlier **2026-01-29** command migration announcement described user invocation, so it must not be treated as current. [Skills](https://ampcode.com/docs/customize/skills), [Amp, Rebuilt](https://ampcode.com/news/neo), [Slashing Custom Commands](https://ampcode.com/news/slashing-custom-commands).

**Plugin bundles:** Directory plugins must explicitly call `await amp.registerSkill({path: string})`; path is relative to plugin root and must name a directory containing `SKILL.md`. No automatic `skills/` scan. Identity becomes `plugin-name:skill-name`; disabling/reloading the plugin removes its bundled skills. Single-file plugins cannot register skills. [Plugins](https://ampcode.com/docs/customize/plugins), [Plugin API](https://ampcode.com/docs/plugin-api).

**Extra metadata:** Sibling `mcp.json` is a **bare map of server names**, not an outer `mcpServers` object. Frontmatter `mcpServers` wins if both exist. Servers connect at discovery; their tools remain hidden until the skill loads unless overridden by ordinary configuration/CLI. [Skills](https://ampcode.com/docs/customize/skills).

## Instructions and rules

| File/source | Activation and scope |
|---|---|
| `AGENTS.md` in cwd/editor workspace roots and parents up to `$HOME` | Always included. |
| Subtree `AGENTS.md` | Included when the agent reads a file in that subtree. |
| `$HOME/.config/amp/AGENTS.md` and `$HOME/.config/AGENTS.md` | Both always included if present. |
| `/etc/ampcode/AGENTS.md` | System/organization guidance on Linux. |
| `/Library/Application Support/ampcode/AGENTS.md` | System/organization guidance on macOS. |
| `%ProgramData%\ampcode\AGENTS.md` | System/organization guidance on Windows. |
| `AGENT.md` or `CLAUDE.md` | Directory-local fallback only when `AGENTS.md` is absent; tie between the two fallback names is **UNKNOWN**. |
| Personal Settings → Advanced → Global AGENTS.md | Personal web-configured guidance for top-level agents. |
| Workspace Settings → Advanced → Global AGENTS.md | Workspace guidance included before personal/repository guidance; explicitly excluded from subagents, Puck and raw custom agents. |

[AGENTS.md](https://ampcode.com/docs/customize/agents-md).

**Includes:** `@relative/path`, `@/absolute/path`, `@~/path`, and glob mentions; relative to the containing guidance file. Mentions inside code blocks are ignored. Recursion limits, cycles and missing-include handling: **UNKNOWN**. [AGENTS.md](https://ampcode.com/docs/customize/agents-md).

**File-scoped included guidance:** Mentioned Markdown files can have YAML frontmatter `globs: string[]`. Inclusion begins after Amp reads a file matching any glob. Without `globs`, mentioned files are always included. Patterns implicitly gain `**/` unless starting `./` or `../`, which resolve relative to the mentioned file. This is read-triggered inclusion, not a documented `.mdc` rule engine. [AGENTS.md](https://ampcode.com/docs/customize/agents-md).

**Opt-out:** `AMP_IGNORE_GUIDANCE_FILES` is a colon-delimited list of absolute-path globs; `/` separators, hidden paths included, `**` spans directories. `'*'` disables automatic guidance loading, not explicit tool reads. [AGENTS.md](https://ampcode.com/docs/customize/agents-md).

`GEMINI.md`, `.mdc`, steering-file formats, model-decided/manual rule metadata and a comprehensive conflict-resolution hierarchy: **UNKNOWN**, not documented in the reviewed guidance reference. [AGENTS.md](https://ampcode.com/docs/customize/agents-md).

## Subagents and custom agents

**Shipped:** Built-in Search, Oracle, Librarian, Task and Read Thread specialists have separate contexts; normally receive the parent’s supplied instructions/context rather than its full conversation. Ordinary specialists cannot communicate with one another or receive user guidance mid-task; parent receives final summary. Models are dynamically routed. [Modes & Models](https://ampcode.com/docs/models-and-subagents).

**Plugin custom agents:** JS/TS definitions through `amp.createAgent`, optionally exposed through a registered tool or `amp.registerAgentMode`. No Markdown agent-frontmatter format is documented for this mechanism. Top-level agent APIs are shipped; corresponding `amp.experimental` aliases are explicitly unstable. [Plugin API](https://ampcode.com/docs/plugin-api).

Every documented `CreateAgentConfig` field:

| Key | Type | Meaning |
|---|---|---|
| `name` | string? | Prompt identity, logs/UI/persisted metadata; ignored with `extends`. |
| `extends` | built-in mode? | Inherit built-in prompt/tools and default model/effort. |
| `model` | `provider/model` string? | Required unless extending a mode. |
| `instructions` | string? | Appended instructions; required unless extending a mode. |
| `tools` | string[] \| `'all'` \| selection object? | Tool selection, described below. |
| `reasoningEffort` | effort enum? | Model effort override. |
| `oracle` | `{model?: string, effort?: effort}`? | Oracle role pin; unavailable model falls back to routing. |
| `subagents` | same pin object? | Pins other specialist roles collectively; same fallback. |
| `compactionThresholdTokens` | positive safe integer? | Automatic compaction threshold; omitted uses configured percentage, default 90%. |
| `features` | readonly string[]? | Required feature baseline; omitted can inherit parent; empty array clears inheritance. Known values include `fast`, `plaid`, `pro`; type permits other strings. |
| `display` | `{label: string, color?: string}`? | Traveling display metadata; label ≤24 characters, color hex RGB. |

Effort enum: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Built-in mode enum: `low`, `medium`, `high`, `ultra`, plus deprecated `smart`, `deep`, `rush`; new `smart`/`deep` threads map to `medium`, `rush` to `low`. [Plugin API](https://ampcode.com/docs/plugin-api).

**Tool selection object:** `include?: string[]|'all'`, `add?: string[]`, `exclude?: string[]`. Explicit arrays replace defaults, including delegation tools; `add` augments defaults; exclusion wins. Patterns match tool names. `mcp__*` and `plugin__*` cover external tools. Loading a skill cannot grant tools omitted from an explicit list. Agents receive `tool_search` and `code_exec` unless excluded; excluding both exposes selected MCP tools directly instead. [Plugin API](https://ampcode.com/docs/plugin-api).

**Mode registration:** `key: string`, `label?: string`, `description?: string`, `color?: hex RGB string`, `agent: AgentDefinition`; label/color can default from agent display. Keys and labels must be unique, nonempty, ≤24 characters, and not conflict with built-in modes; keys are case-insensitive. External plugins need matching static `// @amp-agent-mode {"key":"…","label":"…"}` comments. Missing/mismatched directives produce warnings rather than removing the mode. [Plugin API](https://ampcode.com/docs/plugin-api).

**Inheritance pitfall:** `extends` snapshots Amp’s default model/effort when the plugin loads; user/workspace Tune Modes pins do not determine the custom agent’s main model. [Plugins](https://ampcode.com/docs/customize/plugins#define-a-custom-agent-mode).

**Delegation calls:**

| API/options | Fields and semantics |
|---|---|
| `agent.run(message, options)` | `timeoutMs?: number` milliseconds, default 10 minutes; timeout rejects but child finishes independently. `parentThreadID?: string`; `visibility?: 'private'|'workspace'`; `multiplayerTTLSeconds?: number|null`; `executor?: 'local'|'orb'|{type:'runner',id:string}`. |
| `agent.createThread(options)` | Same parent/visibility/multiplayer/executor fields; additionally `show?: boolean`, `features?: string[]`; returns independently running thread handle. |
| Run result | `threadID: T-${string}`, `text: string`. |

Child visibility and multiplayer inherit when omitted; explicit `null` disables multiplayer. Multiplayer duration 5 minutes–7 days, requires workspace plus Orb/shared runner. Tool cancellation cancels a run invoked within that tool; timeout alone does not. `Task` does not accept a per-call mode; persistent selected-mode children use `create_thread` and coordination tools. [Plugin API](https://ampcode.com/docs/plugin-api).

**Additional declarative agent format present in the generated API:** Agent directory contains required `agent.ts` exporting `defineAgent({...})`, instructions in `instructions.md`, custom tools in `tools/<name>.ts`. Configuration is statically parsed literal data, not arbitrary computed JS. Discovery roots, installation, scope and release status of this directory format are **UNKNOWN** in the reviewed guides; it is documented in the live type reference, not marked experimental there. [Plugin API](https://ampcode.com/docs/plugin-api).

Every documented declarative `AgentConfig` field:

| Key | Type | Meaning |
|---|---|---|
| `label` | string? | ≤24 characters; defaults to directory name. |
| `description` | string? | ≤500 characters; agent listing description. |
| `color` | hex RGB string? | Label color. |
| `extends` | `low|medium|high|ultra`? | Built-in base prompt/tools/model. |
| `model` | provider/model string? | Defaults to default/extended model. |
| `serverOnly` | boolean? | Runs entirely on thread actor without executor. |
| `draft` | boolean? | Hidden from pickers, still startable by key. |
| `tools` | selection union above? | Tool selection; reference describes suffix wildcards. |
| `reasoningEffort` | effort enum? | Effort override. |
| `oracle`, `subagents` | role pin objects? | Model/effort role overrides. |
| `features` | readonly string[]? | Required thread feature baseline. |
| `mcpServers` | readonly string[]? | Remote server IDs mentioned in rendered instructions; **not access restriction**. |

All fields optional; `defineAgent({})` is valid. `AgentToolConfig` fields: `description?: string`, `execution?: 'server'|'executor'`, required object `inputSchema`, required `execute` function. Name comes from filename. Description/execution/schema must be literal; execute is actual code. Server tools use detached sandbox without checkout; executor tools run at checkout. `serverOnly` defaults tools to server and rejects executor placement. [Plugin API](https://ampcode.com/docs/plugin-api).

## Commands and prompts

**Markdown/executable custom commands: Not supported currently.** Removed **2026-01-29**, replaced by skills. Historical paths: `.agents/commands/`, `~/.config/amp/commands/`; migrations target `.agents/skills/<name>/SKILL.md` and `~/.config/agents/skills/<name>/SKILL.md`, moving executables into `scripts/`. [Slashing Custom Commands](https://ampcode.com/news/slashing-custom-commands).

**Shipped replacement command capability:** Plugins register command-palette actions:

`amp.registerCommand(id: string, options, handler(ctx))`

| Option | Type | Meaning |
|---|---|---|
| `title` | string | Palette text after colon. |
| `category` | string? | Text before colon; defaults to plugin name. |
| `description` | string? | Description. |
| `availability` | discriminated object? | `{type:'enabled'}` default; `{type:'disabled',reason:string}` visible but unavailable; `{type:'hidden'}` absent. |

Returned subscription supports `setAvailability(...)` and unregistering. Handler context has `ui`, `ai`, `system`, shell runner `$`, optional active `thread`. [Plugin API](https://ampcode.com/docs/plugin-api).

No current prompt-file frontmatter, `$ARGUMENTS`, positional placeholders, shell/file interpolation or declarative per-command model/tools contract is documented. Plugin code can run shell commands, create agents and append user messages, but that is programmatic behavior, not equivalent prompt-file syntax. [Plugin API](https://ampcode.com/docs/plugin-api).

Manual `$`/`$$` shell invocation in the prompt editor was removed in the **2026-05-06** rebuild. [Amp, Rebuilt](https://ampcode.com/news/neo).

## Hooks

**Shipped hook system:** JS/TS plugin callbacks `amp.on(event, handler)`. No declarative hook JSON, matcher schema, command/http/prompt handler enum or subprocess exit-code decision protocol is documented. Matching is code inside handlers. [Plugins](https://ampcode.com/docs/customize/plugins), [Plugin API](https://ampcode.com/docs/plugin-api).

All documented lifecycle events and payload/return fields:

| Event | Meaning and payload | Return contract |
|---|---|---|
| `session.start` | New thread session, first message or opening/switching existing thread. `thread:{id:string}`. | void/Promise<void>. |
| `tool.call` | Before execution. `thread`, `toolUseID:string`, `tool:string`, `input:object`. | Decision union below. |
| `tool.result` | Terminal result, before delivery to model. Same tool identity/input/thread; `status:'done'|'error'|'cancelled'`, `error?:string`, `output?:unknown`. | void retains original; replacement `{status:'done',output?}` or `{status:'error'|'cancelled',error?,output?}`. |
| `agent.start` | User turn begins. `thread`, `message:string`, `id:string`, `changesWorkflow?:'ship'|'push_branch'`. | `{message?:{content:string,display?:boolean}}`; appended to user content, hidden by default. |
| `agent.end` | Turn completes. `thread`, initial `message`, initial `id`, `status:'done'|'error'|'cancelled'`, `messages:ThreadMessage[]`. | void or `{action:'continue',userMessage:string,maxContinuations?:number}`. Default continuation limit 5; user message resets count. |
| `changes.prompt` | Preparing Ship/Push to Branch prompt before user sees it. `thread`, `workflow:'ship'|'push_branch'`. | void or `{append?:string}`; additions shown for editing before submission. |

[Plugin API](https://ampcode.com/docs/plugin-api).

`tool.call` exact decisions:

- `{action:'allow'}` — original input executes.
- `{action:'reject-and-continue',message:string}` — block call, agent can continue.
- `{action:'modify',input:object}` — replace input.
- `{action:'synthesize',result:{output:string,exitCode?:number}}` — substitute result, do not execute.
- `{action:'error',message:string}` — stop worker, ephemeral error.

No `ask` action: implement approval with UI, then return a decision. `exitCode` above belongs to synthesized tool output, not hook-process control. [Plugin API](https://ampcode.com/docs/plugin-api).

**Context:** All event handlers are thread-scoped; context provides `thread`, `logger`, shell `$`, `ui`, `ai`, `system`, optional tracing `span`. Plugins are long-lived and can serve multiple concurrent threads; module-global state is not automatically thread-local. No `session.end`. Inter-plugin handler execution order is unspecified, except `changes.prompt` additions explicitly follow plugin load order. Ordinary lifecycle timeout, conflicting-decision reduction and failure policy are **UNKNOWN**. [Plugin API](https://ampcode.com/docs/plugin-api), [Plugins](https://ampcode.com/docs/customize/plugins).

**Disposal:** `amp.onDispose(callback)` on unload/reload/graceful shutdown; callbacks concurrent, unspecified order, approximately **3 seconds total per plugin**. Errors logged/ignored; not called on crash/SIGKILL. [Plugin API](https://ampcode.com/docs/plugin-api).

**Separate durable webhook API, not a lifecycle HTTP-hook handler:** `createWebhook({key:string,headers?:string[],handler})`; key 1–128 characters, no surrounding whitespace. Orb-managed registration returns credential-like `url`. Event fields: `id`, exact `body:Uint8Array`, lowercase requested `headers`, `receivedAt` ISO timestamp; deprecated `payload`/`metadata`. Context adds `signal:AbortSignal`. Deadline 30 seconds; at-least-once delivery, retries start at 5 seconds with exponential backoff capped 5 minutes; dropped after 1 hour of handler failures. Registration shared by same owner/project/plugin/key, otherwise thread-specific; archived owner pauses delivery. Rate limit burst 10, refill 10/minute; HTTP 429/`Retry-After`. [Plugin API](https://ampcode.com/docs/plugin-api).

## MCP servers

**Local configuration files:** User `~/.config/amp/settings.json` or `.jsonc`; Windows `%USERPROFILE%\.config\amp\settings.json[ c ]`; nearest project `.amp/settings.json` or `.jsonc`; custom user file via `--settings-file`. Key `amp.mcpServers` is server-name → configuration. Skill sibling `mcp.json` contains the bare map; frontmatter `mcpServers` contains the same concept. [Configuration](https://ampcode.com/docs/cli/settings), [Skills](https://ampcode.com/docs/customize/skills).

**Published schema fields:** [Draft-07 CLI settings schema](https://ampcode.com/cli-settings.schema.json), retrieved 2026-10-01.

| Server/key | Type | Meaning |
|---|---|---|
| stdio `command` | string, required | Executable. |
| stdio `args` | string[]? | Arguments. |
| stdio `env` | map<string,string>? | Environment variables. |
| HTTP `url` | string, required | Endpoint. |
| HTTP `headers` | map<string,string>? | Request headers. |
| HTTP `transport` | `'http'|'sse'|'http-first'`? | Transport selection; omitted default/fallback details **UNKNOWN** in reviewed narrative. |
| HTTP `oauth` | object? | Explicit OAuth configuration. |
| `oauth.clientId` | string, required | OAuth client ID. |
| `oauth.clientSecret` | string? | OAuth secret. |
| `oauth.authUrl` | string, required | Authorization endpoint. |
| `oauth.tokenUrl` | string, required | Token endpoint. |
| `oauth.scopes` | string[]? | Requested scopes. |
| `oauth.redirectUrl` | string? | Redirect URL. |
| Skill `includeTools` | string[]? | Names/globs selecting exposed tools; recommended. **Absent from published settings schema.** |

Schema has `additionalProperties:false` on stdio, HTTP and OAuth objects. `cwd`, `envFile`, connection/request timeouts, `enabled`, disabled-tool lists and plugin-root variables: **not defined by this schema**; behavior outside it is **UNKNOWN**. `includeTools` discrepancy prevents assuming complete interchangeability between skill and settings schemas. [Schema](https://ampcode.com/cli-settings.schema.json), [Skills](https://ampcode.com/docs/customize/skills).

**Expansion:** `${VAR_NAME}` in configuration; explicit examples in URL/headers. `${amp:id-token}` works only in HTTPS headers, without OAuth, inside Orbs; forbidden in URL/command/args/env. Audience is endpoint HTTPS origin; redirects rejected; token refreshed before expiry. No documented `${PLUGIN_ROOT}` equivalent. [MCP](https://ampcode.com/docs/customize/mcp).

**Same-name local precedence:** `--mcp-config` → project `amp.mcpServers` → user `amp.mcpServers` → skills. Direct configuration overrides skill-hidden tools, leaving them visible. Project MCP requires approval (`amp mcp approve <name>`); user settings/CLI configuration do not. Approval-state storage file and skill-server approval behavior: **UNKNOWN**. [MCP](https://ampcode.com/docs/customize/mcp).

**OAuth:** Automatic provider registration/browser flow where available; local manual registration uses redirect `http://localhost:8976/oauth/callback` and `amp mcp oauth login` flags `--server-url`, `--client-id`, `--client-secret`, `--scopes`. Tokens in secret storage, automatically refreshed; exact storage location **UNKNOWN**. Orb browser OAuth unavailable; use headers/secrets, ID token or hosted remote definitions. [MCP](https://ampcode.com/docs/customize/mcp).

**Hosted remote definitions:** Stored on ampcode.com, scoped personal/workspace/project; not files in a plugin. Authentication selectors: `none`, `bearer`, `oauth`, `workload-identity`. Workload identity is **access-gated by Amp staff**, not documented as experimental. CLI requires one scope selector: `--personal`, `--workspace`, `--project`, `--current-project`. Commands `add`, `update`, `remove`, `check`, `list`, `tools`, `login`, `logout`; secret-file flags accept `-` for stdin, not direct secret arguments. Complete hosted-definition JSON schema: **UNKNOWN**. [MCP](https://ampcode.com/docs/customize/mcp).

Hosted server properties exposed in docs include name, UUID, editable module ID, URL, authentication type, OAuth client credentials and disabled state. IDs are unique within each scope; project overrides workspace overrides personal by ID. Disabled/no-cached-tool servers normally do not mask lower scopes; workload-identity servers mask before discovery, preventing fallback after connection failure. Rename does not change ID. Running catalogs refresh asynchronously; in-flight `code_exec` retains selected UUIDs. [MCP](https://ampcode.com/docs/customize/mcp).

## Other native capability types

**JS/TS code modules — shipped:** Single `.ts`/`.js` file or directory `index.ts`/`index.js`; executed with Bun. Relative imports supported. Default export initializes plugin; optional named `description` export must be static string literal ≤300 characters. [Plugins](https://ampcode.com/docs/customize/plugins), [Plugin API](https://ampcode.com/docs/plugin-api).

**Custom tools:** Every `PluginToolDefinition` field:

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Must match `^[a-zA-Z0-9_-]+$`. |
| `title` | string? | UI title, not sent to model. |
| `transcriptGroup` | `{active:string,complete:string}`? | Groups adjacent matching calls in transcript; UI-only. |
| `description` | string | Model-facing description. |
| `inputSchema` | object JSON Schema | Required `type:'object'`; optional `properties`, `required:string[]`; other schema keys permitted. |
| `execute` | function | Receives input/context; returns text, content blocks or nothing; throws for tool error. |

Result blocks: `{type:'text',text:string}`, or `{type:'image',mimeType:string,data:string}` base64, or `{type:'image',mimeType:string,url:string}` HTTPS; image `data` and `url` mutually exclusive. Empty output displayed as `(no tool output)`. [Plugin API](https://ampcode.com/docs/plugin-api).

**Link patterns — shipped:** `registerLinkPattern({id,pattern,href})`; ID letters/digits/hyphens ≤64; regex source ≤200, Unicode flag, token boundaries, no backreferences/lookbehind/empty match. `href` supports URL-encoded `{{match}}` and named `{{group}}`; HTTP(S) or absolute Amp path. Applies to user/assistant prose and persists for later thread viewers. [Plugin API](https://ampcode.com/docs/plugin-api).

**Status items — experimental:** `amp.experimental.createStatusItem({text:string,url?:string})`; update via `.update`; `command:` URLs invoke commands; no initial value means hidden. No declarative statusline file format. [Plugin API](https://ampcode.com/docs/plugin-api).

**Keybindings — shipped settings, not plugin manifest:** `amp.keymap` maps command IDs to string, string[] or `null`; space-separated chords; `null` unbinds. `"leader"` changes leader. Unlike general settings, user keymap entries override project entries. Enumerate current command IDs with `amp config keymap`. [Keybindings](https://ampcode.com/docs/cli/keybindings), [Schema](https://ampcode.com/cli-settings.schema.json).

**Historical toolboxes:** Official **2025-08-29** announcement shipped executables discovered through `AMP_TOOLBOX`. Startup runs each with `TOOLBOX_ACTION=describe`; JSON stdout includes example `name:string`, `description:string`, `args:{argument:[type,description]}`. Invocation runs executable with `TOOLBOX_ACTION=execute`, JSON arguments on stdin. Full argument enums/output protocol/timeouts and continued support in current rebuilt Amp: **UNKNOWN**; absent from reviewed current Tools/Plugin documentation. [Bring Your Own Tools](https://ampcode.com/news/toolboxes), [Tools](https://ampcode.com/docs/tools).

**Themes: Not supported** as custom capability; explicitly removed in rebuild. [Amp, Rebuilt](https://ampcode.com/news/neo).

LSP-server packages, output-style files, apps/connectors, declarative monitors, plugin-specific `userConfig` schema and provider-registration packages: **UNKNOWN**, no native package contracts in reviewed documentation. Custom model selection exists in agent configuration; it is not evidence of arbitrary provider registration. [Plugins](https://ampcode.com/docs/customize/plugins), [Plugin API](https://ampcode.com/docs/plugin-api).

## Permissions, trust and security

**Current default:** No approval before tool execution. Official recommendation for untrusted inputs: policy plugin or isolated development environment. Plugin code executes in the user’s environment; trust warnings are explicit, but mandatory plugin installation/workspace trust prompts are **UNKNOWN**. [Tools](https://ampcode.com/docs/tools), [Plugins](https://ampcode.com/docs/customize/plugins).

**Packages can implement policy:** `tool.call` handlers reject/modify/synthesize/error or show approval dialogs. Workspace admins can distribute a policy as a global workspace plugin. This is executable policy, not declarative allow/deny manifest metadata; same-name project/system plugins have higher precedence than hosted workspace plugins, and enforcement resistance is not established by the docs. [Tools](https://ampcode.com/docs/tools), [Plugins](https://ampcode.com/docs/customize/plugins).

**UI approval controls:** `requireHuman?:boolean`, `skipIfUnwatched?:boolean`; confirmations have `title`, optional `message`, `confirmButtonText`; secret input always human/owner-only. While multiplayer is active, human contributors can answer nonsecret approvals. `requireHuman` is the documented field for permission dialogs. [Plugin API](https://ampcode.com/docs/plugin-api).

**Legacy permissions compatibility:** Rebuild announcement says existing `amp.permissions`, `amp.dangerouslyAllowAll:false`, or `amp.guardedFiles.allowlist` activate a built-in legacy permissions plugin in interactive and execute runs. Full current schema and semantics for those legacy keys: **UNKNOWN**; not in current public settings schema. [Amp, Rebuilt](https://ampcode.com/news/neo), [Schema](https://ampcode.com/cli-settings.schema.json).

**Current declarative settings:**

- `amp.tools.disable: string[]`, default `[]`; `*` glob matching; `builtin:<name>` disables only built-in implementation.
- `amp.mcpPermissions: rule[]`, default `[]`; required `matches`, required `action:'allow'|'reject'`; first match wins, unmatched allowed. Examples match remote `url` or local `command`/`args`.
- Schema’s `matches` is recursive string/array/object/boolean/number/null; complete matching semantics beyond examples **UNKNOWN**.

[Configuration](https://ampcode.com/docs/cli/settings), [Schema](https://ampcode.com/cli-settings.schema.json).

**Enterprise MCP registry:** Admin-set v0.1 registry URL; only approved servers available; unreachable registry blocks all. Local stdio package approval matches registry/package identity, **not version**. Supported npm/Python runners documented; direct URLs/VCS/archive/local paths, alternate registries, aliases and package-adding runner options are blocked. Can scope enforcement to specific users. No published plugin allowlist/required-package enterprise schema found in reviewed references. [MCP Registry Allowlist](https://ampcode.com/docs/enterprise/mcp-registry-allowlist).

**Provenance:** Hosted plugin/skill repositories are Git-versioned; owners may require signed commits. Signature verification during local plugin loading, immutable artifact hashes, package attestations and plugin sandbox guarantees: **UNKNOWN**. [Global Plugins & Skills](https://ampcode.com/docs/customize/global-plugins-and-skills).

## Packaging, install and scopes

**Amp-native package is code, not a plugin manifest.** Reviewed official format documents no `plugin.json`, Agent Plugins manifest, Claude manifest, marketplace manifest or manifest dependency/version fields. Entry contract is default exported initializer plus optional static `description`; package contents and registration code carry capabilities. Support for importing those other manifest formats: **UNKNOWN**. [Plugins](https://ampcode.com/docs/customize/plugins), [Plugin API](https://ampcode.com/docs/plugin-api).

| Scope | Exact location/mechanics | Precedence |
|---|---|---|
| Project plugin | `.amp/plugins/<name>.ts|.js` or `<name>/index.ts|index.js` | Highest. |
| System plugin | `$XDG_CONFIG_HOME/amp/plugins/` when set; otherwise `~/.config/amp/plugins/`; Windows `%USERPROFILE%\.config\amp\plugins\` | Second. |
| Personal hosted plugin | Personal Git repository, applied everywhere user uses Amp | Third. |
| Workspace hosted plugin | Admin-managed Git repository, applied to workspace members | Fourth. |

Same-name shadowing; `index.ts` wins over `index.js`. Hosted repository cache/checkouts and local enable-state files are **UNKNOWN**. [Plugins](https://ampcode.com/docs/customize/plugins).

**Installation:**

- `amp plugins add <URL>` installs single-file machine-local plugin; `--target workspace` means **current project `.amp/plugins/`**, not hosted workspace repository.
- Official collection also advertises `amp plugins add --auto-update @amp/grok-46-mode`; identifier source grammar, auto-update cadence/state and pinning rules **UNKNOWN**.
- Shared hosted plugin/skill URL import copies item and records provenance for later update; exact provenance filename/schema **UNKNOWN**.
- Hosted edits publish by Git push; Amp prepares/reviews/commits and asks before pushing. Settings skill editor saves publish immediately.
- `amp plugins repositories`, `amp skills repositories`; `amp clone user-plugins|workspace-plugins|user-skills|workspace-skills`.
- Imported hosted updates via `amp plugins update`, `amp skill update`; user changes are not overwritten without asking.
- Existing threads do not automatically reload plugins after push; new threads load published versions. Explicit `plugins: reload`/`plugins: list`, `amp plugins list`.
- Skills reload through `reload_skills`; another shell’s `amp skills list` does not reload an active session.

[Plugins](https://ampcode.com/docs/customize/plugins), [Global Plugins & Skills](https://ampcode.com/docs/customize/global-plugins-and-skills), [Skills](https://ampcode.com/docs/customize/skills).

**Skill sources:** `amp skill add <source>` supports GitHub repository, Git URL or local path; `--global` installs to `~/.config/agents/skills/`. Ref/SHA selection syntax, npm/ZIP source handling, dependency resolution, lockfiles and transitive imports: **UNKNOWN**. [Skills](https://ampcode.com/docs/customize/skills).

**Settings scope:** User settings overridden by nearest project `.amp/settings.json[ c ]`, searched upward to Git root; outside Git, current directory. `--settings-file` replaces user-file location. Keymap reverses ordinary precedence. Exact activation settings keys such as `enabledPlugins`, install transaction files and JSON/JSONC coexistence precedence: **UNKNOWN**. [Configuration](https://ampcode.com/docs/cli/settings), [Keybindings](https://ampcode.com/docs/cli/keybindings).

**Hosted skill limits:** Each personal/workspace repository: 200 skills, 200 files/skill including `SKILL.md`, 10 MiB/file, 25 MiB/skill, 25 MiB/repository; text files only. If Git push exceeds 200, first 200 directories alphabetically are considered, then remaining limits checked; API imports/writes reject over-limit additions. Local/project skills exempt. This matters for binary assets and lossless package emission. [Skills](https://ampcode.com/docs/customize/skills).

Public marketplace/catalog schema, semantic versions, manifest dependencies, installation scopes called `local`/`org`, immutable Git pins, uninstall disk contract and cache paths: **UNKNOWN**. Hosted workspace sharing and the official Modes collection exist, but are not evidence of Claude/Agent Plugins marketplace compatibility. [Global Plugins & Skills](https://ampcode.com/docs/customize/global-plugins-and-skills).

## Notable gaps and ambiguities

- **Do not model Amp as Claude-style plugins.** Native format is executable Bun JS/TS with runtime registration, qualified bundled skills, programmatic hooks and agents. Lossless preservation requires retaining code/support files, not only extracting portable metadata. [Plugins](https://ampcode.com/docs/customize/plugins).
- **Schema inconsistency:** Skill `includeTools` is documented, while settings MCP objects reject additional properties and omit it. Transport/OAuth fields exist in schema but receive little narrative treatment. [Skills](https://ampcode.com/docs/customize/skills), [Schema](https://ampcode.com/cli-settings.schema.json).
- **Historical documentation drift:** May 2026 announcement removed skill-management subcommands; October live docs again document `add/import/update`. Current docs govern those commands. User-invokable skills were removed and have no current documented replacement syntax. [Amp, Rebuilt](https://ampcode.com/news/neo), [Skills](https://ampcode.com/docs/customize/skills).
- **Declarative agents are present in live type reference**, but agent-directory discovery/install/scope contracts are missing from reviewed guides. Do not invent paths. [Plugin API](https://ampcode.com/docs/plugin-api).
- **Security-policy ordering is incomplete:** Plugin hook order unspecified; aggregate allow/reject/modify behavior and plugin approval storage unknown. Hosted workspace plugin precedence alone does not establish non-bypassable enterprise policy. [Plugin API](https://ampcode.com/docs/plugin-api), [Plugins](https://ampcode.com/docs/customize/plugins).
- **Toolboxes are historically shipped, current status unknown.** Preserve as a separately versioned legacy capability, not an established October 2026 target feature. [Bring Your Own Tools](https://ampcode.com/news/toolboxes).
- **No version-pinned complete package schema found.** Native manifests, import provenance, dependency/version resolution, activation files and hosted cache locations remain unknown. Reviewed official pages/schema are live snapshots dated retrieval 2026-10-01. [Plugins](https://ampcode.com/docs/customize/plugins), [Schema](https://ampcode.com/cli-settings.schema.json).
