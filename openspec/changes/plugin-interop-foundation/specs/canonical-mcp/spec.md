## Purpose

Defines the canonical MCP server fields this change reads from Agent Plugins `mcp.json` and Claude plugin `.mcp.json` and writes to Claude and the existing loose targets, the package-root and data placeholders, the MCP meanings that stay pending as per-target extras, and the per-target, per-carrier MCP support table. Amends SPEC.md §13a and §22.5. Server enablement, tool filters and timeouts are added by the `canonical-skill-mcp-extensions` change; Agent Plugins client columns by the `agent-plugins-output` change.

## ADDED Requirements

### Requirement: Canonical MCP server fields
The canonical MCP server SHALL carry SPEC.md §13a fields (`name`, `description`, `transport` of `stdio`, `http` or `sse`, `command`, `args`, `env`, `url`, `headers`, `only`, `except`, `targets`) and the additional core field `cwd` (stdio working directory, starting with `${ACF_CAPABILITY_DIR}`, `${ACF_DATA_DIR}` or `./`). An omitted `cwd` means the server assumes no working directory, as existing ACF servers do, and writers SHALL then emit no working directory. `url` SHALL be `https://`, or `http://` only for `localhost`, `127.0.0.1` or `[::1]`, and SHALL NOT contain userinfo. `transport: http` means Streamable HTTP; readers map Agent Plugins `streamable-http` and Claude `http` to it.

#### Scenario: Server with cwd
- **WHEN** an `mcp.yml` server declares `transport: stdio`, `command: node` and `cwd: ./server`
- **THEN** validation succeeds

#### Scenario: Credentials in a URL
- **WHEN** a server declares `url: https://user:secret@example.com/mcp`
- **THEN** validation fails without echoing the credential

### Requirement: Placeholder mapping on read
Readers SHALL map Agent Plugins `${PLUGIN_ROOT}` and Claude `${CLAUDE_PLUGIN_ROOT}` to `${ACF_CAPABILITY_DIR}`, Agent Plugins `${PLUGIN_DATA}` and Claude `${CLAUDE_PLUGIN_DATA}` to `${ACF_DATA_DIR}`, and an Agent Plugins `command` beginning `./` to `${ACF_CAPABILITY_DIR}/`, in exactly the fields where the source format expands them. Any other `${...}` reference in a field the source host expands SHALL make the server a pending-meaning server (Pending MCP meanings).

#### Scenario: Packaged command in an Agent Plugins server
- **WHEN** an Agent Plugins `mcp.json` server declares `"command": "./bin/server"` and `"args": ["--db", "${PLUGIN_DATA}/x.db"]`
- **THEN** the canonical server has `command: ${ACF_CAPABILITY_DIR}/bin/server` and `args: ["--db", "${ACF_DATA_DIR}/x.db"]`

### Requirement: Effective working directory on read
Readers SHALL write a source format's documented default working directory into the canonical `cwd`, so that relative paths in `command`, `args` and `env` keep their meaning on every target. The Agent Plugins reader SHALL set `cwd: ${ACF_CAPABILITY_DIR}` for a stdio server that omits `cwd`, because Agent Plugins 1.0 defaults it to the plugin root. Claude documents no server working directory, so a Claude plugin author cannot rely on one; the Claude reader SHALL leave `cwd` omitted, with the meaning in Canonical MCP server fields. A writer whose target cannot carry the resulting `cwd` SHALL refuse the server; it SHALL NOT drop `cwd` on the assumption that the host's default is the same directory unless a `verified` registry cell records that it is.

#### Scenario: Omitted cwd in an Agent Plugins server
- **WHEN** an Agent Plugins stdio server declares `"command": "node"`, `"args": ["./dist/index.js"]` and no `cwd`, and is installed for Codex
- **THEN** the canonical server has `cwd: ${ACF_CAPABILITY_DIR}` and the Codex entry's `cwd` is the absolute capability directory

#### Scenario: Omitted cwd to Claude
- **WHEN** the same server is planned for Claude with no `verified` Claude working-directory cell
- **THEN** the negative fixture asserts that neither the plugin `.mcp.json` nor the project `.mcp.json` contains the server, that no command wrapper is emitted, and that the plan reports `acf.support.refused` naming the working directory

### Requirement: Data directory placeholder
SPEC.md §13a.4.1 SHALL add `${ACF_DATA_DIR}`: a persistent, writable directory per capability and install scope that survives updates. Writers SHALL map it to `${CLAUDE_PLUGIN_DATA}` in Claude plugins and to a caplet-managed absolute directory `<install-root>/.acf/data/<capability>/` (the target's install root for the scope) for loose carriers, which apply SHALL create. The existing rule that host environment variables are never expanded SHALL remain.

#### Scenario: Data directory in a Claude plugin
- **WHEN** a server declares `args: ["--db", "${ACF_DATA_DIR}/index.db"]` and is written as a Claude plugin
- **THEN** the plugin's `.mcp.json` contains `"${CLAUDE_PLUGIN_DATA}/index.db"`

### Requirement: Pending MCP meanings
The following MCP meanings SHALL be pending core in this change: server enablement, tool allow- and denylists, startup and tool timeouts, `envFile`, Unix-socket transport, `headersHelper`, OAuth settings, tool auto-approval, deferred-loading and promotion hints, watch-restart, and references to host environment variables, files or user options inside values. Native ACF SHALL author them through `targets.<target>.native` on the server, in the target's native spelling. Readers SHALL keep a server whose meaning depends on a reference or authentication mechanism the canonical schema cannot express (host environment references, `headersHelper`, `${user_config.*}`, OAuth) as native remainder of the source format (whole server, not partially projected), emit it unchanged to that format, and report it as untranslated elsewhere; other pending keys on an otherwise canonical server SHALL be read as that format's extras.

#### Scenario: OAuth server in a Claude plugin
- **WHEN** a Claude plugin server declares `oauth.clientId`
- **THEN** the server is emitted unchanged for Claude and listed as untranslated for Codex

#### Scenario: Claude tool timeout kept as a Claude extra
- **WHEN** a Claude plugin server declares `"timeout": 30000` and the capability is installed for Claude and Codex
- **THEN** the Claude plugin `.mcp.json` keeps `"timeout": 30000` and the Codex entry omits it with `acf.extras.dropped`

### Requirement: Per-target MCP support
MCP writers SHALL apply this table. Columns as in the skill table; Pi refers to the `pi-mcp-adapter` configuration that caplet's Pi target writes, since Pi core has no MCP.

| Canonical | Class | CC/p | CC/l | CX | CU | OC | PI |
|---|---|---|---|---|---|---|---|
| `transport: stdio` | functional | N `command` | N `command` | N | N | T `type: local`, command array | N |
| `transport: http` | functional | N `type: http` | N `type: http` | N `url` | N `url` | N `type: remote` | N |
| `transport: sse` | functional | N `type: sse` | N `type: sse` | R | R | R | R |
| `command` (bare executable) | functional | N | N | N | N | N | N |
| `command` under `${ACF_CAPABILITY_DIR}` | functional | T `${CLAUDE_PLUGIN_ROOT}/x` | T absolute | T absolute | T absolute | T absolute | T absolute |
| `command` (absolute path) | functional | N | N | N | N | N | N |
| `args`, `env` | functional | N | N | N | N | T `environment` | N |
| `cwd` | functional | R | R | N | N | N | N |
| `url`, literal `headers` | functional | N | N | N `url`, `http_headers` | N | N | N |
| `${ACF_CAPABILITY_DIR}` in `args`, `env`, `cwd` | functional | T `${CLAUDE_PLUGIN_ROOT}` | T absolute | T absolute | T absolute | T absolute | T absolute |
| `${ACF_CAPABILITY_DIR}` in `url`, `headers` | functional | R | R | R | R | R | R |
| `${ACF_DATA_DIR}` in `args`, `env`, `cwd` | functional | T `${CLAUDE_PLUGIN_DATA}` | T caplet dir | T caplet dir | T caplet dir | T caplet dir | T caplet dir |

The Claude `cwd` cells are refusals with `verified` evidence: Claude ignores a server `cwd` key (both `${CLAUDE_PLUGIN_ROOT}` and absolute values) and starts plugin stdio servers in the directory `claude` was launched from, not the plugin root (Claude 2.1.97). This includes the plugin-root `cwd` that the Agent Plugins reader materializes; a POSIX `cd` wrapper is not used because it changes the executed command and fails on Windows. Path placeholders in `url` and `headers` are refused everywhere because no tool shares a meaning for a filesystem path in a URL.

#### Scenario: Agent Plugins server with cwd to Claude
- **WHEN** an Agent Plugins server with `"cwd": "./server"` is planned for Claude
- **THEN** the server is refused for Claude with `acf.support.refused`, and no command wrapper is emitted

### Requirement: Native MCP serialization per target
MCP writers SHALL emit each target's native shape from the canonical server plus that target's native extras, and SHALL NOT emit canonical-only keys. The Claude plugin carrier SHALL write MCP configuration inside the package (`.mcp.json`) and SHALL NOT also write user or project MCP files for the same server.

#### Scenario: Claude plugin MCP
- **WHEN** a capability with one stdio server is written as a Claude plugin
- **THEN** the server appears in the plugin's `.mcp.json` and not in the project `.mcp.json`
