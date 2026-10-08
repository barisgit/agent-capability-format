# Google Gemini CLI - capability inventory (snapshot 2026-10-01)

## Skills

**Status:** shipped/documented. Sources inspected 2026-10-01; [skills documentation](https://geminicli.com/docs/cli/skills/) updated 2026-04-30. Source references below are upstream `main`, not a verified release tag.

**Files:** `.gemini/skills/<skill>/SKILL.md`, `.agents/skills/<skill>/SKILL.md`, corresponding home-directory paths, and extension-root `skills/<skill>/SKILL.md`. Discovery precedence, lowest first: built-in → extension → user → workspace. Within user/workspace tiers, `.agents/skills` overrides `.gemini/skills` for duplicate names. [Source](https://geminicli.com/docs/cli/skills/#discovery-tiers)

| Frontmatter field | Type | Meaning / implementation |
|---|---|---|
| `name` | string, required | Skill identifier; documentation recommends matching directory name. Loader replaces `: \ / < > * ? " \|` with `-`. |
| `description` | string, required | Discovery metadata used by the model to decide activation. |
| Other keys | UNKNOWN native semantics | Loader extracts only `name` and `description`; it does not implement `allowed-tools`, `model`, invocation flags, or other frontmatter properties. Preserve such properties separately for lossless conversion. |

The YAML header must begin the file and be bounded by `---`. YAML parsing has a fallback simple key/value parser, including indented description continuation. Discovery searches `SKILL.md` and `*/SKILL.md`, not an arbitrary recursive hierarchy. [Implementation: `parseFrontmatter`, `loadSkillsFromDir`, `loadSkillFromFile`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/skills/skillLoader.ts)

Optional `scripts/`, `references/`, and `assets/` hold executable logic, documentation, and templates/resources; only `SKILL.md` is required. Activation grants read access to the entire skill directory. No Gemini-specific extra metadata file is documented. [Source](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/creating-skills.md)

**Invocation:** the model calls `activate_skill`; the user approves a dialog displaying name, purpose, and directory access. Body and folder structure enter conversation history. Built-in skills are pre-approved. `/skills` manages discovery/enabling, rather than serving as a documented `/skill-name` invocation mechanism. Explicit direct user invocation by skill name: **UNKNOWN**. [Sources](https://geminicli.com/docs/cli/skills/), [creation guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/creating-skills.md)

**Management:** `gemini skills install <git-url-or-local-directory>`, `uninstall`, `link`; `--scope user|workspace` defaults to user; `--path` selects a Git subdirectory; `--consent` bypasses installation confirmation. `/skills reload` aliases `/skills refresh`; enable/disable default to user scope. A packaging helper produces a `.skill` ZIP; acceptance of every arbitrary ZIP by the installer is **UNKNOWN** from these sources. [Sources](https://geminicli.com/docs/cli/skills/), [upstream guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/creating-skills.md)

## Instructions and rules

**Status:** shipped/documented. [Context documentation](https://geminicli.com/docs/cli/gemini-md/) updated 2026-06-18.

| File/config | Type | Activation and semantics |
|---|---|---|
| `~/.gemini/GEMINI.md` | Markdown | Global instructions, included with every prompt. |
| Workspace/ancestor `GEMINI.md` | Markdown | Environment/project instructions, concatenated into context. |
| Nested `GEMINI.md` | Markdown | Just-in-time discovery when tools access a directory/file; ancestors searched up to trusted root. |
| `context.fileName` in `settings.json` | string or string[] | Replaces/configures instruction filenames; documented example includes `AGENTS.md`, `CONTEXT.md`, `GEMINI.md`. |
| Extension `contextFileName` | string or string[] in source | Extension-relative context filenames; absent setting defaults to root `GEMINI.md`. |
| `@file.md` inside context | textual import | Relative and absolute imports supported. |

Sources: [context hierarchy/imports](https://geminicli.com/docs/cli/gemini-md/), [extension reference](https://geminicli.com/docs/extensions/reference/), [manifest type](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts).

`AGENTS.md` and `CLAUDE.md` are not documented as independent native instruction formats; they can be selected through filename configuration. `.mdc` rules and dedicated steering-file formats: **Not supported in the documented extension/context interfaces**. No native instruction frontmatter schema for `globs`, `alwaysApply`, model-decided selection, or manual rules is documented. Nested discovery is directory/JIT-based, not a `.mdc` glob engine. Contradictory instruction text is concatenated; a guaranteed semantic “last rule wins” contract is **UNKNOWN**. [Source](https://geminicli.com/docs/cli/gemini-md/)

Policy TOML files are a separate executable-permission capability, not instructional Markdown; inventoried below. [Source](https://geminicli.com/docs/reference/policy-engine/)

## Subagents and custom agents

**Status:** shipped/documented and enabled by default, but the disable switch remains under `experimental.enableAgents`. [Subagents documentation](https://geminicli.com/docs/core/subagents/) updated 2026-06-08; [remote agents](https://geminicli.com/docs/core/remote-agents/) updated 2026-04-10.

**Files:** `.gemini/agents/*.md`, `~/.gemini/agents/*.md`, extension-root `agents/*.md`. Required opening YAML frontmatter; Markdown body becomes the local agent system prompt. Duplicate-name precedence between these locations: **UNKNOWN** in inspected documentation. [Sources](https://geminicli.com/docs/core/subagents/#agent-definition-files), [extension reference](https://geminicli.com/docs/extensions/reference/#sub-agents)

| Local frontmatter | Type | Meaning/default |
|---|---|---|
| `name` | string, required | Slug: lowercase letters, digits, hyphens, underscores; agent identifier. |
| `description` | string, required | Expertise/delegation selector visible to parent. |
| `kind` | `local` or `remote` | Defaults `local`. |
| `tools` | string[] | Tool allowlist; absent inherits parent tools. Supports `*`, `mcp_*`, `mcp_<server>_*`. |
| `mcpServers` | object | Inline MCP configurations isolated to this agent. |
| `model` | string | Default `inherit`. |
| `temperature` | number | Range 0–2; default 1. |
| `max_turns` | number | Maximum conversation turns; default 30. |
| `timeout_mins` | number | Maximum execution minutes; default 10. |

[Source](https://geminicli.com/docs/core/subagents/#configuration-schema)

`permissions`, `permissionMode`, `color`, agent-specific skill references, and memory frontmatter: **UNKNOWN/not documented**, not aliases to the fields above.

**Remote definition:**

| Frontmatter | Type | Meaning |
|---|---|---|
| `kind` | literal `remote`, required | A2A-backed agent. |
| `name` | string, required | Same slug character set. |
| `agent_card_url` | string | A2A card endpoint; required unless inline card supplied. |
| `agent_card_json` | string | Serialized JSON card; required unless URL supplied. |
| `auth` | object | Authentication union below. |

One Markdown file can contain a YAML list of multiple remote definitions. Card schema is A2A, not Gemini's local-agent frontmatter schema. [Source](https://geminicli.com/docs/core/remote-agents/#configuration-schema)

| `auth.type` | Other fields and types |
|---|---|
| `apiKey` | `key: string` required; `name: string` header name, default `X-API-Key`. |
| `http`, `scheme: Bearer` | `token: string` required. |
| `http`, `scheme: Basic` | `username: string`, `password: string` required. |
| `http`, other IANA scheme | `scheme: string`, `value: string` required; raw authorization value. |
| `google-credentials` | `scopes: string[]` optional; default cloud-platform scope. |
| `oauth` | `client_id: string` required for interactive auth; `client_secret: string` optional/server-dependent; `scopes: string[]`, `authorization_url: string`, `token_url: string` optional/discoverable. |

API-key/HTTP secret fields accept `$ENV_VAR`, `!command` using trimmed stdout, literal values, and escaped prefixes `$$`/`!!`. Google credentials only send tokens to `*.googleapis.com` and `*.run.app`. Auth retries on 401/403 up to twice; agent-card fetching begins unauthenticated and retries authenticated. [Source](https://geminicli.com/docs/core/remote-agents/#authentication)

**Invocation/isolation:** automatic parent delegation; leading `@agent-name` injects a note nudging immediate delegation, not a documented bypass of the parent model. Agents have separate histories and cannot invoke other agents even with `tools: ["*"]`. [Source](https://geminicli.com/docs/core/subagents/)

**Overrides:** `agents.overrides.<name>.enabled: boolean`; `modelConfig.model: string`; `runConfig.maxTurns: number`; `runConfig.maxTimeMinutes: number`. `modelConfigs.overrides[]` can match `overrideScope` and supply `modelConfig.generateContentConfig`. These are host settings, not additional manifest fields. [Source](https://geminicli.com/docs/core/subagents/#persistent-configuration-settingsjson)

**Pitfall:** agent docs describe one tool per agent, while policy docs describe unified `invoke_agent` with virtual aliases. Preserve agent identity independently of exposed tool shape. [Sources](https://geminicli.com/docs/core/subagents/), [policy reference](https://geminicli.com/docs/reference/policy-engine/#special-syntax-for-subagents)

## Commands and prompts

**Status:** shipped; TOML format **v1**. [Documentation](https://geminicli.com/docs/cli/custom-commands/) updated 2026-04-30.

**Files:** `~/.gemini/commands/**/*.toml`, `<project>/.gemini/commands/**/*.toml`, extension-root `commands/**/*.toml`. `git/commit.toml` becomes `/git:commit`; project overrides user. Extension commands have lowest precedence; collisions with user/project commands rename the extension command to `/extension-name.command`, using a dot. [Sources](https://geminicli.com/docs/cli/custom-commands/#file-locations-and-precedence), [extension conflict rules](https://geminicli.com/docs/extensions/reference/#conflict-resolution)

| Field/syntax | Type | Semantics |
|---|---|---|
| `prompt` | string, required | Text sent to model; multiline TOML strings supported. |
| `description` | string, optional | Help text; absent generates description from filename. |
| `{{args}}` | placeholder | Entire text after command name; raw in prompt, shell-escaped inside shell interpolation. |
| `!{...}` | shell interpolation | Execute resolved shell command after confirmation; inject output. Failure injects stderr/status. Balanced braces required. |
| `@{...}` | file interpolation | Inject file contents, supported multimodal inputs, or recursive directory contents; respects enabled ignore filtering. |

No documented frontmatter, positional `$1` arguments, model override, or command-specific tools/permissions fields. Commands remain a separate capability; they have **not** been documented as replaced by skills. [Source](https://geminicli.com/docs/cli/custom-commands/)

Without `{{args}}`, supplied arguments cause the **full typed command**, separated by two newlines, to be appended to the prompt; no arguments means no append. File injection runs before shell injection and argument substitution. Paths search current/additional workspace directories; absolute paths must be inside workspace. This is not extension-root-relative file interpolation. [Source](https://geminicli.com/docs/cli/custom-commands/#handling-arguments)

## Hooks

**Status:** shipped/documented. [Reference](https://geminicli.com/docs/hooks/reference/) updated 2026-04-10; [overview](https://geminicli.com/docs/hooks/) updated 2026-04-13.

**Files:** `settings.json` → `hooks`; extension-root `hooks/hooks.json`. Hooks are **not** a `gemini-extension.json` property. [Sources](https://geminicli.com/docs/hooks/), [extension reference](https://geminicli.com/docs/extensions/reference/#hooks)

| Configuration key | Type | Contract |
|---|---|---|
| `hooks.<Event>` | array | Matching hook groups. |
| Group `matcher` | string, optional | Tool events: regex against tool name. Lifecycle: exact trigger. `*` and empty string match all. |
| Group `sequential` | boolean, optional | True sequential within group; false parallel. Omitted default not explicitly specified in reference. |
| Group `hooks` | array, required | Handler definitions. |
| Handler `type` | literal `command`, required | Only documented handler engine. |
| Handler `command` | string, required | Shell command. |
| Handler `name` | string, optional | Logs/management identity. |
| Handler `timeout` | number, optional | Milliseconds; default 60000. |
| Handler `description` | string, optional | Purpose shown in UI. |
| `hooks.disabled` | string[] | Disabled hook names. |

HTTP, prompt, and in-process JS/TS-module handler types: **Not supported** by this hook schema. Executing Node/Python/etc. through `command` is supported. [Sources](https://geminicli.com/docs/hooks/reference/#configuration-schema), [disabled list](https://geminicli.com/docs/hooks/best-practices/#hook-not-executing)

**Common input:** `session_id: string`, `transcript_path: string` absolute session transcript JSON path, `cwd: string`, `hook_event_name: string`, `timestamp: string` ISO-8601. stdin JSON; stdout only final JSON; stderr logs. [Source](https://geminicli.com/docs/hooks/reference/#base-input-schema)

**Common output:** `systemMessage: string` user-visible; `suppressOutput: boolean` suppresses logging/telemetry metadata, not displayed messages; `continue: boolean` stops agent loop when false where supported; `stopReason: string`; `decision: "allow"|"deny"` with `"block"` deny alias; `reason: string`; event-specific `hookSpecificOutput: object`. Hook `ask`/`ask_user` decisions are **not documented**—policy-engine decisions are different. [Sources](https://geminicli.com/docs/hooks/reference/#common-output-fields), [privacy semantics](https://geminicli.com/docs/hooks/best-practices/#privacy-settings)

| Event | Meaning and additional input | Output/decision semantics |
|---|---|---|
| `BeforeAgent` | User prompt submitted, before planning. `prompt: string`. | `additionalContext: string` appended for this turn. Deny discards prompt/history; `continue:false` blocks but retains message. Reason required for denied/stopped turn. |
| `AfterAgent` | Final response for turn. `prompt`, `prompt_response: string`; `stop_hook_active: boolean`. | Deny retries with reason as correction prompt. `continue:false` stops without retry. `clearContext: boolean` clears LLM history while retaining UI. |
| `BeforeModel` | Before LLM request. `llm_request: object`. | `llm_request: object` overrides outgoing request; `llm_response: object` supplies synthetic response, skipping model. Deny aborts turn. |
| `BeforeToolSelection` | Before tool selection. `llm_request: object`. | `toolConfig.mode: "AUTO"|"ANY"|"NONE"`; `allowedFunctionNames: string[]`. NONE wins; allowlists union across hooks. Does not support `decision`, `continue`, `systemMessage`. |
| `AfterModel` | Every received model response chunk. `llm_request`, `llm_response: object`. | Replacement `llm_response` affects current chunk only. Deny discards chunk/blocks turn; `continue:false` stops loop. |
| `BeforeTool` | Before execution. `tool_name: string`, `tool_input: object`, optional `mcp_context: object`, `original_request_name: string` for tail calls. | Deny prevents execution; reason becomes tool error, turn continues. `tool_input: object` merges/overrides arguments. `continue:false` stops loop. |
| `AfterTool` | After execution. Same tool fields plus `tool_response: object` containing `llmContent`, `returnDisplay`, optional `error`. | Deny hides result, replacing it with reason; does not undo execution. `additionalContext: string` appends context. `tailToolCallRequest:{name:string,args:object}` immediately routes another tool; tail result replaces original. |
| `SessionStart` | Startup/resume/clear. `source:"startup"|"resume"|"clear"`. | `additionalContext` becomes first history turn interactively or prepends headless prompt. Advisory; decision/continue ignored. |
| `SessionEnd` | Exit/clear. `reason:"exit"|"clear"|"logout"|"prompt_input_exit"|"other"`. | Best effort; CLI does not wait. Flow control ignored; system message displayed. |
| `Notification` | System alert. `notification_type:"ToolPermission"`, `message:string`, `details:object`. | Observational; cannot grant permissions/block alert. System message supported. |
| `PreCompress` | Before history compression. `trigger:"auto"|"manual"`. | Async/advisory; cannot block or modify compression. System message supported. |

All table contracts: [hooks reference](https://geminicli.com/docs/hooks/reference/).

Stable model payloads are documented only partially: request `{model:string,messages:array,config:object,toolConfig:{mode:string,allowedFunctionNames:string[]}}`; response `{candidates:array,usageMetadata:{totalTokenCount:number}}`. Complete nested message/candidate/config schema: **UNKNOWN** in reference. MCP context nested schema: **UNKNOWN**. [Source](https://geminicli.com/docs/hooks/reference/#stable-model-api)

**Exit codes:** 0 parses JSON, including deliberate denial; 2 blocks tool/result/turn as appropriate, or retries `AfterAgent`, with stderr as reason; other nonzero codes warn and continue using original parameters. Invalid/non-JSON stdout defaults to allow and is treated as a system message—security-critical fail-open pitfall. [Sources](https://geminicli.com/docs/hooks/reference/#global-hook-mechanics), [overview](https://geminicli.com/docs/hooks/#strict-json-requirements-the-golden-rule)

**Environment:** `GEMINI_PROJECT_DIR`, `GEMINI_PLANS_DIR`, `GEMINI_SESSION_ID`, `GEMINI_CWD`, compatibility alias `CLAUDE_PROJECT_DIR`. Extension JSON substitution additionally supports `${extensionPath}`, `${workspacePath}`, `${/}`. [Sources](https://geminicli.com/docs/hooks/#environment-variables), [extension variables](https://geminicli.com/docs/extensions/reference/#variables)

**Scope/order:** overview lists project > user > system > extension hooks; ordinary matching hooks synchronize agent-loop progress, except documented asynchronous/best-effort events. Global total ordering and all multi-hook merge conflict rules: **UNKNOWN**; do not infer them from configuration precedence. Project hook identities fingerprint name/command, not documented script-content hashes. [Sources](https://geminicli.com/docs/hooks/#configuration), [security](https://geminicli.com/docs/hooks/best-practices/#project-hook-security)

## MCP servers

**Status:** shipped/documented; [MCP guide](https://geminicli.com/docs/tools/mcp-server/). Source `main` has additional transport fields beyond the guide.

**Config:** `settings.json` → `mcpServers.<server-name>`; extension manifest `mcpServers`; local-agent frontmatter `mcpServers`. Settings-defined server wins over same-named extension server. Extension MCP configurations support all documented server options **except `trust`**. [Sources](https://geminicli.com/docs/tools/mcp-server/#how-to-set-up-your-mcp-server), [extension reference](https://geminicli.com/docs/extensions/reference/#gemini-extensionjson)

| Server field | Type | Meaning |
|---|---|---|
| `command` | string | Executable for stdio. |
| `args` | string[] | Executable arguments, separately from command. |
| `env` | map<string,string> | Explicit process environment. |
| `cwd` | string | Stdio working directory. |
| `url` | string | Guide: SSE endpoint. Source: optional `type` selects SSE/HTTP; omission auto-detects. |
| `httpUrl` | string | Streamable HTTP endpoint; source marks deprecated in favor of `url` + `type`. |
| `type` | `"sse"|"http"` | Source-level explicit URL transport selector. |
| `tcp` | string | Source constructor labels this “For websocket transport”; exact value syntax/runtime support **UNKNOWN**. |
| `headers` | map<string,string> | HTTP/SSE headers. |
| `timeout` | number | Request milliseconds; default 600000. |
| `trust` | boolean | Bypass tool confirmations; default false; forbidden for extension contributions. |
| `description` | string | Server metadata, present in source. |
| `includeTools` | string[] | Tool allowlist; absent includes all. |
| `excludeTools` | string[] | Tool denylist; overrides inclusion. |
| `oauth` | object | OAuth settings below. |
| `authProviderType` | enum string | `dynamic_discovery`, `google_credentials`, `service_account_impersonation`. |
| `targetAudience` | string | IAP OAuth client ID for impersonation. |
| `targetServiceAccount` | string | Service-account email to impersonate. |
| `extension` | internal object | Runtime provenance in source; not a portable authored server field. |

Sources: [documented properties](https://geminicli.com/docs/tools/mcp-server/#configuration-properties), [`MCPServerConfig`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts).

`envFile`: **Not supported in the inspected server configuration type**; extension `.env` and host dotenv loading are separate mechanisms. [Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts)

| `oauth` field | Type | Meaning |
|---|---|---|
| `enabled` | boolean | Enable OAuth. |
| `clientId`, `clientSecret` | string | Client credentials; ID may be dynamically registered. |
| `authorizationUrl`, `tokenUrl` | string | Explicit endpoints or discovery defaults. |
| `issuer` | string | Expected authorization server issuer, RFC 9207 validation. |
| `authorizationResponseIssParameterSupported` | boolean | Require callback `iss`; discovered, or true with explicit issuer absent metadata. False permits absent `iss`, not mismatched `iss`. |
| `scopes`, `audiences` | string[] | Requested scopes / valid audiences. |
| `redirectUri` | string | Callback override; default loopback random port. |
| `tokenParamName` | string | SSE token query parameter. |
| `registrationUrl` | string | Dynamic-registration endpoint; source-level additional field. |

Sources: [OAuth properties](https://geminicli.com/docs/tools/mcp-server/#oauth-configuration-properties), [`MCPOAuthConfig`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/mcp/oauth-provider.ts).

OAuth discovery follows unauthorized responses; dynamic registration supported. Tokens stored at `~/.gemini/mcp-oauth-tokens.json`, refreshed/validated automatically. Google ADC supports configured scopes; impersonation produces an OIDC ID token. [Source](https://geminicli.com/docs/tools/mcp-server/#oauth-support-for-remote-mcp-servers)

**Global controls:** `mcp.serverCommand:string`; `mcp.allowed:string[]` connection allowlist; `mcp.excluded:string[]` connection denylist. These differ from server-local tool allow/deny lists. [Source](https://geminicli.com/docs/tools/mcp-server/#global-mcp-settings-mcp)

**Expansion:** `$VAR`, `${VAR}` all platforms; `%VAR%` Windows. MCP guide says undefined environment variables become empty strings. Extension-specific `${extensionPath}`, `${workspacePath}`, `${/}` substitutions apply recursively to manifest/hook strings; that hydrator leaves unknown placeholders unchanged. These are distinct expansion stages. [Sources](https://geminicli.com/docs/tools/mcp-server/#environment-variable-expansion), [configuration](https://geminicli.com/docs/reference/configuration/), [hydrator implementation](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/variables.ts)

**Security:** inherited sensitive variables are filtered according to documentation; explicitly configured `env` values are not redacted. Docs disagree about default redaction—see gaps. MCP tools/resources/prompts are discovered; resource `@server://resource/path` fetches and injects resource content. [Source](https://geminicli.com/docs/tools/mcp-server/)

## Other native capability types

**Documented package contribution surfaces:** context, commands, skills, agents, MCP servers, hooks, policies/safety checkers, themes, extension settings, and planning-directory fallback. No documented native extension fields/loaders for LSP servers, output-style packages, app/connectors, monitors, statusline programs, keybindings, or dynamically imported JS/TS plugins. For these facets: **Not supported as documented extension capability types**; absence of internal application features is not asserted. [Sources](https://geminicli.com/docs/extensions/reference/), [manifest interface](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts)

Arbitrary executable files/binaries can be shipped and referenced by MCP/hook commands; this is subprocess execution, not an in-process plugin-module API. [Sources](https://geminicli.com/docs/extensions/reference/), [release archives](https://geminicli.com/docs/extensions/releasing/#custom-pre-built-archives)

**Themes:** manifest `themes: object[]`; host `ui.customThemes: map<string,object>` or `ui.theme:string` selecting name/JSON path. Extension theme display/selection uses `theme-name (extension-name)`. [Sources](https://geminicli.com/docs/extensions/reference/#themes), [theme documentation](https://geminicli.com/docs/cli/themes/) updated 2026-04-10.

| Theme key | Type | Meaning |
|---|---|---|
| `name` | string | Theme identifier; documented required. |
| `type` | literal `custom` | Documented required. |
| `text.primary`, `.secondary`, `.link`, `.accent`, `.response` | string | Main/secondary/link/accent/model-response colors. |
| `background.primary` | string | Background. |
| `background.diff.added`, `.removed` | string | Diff backgrounds. |
| `border.default`, `.focused` | string | Documented border colors; source renderer does not consume `.focused` in inspected implementation. |
| `status.success`, `.warning`, `.error` | string | Status colors. |
| `ui.comment`, `.symbol` | string | Comment/symbol colors. |
| `ui.gradient` | string[] | Gradient palette. |
| `ui.active`, `.focus` | string | Additional renderer-consumed UI colors visible in source. |

Colors accept hex/CSS names. Source also consumes legacy flat string fields `Background`, `Foreground`, `LightBlue`, `AccentBlue`, `AccentPurple`, `AccentCyan`, `AccentGreen`, `AccentYellow`, `AccentRed`, `DiffAdded`, `DiffRemoved`, `Comment`, `Gray`, `DarkGray`, and `GradientColors:string[]`. Nested fields generally supersede legacy counterparts; exact mapping is not uniformly one-to-one. [Sources](https://geminicli.com/docs/cli/themes/#custom-color-themes), [`createCustomTheme`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/themes/theme.ts)

**Planning:** manifest `plan.directory:string` is fallback when host planning directory is unset; extension does not override user-selected directory. [Source](https://geminicli.com/docs/extensions/reference/#gemini-extensionjson)

**Models/providers:** agents select models; hooks can modify model requests. Arbitrary provider/model registration by extension: **Not supported in documented manifest**. Host `modelConfigs` is separate application configuration. [Sources](https://geminicli.com/docs/core/subagents/), [hooks reference](https://geminicli.com/docs/hooks/reference/), [manifest](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts)

## Permissions, trust and security

**Packages can contribute permission policies**, unlike a model where plugin files are purely declarative suggestions. Extension-root `policies/*.toml` loads automatically when activated; manifest `excludeTools` restricts model tool visibility, including forms such as `run_shell_command(rm -rf)`. Extensions cannot grant MCP `trust`. [Source](https://geminicli.com/docs/extensions/reference/#policy-engine)

**Policy fields**, based on loader schema:

| `[[rule]]` key | Type | Meaning |
|---|---|---|
| `toolName` | string or string[], required in source | Tool matcher, supporting wildcards. |
| `subagent` | string | Restrict caller agent. |
| `mcpName` | string | MCP server matcher. |
| `argsPattern` | string | Regex on stable serialized arguments. |
| `commandPrefix` | string or string[] | Shell-command prefix matcher. |
| `commandRegex` | string | Shell-command regex shorthand. |
| `decision` | `"allow"|"deny"|"ask_user"` | Auto-execute, block, or confirm; headless ask means deny. |
| `priority` | integer 0–999, required | Within-tier order; higher wins. |
| `modes` | string[] | `default`, `autoEdit`, `plan`, `yolo`; omitted/empty applies all. |
| `interactive` | boolean | Match interactive/headless execution. |
| `toolAnnotations` | map<string,any> | Required matching tool annotations. |
| `allowRedirection` | boolean | Permit shell redirection. |
| `allow_redirection` | boolean | Deprecated compatibility alias. |
| `denyMessage` | string | User/model denial explanation. |
| `deny_message` | string | Deprecated compatibility alias. |

`commandPrefix`/`commandRegex` require exactly `toolName="run_shell_command"` and cannot combine with each other or `argsPattern`. Source does not expose `name`, `description`, or `action` as rule-schema fields despite conflicting subagent examples. [Sources](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/policy/toml-loader.ts), [policy reference](https://geminicli.com/docs/reference/policy-engine/)

`[[safety_checker]]`: `toolName:string|string[]` required; optional `mcpName:string`, `argsPattern:string`, `commandPrefix:string|string[]`, `commandRegex:string`, `priority:integer` default 0, `modes:string[]`, `toolAnnotations:object`; required `checker` union:
- `type:"in-process"`, `name:InProcessCheckerType`;
- `type:"external"`, `name:string`;
- both optionally `required_context:string[]`, `config:map<string,unknown>`.

Complete in-process checker enum and external execution/response contract: **UNKNOWN in this inventory**. `allowed-path` is an officially demonstrated checker name. [Sources](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/policy/toml-loader.ts), [extension policy example](https://geminicli.com/docs/extensions/reference/#policy-engine)

**Tiers:** source mapping is default 1, extension 2, workspace 3, user 4, admin 5; final priority `tier + priority/1000`. Workspace policy loading is documented disabled. Documentation contains contradictory older numeric examples. User policies `~/.gemini/policies/*.toml`; administrator policies Linux `/etc/gemini-cli/policies`, macOS `/Library/Application Support/GeminiCli/policies`, Windows `C:\ProgramData\gemini-cli\policies`. Supplemental `--admin-policy`/`adminPolicyPaths` ignored if standard admin location contains policies. System-directory ownership/ACL checks can cause unsafe admin directories to be ignored. [Sources](https://geminicli.com/docs/reference/policy-engine/), [tier implementation](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/policy/toml-loader.ts)

**Install consent:** extension installation normally prompts about security risks; `--consent` skips confirmation. Skills additionally have activation consent granting directory access. Signature verification, mandatory package signing, provenance attestations, and cryptographic publisher trust: **UNKNOWN/not documented**. [Sources](https://geminicli.com/docs/extensions/reference/#install-an-extension), [skills](https://geminicli.com/docs/cli/skills/)

**Workspace trust:** `security.folderTrust.enabled:boolean`, default false in trust guide. Decisions stored in `~/.gemini/trustedFolders.json`, override path `GEMINI_CLI_TRUSTED_FOLDERS_PATH`. Untrusted mode ignores workspace settings/dotenv, restricts extension management, disables MCP connections/custom commands and tool auto-acceptance. Headless untrusted startup throws `FatalUntrustedWorkspaceError`; `--skip-trust` or `GEMINI_CLI_TRUST_WORKSPACE=true` bypasses for session. IDE trust signal outranks local trust file. [Source](https://geminicli.com/docs/cli/trusted-folders/) updated 2026-04-23.

**Enterprise controls:** `security.blockGitExtensions:boolean`; `security.allowedExtensions:string[]` regex allowlist, when nonempty overrides Git-block setting. System settings override other settings files. Package-required-install enforcement: **UNKNOWN**. [Source](https://geminicli.com/docs/reference/configuration/)

**Sandbox:** host sandbox configuration exists; inspected source lists `docker`, `podman`, `sandbox-exec`, `runsc`, `lxc`, `windows-native`, plus `enabled:boolean`, `allowedPaths:string[]`, `includeDirectories:string[]`, `networkAccess:boolean`, `image:string`. These are host configuration, not manifest fields. Hooks are documented running with user privileges; sandbox coverage of every hook/extension subprocess is **UNKNOWN**. [Sources](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts), [hook risks](https://geminicli.com/docs/hooks/best-practices/#risks)

## Packaging, install and scopes

**Status:** shipped extension packaging/management; several related settings remain explicitly `experimental`. [Extension reference](https://geminicli.com/docs/extensions/reference/) updated 2026-05-14; [release guide](https://geminicli.com/docs/extensions/releasing/) updated 2026-05-08.

**Required root:** `gemini-extension.json`; optional `GEMINI.md`, `commands/`, `skills/`, `agents/`, `hooks/hooks.json`, `policies/*.toml`, and referenced executables/resources. Manifest must be at absolute repository/archive root for gallery discovery. [Sources](https://geminicli.com/docs/extensions/reference/), [releasing](https://geminicli.com/docs/extensions/releasing/)

| Manifest field | Type | Meaning |
|---|---|---|
| `name` | string, required | Unique lowercase/digit/dash identity; expected to match install directory. |
| `version` | string, required | Displayed version; local-update comparison. |
| `description` | string, documented | Gallery description; absent from inspected `ExtensionConfig` interface. |
| `mcpServers` | map<string,server config> | Server contributions, excluding `trust`. |
| `contextFileName` | string or string[] | Extension context files; default `GEMINI.md`. Array variant is source-confirmed. |
| `excludeTools` | string[] | Exclude model tools/command-specific forms. |
| `settings` | object[] | Install-time settings requests. |
| `themes` | object[] | Custom theme contributions. |
| `plan` | object | Planning fallback configuration. |
| `plan.directory` | string | Planning-artifact directory. |
| `migratedTo` | string | New source repository URL; updater can migrate installation/settings. |

Sources: [manifest documentation](https://geminicli.com/docs/extensions/reference/#gemini-extensionjson), [source interface](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts).

No documented `dependencies`, transitive imports, `engines`, package permissions block, arbitrary capability-directory overrides, license/author/homepage schemas, or install-script fields in this manifest. Preserve unknown keys; do not assume CLI interprets them. [Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts)

| `settings[]` field | Type | Meaning |
|---|---|---|
| `name` | string, required in source | Display name, accepted setting lookup key. |
| `description` | string, required in source | User prompt explanation. |
| `envVar` | string, required | Requested environment name; also accepted lookup key. |
| `sensitive` | boolean, optional | Default false; secret goes to OS keychain, UI obscured. |

No typed choices/default/required-validation schema is documented. Nonsecret user settings reside in extension `.env`; workspace settings use **`<workspace>/.env`**, not extension-specific project files. Workspace values override user values; sensitive keychain namespace incorporates extension name/ID and workspace scope. Initial installation prompts use user scope. [Sources](https://geminicli.com/docs/extensions/reference/#extension-settings), [`extensionSettings.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/extensionSettings.ts)

**Installation sources/mechanics:**
- Git repository/GitHub URL; `--ref` branch, tag, commit.
- Local path, copied on install.
- Local development `gemini extensions link <path>` links into extension discovery.
- GitHub Releases with `.tar.gz`/`.zip` assets; root manifest required; platform selection uses `{platform}.{arch}.{name}.{extension}`, then platform-only, then generic asset.
- npm package source or arbitrary direct ZIP URL installation: **UNKNOWN/not documented**. `npx` inside MCP `command` is not npm extension installation.  
[Sources](https://geminicli.com/docs/extensions/reference/#manage-extensions), [releasing](https://geminicli.com/docs/extensions/releasing/)

**Commands:** `install <source> [--ref ...] [--auto-update] [--pre-release] [--consent] [--skip-settings]`; `uninstall <names>`; `enable|disable <name> --scope user|workspace`; `update <name>|--all`; `config <name> [setting] [--scope ...]`; `new <path> [template]`; `link <path>`. Management changes traditionally require session restart; experimental reloading exists separately. [Sources](https://geminicli.com/docs/extensions/reference/), [configuration](https://geminicli.com/docs/reference/configuration/)

**On-disk state:**

| Path | Schema/meaning |
|---|---|
| `~/.gemini/extensions/<name>/` | Installed payload directory. |
| `<extension>/.gemini-extension-install.json` | Install source/update metadata below. |
| `~/.gemini/extensions/extension-enablement.json` | `{ "<name>": { "overrides": string[] } }`. |
| `<extension>/.env` | Nonsecret user-scope requested settings. |
| `<workspace>/.env` | Workspace-scope settings. |
| OS keychain | Sensitive settings. |
| OS temp `gemini-extension*` | Temporary installation staging directories. |

Sources: [`ExtensionStorage`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/storage.ts), [filenames](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/variables.ts), [enablement](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/extensionEnablement.ts), [settings](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/extensionSettings.ts).

Install metadata fields: `source:string`; `type:"git"|"local"|"link"|"github-release"`; optional `releaseTag:string`, `ref:string`, `autoUpdate:boolean`, `allowPreRelease:boolean`. [Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts)

Enablement defaults true. Override strings use `!` to disable, trailing `*` to include descendants, and ordered path matching: **last matching rule wins**. Explicit CLI selected-extension list overrides stored rules; `-e none` disables all. This is not an `enabledPlugins` settings map. Workspace enablement is stored in the central enablement file, not necessarily project settings. [Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/extensionEnablement.ts)

**Scopes:** install payload is user-level; enablement and settings support user/workspace behavior. Separate project-local installed extension directory, org install scope, lockfile, or dependency resolver: **UNKNOWN/not documented**. [Sources](https://geminicli.com/docs/extensions/reference/), [storage implementation](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extensions/storage.ts)

**General settings precedence:** system defaults → user → project → system overrides; environment/flags participate in broader configuration precedence. Files: Linux `/etc/gemini-cli/{system-defaults,settings}.json`, macOS `/Library/Application Support/GeminiCli/...`, Windows `C:\ProgramData\gemini-cli\...`; user `~/.gemini/settings.json`; project `.gemini/settings.json`. System path overrides: `GEMINI_CLI_SYSTEM_DEFAULTS_PATH`, `GEMINI_CLI_SYSTEM_SETTINGS_PATH`. [Source](https://geminicli.com/docs/reference/configuration/)

**Updates:** Git compares remote hash via `git ls-remote`; GitHub Releases compare latest release tag, not manifest version; local copies compare manifest version. `--pre-release` changes release selection. Keep release tag/manifest version aligned for display consistency. `migratedTo` moves tracking source and settings. Immutable SHA pin behavior after migration: **UNKNOWN**. [Source](https://geminicli.com/docs/extensions/releasing/#how-updates-work)

**Catalog:** official gallery automatically crawls public GitHub repositories tagged `gemini-cli-extension`, daily, validating root manifests. Host settings include `experimental.extensionRegistry:boolean`, `experimental.extensionRegistryURI:string` default `https://geminicli.com/extensions.json`; registry URI can be web URL/local file. Complete catalog record schema: **UNKNOWN/not inspected**. No Claude-style marketplace manifest schema is documented in these inspected extension pages. [Sources](https://geminicli.com/docs/extensions/releasing/#list-your-extension-in-the-gallery), [configuration](https://geminicli.com/docs/reference/configuration/)

Experimental settings also include `experimental.extensionManagement`, `.extensionConfig`, `.extensionReloading`; do not interpret their names alone as proof the entire extension subsystem is unshipped. [Source](https://geminicli.com/docs/reference/configuration/)

## Notable gaps and ambiguities

- **Version boundary:** this inventory combines live official docs with upstream `main` inspected 2026-10-01. No release tag/commit was successfully pinned. Source-only additions—especially MCP `type`, `tcp`, OAuth `registrationUrl`, and legacy theme fields—are **implemented/source-present**, but released-version availability is **UNKNOWN**.
- **Manifest divergence:** docs expose `description`; source `ExtensionConfig` omits it. Source permits `contextFileName:string[]`; prose largely describes a single filename. [Sources](https://geminicli.com/docs/extensions/reference/), [interface](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts)
- **Transport divergence:** docs describe `url` as SSE; source adds HTTP/SSE selection and deprecates `httpUrl`. `tcp`'s documented source comment does not establish a complete websocket configuration contract. [Sources](https://geminicli.com/docs/tools/mcp-server/), [source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts)
- **Policy docs contain stale examples:** numeric tiers conflict internally; extension reference equates extension/workspace tier, while source maps them separately. Agent docs use `[[rules]]`, `action`, and metadata fields in one example; loader expects `[[rule]]`, `decision`, required `toolName`/`priority`. Reference permits MCP-only rules, but inspected loader requires `toolName`. [Sources](https://geminicli.com/docs/extensions/reference/#policy-engine), [subagents](https://geminicli.com/docs/core/subagents/#subagent-specific-policies), [policy reference](https://geminicli.com/docs/reference/policy-engine/), [loader](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/policy/toml-loader.ts)
- **Security defaults conflict:** extension/MCP docs describe automatic sensitive-environment filtering; hook best practices explicitly say redaction defaults OFF. Default behavior per execution surface/release needs source-level tracing before a security guarantee. [Sources](https://geminicli.com/docs/extensions/reference/#environment-variable-sanitization), [MCP guide](https://geminicli.com/docs/tools/mcp-server/#security-and-environment-sanitization), [hook guidance](https://geminicli.com/docs/hooks/best-practices/#sanitize-environment)
- **Precedence conflict:** hook overview ranks project above system; general settings reference says system settings override all other settings. Exact hook merge/override behavior needs runtime/source verification. [Sources](https://geminicli.com/docs/hooks/#configuration), [configuration](https://geminicli.com/docs/reference/configuration/)
- **Unresolved schemas:** complete stable model hook payloads, MCP hook context, all safety-checker enums/external contracts, catalog schema, duplicate-agent precedence, import recursion/cycle limits, and exhaustive auxiliary install/cache files remain **UNKNOWN**.
- **Round trips:** Gemini's skill loader discards uninterpreted frontmatter from its runtime model; source manifest types do not enumerate all documented metadata. ACF cannot achieve same-format losslessness by reconstructing from runtime definitions alone: retain original documents, unknown fields, resource trees, and target-specific policy/theme/auth structures. [Sources](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/skills/skillLoader.ts), [manifest interface](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/extension.ts)
