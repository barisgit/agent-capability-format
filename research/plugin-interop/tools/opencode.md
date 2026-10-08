# OpenCode - capability inventory (snapshot 2026-10-01)

## Skills: SKILL.md frontmatter fields and their variants per tool, discovery paths and precedence, bundled scripts/references/assets, invocation (model vs user), allowed-tools, per-tool extra metadata files

**Evidence baseline:** OpenCode source pinned to [`a79ecfe109294909a239c98fb89f02979d5aa10b`](https://github.com/anomalyco/opencode/commit/a79ecfe109294909a239c98fb89f02979d5aa10b), committed **2026-10-01 21:41:08 UTC**. Its [`@opencode-ai/plugin` package](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/package.json) declares **1.18.34**. Source presence establishes implemented behavior, not independently verified release availability. Official documentation is unversioned; live `dev` was already dated October 8, so historical conclusions below use the October 1 snapshot where inspected. No announced-only features are asserted.

Sources: [official skills documentation](https://opencode.ai/docs/skills/), [pinned documentation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/web/src/content/docs/skills.mdx), [V1 skill implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/skill/index.ts).

| Frontmatter | Documented type/meaning | Implementation qualification |
|---|---|---|
| `name` | Required string; 1–64 characters; `^[a-z0-9]+(-[a-z0-9]+)*$`; must match containing directory | Inspected V1 loader checks only that it is a string; documented lexical/directory constraints are not enforced there |
| `description` | Required string, 1–1024 characters; model selection guidance | V1 loader permits omission; description-less skills are excluded from advertised skill lists |
| `license` | Optional string; licensing | Not retained in V1 runtime `Info` |
| `compatibility` | Optional string; compatibility declaration | Not retained in V1 runtime `Info` |
| `metadata` | Optional string-to-string map | Not retained in V1 runtime `Info` |
| Other keys | Documentation says ignored | No native `allowed-tools`, invocation-control, model, hooks, or context schema in the inspected V1 skill loader |

**Discovery paths** ([documentation](https://opencode.ai/docs/skills/), [implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/skill/index.ts)):

- `.opencode/skills/<name>/SKILL.md`; `~/.config/opencode/skills/<name>/SKILL.md`.
- `.claude/skills/<name>/SKILL.md`; `~/.claude/skills/<name>/SKILL.md`.
- `.agents/skills/<name>/SKILL.md`; `~/.agents/skills/<name>/SKILL.md`.
- Implementation additionally scans recursive `skills/**/SKILL.md`, OpenCode `{skill,skills}/**/SKILL.md`, and configured `skills.paths` and `skills.urls`.
- Project external directories are discovered upward from working directory to worktree. Config-directory discovery also includes custom OpenCode configuration directories.
- `skills.paths`: string array; relative paths resolve from session directory; `~/` expands to home.
- `skills.urls`: string array; remote skill catalog bases.
- Duplicate names generate warnings and overwrite the runtime map. **Do not promise deterministic precedence:** V1 parsing uses unbounded concurrency, so discovery order alone does not establish the winning duplicate.
- Built-in `customize-opencode` is registered before disk loading and can be overridden.

**Invocation and resources**: The model receives name/description summaries and calls `skill({name: string})` on demand. `permission.skill` controls loading; denied skills disappear from advertising. A direct user slash-skill invocation contract is **UNKNOWN** from inspected skills documentation. Commands remain a separate documented type. Ordinary resources can accompany skills, and remote catalogs enumerate arbitrary files; scripts/references/assets have no typed execution contract in the inspected skill schema. Tool restrictions belong to configuration or agent permissions, not skill frontmatter. ([skills](https://opencode.ai/docs/skills/), [remote discovery source](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/skill/discovery.ts))

Remote cache metadata: `.opencode-version` contains the catalog version string; this is generated cache metadata, not a required author file. No OpenCode equivalent of `agents/openai.yaml` is specified in the inspected skill documentation. ([discovery](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/skill/discovery.ts))

## Instructions and rules: AGENTS.md, CLAUDE.md, GEMINI.md, .mdc rules, steering files; activation modes (always, glob/file-scoped, model-decided, manual), nesting and precedence, imports/includes

Sources: [rules](https://opencode.ai/docs/rules/), [config](https://opencode.ai/docs/config/), [pinned config documentation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/web/src/content/docs/config.mdx).

| File/key | Type and semantics |
|---|---|
| Project `AGENTS.md` | Plain Markdown instructions; project and subdirectories |
| Project `CLAUDE.md` | Compatibility fallback when no applicable `AGENTS.md` exists |
| `~/.config/opencode/AGENTS.md` | Global instructions |
| `~/.claude/CLAUDE.md` | Global fallback when OpenCode global instructions do not exist |
| `instructions` | Array of file paths, glob patterns, or remote URLs; combined with discovered rules |
| `{file:path}` | Config text substitution; relative to declaring config directory, or absolute/`~` |
| `GEMINI.md`, `.mdc` activation metadata, steering-file schema | **Not supported as documented native rule types**; ordinary text can be explicitly included through `instructions` |

Rules docs describe upward local discovery, first matching file per category, and OpenCode-before-Claude fallback. Local and global instructions are combined; this is not a general promise that every ancestor rule file is stacked. Fine-grained nested-file loading precedence beyond this documented description is **UNKNOWN** without tracing the instruction loader. ([rules](https://opencode.ai/docs/rules/))

Activation:

- Automatically discovered rules and `instructions` are context instructions.
- A glob in `instructions` selects files to include; it is **not** Cursor-style conditional activation based on the file being edited.
- No native `alwaysApply`, `globs`, `inclusion`, model-decided description, or manual rule frontmatter is documented.
- `@file` references inside `AGENTS.md` are **not automatically parsed**. Instructions can tell the model to read references, but that is prompt behavior, not an import mechanism.
- Remote instructions have a documented five-second fetch timeout. ([rules](https://opencode.ai/docs/rules/))

Compatibility flags: `OPENCODE_DISABLE_CLAUDE_CODE`, `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT`, `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`. ([rules](https://opencode.ai/docs/rules/))

Config merge specially concatenates and deduplicates `instructions` arrays rather than simply replacing them. ([pinned config implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/config/config.ts))

## Subagents and custom agents: agent definition files and frontmatter (name, description, model, tools, permissions, color, etc.), invocation, delegation, scopes

Files: `.opencode/agents/<name>.md`, `~/.config/opencode/agents/<name>.md`; JSON alternative `opencode.json[c].agent.<name>`. Filename supplies identity; body supplies prompt. Singular `agent/` remains backward-compatible. ([agents](https://opencode.ai/docs/agents/), [config](https://opencode.ai/docs/config/))

All fields below come from the [pinned canonical V1 agent config schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/agent.ts):

| Key | Type | Meaning |
|---|---|---|
| `model` | string | `provider/model-id` override |
| `variant` | string | Default variant, only when using configured agent model |
| `temperature` | finite number | Sampling temperature |
| `top_p` | finite number | Nucleus sampling |
| `prompt` | string | System prompt; Markdown body supplies it for file agents |
| `description` | string | Selection/delegation guidance; optional in schema despite docs calling it required |
| `mode` | `primary` / `subagent` / `all` | Invocation role; docs default to `all` |
| `hidden` | boolean | Hide subagent from `@` autocomplete; does not prevent Task delegation |
| `disable` | boolean | Disable definition |
| `color` | string | Six-digit hex or `primary`, `secondary`, `accent`, `success`, `warning`, `error`, `info` |
| `steps` | positive integer | Maximum agentic iterations before text-only response |
| `maxSteps` | positive integer | Deprecated alias; `steps` wins |
| `permission` | permission value/object | Agent-specific permission rules |
| `tools` | map of string → boolean | Deprecated; normalized to permissions; explicit `permission` wins |
| `options` | map of string → arbitrary value | Provider model options |
| Other keys | arbitrary values | Copied into provider options; unknown key does not necessarily mean ignored |

`name` is recognized by normalization but is not a declared identity field in the inspected schema; preserve file/map identity rather than assuming Claude agent `name` frontmatter semantics. ([schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/agent.ts))

Primary agents are user-switchable; subagents are model-delegated through Task or user-invoked with `@name`. `permission.task` matches subagent names; deny removes them from the Task description, but docs explicitly allow direct user invocation even where model Task permission denies. `hidden` is visibility, not security. ([agents](https://opencode.ai/docs/agents/))

Model inheritance: primary uses global model; subagent without explicit model inherits invoking primary model. `subagent_depth`: integer; documented default `1`, `0` prohibits launches, `2` allows an additional nested level. `default_agent`: string; must identify a primary agent; invalid/subagent selection falls back to `build` with warning. ([agents](https://opencode.ai/docs/agents/), [pinned config docs](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/web/src/content/docs/config.mdx))

## Commands and prompts: slash commands / prompt files: file layout, frontmatter, arguments and placeholders, shell/file interpolation, model/tool overrides; whether commands have become skills

Files: `.opencode/commands/<name>.md`, `~/.config/opencode/commands/<name>.md`; JSON alternative `command.<name>`. Filename supplies slash name; body supplies `template`. Singular `command/` is backward-compatible. ([commands](https://opencode.ai/docs/commands/), [config](https://opencode.ai/docs/config/))

Complete [pinned V1 command schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/command.ts):

| Key | Type | Meaning |
|---|---|---|
| `template` | required string | Prompt; Markdown body in file representation |
| `description` | optional string | Slash-menu description |
| `agent` | optional string | Agent override; defaults to current agent |
| `model` | optional string | Model override |
| `variant` | optional string | Model variant |
| `subtask` | optional boolean | Force child/subagent execution; false disables automatic subtask behavior for a subagent |

Syntax: `$ARGUMENTS` is the argument string; `$1`, `$2`, … are positional substitutions; `!` followed by a backtick-delimited shell command injects shell output; `@path` includes file contents. Shell snippets run in project root. Custom commands can override built-ins. No per-command `allowed-tools` field exists in this schema. ([commands](https://opencode.ai/docs/commands/))

**Commands have not become skills in this documented contract:** both have separate storage and schemas. Direct migration/alias semantics are **UNKNOWN**. ([commands](https://opencode.ai/docs/commands/), [skills](https://opencode.ai/docs/skills/))

## Hooks: every lifecycle event and its meaning, matchers, handler types (command, http, prompt, script module), input payload, output contract, exit codes and decisions (allow/deny/ask/modify/inject context), timeouts, env vars, ordering, scope

Native hooks are JS/TS plugin functions, not declarative Claude-style command/HTTP/prompt hook records. Complete inspected V1 callable contract: [plugin types](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/src/index.ts). Optional values below use `?`.

| Hook | Input | Mutable output / meaning |
|---|---|---|
| `dispose` | none | Promise<void>; instance cleanup |
| `event` | `{event: Event}` | No decision output; event observer |
| `config` | resolved config | May mutate config; initialization notification |
| `chat.message` | `sessionID`, `agent?`, `model?:{providerID,modelID}`, `messageID?`, `variant?` | `{message:UserMessage,parts:Part[]}`; new-message transformation |
| `chat.params` | `sessionID`, `agent`, `model`, `provider`, `message` | `temperature:number`, `topP:number`, `topK:number`, `maxOutputTokens:number\|undefined`, `options:Record<string,any>` |
| `chat.headers` | same input as `chat.params` | `headers:Record<string,string>` |
| `permission.ask` | SDK `Permission` | `status:"ask"\|"deny"\|"allow"` |
| `command.execute.before` | `command`, `sessionID`, `arguments`: strings | `parts:Part[]` |
| `tool.execute.before` | `tool`, `sessionID`, `callID`: strings | `args:any`; change tool arguments |
| `shell.env` | `cwd:string`, `sessionID?`, `callID?` | `env:Record<string,string>`; shell environment injection |
| `tool.execute.after` | `tool`, `sessionID`, `callID`, `args:any` | `title:string`, `output:string`, `metadata:any` |
| `tool.definition` | `toolID:string` | `description:string`, `parameters:any` |
| `experimental.chat.messages.transform` | `{}` | `messages:{info:Message,parts:Part[]}[]` |
| `experimental.chat.system.transform` | `sessionID?`, `model` | `system:string[]` |
| `experimental.provider.small_model` | `provider:ProviderV2` | `model?:ModelV2` |
| `experimental.session.compacting` | `sessionID:string` | `context:string[]`, `prompt?:string`; prompt replaces default; context ignored when prompt supplied |
| `experimental.compaction.autocontinue` | `sessionID`, `agent`, `model`, `provider`, `message`, `overflow:boolean` | `enabled:boolean`; suppress synthetic continue turn when false |
| `experimental.text.complete` | `sessionID`, `messageID`, `partID` | `text:string` |

All callable handlers return `Promise<void>` except the plugin initializer, which returns hooks. SDK object types are imported contracts, not arbitrary JSON payload guarantees. `experimental.*` hooks are explicitly experimental. ([types](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/src/index.ts))

**Documented event names**, with meanings indicated by their subjects; exhaustive event payload fields are **UNKNOWN in this inventory**, because the full SDK event union was not traced:

| Subject | Exact names |
|---|---|
| Command | `command.executed` |
| Files | `file.edited`, `file.watcher.updated` |
| Installation | `installation.updated` |
| LSP | `lsp.client.diagnostics`, `lsp.updated` |
| Messages | `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated` |
| Permission requests/replies | `permission.asked`, `permission.replied` |
| Server connection | `server.connected` |
| Sessions | `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated` |
| Todos | `todo.updated` |
| TUI | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show` |

Docs also group `shell.env`, `tool.execute.before`, and `tool.execute.after` under “events,” but types define separate callable hooks; these should not be flattened into observer events. ([plugins documentation](https://opencode.ai/docs/plugins/), [types](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/src/index.ts))

**Execution semantics**:

- Trigger hooks are awaited sequentially over registered plugins, sharing mutable output.
- Observer `event` promises are invoked without awaiting; “all hooks run sequentially” in docs is not a reliable completion-order guarantee for observers.
- Event observers receive an object constructed with `id`, `type`, and `properties`; filtering by event/tool is ordinary JS, not declarative matcher syntax.
- Plugins initialize per instance; observer delivery filters instance directory.
- No native hook exit-code protocol, declarative timeout, hook-specific environment-variable namespace, or command/http/prompt handler enum exists in the inspected V1 interface. A plugin can execute subprocesses or HTTP itself.
- Throwing in `tool.execute.before` is documented as a blocking technique; no generalized structured deny-message output exists for that hook. ([implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/index.ts), [examples](https://opencode.ai/docs/plugins/))

Additional hook members `tool`, `auth`, and `provider` register capabilities rather than lifecycle callbacks; described below.

## MCP servers: config file and every field (command, args, env, cwd, envFile, url, headers, transport type, auth/oauth, timeouts, enabled/disabled tools, trust), variable expansion syntax incl. plugin-root variables, scopes and precedence

Location: `opencode.json[c].mcp.<server-name>`. Complete inspected [V1 MCP schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/mcp.ts); [official docs](https://opencode.ai/docs/mcp-servers/).

| Key | Type | Meaning |
|---|---|---|
| `type` | required `"local"` or `"remote"` | Connection category |
| `command` | required string[] for local | Executable and arguments together |
| `cwd` | optional string, local | Relative to workspace directory |
| `environment` | optional string-to-string map, local | Process environment |
| `url` | required string, remote | Server endpoint |
| `headers` | optional string-to-string map, remote | HTTP headers |
| `enabled` | optional boolean | Startup enable/disable |
| `timeout` | optional positive integer | Milliseconds; schema describes server requests; docs describe fetching tools; default 5000 |
| `oauth` | optional object or `false`, remote | Automatic OAuth configuration, or disable |
| `oauth.clientId` | optional string | Registered client; otherwise dynamic registration |
| `oauth.clientSecret` | optional string | Client secret |
| `oauth.scope` | optional string | Requested scopes |
| `oauth.callbackPort` | optional integer 1–65535 | Default 19876; ignored if redirect URI set |
| `oauth.redirectUri` | optional string | Default `http://127.0.0.1:19876/mcp/oauth/callback` |

`args`, `env`, `envFile`, explicit `transport`, `trust`, server-local tool allowlists/denylists, and plugin-root variables are **not fields of this inspected schema**. Local process and remote URL are the native categories; precise remote transport negotiation was not traced. ([schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/mcp.ts))

Config substitutions: `{env:NAME}`; unset becomes empty string. `{file:path}` includes text; relative to config directory, with `/` and `~` absolute forms. No documented `${CLAUDE_PLUGIN_ROOT}` equivalent. ([config](https://opencode.ai/docs/config/))

Tools are namespaced by server prefix; use `permission["server_*"]` for tool access, or deprecated `tools["server_*"]:false`; agents can override tool permissions. `enabled:false` disables connection, not merely model visibility. ([MCP docs](https://opencode.ai/docs/mcp-servers/), [permissions](https://opencode.ai/docs/permissions/))

Remote OAuth supports 401 detection and dynamic client registration. Commands: `opencode mcp auth <name>`, `opencode mcp list`, `opencode mcp logout <name>`, `opencode mcp auth list`, `opencode mcp debug <name>`. Token storage documented as `~/.local/share/opencode/mcp-auth.json`. ([MCP docs](https://opencode.ai/docs/mcp-servers/))

Scopes and precedence use ordinary merged configuration; organizational remote defaults are overridable unless enforced through managed configuration. ([config](https://opencode.ai/docs/config/))

## Other native capability types: LSP servers, output styles, themes, apps/connectors, monitors, userConfig/plugin settings, models/providers, statusline, keybindings, tool/extension code modules (JS/TS plugins) and anything else a package can ship

**Custom tools**: `.opencode/tools/*.ts|js`, `~/.config/opencode/tools/*.ts|js`. Default export uses filename identity; named export uses `<filename>_<exportname>`. Fields: `description:string`, `args:Record<string,ZodSchema>`, `execute(args,context)` returning result text asynchronously. Context documented fields: `agent`, `sessionID`, `messageID`, `directory`, `worktree`. Tools may invoke any-language scripts; a script alone is not a native tool definition. Custom/plugin tools can replace built-ins by name. ([custom tools](https://opencode.ai/docs/custom-tools/), [plugins](https://opencode.ai/docs/plugins/))

**LSP**: `lsp:boolean|Record<string,server>`; omitted disables in inspected documentation; true enables built-ins; object enables built-ins plus overrides. Server fields: `disabled?:boolean`, `command:string[]` unless disabling only, `extensions?:string[]`, `env?:Record<string,string>`, `initialization?:object`. ([LSP docs](https://opencode.ai/docs/lsp/))

**Formatters**: `formatter:boolean|Record<string,formatter>`; omitted disables. Entry fields documented: `disabled?:boolean`, `command?:string[]`, `environment?:Record<string,string>`, `extensions?:string[]`; `$FILE` interpolates filename. ([pinned config docs](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/web/src/content/docs/config.mdx))

**Themes**: `themes/<name>.json`; top-level `$schema`, optional `defs` reusable colors, `theme` color map. Color values: hex string, ANSI integer 0–255, reference string, `"none"`, or `{dark,light}`. Precedence: binary built-ins → user config → project-root `.opencode/themes` → working-directory `.opencode/themes`. Selection `tui.json.theme:string`. Package field `oc-themes:string[]` lists relative theme files; absolute paths, empty entries, and escaping package root are rejected. ([themes](https://opencode.ai/docs/themes/), [package implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/shared.ts))

Theme color slots documented: `primary`, `secondary`, `accent`, `error`, `warning`, `success`, `info`, `text`, `textMuted`, `background`, `backgroundPanel`, `backgroundElement`, `border`, `borderActive`, `borderSubtle`; `diffAdded`, `diffRemoved`, `diffContext`, `diffHunkHeader`, `diffHighlightAdded`, `diffHighlightRemoved`, `diffAddedBg`, `diffRemovedBg`, `diffContextBg`, `diffLineNumber`, `diffAddedLineNumberBg`, `diffRemovedLineNumberBg`; `markdownText`, `markdownHeading`, `markdownLink`, `markdownLinkText`, `markdownCode`, `markdownBlockQuote`, `markdownEmph`, `markdownStrong`, `markdownHorizontalRule`, `markdownListItem`, `markdownListEnumeration`, `markdownImage`, `markdownImageText`, `markdownCodeBlock`; `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`. Schema-required versus optional slots were not independently checked. ([themes](https://opencode.ai/docs/themes/))

**Provider/model configuration**, complete fields of inspected [provider schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/provider.ts):

| Object | Fields |
|---|---|
| Provider | `api`, `name`, `id`, `npm`: optional strings; `env`, `whitelist`, `blacklist`: optional string[]; `options`: object; `models`: map |
| Provider options | `apiKey`, `baseURL`, `enterpriseUrl`: strings; `setCacheKey`: boolean; `timeout`, `headerTimeout`, `chunkTimeout`: positive integer milliseconds or false; arbitrary SDK-specific extra keys accepted |
| Model identity | `id`, `name`, `family`, `release_date`: strings |
| Model capabilities | `attachment`, `reasoning`, `temperature`, `tool_call`, `experimental`: booleans |
| `interleaved` | boolean, string, or `{field:string}`; known field spellings include `reasoning`, `reasoning_content`, `reasoning_text` |
| `cost` | required `input`, `output` numbers within supplied object; optional `cache_read`, `cache_write`; optional `context_over_200k` with same numeric fields |
| `limit` | required `context`, `output` numbers within supplied object; optional `input` |
| `modalities` | optional `input`/`output` arrays; values `text`, `audio`, `image`, `video`, `pdf` |
| `status` | `alpha`, `beta`, `deprecated`, `active` |
| Model `provider` | optional `npm`, `api` strings |
| Model `options` | arbitrary-value map |
| Model `headers` | string-to-string map |
| `variants` | map to arbitrary option objects with optional `disabled:boolean` |

Global `model` and `small_model` are strings; `enabled_providers`/`disabled_providers` are string arrays; disabled wins. ([config](https://opencode.ai/docs/config/))

**Provider/auth plugin code**: `provider:{id:string,models?:async callback}` registers models; context includes optional auth. `auth:{provider:string,loader?:callback,methods:array}` supports `type:"oauth"|"api"`, `label`, optional prompts, `authorize`. Prompt fields: `type:"text"|"select"`, `key`, `message`; text adds `placeholder?`, `validate?`; select adds `options:{label,value,hint?}[]`; both support deprecated `condition?` callback or `when?:{key,op:"eq"|"neq",value}`. OAuth authorization result includes `url`, `instructions`, `method:"auto"|"code"`, callback; callback returns `type:"success"|"failed"` plus optional provider and either token fields `refresh`, `access`, `expires`, `accountId?`, `enterpriseUrl?` or `key`, `metadata?`. API success uses `key`, optional provider and string metadata. ([plugin types](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/src/index.ts))

**TUI/keybindings**: dedicated `tui.json[c]`, configurable using `OPENCODE_TUI_CONFIG`; legacy runtime-config UI fields deprecated. `keybinds` maps action IDs to shortcut strings, arrays, false, or objects with `key`, `event`, `preventDefault`, `fallthrough`; `"none"` disables. `leader_timeout` is milliseconds, default 2000. Full action enum and TUI extension API were not exhaustively inventoried here. ([keybinds](https://opencode.ai/docs/keybinds/), [config](https://opencode.ai/docs/config/))

**Experimental workspace adapters**: plugin input exposes `experimental_workspace.register(type,adapter)`. Adapter fields: `name`, `description`, callbacks `configure`, `create`, `remove`, `target`; target is `{type:"local",directory}` or `{type:"remote",url,headers?}`. ([plugin types](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/src/index.ts))

Dedicated declarative **output styles, apps/connectors, monitors, statusline, or standardized `userConfig` schema**: **UNKNOWN/not documented in inspected capability sources**. Arbitrary plugin options exist; this is not evidence of a portable manifest-defined settings UI. V2 Effect/Promise plugin APIs and TUI plugin APIs exist in package exports but were not fully traced. ([package exports](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/plugin/package.json))

## Permissions, trust and security: permission/allow-deny settings packages can or cannot set, trust prompts on install, workspace trust, sandboxing, signature/provenance, managed/enterprise policy that can block or require packages

`permission` accepts `"allow"|"ask"|"deny"` or a map of permission/tool patterns to actions or input-pattern maps. Last matching rule wins; `*` matches any sequence, `?` one character; `~`/`$HOME` expand at pattern start. Agent permissions override global settings. Legacy `tools` remains accepted, deprecated since documented **v1.1.1**. ([permissions](https://opencode.ai/docs/permissions/), [agent normalization](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/agent.ts))

Documented keys: `read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `external_directory`, `todowrite`, `webfetch`, `websearch`, `lsp`, `skill`, `question`, `doom_loop`; custom/MCP tool patterns also work. `edit` covers multiple write/edit/patch tools. `task` matches subagent identity; `skill` skill identity; `external_directory` guards paths outside working directory; `doom_loop` detects three identical repeated tool calls. Docs differ over whether LSP granularity is supported. ([agents](https://opencode.ai/docs/agents/), [permissions](https://opencode.ai/docs/permissions/))

Defaults: most actions allow; `external_directory` and `doom_loop` ask; reads deny `*.env` and `*.env.*` but allow `*.env.example`. Approval decisions: `once`, `always` for current session patterns, `reject`. `--auto` approves asks, not explicit denies. ([permissions](https://opencode.ai/docs/permissions/))

Packages are executable code: plugin `config` hooks can mutate config, `permission.ask` exposes decision mutation, and tool hooks can rewrite arguments/results. These are not sandboxed declarative resources. Install code uses npm Arborist with `ignoreScripts:true`; this suppresses dependency install scripts, **not imported plugin execution**. A workspace-trust prompt, permission ceiling for packages, signature verification, provenance enforcement, or plugin runtime sandbox was **not established** in inspected loader code. ([plugin implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/index.ts), [npm implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/npm.ts))

Managed config overrides normal configuration:

- macOS `/Library/Application Support/opencode/opencode.json[c]`.
- Linux `/etc/opencode/opencode.json[c]`.
- Windows `%ProgramData%\opencode\opencode.json[c]`.
- macOS MDM domain `ai.opencode.managed`; user-specific then system managed plist locations; MDM metadata stripped.
- `experimental.policies` is explicitly experimental; documented fields `effect`, `action`, `resource`, with `provider.use` example.
- A package-specific managed allowlist/required-package policy was **UNKNOWN** in inspected docs. ([pinned config docs](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/web/src/content/docs/config.mdx))

## Packaging, install and scopes: plugin/extension manifest files and all fields, required layout, marketplaces/catalogs and their schemas, source types (git/ref/sha/npm/zip/path), install and enable mechanics on disk (exact files written, settings keys like enabledPlugins), scopes (user/project/local/org) and precedence, versions, dependencies, update behavior, caching locations

OpenCode plugins are code packages/modules, **not Agent Plugins 1.0 or Claude plugin manifests**. Config key `plugin` is an array of strings or `[specifier, options]` tuples; options are arbitrary string-to-unknown maps. Local auto-discovery directories: `.opencode/plugins/`, `~/.config/opencode/plugins/`. ([plugin config schema](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/v1/config/plugin.ts), [plugins docs](https://opencode.ai/docs/plugins/))

**Package/module fields actually consumed** ([shared loader](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/shared.ts)):

| File/object | Field | Type/meaning |
|---|---|---|
| `package.json` | `name` | Package identity fallback |
| `package.json` | `main` | Server entry fallback |
| `package.json` | `exports["./server"]` | Server module path; string or object `import`/`default` |
| `package.json` | `exports["./tui"]` | TUI entry; same path forms |
| `package.json` | `engines.opencode` | Semver compatibility range; checked for npm packages, skipped for file plugins |
| `package.json` | `oc-themes` | Relative theme-file string[] |
| Config-directory `package.json` | npm dependency fields | External dependencies for local tools/plugins |
| Default module object | `id?` | Nonempty string; required for path plugins using this object contract |
| Default module object | `server` or `tui` | Function; cannot supply both in one default object |
| Legacy module exports | exported plugin functions | Server loader still supports legacy functions |

A directory without `package.json` may use `index.ts`, `index.tsx`, `index.js`, `index.mjs`, or `index.cjs`. Relative plugin specs are normalized relative to the declaring config file. Entrypoint paths must remain inside the package directory. ([shared loader](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/shared.ts), [config implementation](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/config/config.ts))

**Sources**: first-class classification is `"file"` or `"npm"`. File specs include `file://`, relative paths beginning `.`, and absolute paths. Bare npm names become `@latest`; scoped packages and version/range specs are parsed with `npm-package-arg`. Other npm-supported source forms are handed through to npm; a dedicated documented Git/ref/SHA/ZIP package contract was **not established**. ([shared loader](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/shared.ts))

**Installation/cache—important source/docs disagreement**:

- Docs say Bun startup installation and `~/.cache/opencode/node_modules`.
- October 1 source instead uses npm Arborist and a per-spec cache: `$XDG_CACHE_HOME/opencode/packages/<sanitized-spec>/node_modules/<package>`, with default cache root `~/.cache/opencode`.
- Installer operates on `package.json`, `package-lock.json`, and `node_modules`; install scripts disabled.
- `Npm.add` reuses an existing package directory without registry refresh. Unpinned `latest` therefore is not evidence of automatic plugin upgrades on each launch.
- Exact complete installer-generated filesystem contents depend on npm; no Claude-like `enabledPlugins` registry is shown by this inspected server loader.
- OpenCode application `autoupdate` is separate from plugin updates. ([plugins docs](https://opencode.ai/docs/plugins/), [npm source](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/npm.ts), [config](https://opencode.ai/docs/config/))

**Catalogs**: ecosystem page lists community plugins but is not a verified install-manifest schema. There is a native **skill URL catalog**, not a general plugin marketplace, implemented as `<base>/index.json`:

```json
{
  "skills": [
    {
      "name": "string",
      "files": ["SKILL.md", "references/example.md"],
      "version": "optional string"
    }
  ]
}
```

V1 requires `SKILL.md` in `files`; downloads under `~/.cache/opencode/skills/<name>/`, writes `.opencode-version` on versioned refresh, and uses staging/backup swaps for changed versions. Without a version change, existing files are reused. V2 source instead isolates catalogs under a hash of base URL and additionally accepts `<name>.md`; these are **different contracts**, not interchangeable guarantees. ([V1 discovery](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/skill/discovery.ts), [V2 discovery](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/core/src/skill/discovery.ts))

**Scopes/config precedence**, later wins on conflicts; configurations merge:

1. Remote `.well-known/opencode` organizational defaults.
2. Global `~/.config/opencode/opencode.json[c]`.
3. `OPENCODE_CONFIG`.
4. Project `opencode.json[c]`, found upward to nearest Git directory.
5. `.opencode` configuration directories.
6. `OPENCODE_CONFIG_CONTENT`.
7. Managed configuration files.
8. macOS managed preferences.

`OPENCODE_CONFIG_DIR` supplies another config directory documented as overriding global and `.opencode` directories. No separately documented Claude-style project-local settings scope or plugin organization-install registry. ([pinned config docs](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/web/src/content/docs/config.mdx))

Docs give plugin order global config → project config → global directory → project directory. Server hook initialization and trigger execution are sequential; package resolution/import can run in parallel while preserving successful result ordering. Do not equate this with asynchronous event completion order. ([plugins](https://opencode.ai/docs/plugins/), [loader](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/loader.ts), [runtime](https://github.com/anomalyco/opencode/blob/a79ecfe109294909a239c98fb89f02979d5aa10b/packages/opencode/src/plugin/index.ts))

## Notable gaps and ambiguities

- **Historical release status:** October 1 source snapshot is verified; exact published release coverage is **UNKNOWN**. Live documentation/source can include post-cutoff changes.
- **Not fully covered:** V2 Effect/Promise plugin APIs, TUI extension API and installation/enable registry, complete SDK event payload union, full keybinding action enum, complete TUI/theme schemas, and nested instruction-loader behavior. This is not an exhaustive inventory of those surfaces.
- **Documentation conflicts:** skill description required versus optional runtime; documented skill-name constraints versus weak inspected validation; Bun/shared cache versus npm/per-spec cache; “sequential hooks” versus unawaited event observers; differing LSP permission granularity. Sources are cited in their facets.
- **Parallel implementations matter:** V1 and V2 skill discovery differ in cache isolation, alternate Markdown filenames, and path validation. Active runtime selection must be established before promising package compatibility.
- **ACF losslessness risk:** converting OpenCode skills into only runtime `name`, `description`, and body loses author metadata; preserving raw frontmatter is necessary for same-format round trips. Agent unknown keys are meaningful provider options, not safely discardable noise.
- **Security portability risk:** executable plugins, mutable permission hooks, custom built-in replacements, and shell interpolation cannot be represented as harmless declarative instruction bundles.
- **Next research priority:** pin a released October 1 tag and trace its active runtime, TUI plugin manager, V2 plugin contracts, SDK events, and instruction loader before finalizing OpenCode support/degradation tables.
