## ADDED Requirements

### Requirement: Server enablement
The canonical MCP server SHALL accept `enabled` (boolean, default `true`). `enabled: false` has two parts: the server SHALL NOT start (`restricting`), and the definition stays installed so the user can enable it in the host (`descriptive`). Where the target has a native per-server disable (Codex `enabled = false`, OpenCode `enabled: false`), the writer SHALL emit it. Elsewhere the writer SHALL omit the server, which keeps the restricting part, and SHALL report the loss of the dormant definition as a declared degradation `acf.support.degraded` with severity `lossy`, naming the server and that enabling it requires changing the declaration. Writers SHALL NOT write host enablement state that the consumer owns (such as Claude `disabledMcpjsonServers`).

#### Scenario: Disabled server for Claude
- **WHEN** a server with `enabled: false` is planned for Claude and Codex
- **THEN** the Codex entry contains `enabled = false`, the Claude output has no entry for the server, and the plan shows a `lossy` degradation for Claude

### Requirement: Tool filters
The canonical MCP server SHALL accept `tools.enabled` (non-empty allowlist of exact tool names) and `tools.disabled` (denylist of exact tool names that wins over the allowlist), both `restricting`. Cells: Codex loose N `enabled_tools` / `disabled_tools`; Copilot loose carrier N `tools` for `tools.enabled` and R for `tools.disabled`; Pi (pi-mcp-adapter) N `excludeTools` for `tools.disabled` and R for `tools.enabled`; every plugin carrier whose MCP schema cannot carry them SHALL refuse, including Claude (no documented per-server filter; `permissions.deny` is a permission rule, not a visibility filter) and every Agent Plugins profile (the closed 1.0 `mcp.json` schema invalidates a server with unknown keys). All other targets SHALL refuse. The recovery for a plugin-carrier refusal SHALL name `targets.<id>.carrier: loose` where the loose carrier is native, and `except` otherwise.

#### Scenario: Allowlist to Copilot plugin carrier
- **WHEN** a server with `tools.enabled: [search]` is planned for Copilot with the plugin carrier
- **THEN** the server is refused for Copilot with `acf.support.refused`, no `mcp.json` contains a `tools` key, and the recovery names `targets.copilot.carrier: loose`

#### Scenario: Allowlist to Copilot loose carrier
- **WHEN** the same server is planned for Copilot with `carrier: loose`
- **THEN** the Copilot MCP configuration entry contains `"tools": ["search"]`

### Requirement: Server timeouts
The canonical MCP server SHALL accept `timeouts.startupMs` and `timeouts.toolMs` (positive integer milliseconds), both `descriptive`. Each native cell SHALL state its unit and value domain: Claude `timeout` is the per-server tool timeout in milliseconds with a documented minimum of 1000, so `toolMs` SHALL map to it natively only when the value is at least 1000 and SHALL otherwise be dropped with a `lossy` diagnostic naming the minimum, never clamped; Claude has no per-server startup timeout (`MCP_TIMEOUT` is a process-wide environment variable caplet does not set), so `startupMs` SHALL be dropped for Claude. Codex SHALL receive `startup_timeout_ms` natively and `tool_timeout_sec` as `toolMs / 1000`. OpenCode `timeout` is documented inconsistently (server requests versus tool fetching) and SHALL NOT be used for either field. Copilot loose `timeout` covers discovery and tool calls together and SHALL NOT be used for either field. All other cells drop the value with a `lossy` diagnostic.

#### Scenario: Claude tool timeout above the minimum
- **WHEN** a server with `timeouts.toolMs: 30000` is written for Claude
- **THEN** the Claude entry contains `"timeout": 30000`

#### Scenario: Claude tool timeout below the minimum
- **WHEN** a server with `timeouts.toolMs: 500` is written for Claude
- **THEN** the Claude entry has no `timeout` key and the plan reports the drop with the 1000 ms minimum
