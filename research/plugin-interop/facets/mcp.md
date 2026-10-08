# MCP servers - cross-tool facet (snapshot 2026-10-01)

Facet scope: MCP server configuration files and every server field (command, args, env, cwd, envFile, url, headers, transport type, auth/OAuth, timeouts, enabled/disabled tools, trust), variable-expansion syntax including plugin-root variables, scopes and precedence.

Inputs: the fifteen inventories in [`../tools/`](../tools/) (each cites its sources; cells below inherit those citations unless marked otherwise), plus the current ACF contract: `SPEC.md` §6.4, §7, §13.6.3, §13a, §14.3-14.4, §15, §17.6, §22.5; `packages/core/src/types/model.ts:203-229`; `packages/core/src/schemas/index.ts:185-227`; `packages/core/src/targets/extensions.ts:61-76`; `packages/core/src/targets/registry.ts`; `packages/adapters/src/common/emitter.ts:298-317,604-652`; `packages/adapters/src/common/placeholders.ts`.

Re-verified for this facet on 2026-10-01 (beyond the inventories):

- Claude Code MCP page ([code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)): an entry with no `type` is read as stdio, and a `url` entry without `type` is **skipped** with an error; env expansion `${VAR}`/`${VAR:-default}` applies to `command`, `args`, `env`, `url`, `headers`; per-server `timeout` is the tool-execution timeout in ms; `alwaysLoad` applies to all server types; precedence is managed > local > project > user > plugin > claude.ai connectors, whole-entry (no field merge); plugins and connectors deduplicate against higher scopes **by endpoint (URL or command), not by name**. No `cwd` or `envFile` field appears on the page.
- Claude plugin reference ([plugins-reference](https://code.claude.com/docs/en/plugins-reference), via the 2026-10-01 Internet Archive snapshot): `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}` resolve in stdio `command`, `args`, `env` and in remote `url`, `headers`, `headersHelper`; stdio processes receive `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`; `headersHelper` rejects `${user_config.*}`.
- Cursor plugin reference ([cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins)): "Cursor does not expand the standard's `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` variables in `mcp.json`"; it expands `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in `command`, `args`, `env` values and `cwd`.
- OpenCode MCP docs ([opencode.ai/docs/mcp-servers](https://opencode.ai/docs/mcp-servers/)): `timeout` is "Timeout in ms for fetching tools from the MCP server", default 5000. This resolves the inventory's schema-vs-docs ambiguity toward a startup/discovery timeout.
- Codex config reference ([learn.chatgpt.com/docs/config-file/config-reference](https://learn.chatgpt.com/docs/config-file/config-reference)): keys `startup_timeout_sec` (default 10 s), `startup_timeout_ms` (alias), `tool_timeout_sec` (default 60 s), `enabled_tools`, `disabled_tools` ("deny list applied after `enabled_tools`"), `env_vars`, `env_http_headers`, `http_headers_helper`, `default_tools_approval_mode` with enum `auto|prompt|writes|approve`. The page does **not** define the four approval values.
- Pi: Pi core has no MCP (inventory). The MCP the user actually runs in Pi is the extension `pi-mcp-adapter`, local fork `~/.pi/agent/git/github.com/barisgit/pi-mcp-adapter` at commit `8c918b8` (2026-09-25). Read from source: `types.ts:278-329` (server fields), `config.ts:196-258` (sources and merge), `server-manager.ts:117-143,480-501` and `utils.ts:62-87` (transport choice and expansion). This is evidence for one extension, not a Pi contract.

Cell legend used throughout: **N**(spelling) native; **T**(how) translated losslessly by the writer; **D**(how; diagnostic) declared degradation; **U** unsupported (handling follows the field's degradation class in §2.4); **?** unknown or unverified (treated as U until verified).

---

## 1. Concept map

### 1.1 Shared meanings and their spellings

Only concepts present in at least two tools with the same meaning are listed here. Tool-only concepts are listed in §1.2 and land in per-target extras (§5).

| # | Concept (one meaning) | Spellings by tool |
|---|---|---|
| C1 | **Server map container** | Claude `mcpServers` in `.mcp.json` / `~/.claude.json` / plugin `.mcp.json` or manifest `mcpServers`; Agent Plugins (AP) root `mcp.json` `{$schema, mcpServers}`; Codex TOML `[mcp_servers.<name>]`; Copilot `mcpServers` (workspace files also accept a bare map); VS Code `servers` (+ file-level `inputs`, `sandbox`); Cursor `mcpServers`; Gemini `mcpServers` (settings, extension manifest, agent frontmatter); OpenCode `mcp`; Amp `amp.mcpServers`, skill `mcp.json` bare map, skill frontmatter `mcpServers`; Windsurf Cascade / Devin Local `mcpServers`; Cline / Roo `mcpServers`; Goose `extensions`; Kiro `mcpServers`; Lume `mcp`; pi-mcp-adapter `mcpServers` (also `mcp-servers`); MCPB single `server` |
| C2 | **Server identity** (map key) | Map key everywhere; Goose also repeats `name` inside the entry; Lume ids `^[a-z0-9][a-z0-9._-]*$`, max 128 chars, max 32 servers. Plugin-provided names are namespaced by the host: Claude `plugin:<plugin>:<server>` (tools `mcp__plugin_<plugin>_<server>__<tool>`), Cline `<plugin>.<server>`, Goose `<plugin>:<server>`, Kiro `power-<power>-<server>` |
| C3 | **Transport: local subprocess (stdio)** | `type: "stdio"` (Claude, AP, Copilot, VS Code, Cursor, Cline, Roo, Goose), `type: "local"` (Copilot, OpenCode), `transport: "stdio"` (Lume, current ACF); implied by `command` (Codex, Gemini, Amp, Windsurf, Devin, Kiro, pi, Claude when `type` omitted) |
| C4 | **Transport: MCP Streamable HTTP** | `http` (Claude, Copilot, VS Code, Lume, Devin `transport`, Amp `transport`, Gemini source `type`, Kiro examples, current ACF), `streamable-http` (AP, Claude alias, Copilot alias, Roo), `streamableHttp` (Cline), `streamable_http` (Goose, Codex skill metadata), `remote` (OpenCode, transport negotiated), Gemini `httpUrl` (deprecated), implied by `url` (Codex, Windsurf `serverUrl`/`url`, pi) |
| C5 | **Transport: legacy HTTP+SSE (MCP 2024-11-05)** | `sse` (Claude, AP, Copilot, VS Code, Cline, Roo, Lume, Devin/Amp `transport`, current ACF); Gemini `url` without `type` (docs); Goose: unsupported; Codex: unknown |
| C6 | **Executable** | `command` (all stdio-capable tools; OpenCode `command` is an array `[exe, ...args]`); Goose `cmd`; MCPB `mcp_config.command` |
| C7 | **Arguments** (argv vector, never shell-parsed) | `args` everywhere; OpenCode folds into `command[1..]` |
| C8 | **Process environment overlay** | `env` (most); OpenCode `environment`; Goose `envs` (alias `env`) |
| C9 | **Forward a host env var by name** | Codex `env_vars`, Goose `env_keys`, and every tool that expands env references inside `env` values (`{X: "${X}"}` style). Canonically this is an env value that is a single env reference (§2.3), not a separate field |
| C10 | **Working directory** | `cwd` (AP, Codex, Copilot, VS Code, Cursor plugin, Gemini, OpenCode, Cline, Roo, Goose, Lume, pi, Goose/Devin/Kiro AP lanes). Defaults differ (see conflict X3) |
| C11 | **Dotenv file for the process** | `envFile` (VS Code, Cursor stdio; VS Code also reports it for Claude-format plugins) |
| C12 | **Remote endpoint** | `url` (most); Windsurf `serverUrl` or `url`; Goose `uri`; Gemini `url`/`httpUrl` |
| C13 | **HTTP over a Unix domain socket** | VS Code `url: unix:///path.sock`, Goose `socket` |
| C14 | **Static request headers** | `headers` (most); Codex `http_headers` |
| C15 | **Header value from a host env var** | Codex `env_http_headers` (header -> var name), `bearer_token_env_var` (Authorization: Bearer), pi `bearerTokenEnv`; in all expansion-capable tools via an env reference inside `headers` |
| C16 | **Dynamic headers helper** (command printing JSON headers at connect time) | Claude `headersHelper` (shell string), Codex `http_headers_helper` (string command) |
| C17 | **Disable OAuth for this server** | OpenCode `oauth: false`, pi `oauth: false` / `auth: false`, Gemini `oauth.enabled: false` |
| C18 | **Pre-registered OAuth client id** | Claude/VS Code/Gemini/OpenCode/Amp/Kiro/Lume/pi `oauth.clientId`; Codex `oauth.client_id`; Copilot/Devin `oauthClientId`; Cursor `auth.CLIENT_ID`; Goose `client_id`; Cline SDK `oauthClient.clientId` |
| C19 | **Confidential-client secret** | Gemini/OpenCode/Amp/Kiro/pi `oauth.clientSecret`; Cursor `auth.CLIENT_SECRET`; Devin `oauthClientSecret`; Goose `client_secret_key` (secret-store key, not inline); Cline SDK `oauthClient.clientSecret`. Claude and Copilot keep secrets in the OS credential store via CLI |
| C20 | **Requested OAuth scopes** | array: Codex `scopes`, Copilot `oauthScopes`, Cursor `auth.scopes`, Gemini/Amp `oauth.scopes`, Goose `scopes`, Kiro `oauth.oauthScopes` / top-level `oauthScopes`; space-separated string: Claude `oauth.scopes`, OpenCode/Lume/pi `oauth.scope` |
| C21 | **OAuth redirect URI** | Gemini/OpenCode/Kiro `oauth.redirectUri`, Amp/Lume `oauth.redirectUrl`, Codex `oauth.callback_url` |
| C22 | **OAuth loopback callback port** | Claude `oauth.callbackPort`, Codex `oauth.callback_port`, OpenCode `oauth.callbackPort` (ignored when redirectUri set) |
| C23 | **RFC 8707 resource indicator** | Codex `oauth_resource`, Devin `oauthResource` |
| C24 | **Explicit authorization and token endpoints** | Gemini `oauth.authorizationUrl`/`tokenUrl`, Amp `oauth.authUrl`/`tokenUrl` (both required when `oauth` present), Lume `oauth.authorizationUrl`/`tokenUrl` (required) |
| C25 | **OAuth grant type** | Copilot `oauthGrantType`, pi `oauth.grantType`: `authorization_code` (default) or `client_credentials` |
| C26 | **Startup / connection / tool-listing timeout** | Codex `startup_timeout_sec`/`_ms`, Kiro `timeout` (ms, handshake), OpenCode `timeout` (ms, tool fetch), Copilot `timeout` (ms, discovery and calls) |
| C27 | **Per-call (tool execution) timeout** | Claude `timeout` (ms, >= 1000), Codex `tool_timeout_sec`, Gemini `timeout` (ms), Kiro `requestTimeout` (ms), Copilot `timeout` (shared with C26), Roo `timeout` (s, 1-3600), Cline `timeout` (s, meaning unverified), Goose `timeout` (s) |
| C28 | **Server enabled without deleting config** | `enabled` (Codex, OpenCode, Goose); `disabled` inverted (Cline, Roo, Kiro, Devin); separate state in Claude (`disabledMcpServers`), Copilot (`disabledMcpServers`), VS Code and Cursor (persisted UI state) |
| C29 | **Tool allowlist** (only these tools are exposed) | Codex `enabled_tools`, Copilot `tools` (`"*"` = all), Gemini `includeTools`, Goose `available_tools` (empty = all), Amp skill `includeTools` (names/globs) |
| C30 | **Tool denylist** (these tools are hidden; wins over allowlist) | Codex `disabled_tools`, Gemini `excludeTools`, Windsurf Cascade/Roo/Kiro `disabledTools`, pi `excludeTools` |
| C31 | **Tools that run without an approval prompt** | Cline `autoApprove`, Kiro `autoApprove` (`"*"` = all), Roo `alwaysAllow`, Gemini `trust: true` (all tools), Codex `tools.<t>.approval_mode` / `default_tools_approval_mode` (enum semantics unverified); outside the entry: Claude/Devin `permissions.allow` `mcp__s__t`, OpenCode `permission`, Cursor `mcpAllowlist` `server:tool`, Copilot permission `mcp` rules |
| C32 | **Load all tools eagerly instead of deferred tool search** | Claude `alwaysLoad: true`, Copilot `deferTools: "never"`, pi `directTools: true` |
| C33 | **Promote selected tools' schemas into the gateway/proxy description** | Lume `promotedTools`, pi `promotedTools` |
| C34 | **Restart server when watched files change** | VS Code `dev.watch` (globs), Roo `watchPaths` (paths) |
| C35 | **Description** | Gemini/Goose/Lume (model-facing, 1-200 chars)/pi `description`; current ACF `description` |
| C36 | **Package-root path variable** | Claude/Cursor/Devin `${CLAUDE_PLUGIN_ROOT}`; AP/Devin/Goose `${PLUGIN_ROOT}`; Cursor `${CURSOR_PLUGIN_ROOT}`; Gemini `${extensionPath}`; MCPB `${__dirname}`; ACF `${ACF_CAPABILITY_DIR}` / `${ACF_PACKAGE_DIR}` |
| C37 | **Package persistent-data variable** | Claude `${CLAUDE_PLUGIN_DATA}`; AP/Devin(AP layout)/Copilot `${PLUGIN_DATA}` (Copilot also accepts `${CLAUDE_PLUGIN_DATA}`, `${COPILOT_PLUGIN_DATA}`) |
| C38 | **Project/workspace root variable** | Claude `${CLAUDE_PROJECT_DIR}`; VS Code/Cursor/Roo `${workspaceFolder}`; Gemini extension `${workspacePath}` |
| C39 | **Host environment reference** | `${VAR}` (Claude, Copilot, Gemini, Amp, Kiro, pi), `$VAR` (Copilot, Gemini), `${env:VAR}` (Cursor, VS Code, Windsurf, Devin, Cline, Roo), `$env:VAR` (pi), `{env:VAR}` (OpenCode), `%VAR%` (Gemini on Windows), `env://VAR` whole-value (Lume) |
| C40 | **Host env reference with default** | `${VAR:-default}` (Claude, Copilot) |
| C41 | **File-content reference** | `${file:/path}` (Windsurf, Devin; trimmed), `{file:path}` (OpenCode), `file:///abs` whole-value (Lume; trimmed) |
| C42 | **Package-declared user option reference** | Claude `${user_config.KEY}`, MCPB `${user_config.KEY}`, VS Code `${input:id}` (+ `inputs[]`), Cursor plugin declared `${VAR}` variables |

### 1.2 Tool-only concepts (no second tool with the same meaning)

Claude `type: "ws"`, `bareElicitationCapability`, `oauth.authServerMetadataUrl`; Codex `required`, `experimental_environment`, `env_vars[].source`, `auth: "chatgpt"`, `tools.<t>.output_token_limit`, the four-value approval enum beyond the C31 mapping; Copilot `disableToolCache`, `slowConnectionThresholdMs`, `filterMapping`, `oauthPublicClient`, `oidc`, `deferTools: "auto"`; VS Code `sandboxEnabled`, file-level `sandbox`, `dev.debug`, `oauth.enterpriseManaged`, `pipe:///` URLs, env values typed number/null; Gemini `trust` on a subset (it is all-or-nothing), `authProviderType`, `targetAudience`, `targetServiceAccount`, `oauth.issuer`, `oauth.authorizationResponseIssParameterSupported`, `oauth.audiences`, `oauth.tokenParamName`, `oauth.registrationUrl`, `tcp` (websocket, unverified); Amp `transport: "http-first"`, `${amp:id-token}`; Kiro `oauth.clientMetadataUrl`, `type: "registry"`; Goose `bundled`, `display_name`, `builtin`/`platform` types, `env_keys` secret-store fallback; Cline `remoteConfigured`, `metadata`, persisted `oauth` state, `transportType`, nested `transport` object form; pi-mcp-adapter `lifecycle`, `idleTimeout`, `exposeResources`, `directTools: string[]`, `toolOverrides`, `debug`, `auth: "bearer"` + `bearerToken`; MCPB `platform_overrides`, `server.type`, `entry_point`, `${HOME}`/`${DESKTOP}`/`${DOCUMENTS}`/`${DOWNLOADS}`/`${pathSeparator}`.

Agent Skills and AGENTS.md define no MCP configuration (a Markdown mention is not a registration).

---

## 2. Proposed canonical ACF core

The core stays in `mcp/mcp.yml` `servers[]` (existing location and entry shape, §13a). Every field below has exactly one meaning; every field is backed by at least two tools (column "Origin"). Field names are camelCase like the rest of ACF YAML.

### 2.1 Shape

```yaml
# illustrative
servers:
  - name: search                 # slug
    description: Company doc search
    transport: http              # stdio | http | sse
    url: https://mcp.example.com/search
    headers:
      Authorization: "Bearer ${env:SEARCH_TOKEN}"
    oauth: false                 # or an object, see 2.2
    timeouts: { startupMs: 15000, toolMs: 120000 }
    tools:
      enabled: [search, fetch]   # allowlist, non-empty
      disabled: [delete]         # denylist, wins over enabled
      autoApprove: [search]      # consumer-gated, see X8
      alwaysLoad: false
      promoted: [search]
    enabled: true
    only: [claude, codex]
    targets:
      claude: { bareElicitationCapability: true }   # raw native extras (§5)
```

### 2.2 Field table

Classes (drive degradation, §2.4): **def** = server definition (package-owned); **policy** = consumer policy that some hosts keep inside the entry and others in separate settings; **hint** = presentation/lifecycle hint.

| Canonical field | Type | Meaning | Class | Origin (>= 2 tools) | Validation |
|---|---|---|---|---|---|
| `name` | slug | Server identity within the capability; writers derive native names (§3 row `name`). | def | all (C2) | ACF slug (already compatible with Lume's id regex); unique per capability (§5.4) and per `(mcp, name)` after resolution (§17.6) |
| `description` | string | Human/model-facing summary of the server. | hint | Gemini, Goose, Lume, pi, current ACF (C35) | <= 200 chars recommended (Lume hard limit; longer -> Lume D) |
| `transport` | enum `stdio` \| `http` \| `sse` | `stdio`: local subprocess speaking MCP over stdin/stdout. `http`: MCP **Streamable HTTP**; whether a host falls back to SSE is host behavior, not canonical. `sse`: deprecated HTTP+SSE transport of MCP 2024-11-05 (not Streamable HTTP's SSE response mode). | def | C3-C5 | Required and explicit (no inference). Spelling `http` kept for backward compatibility |
| `command` | string | One executable token: bare name (host PATH lookup), package-relative path `${ACF_CAPABILITY_DIR}/...`, or absolute path. Never a shell string. | def (stdio) | C6 | Required for stdio; forbidden otherwise; non-empty; no whitespace-split semantics. Absolute paths -> `acf.mcp.non-portable-path` warning |
| `args` | template[] | argv elements after `command`. | def (stdio) | C7 | stdio only |
| `env` | map<envName, template> | Overlay on the host-chosen base environment. A value that is exactly `${env:NAME}` means "forward host var NAME" (C9). | def (stdio) | C8, C9 | stdio only; names non-empty, no `=`/NUL; reserved names `PLUGIN_ROOT`, `PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR` rejected |
| `cwd` | template | Process working directory. Must start with `${ACF_CAPABILITY_DIR}`, `${ACF_DATA_DIR}`, `${ACF_PROJECT_DIR}`, or `./` (= capability root). Omitted = host default (differs per host, X3). | def (stdio) | C10 | stdio only; containment check for capability/data roots (AP §4.1 parity) |
| `envFile` | template (path) | Dotenv file loaded into the process environment by the host at start. | def (stdio) | C11 | stdio only; same root rules as `cwd` |
| `url` | template (URL) | Remote MCP endpoint. | def (http, sse) | C12 | Required for http/sse; forbidden for stdio; `https://` or `http://` on `localhost`/`127.0.0.1`/`[::1]` only (AP, Lume, Kiro parity; replaces the `localDev` flag); no userinfo, no fragment |
| `socket` | template (path) | Connect HTTP over this Unix domain socket; `url` still supplies the request path/authority. | def (http) | C13 | http only; POSIX only |
| `headers` | map<headerName, template> | Request headers sent on every MCP HTTP request. | def (http, sse) | C14, C15 | HTTP token names; case-insensitive duplicate names rejected (AP parity); credential-looking names (`Authorization`, `*-Token`, `*-Key`) with a literal value -> `acf.mcp.secret-literal` warning |
| `headersHelper` | string | Command run at connect time whose stdout is a JSON object of string headers merged into the request headers. | def (http, sse) | C16 | http/sse only. Executed by the host's shell on Claude; Codex execution form unverified (§7) |
| `oauth` | `false` \| object | `false`: never attempt OAuth for this server. Object: OAuth client hints; absent: host default (discovery/DCR where supported). | def (http, sse) | C17-C25 | http/sse only |
| `oauth.clientId` | template | Pre-registered client id (skips dynamic registration). | def | C18 | |
| `oauth.clientSecret` | template, **reference only** | Confidential-client secret. | def | C19 | Must be a single `${env:...}`, `${file:...}` or `${option:...}` reference; literals rejected (`acf.mcp.secret-literal`, error) |
| `oauth.scopes` | string[] | Requested scopes. | def | C20 | Non-empty items without whitespace (RFC 6749 scope tokens), so joining with one space is lossless |
| `oauth.redirectUri` | string | Exact redirect URI registered with the authorization server. | def | C21 | Loopback `http://localhost\|127.0.0.1:PORT/path` recommended; if `callbackPort` is also set, ports must match |
| `oauth.callbackPort` | integer 1-65535 | Loopback port of the host's callback listener (host chooses path). | def | C22 | |
| `oauth.resource` | string (URI) | RFC 8707 resource indicator sent with authorization/token requests. | def | C23 | |
| `oauth.authorizationUrl` | string (URL) | Explicit authorization endpoint (skip metadata discovery). | def | C24 | `https://` |
| `oauth.tokenUrl` | string (URL) | Explicit token endpoint. | def | C24 | `https://` |
| `oauth.grantType` | enum `authorization_code` \| `client_credentials` | OAuth grant. Default `authorization_code`. | def | C25 | `client_credentials` requires `clientId` and `clientSecret` |
| `timeouts.startupMs` | integer ms > 0 | Budget for process start/connect, initialize handshake and initial tool listing. | hint | C26 | |
| `timeouts.toolMs` | integer ms > 0 | Budget for one tool call. | hint | C27 | |
| `enabled` | boolean, default `true` | `false`: ship the definition but do not start/connect until the consumer enables it. | policy | C28 | |
| `tools.enabled` | string[] | Allowlist of MCP tool names (as returned by `tools/list`, unprefixed). Only these are exposed. | policy (restrictive) | C29 | Non-empty when present (X6); exact names, no globs (globs -> Amp extras) |
| `tools.disabled` | string[] | Denylist of tool names; wins over `tools.enabled`. | policy (restrictive) | C30 | Exact names |
| `tools.autoApprove` | string[] | Tools callable without an approval prompt; `["*"]` = all tools. | policy (permissive, consumer-gated, X8) | C31 | Emitted only when the consumer opts in (§4 X8) |
| `tools.alwaysLoad` | boolean | Expose all tool schemas up front instead of deferred tool search. | hint | C32 | |
| `tools.promoted` | string[] | Include these tools' schemas in the gateway/proxy tool description. | hint | C33 | |
| `watch` | string[] (globs, capability-relative) | Restart the server when matching files change (development aid). | hint | C34 | Literal paths are globs without wildcards |
| `only`, `except` | TargetId[] | Entry applicability (unchanged, §6.4). | - | ACF | |
| `targets.<target>` | object, **raw native keys** | Per-target extras emitted verbatim (§5). | - | ACF | Keys must not collide with keys generated from canonical fields (error) |

Core size: 21 server-level fields (counting `oauth` and `timeouts` once each and `tools.*` as five) plus 9 `oauth.*` subfields, 3 transport values, and the 9-form template grammar below. Everything else is per-target extras.

### 2.3 Template grammar (fields typed "template")

Replaces the §13a.4.1 "no env expansion" rule with one canonical syntax that each writer translates **per field** (never by global string replacement).

| Form | Meaning | Origin |
|---|---|---|
| `${ACF_CAPABILITY_DIR}` (alias `${ACF_PACKAGE_DIR}`) | Absolute path of the installed capability root (read-only; changes on update). | C36 + existing ACF |
| `${ACF_DATA_DIR}` | **New.** Absolute, writable, per-installed-capability directory that survives updates. | C37 |
| `${ACF_PROJECT_DIR}` | **New.** Absolute project root of the session (project scope). | C38 |
| `${env:NAME}` | **New.** Host environment variable value at server start. | C39 |
| `${env:NAME:-default}` | **New.** As above, `default` when unset or empty. | C40 |
| `${file:PATH}` | **New.** Trimmed contents of a file; `PATH` is absolute or one of the path placeholders. | C41 |
| `${option:KEY}` | **New.** Value of a capability-declared user option (owned by the settings/userConfig facet, not this one). | C42 |
| `$${` | **New.** Literal `${`. | ACF-only escape |
| `${ACF_HOOK_DIR}` | Existing; for MCP it resolves to the `mcp/` directory. Deprecated for MCP (`acf.mcp.deprecated-placeholder`), kept for compatibility. | existing ACF |

Rules: single pass, non-recursive; unknown `${...}` text is an error (not silently literal) so that authors do not ship strings some host would expand; references are allowed in `command`, `args`, `env` values, `cwd`, `envFile`, `url`, `headers` values, `socket`, `oauth.clientId`, `oauth.clientSecret`. Path placeholders are **not** allowed in `url` and `headers` (no tool shares a meaning for a filesystem path in a URL; AP forbids it).

### 2.4 Degradation classes (how "degraded" and "unsupported" cells behave)

| Class | Fields | When the target cannot represent the field |
|---|---|---|
| Functional | `transport` value, `command`, `cwd`, `envFile`, `url`, `socket`, `headers` with references, `headersHelper`, `oauth.clientSecret`, `oauth.grantType: client_credentials`, any template form | Error `acf.lossy.mcp.<field>`; **the server is not emitted for that target** (it would start but misbehave, or leak a literal `${...}`). Other servers still emit. |
| Restrictive policy | `tools.enabled`, `tools.disabled` | Error; server not emitted (fail closed: dropping a filter broadens exposure). Consumer may override per server in `capabilities.yml` (new knob, §6). |
| Permissive policy | `tools.autoApprove` | Dropped with `info` (fails safe: more prompts). |
| Activation policy | `enabled: false` | Server omitted for that target with `info` (fails safe). |
| OAuth hints | `oauth` object fields other than secret/grant | Dropped with `warning`; host discovery/DCR may still succeed. |
| Hints | `description`, `timeouts.*`, `tools.alwaysLoad`, `tools.promoted`, `watch` | Dropped with `info`. |

---

## 3. Field-level support tables

Rows are canonical fields, enum values and template forms. Two tables because the column set is wide; rows are identical. "Claude" = loose files (`.mcp.json`, `~/.claude.json`); "Claude plugin" = plugin `.mcp.json`. "AP" = Agent Plugins 1.0 `mcp.json`, which is also what Codex, Copilot, VS Code, Kiro powers and Devin/Cline AP lanes read from plugins. "Pi" = pi-mcp-adapter (Pi core: everything U).

### 3.1 Table A - current and planned writer targets

| Canonical | Claude | Claude plugin | AP 1.0 | Codex (`config.toml`) | Copilot CLI | VS Code (`.vscode/mcp.json`) | Cursor (native + Cursor plugin) | OpenCode | Pi (pi-mcp-adapter) |
|---|---|---|---|---|---|---|---|---|---|
| `name` | N(map key) | T(`plugin:<p>:<s>`; tools `mcp__plugin_<p>_<s>__<t>`) | N(map key; host namespaces) | N(`[mcp_servers.<name>]`) | N(map key) | N(`servers` key) | N(map key) | N(`mcp.<name>`) | N(map key) |
| `description` | U | U | U | U | U | U | U | U | N(`description`) |
| `transport: stdio` | N(`type:"stdio"`) | N | N(`type:"stdio"`) | T(implied by `command`) | N(`type:"stdio"`; `local` alias) | N(`type:"stdio"`) | N(`type:"stdio"`) | T(`type:"local"`) | T(implied by `command`) |
| `transport: http` | N(`type:"http"`) | N | T(`type:"streamable-http"`) | T(implied by `url`) | N(`type:"http"`) | N(`type:"http"`; host falls back to SSE) | ?(`url` + inferred or `type`; exact remote spelling unverified) | T(`type:"remote"`; negotiation untraced) | T(implied by `url`; Streamable then SSE fallback) |
| `transport: sse` | N(`type:"sse"`, deprecated) | N | N(`type:"sse"`, optional for clients) | ?(not documented) | N(`type:"sse"`) | N(`type:"sse"`) | ?(supported; selector unverified) | ?(`remote`; SSE support untraced) | D(no selector; adapter tries Streamable first; warning) |
| `command` | N | N(`${CLAUDE_PLUGIN_ROOT}/...`) | T(bare name verbatim; `${ACF_CAPABILITY_DIR}/p` -> `./p`; absolute -> U) | N | N | N | N(plugin: `${CURSOR_PLUGIN_ROOT}/...`) | T(`command[0]`) | N |
| `args` | N | N | N | N | N (required: emit `[]`) | N | N | T(`command[1..]`) | N |
| `env` | N | N | N (reserved keys) | N | N | N | N | T(`environment`) | N |
| `cwd` | D(POSIX wrapper `sh -c 'cd "$1" && shift && exec "$@"'`; not on native Windows; warning) | D(same wrapper) | T(`./x`, `${PLUGIN_ROOT}/x`, `${PLUGIN_DATA}/x`; project-rooted -> U) | N | N | N | N(plugin documented; loose ?) | N(relative to workspace) | N(`~` and env expanded) |
| `envFile` | U | U | U | U | U | N | N(stdio) | U | U |
| `url` | N | N | N(literal only) | N | N | N | N | N | N |
| `socket` | U | U | U | U | U | T(`url: unix:///path`) | U | U | U |
| `headers` (literal) | N | N | N | N(`http_headers`) | N | N | N | N | N |
| `headersHelper` | N(shell; project/local need folder trust) | N | U | N(`http_headers_helper`) | U | U | U | U | U |
| `oauth: false` | U (warning) | U | U | U(`auth` has no "none") | U | U | U | N(`oauth: false`) | N(`oauth: false`) |
| `oauth.clientId` | N(`oauth.clientId`) | N | D(drop; client-managed auth; warning) | N(`oauth.client_id`) | N(`oauthClientId`) | N(`oauth.clientId`) | N(`auth.CLIENT_ID`) | N(`oauth.clientId`) | N(`oauth.clientId`) |
| `oauth.clientSecret` | D(not in config; `claude mcp` CLI keychain; warning) | U | U | U | D(OS store via `/mcp auth`; warning) | U | N(`auth.CLIENT_SECRET`, `${env:}` allowed) | N(`oauth.clientSecret`) | N(`oauth.clientSecret`) |
| `oauth.scopes` | T(`oauth.scopes`, space-joined) | T | U | N(`scopes`) | N(`oauthScopes`, needs client id) | U | N(`auth.scopes`) | T(`oauth.scope`, joined) | T(`oauth.scope`, joined) |
| `oauth.redirectUri` | D(-> `oauth.callbackPort`; path lost; warning) | D | U | N(`oauth.callback_url`) | U | U | U(fixed redirect) | N(`oauth.redirectUri`) | U |
| `oauth.callbackPort` | N(`oauth.callbackPort`) | N | U | N(`oauth.callback_port`) | U | U | U | N(`oauth.callbackPort`) | U |
| `oauth.resource` | U | U | U | N(`oauth_resource`) | U | U | U | U | U |
| `oauth.authorizationUrl`/`tokenUrl` | U (only `authServerMetadataUrl`) | U | U | U | U | U | U | U | U |
| `oauth.grantType` | N for `authorization_code`; U for `client_credentials` | same | U | same as Claude | N(`oauthGrantType`) | same as Claude | same as Claude | same as Claude | N(`oauth.grantType`) |
| `timeouts.startupMs` | U (global `MCP_TIMEOUT` only) | U | U | T(`startup_timeout_ms`) | D(single `timeout`; emit max of both; info) | U | U | T(`timeout`, tool-fetch ms) | U |
| `timeouts.toolMs` | N(`timeout`, >= 1000) | N | U | T(`tool_timeout_sec` = ms/1000) | D(single `timeout`) | U | U | U | U |
| `enabled: false` | D(omit; alt: `disabledMcpServers` in Claude-owned `~/.claude.json`) | D(omit) | D(omit) | N(`enabled`) | D(omit; user `disabledMcpServers`) | D(omit; persisted UI state) | D(omit; UI toggle) | N(`enabled`) | D(omit) |
| `tools.enabled` | U | U | U | N(`enabled_tools`) | N(`tools`; absent -> `["*"]`) | U | U | ?(`tools` map with `"<s>_*": false` then allows; ordering unverified) | U |
| `tools.disabled` | D(loose only: `permissions.deny` `mcp__<s>__<t>`; permission, not visibility; warning) | U (plugins cannot set permissions) | U | N(`disabled_tools`) | U | U | U | T(deprecated `tools["<s>_<t>"]: false` or `permission` deny) | N(`excludeTools`) |
| `tools.autoApprove` | T(loose only: `permissions.allow` `mcp__<s>__<t>`) | U | U | ?(`tools.<t>.approval_mode`; enum meaning unverified) | D(permission `mcp` rules; consumer settings) | U | D(permissions `mcpAllowlist` `server:tool`) | T(`permission["<s>_<t>"]: "allow"`) | U |
| `tools.alwaysLoad` | N(`alwaysLoad`) | N | U | U | T(`deferTools: "never"`) | U | U | U | T(`directTools: true`) |
| `tools.promoted` | U | U | U | U | U | U | U | U | N(`promotedTools`) |
| `watch` | U | U | U | U | U | N(`dev.watch`) | U | U | U |
| `${ACF_CAPABILITY_DIR}` | T(absolute path at emit) | N(`${CLAUDE_PLUGIN_ROOT}` in command/args/env, url/headers) | N(`${PLUGIN_ROOT}` in args, env values, cwd; command via `./`) | T(absolute) | T(absolute; plugin: `${PLUGIN_ROOT}` as AP) | T(absolute) | T(loose: absolute; plugin: `${CURSOR_PLUGIN_ROOT}` in command/args/env/cwd) | T(absolute) | T(absolute) |
| `${ACF_DATA_DIR}` | T(caplet-managed absolute dir) | N(`${CLAUDE_PLUGIN_DATA}`) | N(`${PLUGIN_DATA}` in args, env values, cwd) | T(caplet dir) | T(caplet dir; plugin `${PLUGIN_DATA}`) | T(caplet dir) | T(loose: caplet dir); U in Cursor plugin | T(caplet dir) | T(caplet dir) |
| `${ACF_PROJECT_DIR}` | D(absolute at emit; `${CLAUDE_PROJECT_DIR}` is set only in the server's env, so `.mcp.json` expansion needs `${CLAUDE_PROJECT_DIR:-.}`, which yields `.`; warning) | N(`${CLAUDE_PROJECT_DIR}`) | U | D(absolute at emit; project config only) | D(absolute at emit) | N(`${workspaceFolder}`) | N(`${workspaceFolder}`) | D(`cwd` relative to workspace; elsewhere absolute) | D(absolute at emit) |
| `${env:NAME}` | T(`${NAME}`) | T(`${NAME}`) | U (expansion forbidden) | T(only whole-value: env -> `env_vars`, header -> `env_http_headers`, `Bearer ${env:X}` -> `bearer_token_env_var`; else U) | T(`${NAME}`; env and headers documented, other fields ?) | ?(`${env:NAME}` assumed from VS Code variables) | N(`${env:NAME}`) | T(`{env:NAME}`; unset -> empty) | T(`${NAME}` in env, headers, cwd only; else U) |
| `${env:NAME:-d}` | N(`${NAME:-d}`) | N | U | U | N(`${NAME:-d}`) | U | U | U | U |
| `${file:PATH}` | U | U | U | U | U | U | U | T(`{file:PATH}`; trimming ?) | U |
| `${option:KEY}` | T(install-time literal; sensitive -> U) | N(`${user_config.KEY}`; not in `headersHelper`) | U | T(install-time literal) | T(literal) | T(`inputs[]` + `${input:KEY}`, `password: true` when sensitive) | T(loose: literal; plugin: declared `variables` `${KEY}` ?) | T(literal) | T(literal) |
| `$${` escape | U (no escape; error if a literal `${` lands in an expanded field) | U | T(literal `${` except exact `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`) | T(no expansion) | U | ? | ? | T(`${` is literal; `{env:` is the hazard) | U |

### 3.2 Table B - other inventoried tools and formats

| Canonical | Gemini CLI | Amp | Windsurf Cascade | Devin Local | Cline | Roo Code | Goose (native) | Kiro (standalone) | Lume | MCPB (read-only) |
|---|---|---|---|---|---|---|---|---|---|---|
| `name` | N(key; extension servers named per extension) | N(key) | N(key) | N(key) | N(key; AP lane `<plugin>.<server>`) | N(key) | N(key + `name`) | N(key) | N(id, regex, <= 32 servers) | T(one server per bundle) |
| `description` | N | U | U | U | U | U | N | U | N(<= 200 chars) | T(manifest-level) |
| `stdio` | T(implied) | T(implied) | T(implied) | T(implied) | N(`type:"stdio"`) | N(`type:"stdio"`) | N(`type:"stdio"`) | T(implied) | N(`transport:"stdio"`) | N(only transport) |
| `http` | T(`url` + `type:"http"` source-only; or deprecated `httpUrl`) | N(`transport:"http"`) | T(implied by `serverUrl`) | N(`transport:"http"`, default) | T(`type:"streamableHttp"`) | N(`type:"streamable-http"`) | T(`type:"streamable_http"`) | T(`type:"http"`/implied) | N(`transport:"http"`, no fallback) | U |
| `sse` | N(`url`, docs) | N(`transport:"sse"`) | ?(supported; selector unknown) | N(`transport:"sse"`) | N(`type:"sse"`) | N(`type:"sse"`) | U | ? | N(`transport:"sse"`) | U |
| `command` | N | N | N | N | N | N | N(`cmd`) | N | N | N(`mcp_config.command`) |
| `args` | N | N | N | N | N | N | N | N | N | N |
| `env` | N | N | N | N | N | N | N(`envs`; rejects PATH, LD_*, NODE_OPTIONS, ... -> U for those keys) | N | N | N |
| `cwd` | N | U | ? | ? | N | N | N | ? | N | U |
| `envFile` | U | U | ? | ? | U | U | U | ? | U | U |
| `url` | N | N | N(`serverUrl` or `url`) | N | N | N | N(`uri`) | N | N | U |
| `socket` | U | U | U | U | U | U | N(`socket`) | U | U | U |
| `headers` | N | N | N | N | N | N | N | N | N | U |
| `headersHelper` | U | U | U | U | U | U | U | U | U | U |
| `oauth: false` | T(`oauth.enabled: false`) | U | ? | U | U | U | U | U | U | U |
| `oauth.clientId` | N | N | ? | N(`oauthClientId`) | N(SDK `oauthClient.clientId`) | U | N(`client_id`) | N | N | U |
| `oauth.clientSecret` | N | N | ? | N(`oauthClientSecret`; rejected in plugins) | N(SDK) | U | T(`client_secret_key` = env/secret-store name; only from `${env:}`) | N(CLI only) | U (public PKCE only) | U |
| `oauth.scopes` | N | N | ? | ?(plugin key unknown) | U | U | N(`scopes`) | N(`oauth.oauthScopes`; docs conflict) | T(`oauth.scope`, joined) | U |
| `oauth.redirectUri` | N | N(`oauth.redirectUrl`) | ? | U | U | U | U | N | N(`oauth.redirectUrl`, required) | U |
| `oauth.callbackPort` | D(-> `redirectUri` `http://localhost:PORT/`; path chosen by ACF; warning) | U | ? | U | U | U | U | T(`redirectUri: ":PORT"`) | U | U |
| `oauth.resource` | U | U | ? | N(`oauthResource`) | U | U | U | U | U | U |
| `oauth.authorizationUrl`/`tokenUrl` | N | N(`authUrl`/`tokenUrl`; required pair) | ? | U | U | U | U | U | N(required) | U |
| `oauth.grantType` | `authorization_code` only | same | ? | same | same | same | same | same | `authorization_code` only | U |
| `timeouts.startupMs` | U | U | ? | ? | U | U | U | N(`timeout`, ms) | U (fixed 10 s) | U |
| `timeouts.toolMs` | N(`timeout`, ms) | U | ? | ? | ?(`timeout`, seconds; meaning unverified) | T(`timeout` s, clamp 1-3600) | T(`timeout` s) | N(`requestTimeout`, ms) | U (per-call input) | U |
| `enabled: false` | D(omit; consumer `mcp.excluded`) | D(omit) | ? | T(`disabled: true`) | T(`disabled: true`) | T(`disabled: true`) | N(`enabled`) | T(`disabled: true`) | D(omit) | U |
| `tools.enabled` | N(`includeTools`) | D(skill `mcpServers` only: `includeTools`; settings schema rejects it) | U | ? | U | U | N(`available_tools`) | U | U (role selects servers only) | U |
| `tools.disabled` | N(`excludeTools`) | U | N(`disabledTools`) | ? | U | N(`disabledTools`) | U | N(`disabledTools`) | U | U |
| `tools.autoApprove` | T(`trust: true` only for `["*"]`; forbidden in extensions; subsets U) | U(`amp.mcpPermissions` matches servers, not tools) | U | D(`permissions.allow` `mcp__<s>__<t>`) | N(`autoApprove`) | N(`alwaysAllow`) | U | N(`autoApprove`) | U (no prompts exist) | U |
| `tools.alwaysLoad` | U | U | U | U | U | U | U | U | U | U |
| `tools.promoted` | U | U | U | U | U | U | U | U | N(`promotedTools`, <= 16) | U |
| `watch` | U | U | U | U | U | T(`watchPaths`, only wildcard-free globs) | U | U | U | U |
| `${ACF_CAPABILITY_DIR}` | T(settings: absolute; extension: `${extensionPath}`) | T(absolute) | T(absolute) | T(absolute; plugin: `${PLUGIN_ROOT}` or `${CLAUDE_PLUGIN_ROOT}`) | T(absolute; AP lane `${PLUGIN_ROOT}`) | T(absolute) | T(absolute; plugin lane `${PLUGIN_ROOT}`, stdio only) | T(absolute; powers: AP) | T(absolute) | N(`${__dirname}`) |
| `${ACF_DATA_DIR}` | T(caplet dir) | T | T | T(caplet dir; AP layout `${PLUGIN_DATA}`) | T(AP lane `${PLUGIN_DATA}`) | T | T(plugin lane: U) | T | T | U |
| `${ACF_PROJECT_DIR}` | T(extension `${workspacePath}`) | D(absolute) | D | D | D | N(`${workspaceFolder}`) | D | D | U (no project config) | U |
| `${env:NAME}` | T(`${NAME}`; unset -> empty) | T(`${NAME}`) | T(`${env:NAME}`; unset -> empty) | T(`${env:NAME}`; documented for OAuth fields, others ?) | T(`${env:NAME}`; unset left literal + warning) | T(`${env:NAME}`) | T(whole-value env -> `env_keys`; `client_id` `${NAME}`; else U) | T(`${NAME}` in env/headers) | D(whole env/header value only: `env://NAME`; embedded -> U) | U |
| `${env:NAME:-d}` | U | U | U | U | U | U | U | U | U | U |
| `${file:PATH}` | U | U | N(`${file:PATH}`, trimmed) | N(`${file:PATH}`) | U | U | U | U | D(whole value `file:///abs` only) | U |
| `${option:KEY}` | T(literal; extension settings mapping ?) | T(literal) | T(literal) | T(literal) | T(literal) | T(literal) | T(literal) | T(literal) | T(literal) | N(`${user_config.KEY}`) |
| `$${` escape | U (`$VAR`, `%VAR%` hazards) | U | U | U | U | U | U | U | T(no `${` expansion) | U |

Notes on the tables:

- "T(literal)" for `${option:KEY}` means caplet substitutes the consumer's configured value at install time. It is never used for options declared sensitive; those must be `${env:...}` references instead (error otherwise), because the literal would land in a config file.
- "T(absolute)" for path placeholders is current ACF behavior. For **project-scope** output into committed files (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) an absolute path is machine-specific; writers should prefer the target's project variable plus a project-relative caplet install path when the capability is installed inside the project (`acf.mcp.non-portable-path` otherwise).
- Every "T(implied by ...)" writer must still reject canonical servers whose transport the target cannot express (for example `sse` on Codex).

---

## 4. Conflicts that must not be unioned

| # | Conflict | Evidence | Canonical handling |
|---|---|---|---|
| X1 | **Transport when `type` is omitted.** Claude: stdio, and a `url` without `type` is skipped. Cline: URL defaults to SSE. Roo: SSE-first union. Gemini docs: `url` is SSE; source: auto-detect. pi-mcp-adapter: Streamable then SSE. VS Code: table says required, examples omit. | inventories; Claude MCP doc (verified) | Canonical `transport` is required. Writers always emit an explicit selector where the target has one. Readers apply a per-format default table, and the same-format memo (§5.3) records that `type` was omitted. |
| X2 | **SSE fallback.** VS Code, Devin (non-auth 4xx), Claude, pi-mcp-adapter fall back from Streamable HTTP to SSE; Lume and AP do not (AP: "initial connection must use declared transport"). Amp distinguishes `http` from `http-first`. | inventories | `http` means Streamable HTTP only; fallback is host behavior, not a field. Amp `http-first` is an Amp extra. |
| X3 | **Default `cwd`.** AP: plugin root. VS Code / Roo: workspace folder. OpenCode: relative paths against workspace. ACF hooks (§13.6.5): capability root. Claude: no field; default undocumented. | inventories, SPEC §13.6.5 | No canonical default. Omitted `cwd` = host default, and a validator `info` warns when relative `args` are present without `cwd`. Relative canonical `cwd` must start `./` and means capability root (explicit, so the AP writer can translate it). |
| X4 | **Expansion contracts.** AP: only `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`, only in args/env values/cwd, env expansion forbidden. Claude: env and plugin vars in command/args/env/url/headers. Missing var: empty string (Gemini, OpenCode, Windsurf, pi), left literal (Claude with warning, Cline, Roo), unexpanded with warning (Claude). Bare `$VAR` expands in Gemini and Copilot; `%VAR%` in Gemini on Windows; `$env:VAR` in pi; `{env:VAR}` in OpenCode. | inventories; Claude doc | One canonical grammar (§2.3), translated per field and per target. Writers scan every emitted string for sequences the target would expand that the canonical value meant literally (`$NAME`, `%NAME%`, `{env:`, `$env:`) and raise `acf.mcp.expansion-hazard` (error when no escape exists). Canonical semantics for a missing variable: unspecified; authors who need a value use `:-default`, which only Claude/Copilot express (U elsewhere). |
| X5 | **Plugin-root variables differ by host, and Cursor does not expand the AP ones.** `${CLAUDE_PLUGIN_ROOT}` (Claude, Cursor, Devin), `${PLUGIN_ROOT}` (AP, Devin, Goose plugins), `${CURSOR_PLUGIN_ROOT}`, `${extensionPath}`, `${__dirname}`. Cursor's own AP example uses `${CURSOR_PLUGIN_ROOT}` in `cwd`, which violates the AP 1.0 schema pattern. | Cursor doc (verified) | `${ACF_CAPABILITY_DIR}` and `${ACF_DATA_DIR}` are translated per writer. One AP package cannot serve Cursor correctly when a server uses package-relative args/env/cwd: emit the Cursor dialect for Cursor (`.cursor-plugin/plugin.json` with `mcpServers` pointing to a Cursor-specific file), or refuse the server for Cursor. |
| X6 | **Empty tool allowlist.** Goose `available_tools: []` = all tools; Copilot `tools: []` = no tools. | inventories | Canonical `tools.enabled` must be non-empty when present; "no tools" is `enabled: false`. Readers map Goose `[]` to absent and Copilot `[]` to `enabled: false` (memo keeps spelling). |
| X7 | **Bare `timeout` means different things.** Kiro: startup handshake. Claude, Gemini, Roo, Goose: tool call. Copilot: both. OpenCode: tool listing. Units: ms (Claude, Copilot, Gemini, Kiro, OpenCode) vs s (Codex, Roo, Cline, Goose). | inventories; OpenCode and Codex docs (verified) | Two canonical fields in ms. Readers never map a bare `timeout` without that format's meaning; writers convert units and report rounding (`info`) and clamping (Roo 3600 s, `warning`). |
| X8 | **Approval grants from a package.** Gemini forbids `trust` in extensions; Claude plugins cannot set permissions; AP has no grants; Devin plugins strip secrets. Cline/Roo/Kiro keep `autoApprove` inside the same entry as the definition. | inventories | `tools.autoApprove` is canonical but consumer-gated: writers emit it only into consumer-scope loose config and only when `capabilities.yml` opts in for that capability; never inside plugin packages. Absent opt-in: `info` diagnostic. |
| X9 | **Where policy lives.** `enabled`, tool filters and approvals are inside the server entry for Codex native, Gemini, Roo, Kiro, Cline, Goose, OpenCode; in separate consumer settings for Claude (`disabledMcpServers`, `permissions`), Copilot (`disabledMcpServers`, permission rules), VS Code and Cursor (UI state, `mcpAllowlist`), and Codex plugins (`[plugins.<p>.mcp_servers.<s>]`). | inventories | Canonical keeps them on the entry (one authoring place) but classifies them as policy. Writers may place them in consumer settings only through ownership-tracked edits (sidecar), never by rewriting Claude-owned `~/.claude.json` records directly; otherwise apply the §2.4 class. |
| X10 | **Precedence across sources is inverted between hosts.** Claude: managed > local > project > user > plugin, plugins deduplicated by endpoint. Copilot: `--additional-mcp-config` > plugin > workspace > user; plugin collisions last-loaded-wins. Gemini: settings > extension. Amp: CLI > project > user > skills. Kiro: agent > project > global (whole-entry). Devin: local > project > user. Roo: project > global. pi-mcp-adapter: `.pi/mcp.json` > `.mcp.json` > `~/.pi/agent/mcp.json` > `~/.config/mcp/mcp.json` (whole-entry spread). Lume: no merging. | inventories; Claude doc; pi source | Not unioned. ACF resolves collisions among ACF-managed servers before emission (§17.6: project shadows user; same-scope collision is an error), so every emitted name is unique. Interaction with servers the consumer configured natively stays host-defined; writers detect a same-name entry they do not own (`acf.mcp.native-collision`, warning) and, for Claude plugins, a same-endpoint server in a higher scope that would silently hide the plugin server (`acf.mcp.endpoint-shadowed`, warning). |
| X11 | **OAuth required-field sets.** Amp requires `authUrl`+`tokenUrl` whenever `oauth` is present; Lume requires `authorizationUrl`, `tokenUrl`, `redirectUrl`; Claude/Cursor/OpenCode/Gemini discover. | inventories | Canonical fields optional. Amp writer omits the `oauth` object when the pair is missing (warning: falls back to Amp's automatic registration); Lume writer errors (functional). |
| X12 | **Secrets in packages.** AP forbids secrets in `env`/`headers`; Devin plugins reject OAuth client secrets and strip literal secrets; Lume only `env://`/`file://`; Claude/Copilot secrets only via CLI keychain. | inventories | `oauth.clientSecret` must be a reference; credential-looking literal headers warn. Plugin writers refuse servers whose secrets need host env expansion that the plugin format forbids (AP). |
| X13 | **Non-standard transports.** Claude `ws`; Gemini `tcp` (labelled websocket in source, unverified); Goose `builtin`/`platform`. | inventories | Not canonical. Carried as family-level native entries in `targets.<target>.servers` (§5.2). Revisit `ws` if a second tool documents it. |
| X14 | **Env value types.** VS Code accepts number and `null` values; everyone else string-only. | VS Code inventory | Canonical strings. Reader coerces numbers to strings and records the original JSON type in the memo; `null` (meaning unclear) becomes a VS Code extra. |
| X15 | **Sensitive env keys.** Goose rejects `PATH`, `LD_*`, `DYLD_*`, `NODE_OPTIONS`, `PYTHONPATH` and ~25 more. AP reserves `PLUGIN_ROOT`/`PLUGIN_DATA`. | inventories | Per-target validation in the writer (functional class). Canonical additionally reserves the plugin variable names (§2.2). |
| X16 | **Cross-facet references to server names.** Hooks (`mcp_tool` handler `server`), agent tool selectors (`server/*`, `mcp__server__*`, `@server`), permission rules and MCP prompts-as-commands embed the native server name, which plugins rewrite (`plugin:<p>:<s>`, `<p>.<s>`, `power-<p>-<s>`). Claude plugin agents ignore agent `mcpServers`. | inventories | Not part of this facet's schema. The MCP writer must publish its name mapping so hook/agent/permission writers can rewrite references, and an unknown reference is an error rather than a guess. |

---

## 5. Per-target extras and lossless round trips

### 5.1 What stays raw per target

Entry-level `targets.<target>` holds native keys verbatim (JSON/TOML values as read). The writer merges them into the generated native entry; a key that the writer also generates from a canonical field is an error (one owner per output key, advisor rule 4).

| Target | Raw entry-level extras |
|---|---|
| claude | `bareElicitationCapability`, `oauth.authServerMetadataUrl`; plugin manifest `mcpServers` variants (path list, MCPB bundle path/HTTPS URL, inline map) as package-level extras |
| codex | `required`, `experimental_environment`, `env_vars[]` objects with `source`, `auth`, `default_tools_approval_mode`, `tools.<t>.approval_mode` (until the enum is verified), `tools.<t>.output_token_limit` |
| copilot | `deferTools: "auto"` (explicit), `disableToolCache`, `slowConnectionThresholdMs`, `filterMapping`, `oauthPublicClient`, `oidc` |
| vscode | `sandboxEnabled`, `dev.debug`, `oauth.enterpriseManaged`, `null` env values; file-level `sandbox` and hand-written `inputs` entries |
| cursor | Cursor plugin `variables` declarations not produced from `${option:}` |
| gemini | `trust` (when not representable as `autoApprove: ["*"]`), `authProviderType`, `targetAudience`, `targetServiceAccount`, `oauth.issuer`, `oauth.authorizationResponseIssParameterSupported`, `oauth.audiences`, `oauth.tokenParamName`, `oauth.registrationUrl` |
| opencode | none identified beyond the core |
| amp | `transport: "http-first"`, glob entries in skill `includeTools`, `${amp:id-token}` header values |
| windsurf / devin | Devin plugin `mcpServers: {paths, exclusive}` (package-level) |
| cline | `remoteConfigured`, `metadata` (persisted OAuth state is runtime state and is never imported) |
| roo | none identified beyond the core |
| goose | `bundled`, `display_name`, `env_keys` entries that rely on the secret-store fallback |
| kiro | `oauth.clientMetadataUrl` |
| lume | none identified beyond the core |
| pi (pi-mcp-adapter) | `lifecycle`, `idleTimeout`, `exposeResources`, `directTools` as `string[]`, `toolOverrides`, `debug`, `auth: "bearer"` with `bearerToken` |

### 5.2 Native-only servers

Family-level `targets.<target>.servers` becomes a map `nativeName -> verbatim native server object` (today it is a list of canonical-shaped entries, which cannot carry a Claude `ws` server, a Goose `builtin` extension or a Gemini `tcp` server). These are emitted only to that target and dropped elsewhere with `acf.mcp.extra-dropped` (`info`, listing the server).

### 5.3 Round-trip mechanism

1. **Reader** of a native format produces: canonical fields for every understood key; `targets.<owner>` raw extras for every other key; a reader-private **memo** per entry (format id and version, key order, spelling aliases used such as `streamable-http`/`local`/`httpUrl`/`serverUrl`/`startup_timeout_sec` vs `_ms`, omitted-default flags such as missing `type`, original value types, original scope string, units); and the immutable source-package snapshot (advisor rule 2).
2. **Same-format writer, unchanged entry** (canonical + extras hash equals the memo hash): emit the original bytes of the file, or of the entry when patching a shared file. This is the only way to keep comments (JSONC in OpenCode/Amp, TOML in Codex) and formatting.
3. **Same-format writer, changed entry**: regenerate from canonical using memo spellings, then merge extras; untouched sibling entries keep original bytes.
4. **Cross-format writer**: canonical projection plus that target's extras; extras of other targets are dropped with `acf.mcp.extra-dropped`.
5. **Native ACF**: `mcp.yml` stores canonical fields plus `targets.<t>` raw objects, so ACF -> model -> ACF is lossless by construction; YAML comments and layout survive only through the snapshot path (step 2).

Known normalizations that need the memo to be lossless: `type` aliases and omitted `type`; Claude/OpenCode/Lume/pi space-joined scope strings (whitespace runs); VS Code numeric env values; Codex `_sec` vs `_ms`; Copilot `type: "local"`; Goose `env` vs `envs` alias; Kiro top-level vs nested scopes; Cline flat vs nested `transport` object; Windsurf `url` vs `serverUrl`; header-name case.

---

## 6. Delta versus the current ACF spec and code

### 6.1 What exists

- SPEC §13a: `mcp/mcp.yml` (`.yaml` alias), `servers[]` with `name`, `description`, `transport: stdio|http|sse`, `command`, `args`, `env`, `url`, `headers`, `only`, `except`, `targets`; family-level `targets.<target>.servers` reusing the canonical shape; https required unless a `targets.<target>` local-dev flag; §13a.4.1 path placeholders in command/args/env and url/headers, "MUST NOT perform additional environment-variable expansion". §15 reserves a canonical MCP `scope`. §22.5 lists MCP artifact locations.
- `model.ts:203-229` mirrors that shape (discriminated `McpTransport`).
- `schemas/index.ts:185-227` validates it, but only checks "stdio needs command", "http/sse need url", "http/sse forbid command"; it does not forbid `url`/`headers` on stdio or `args`/`env` on http, and `z.string().url()` does not enforce https.
- `targets/extensions.ts:61-76`: one MCP extension schema for every target, `{servers: canonical[], scope: user|project, localDev: boolean}`, strict. `localDev` is read nowhere; `scope` has no consumer in the emitter.
- `targets/registry.ts`: `mcp: "full"` for claude, codex, cursor, opencode, pi; `mcpInstallPath` per target, which the emitter does not use (`emitter.ts:648-652` computes its own path).
- `adapters/src/common/emitter.ts:298-317,604-646`: one generic writer for all five targets. It merges `{transport, command, args, env}` or `{transport, url, headers}` at JSON pointer `/mcpServers/<name>` into `<installRoot>/mcp.json` (Claude project: `./.mcp.json`), substituting `${ACF_CAPABILITY_DIR}`/`${ACF_PACKAGE_DIR}`/`${ACF_HOOK_DIR}` with absolute paths (`placeholders.ts`), including inside `url` and `headers`.
- Tests (`packages/adapters/tests/claude.test.ts:45-50`, `codex.test.ts:23-24`) assert only JSON pointers and substrings, so none of the defects below fail them.

### 6.2 Defects in the current output (each verified against the native contract above)

| Target | Written today | Native contract | Effect |
|---|---|---|---|
| claude, project | `.mcp.json` entries with `transport` and no `type` | `type` selects transport; no `type` = stdio; `url` without `type` is skipped | stdio works by accident; **every http/sse server is skipped** |
| claude, user | `~/.claude/mcp.json` | user servers live in `~/.claude.json` (CLI-owned) | ignored by Claude (pi-mcp-adapter happens to import this path) |
| codex | `.codex/mcp.json` / `~/.codex/mcp.json` JSON | `[mcp_servers.<name>]` in `config.toml` | ignored |
| cursor | `.cursor/mcp.json` with `transport` | `type` (stdio table requires `"stdio"`) | correct file, non-native key; behavior unverified |
| opencode | `.opencode/mcp.json` / `~/.config/opencode/mcp.json` `mcpServers` | `opencode.json[c]` `mcp.<name>` with `type: local\|remote`, `command: string[]`, `environment` | ignored |
| pi | `.pi/mcp.json` / `~/.pi/agent/mcp.json` `mcpServers` | Pi core: no MCP. pi-mcp-adapter reads exactly these paths, infers transport from `command`/`url`, ignores `transport` | works only when that extension is installed; `"full"` support claim is wrong |
| all | absolute capability paths in project files | committed project files are shared | machine-specific committed config |

### 6.3 What changes

- **SPEC §13a.2-13a.3**: add fields `cwd`, `envFile`, `socket`, `headersHelper`, `oauth` (false or object with 9 subfields), `timeouts.{startupMs,toolMs}`, `enabled`, `tools.{enabled,disabled,autoApprove,alwaysLoad,promoted}`, `watch`; define `http` as Streamable HTTP and `sse` as the 2024-11-05 transport; full variant exclusivity.
- **SPEC §13a.4**: replace the `localDev` opt-in with "https, or http on loopback" (AP/Lume/Kiro parity). Drop `localDev` from `extensions.ts`.
- **SPEC §13a.4.1**: replace "no env expansion" with the §2.3 grammar and its escape; deprecate path placeholders in `url`/`headers` and `${ACF_HOOK_DIR}` for MCP. Changing the meaning of strings that today pass through literally (`${env:X}` was literal) needs a §15 decision: either an `acf: 1` minor with a migration diagnostic for existing literal `${...}` occurrences, or gating behind `acf: 2`.
- **SPEC §13a.5 and §7.3 for MCP**: per-entry `targets.<t>` becomes a raw native key bag validated by the target's native MCP schema (known keys typed, unknown keys preserved with `info`), not a canonical-shaped strict object; family-level `targets.<t>.servers` becomes `nativeName -> native object`.
- **SPEC §14.4**: "MUST NOT read native artifacts" conflicts with foreign-format readers; amend to distinguish emitted artifacts (still never re-read as source) from imported source packages.
- **SPEC §15**: keep canonical `scope` reserved. Placement scope is a consumer/resolution property (§17), not a server property; no tool shares a per-server scope field.
- **SPEC §17 / `capabilities.yml`**: add per-capability consumer opt-ins: `mcp.autoApprove: allow` (X8) and per-server `allowLossy: [<field>]` to downgrade restrictive/functional errors deliberately.
- **SPEC §22.5**: rewrite the table with real native files (Claude `.mcp.json` / `claude mcp add --scope user` or plugin; Codex `config.toml`; Cursor `.cursor/mcp.json`; OpenCode `opencode.json` `mcp`; VS Code `.vscode/mcp.json` `servers`; Copilot `.mcp.json` / `~/.copilot/mcp-config.json`; AP `mcp.json`; Pi via pi-mcp-adapter files with an explicit extension dependency).
- **`model.ts`**: extend `McpServer` with the new fields; a branded `McpTemplate` string type produced by a parser (so writers receive parsed references, not raw strings); `targets` as `Partial<Record<TargetId, Readonly<Record<string, unknown>>>>`; reader memo and source-format provenance outside the author-facing type.
- **`schemas/index.ts`**: discriminated union on `transport`; template parsing and per-field allowed forms; header-name, env-name, URL, scope-token, secret-reference and `tools.enabled` non-empty checks.
- **`targets/registry.ts`**: replace `mcp: "full"` with field-level support data equivalent to §3 (per transport, per field, per template form, with degradation class), used for diagnostics and docs; Pi becomes "via extension pi-mcp-adapter"; remove or use `mcpInstallPath`.
- **`adapters`**: one writer per native dialect instead of the generic emitter: Claude (loose and plugin share the entry writer; different template translators), AP (shared by Codex/Copilot/VS Code/Kiro packages), Cursor (native and Cursor-plugin dialect), Codex TOML (owned `[mcp_servers.*]` tables), OpenCode JSONC `mcp`, VS Code `servers` + generated `inputs`, Copilot, pi-mcp-adapter. `placeholders.ts` becomes a template translator keyed by `(target dialect, field)` that returns either native text or a typed unsupported reason.
- **Diagnostics** (new codes): `acf.lossy.mcp.<field>`, `acf.mcp.template-unsupported`, `acf.mcp.expansion-hazard`, `acf.mcp.secret-literal`, `acf.mcp.extra-dropped`, `acf.mcp.native-collision`, `acf.mcp.endpoint-shadowed`, `acf.mcp.non-portable-path`, `acf.mcp.deprecated-placeholder`.
- **Tests**: per-dialect golden files validated against each native schema where one exists (AP 1.0 JSON Schema, Amp settings schema, Lume and Codex key sets), plus the round-trip fixtures of §5.3.

### 6.4 What is new (no ACF counterpart today)

Foreign readers for `.mcp.json` (Claude/Copilot/Goose plugin), AP `mcp.json`, Codex TOML, VS Code `servers`, Cursor, OpenCode, Gemini extension `mcpServers`, MCPB `server`; the reader memo; `${ACF_DATA_DIR}` with a caplet-managed data directory for loose targets (location and uninstall lifecycle undecided); `${ACF_PROJECT_DIR}`; `${option:KEY}` (depends on the settings/userConfig facet); consumer opt-ins in `capabilities.yml`; the name-mapping output consumed by hook/agent/permission writers (X16).

---

## 7. Open questions and unverified claims

Design questions:

1. **Cursor in a shared AP package (X5).** Does Cursor prefer `.cursor-plugin/plugin.json` over root `plugin.json` when both exist, so one package can carry an AP `mcp.json` plus a Cursor-dialect MCP file? Unverified; until then Cursor needs its own package or loses package-relative servers.
2. **Claude `cwd`.** Is the POSIX `sh -c` wrapper an acceptable declared degradation, or should `cwd` on Claude be refused (functional error) to keep Windows behavior identical?
3. **`${ACF_DATA_DIR}` for loose targets**: location (for example `$XDG_DATA_HOME/caplet/data/<capability>`), creation time, and deletion on `caplet remove`.
4. **Template grammar versioning** under §15 (literal `${env:...}` strings in existing capabilities).
5. **Consumer-gated policy (X8/X9)**: whether caplet may write consumer settings (Claude `permissions`, Codex `[plugins.<p>.mcp_servers.<s>]`) at all, or only report the needed edits.
6. **`socket`, `watch`, `tools.promoted`** pass the two-tool rule narrowly (VS Code + Goose; VS Code + Roo; Lume + pi-mcp-adapter, both user-owned). Confirm they belong in the core rather than extras.
7. **Agent-scoped MCP** (Claude/Gemini/Kiro agent `mcpServers`, Copilot agent `mcp-servers`, Amp skill `mcpServers`) should reuse this entry schema inside the agents/skills facets; ownership of that decision sits with those facets.

Unverified claims (treated as `?`/U in §3 until checked):

- Codex: meaning of `auto|prompt|writes|approve`; SSE support; `headersHelper` exec vs shell; relative `cwd` resolution; `${PLUGIN_DATA}` location; whether `description` exists.
- Claude: default stdio `cwd`; whether unknown entry keys are rejected or ignored; whether `./relative` `command` works in plugins; `tools.disabled` via `permissions.deny` hiding the tool versus only blocking calls.
- Copilot: whether `command`, `args`, `url` expand env references; AP 1.1 MCP schema changes (only 1.0 inventoried).
- VS Code: `${env:NAME}` support in `mcp.json`; `type` inference; duplicate-name precedence; `null` env value meaning.
- Cursor: exact remote `type` spelling and SSE selection; `cwd` outside plugins; `envFile` relative resolution and precedence against `env`; scope precedence; plugin `variables` expansion fields.
- OpenCode: remote transport negotiation and SSE; whether the `tools` map can express an allowlist (pattern ordering); `{file:}` trimming.
- Gemini: released availability of source-only `type`, `tcp`, `oauth.registrationUrl`; env redaction defaults.
- Windsurf Cascade: SSE selector, `url` vs `serverUrl` precedence, OAuth field names, `cwd`/`envFile`/timeouts.
- Devin Local: env/file expansion coverage outside OAuth fields; plugin scopes key.
- Cline: `timeout` meaning; SDK env expansion; OAuth fields in the shipped extension.
- Kiro: nested vs top-level scopes precedence (docs conflict); `cwd`/`envFile`; MCP page dated 2026-10-07 is after the snapshot.
- Goose: whether `socket` semantics match VS Code `unix://` URLs.
- pi-mcp-adapter: the evidence is the user's fork (`barisgit/pi-mcp-adapter@8c918b8`); upstream field set (`promotedTools`, `toolOverrides`, `directTools`) may differ, and Pi core may never adopt MCP.
- Agent Plugins compatible-clients list (which hosts actually honor `sse` and `${PLUGIN_DATA}`) is an official listing, not verified per client.
