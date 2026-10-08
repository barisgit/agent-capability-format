# Agent Plugins 1.0 open standard - capability inventory (snapshot 2026-10-01)

## Skills

**Scope and status:** Agent Plugins **1.0.0, Published**, researched 2026-10-01. References below use the official repository snapshot [`ff8ab5e392cc87bd88d87c060815a87490e51003`](https://github.com/agentplugins/agent-plugins-spec/tree/ff8ab5e392cc87bd88d87c060815a87490e51003), whose [commit date is 2026-08-19](https://github.com/agentplugins/agent-plugins-spec/commit/ff8ab5e392cc87bd88d87c060815a87490e51003). This is a published packaging specification, not a client runtime. **1.1.0 is a working draft**, not a shipped contract. ([README](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/README.md))

**Discovery:** `<plugin-root>/skills/<skill-directory>/SKILL.md`. Only immediate child directories are searched; discovery is not recursive. `SKILL.md` must resolve to a regular file inside the resolved plugin root. Invalid skills are skipped independently; other skills and components continue loading. Missing `skills/` is not an error. Manifest overrides of discovery locations are forbidden. ([Specification §§4, 6, 7.1](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#71-skills))

**Frontmatter:** YAML followed by Markdown; Agent Plugins incorporates the [Agent Skills specification](https://agentskills.io/specification) as its source of truth. That live document exposes no version/date in the retrieved text; fields below reflect the 2026-10-01 retrieval.

| Field | Type | Required | Meaning and constraints |
|---|---|---|---|
| `name` | string | Yes | 1–64 characters; lowercase alphanumeric characters and hyphens; no leading/trailing hyphen or consecutive `--`; must match parent directory name. |
| `description` | string | Yes | 1–1024 characters; describes function and when to activate. |
| `license` | string | No | License name or reference to a bundled license file. |
| `compatibility` | string | No | 1–500 characters if supplied; environment/product/system-package/network requirements. |
| `metadata` | map<string,string> | No | Arbitrary additional metadata; unique keys recommended. |
| `allowed-tools` | string | No | Space-separated pre-approved tool expressions. **Experimental**; support varies by implementation. Not an array. |

Source for every row: [Agent Skills specification, frontmatter](https://agentskills.io/specification#frontmatter).

**Bundled files:** `scripts/` for executable code, `references/` for documentation, `assets/` for static resources. Other files/directories are permitted. Languages supported for scripts depend on the client. References use paths relative to the skill root; shallow reference chains are recommended. Markdown body has no prescribed format. ([Agent Skills specification](https://agentskills.io/specification#optional-directories))

**Invocation, precedence and tool variants:** model-versus-user invocation, slash-command exposure, collisions between packages, discovery outside the plugin, precedence, and per-tool extra metadata files are **UNKNOWN/not standardized**. Agent Plugins explicitly does not define how clients expose skills to users or models. No portable `model`, `argument-hint`, `disable-model-invocation`, `user-invocable`, or separate tool-metadata file is defined by this packaging specification. Client-specific packaging belongs in extension namespaces, not additional root manifest fields. ([§§7.1, 8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#8-client-extensions))

**Pitfall:** plugin names allow periods; skill names do not under the referenced skill rules. The skill specification describes “unicode lowercase alphanumeric” while parenthetically naming `a-z, 0-9`; non-ASCII acceptance is ambiguous in that text. ([Plugin names §5.5](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#55-plugin-name-constraints), [skill name](https://agentskills.io/specification#name-field))

## Instructions and rules

**Not supported as portable components.** Agent Plugins 1.0 defines exactly skills and MCP servers. It assigns no discovery or execution semantics to `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.mdc` rules, steering files, activation modes, nesting, precedence, imports or includes. ([§7](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#7-component-types))

Client-specific instructions/rules could be represented under a client-owned reverse-domain extension namespace; their fields and behavior are **UNKNOWN** without that client’s contract. ([§8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#8-client-extensions))

## Subagents and custom agents

**Not supported as portable components.** No agent-definition file, frontmatter, `name`, `description`, `model`, `tools`, permissions, color, invocation/delegation protocol or scope is standardized. Extension implementations may define their own behavior; the standard supplies none. ([§§7–8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#7-component-types))

## Commands and prompts

**Not supported as portable components.** No `commands/` or prompt-file discovery, command frontmatter, arguments, placeholders, shell/file interpolation, or model/tool overrides is defined. Whether a client exposes skills as commands or has migrated commands into skills is **UNKNOWN** from this standard. ([§§7.1, 8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#71-skills))

## Hooks

**Not supported as portable components.** There are no standardized lifecycle-event names, matchers, handler types, payloads, output contracts, exit-code decisions, timeouts, environment variables, ordering or hook scopes. ([§7](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#7-component-types))

The specification illustrates `com.example.client/hooks/hooks.json`, but explicitly leaves extension contents, discovery details beyond the namespace directory, validation, loading and failure semantics to the owning client. This is an **illustration**, not a shipped portable hook schema. ([§8.2](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#82-extension-directories))

## MCP servers

**File:** `<plugin-root>/mcp.json`, exclusively. Inline MCP configuration in `plugin.json` and alternative core discovery paths are forbidden. All objects described below are closed except the named maps. ([§7.2.1](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#721-discovery-and-configuration), [JSON Schema](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0/mcp.schema.json))

| Field | Type | Required | Meaning |
|---|---|---|---|
| `$schema` | string constant | Yes | Exactly `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`; version must match `plugin.json`. |
| `mcpServers` | map<string,server> | Yes | Member keys identify servers. Empty map is valid; no server-name constraint is specified. |

Each server must match exactly one variant:

| Field | Type | Required | Variant and meaning |
|---|---|---|---|
| `type` | `"stdio"` | Yes | Local subprocess transport. |
| `command` | nonempty string | Yes | One executable token: bare executable name or plugin-relative path beginning `./`; not a shell command. |
| `args` | string[] | No | Separately passed executable arguments. |
| `env` | map<string,string> | No | Process environment overlay. Reserved `PLUGIN_ROOT` and `PLUGIN_DATA` entries prohibited. |
| `cwd` | string | No | `./…`, exactly `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`, or a path beginning `${PLUGIN_ROOT}/`/`${PLUGIN_DATA}/`. Defaults to plugin root. |
| `type` | `"streamable-http"` | Yes | Current MCP Streamable HTTP transport. |
| `type` | `"sse"` | Yes | Deprecated HTTP+SSE transport from MCP 2024-11-05; not Streamable HTTP’s SSE response mode. |
| `url` | nonempty string | Yes, remote variants | Absolute HTTP(S) endpoint; no user information or fragment. HTTPS mandatory except exact `localhost` or loopback IP literals. |
| `headers` | map<string,string> | No, remote variants | Fixed HTTP headers; names/values must be valid HTTP header fields. Case-insensitive duplicate names invalidate the server. |

Source for every row: [§7.2.1](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#721-discovery-and-configuration), [schema](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0/mcp.schema.json).

**Expansion and subprocess environment:**

| Item | Contract |
|---|---|
| `${PLUGIN_ROOT}` | Absolute filesystem-resolved plugin root. |
| `${PLUGIN_DATA}` | Absolute client-managed persistent directory dedicated to the installed plugin instance. Created before launch, writable, preserved across updates; may be deleted on uninstall. |
| Expansion fields | Every `args` element, every `env` value, `cwd`. |
| Expansion algorithm | Replace every exact recognized occurrence once, non-recursively. Unknown placeholder-like text remains literal. |
| No expansion | `command`, `env` keys, fixed discovery paths, remote `url`, header names or values. No arbitrary environment-variable expansion. |
| Environment precedence | Client-chosen inherited/sanitized base → expanded `env` overlay → client-supplied reserved variables. Platform environment-name semantics apply. |
| Bare executable lookup | Platform executable-search rules. Participation of configured `PATH` is client-defined; portable packages must not depend on it. |
| Path containment | `command` paths and plugin-root `cwd` remain within resolved plugin root; data-root `cwd` remains within resolved plugin data directory. Arguments/environment strings are otherwise opaque, not automatically treated as package paths. |

Sources: [§§4.1, 7.2.1, 9](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#9-environment-variables-and-placeholder-expansion).

**Auth and headers:** no OAuth configuration or portable credential-reference fields. Discovery, consent and credential storage are client-managed. Package `env` and `headers` must not embed secrets. Client-generated HTTP/MCP/auth headers override same-name configured headers. Configured headers must not cross origins via redirects or legacy SSE endpoint events without explicit user authorization. ([§§7.2.1, 9.2](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#721-discovery-and-configuration))

**Not supported fields:** `envFile`, auth/OAuth objects, timeouts, enabled/disabled tools, trust, server-level enable flags and alternate transport spellings. Unknown keys or mixing variant fields invalidate that server; do not silently transplant a client-native configuration. Scopes and precedence across plugins/user/workspace configurations are **UNKNOWN**. ([§7.2.1](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#721-discovery-and-configuration))

**Failure boundaries:** invalid JSON/top-level config, unsupported schema or plugin/MCP version mismatch disables only that plugin’s MCP component. Invalid individual servers or unsupported transports are skipped individually. Start/connect/auth/handshake failures must not prevent other components loading. Clients supporting MCP must support at least one of `stdio` or `streamable-http`, should support both, and may support `sse`. Initial connection must use declared transport; fallback behavior is unspecified. ([§§7.2.2, 11](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#722-loading-rules))

## Other native capability types

**Not supported portably:** LSP servers, output styles, themes, apps/connectors, monitors, `userConfig`/plugin settings schemas, models/providers, statusline, keybindings and JS/TS tool/extension modules. Agent Plugins 1.0 standardizes exactly two component types. Bundled skill scripts are not a standardized runtime extension-module API. ([§7](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#7-component-types), [Agent Skills directories](https://agentskills.io/specification#optional-directories))

**Escape hatch:**

| Location | Type | Contract |
|---|---|---|
| `plugin.json.extensions` | object | Optional map keyed by client-owned reverse-domain namespaces. |
| `extensions["com.example.client"]` | object | Client-specific manifest data; arbitrary contents governed by that client. |
| `<plugin-root>/com.example.client/` | directory | Client-specific files; namespace directory name must match exactly. Manifest data, directory contents, or both may be used. |

Unknown namespaces must be ignored **without validating their values**. A non-object `extensions` field must be reported and ignored without rejecting the plugin. Validation and failure handling for implemented namespaces are client-defined. The extension directory is not an alternative manifest and cannot override core fields. ([§§5.1, 8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#8-client-extensions))

## Permissions, trust and security

**Not supported as portable policy:** manifest permission grants/allow-deny settings, install trust prompts, workspace trust, sandbox requirements, signatures/attestations, publisher verification, or managed/enterprise allowlists and mandatory packages. These are explicitly future considerations, **not committed roadmap features**. Concrete client behavior is **UNKNOWN** here. ([Future Considerations](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/FUTURE_CONSIDERATIONS.md))

**Actual normative protections:**

- Files supplied by the package must resolve inside the resolved plugin root, including symlinks/junctions/reparse points. Root manifest escape rejects the plugin; fixed-location escape invalidates that component; escaped `SKILL.md` skips that skill; escaped MCP `command`/`cwd` invalidates that server; other escaped package access is denied. These checks **do not sandbox subprocesses** or constrain runtime-supplied paths. ([§4.1](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#41-general-requirements))
- Clients must use locally recognized schemas and **must not fetch schemas during plugin loading**. Unsupported specification versions reject the plugin. ([§5.2](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#52-manifest-object))
- Remote transport URL/header restrictions and prohibition on embedded `env`/header secrets apply as described above. ([§§7.2.1, 9.2](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#721-discovery-and-configuration))
- `allowed-tools` is inherited **experimental skill metadata**, not an Agent Plugins permission system. ([Agent Skills](https://agentskills.io/specification#allowed-tools-field), [Future Considerations](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/FUTURE_CONSIDERATIONS.md))

## Packaging, install and scopes

**Required layout:** directory package with exactly one portable root manifest, `plugin.json`. Optional fixed components are `skills/` and `mcp.json`; client-specific files use top-level reverse-domain namespace directories. `LICENSE` and `CHANGELOG.md` appear in an example but are not mandatory. ([§§4–6](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#4-plugin-package-model))

**Complete root manifest field inventory:**

| Field | Type | Required | Meaning/constraints |
|---|---|---|---|
| `$schema` | string constant | Yes | Exactly `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Selects supported interpretation rules. |
| `name` | string | Yes | 1–64 characters, `a-z`, `0-9`, `-`, `.`; alphanumeric first/last; no `--` or `..`. |
| `version` | string | No | Plugin version; SemVer recommended, not required. May inform updates/cache freshness. |
| `description` | string | No | Short package description. |
| `author` | object | No | Closed object with optional `name`, `email`, `url`; empty object valid. |
| `author.name` | string | No | Author name. |
| `author.email` | string | No | Author email; email syntax not validated by the portable contract. |
| `author.url` | string | No | Author URL; URL syntax not validated. |
| `homepage` | string | No | Homepage/documentation URL; syntax not validated. |
| `repository` | string | No | Source repository URL; syntax not validated. Not an install-source descriptor. |
| `license` | string | No | License identifier; SPDX recommended, not required. |
| `keywords` | string[] | No | Discovery/search tags. |
| `extensions` | map<namespace,object> | No | Client-owned extension data; special runtime tolerance described above. |

Sources: [§5](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#5-manifest), [manifest schema](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0/plugin.schema.json).

**Validation pitfalls:** unknown top-level fields make the manifest schema-nonconformant, but clients must report and ignore them and continue if otherwise valid. They must not assign those keys semantics. Other violations are fatal except non-object `extensions`. Unknown fields inside `author` are fatal. Metadata is type-checked, not URL/email/SPDX/SemVer validated. Specification prose is authoritative over JSON Schema. ([§5.2–5.4](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#52-manifest-object))

**Install contract:** a conformant client must load a plugin from a directory path and support at least one component type. There is no requirement to support both skills and MCP. Client conformance does not establish a universal installer CLI. ([§11](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#11-client-conformance))

| Requested mechanism | Agent Plugins 1.0 contract |
|---|---|
| Marketplace/catalog files and schemas | Not standardized. |
| Git/ref/SHA/npm/zip source descriptors | Not standardized; directory-path loading is the required baseline. |
| Install/enable commands and `enabledPlugins` settings | UNKNOWN/client-defined; no portable keys or disk records. |
| User/project/local/org scopes and precedence | UNKNOWN/not standardized. |
| Cache/install directories | UNKNOWN/client-defined. Paths shown in environment examples are illustrative, not required locations. |
| Update mechanics | `version` may be used for update/cache freshness; no scheduling, resolution, atomicity or rollback protocol specified. |
| Dependencies/transitive imports | No dependency declarations; explicitly a noncommitted future consideration. |
| Persistent state | Required client-managed `PLUGIN_DATA` for subprocess-capable clients, preserved across updates; uninstall deletion optional. |
| Spec versions | Each release publishes matching manifest and MCP schema versions; canonical schema identifiers cannot be reassigned. Older versions remain usable only where clients recognize them. |

Sources: [§§9–11](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#9-environment-variables-and-placeholder-expansion), [Future Considerations](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/FUTURE_CONSIDERATIONS.md).

**Compatible-client evidence:** the official [Compatible Clients page](https://agent-plugins.org/compatible-clients), as surfaced by live search, lists:

| Listed client | Skills | Listed MCP transports |
|---|---|---|
| VS Code | Yes | `stdio`, Streamable HTTP, legacy SSE |
| Cursor | Yes | `stdio`, Streamable HTTP, legacy SSE |
| GitHub Copilot | Yes | `stdio`, Streamable HTTP, legacy SSE |
| ChatGPT & Codex | Yes | `stdio`, Streamable HTTP |
| Kiro | Yes | `stdio`, Streamable HTTP, legacy SSE |
| Hermes Agent | Yes | `stdio`, Streamable HTTP |
| OpenClaw | Yes | `stdio`, Streamable HTTP, legacy SSE |
| Grok Bot | Yes | `stdio`, Streamable HTTP, legacy SSE |
| NanoClaw | Yes | `stdio`, Streamable HTTP |
| OpenHands | Yes | `stdio`, Streamable HTTP |

**Status limitation:** these are official-site compatibility listings, not independently verified shipped releases. Exact client versions, GA/experimental status, installation layouts, namespace contracts and adherence to every 1.0 requirement are **UNKNOWN** from the retrieved evidence. Direct page retrieval timed out; the table was available through live search. Do not equate support for skills/MCP generally with verified Agent Plugins 1.0 conformance.

## Notable gaps and ambiguities

- **Two component types, not a universal agent configuration format.** Rules, agents, commands, hooks and all other capabilities require client extensions or separate formats; putting their native keys at manifest root is not conformant. ([§§7–8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#7-component-types))
- **Lossless ACF round trips need preservation beyond typed portable fields.** Unknown extension namespaces cannot be validated or interpreted by a non-owning client; extension file trees can carry arbitrary client-specific content. Unknown root fields must be ignored operationally, not given native semantics. ([§§5.2, 8](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#8-client-extensions))
- **Schema validation alone is insufficient.** Strict whole-manifest/whole-MCP rejection would violate required nonfatal boundaries; filesystem containment, URL/header semantics and environment-name handling also need semantic checks. ([§§4.1, 5.2, 7.2, 8.1, 9](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md))
- **No secret portability.** Arbitrary `${ENV_VAR}` expansion is expressly forbidden; `envFile` and secret references are absent. Credentials require client-managed mechanisms rather than embedding or silently expanding them. ([§§7.2.1, 9.2](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#92-placeholder-expansion))
- **External skill specification is unversioned in the dependency link.** Agent Plugins points to a live URL; the fetched skill document has no visible release identifier, and its name-character wording is ambiguous. ([§7.1](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#71-skills), [Agent Skills](https://agentskills.io/specification))
- **Governance is separate from format semantics.** The charter defines community governance, individual roles, a TSC, no single-vendor majority of Core Maintainers, and a lead tie-breaker. It does not certify client compatibility or specify install policy. ([Technical Charter](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/GOVERNANCE.md))
- **Published versus draft versus contemplated:** 1.0.0 is published; 1.1.0 is a working draft. Trust, provenance, secrets, enterprise controls, audit schemas, dependency resolution and testing conventions are merely non-normative future considerations, explicitly uncommitted. ([README](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/README.md), [Future Considerations](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/FUTURE_CONSIDERATIONS.md))
- **Research boundary:** no repository/application changes were made. Official-site direct access failed; normative findings use official GitHub specification/schema sources. Client-specific shipped behavior remains unverified and must be researched separately before selecting native writer/install behavior.
