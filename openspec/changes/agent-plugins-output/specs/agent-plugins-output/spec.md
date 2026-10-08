## Purpose

Defines how caplet writes Agent Plugins 1.0 packages for Codex, Copilot, VS Code and Cursor through client profiles, which skill and MCP fields each profile carries, and how those packages are registered with each client. Amends SPEC.md §22.1, §22.2 and §22.5.

## ADDED Requirements

### Requirement: New targets and plugin carriers
The target registry SHALL add `copilot` (GitHub Copilot CLI) and `vscode` (VS Code agent mode) targets, and `targets.<id>.carrier: plugin` SHALL become valid for `codex`, `copilot`, `vscode` and `cursor`. Defaults: `copilot` and `vscode` use `plugin`; `codex` and `cursor` use `loose` until their plugin route has a `verified` installation test, after which their default is `plugin`; `opencode` and `pi` support only `loose`.

#### Scenario: Opt into the Codex plugin carrier
- **WHEN** `caplet.yml` sets `targets.codex.carrier: plugin`
- **THEN** caplet writes an Agent Plugins package with the Codex profile instead of loose Codex files

#### Scenario: Plugin carrier for Pi
- **WHEN** `caplet.yml` sets `targets.pi.carrier: plugin`
- **THEN** configuration loading fails naming the target

### Requirement: Agent Plugins package layout
The Agent Plugins writer SHALL produce, per capability and client profile, a directory containing `plugin.json` with `$schema` set to the Agent Plugins 1.0 plugin schema and the mapped package metadata, `skills/<name>/` for each emitted skill, `mcp.json` with the 1.0 MCP schema when at least one server is emitted (metadata uses the target's `targets.<target>.package` values where set; an Agent Plugins reader records out-of-domain manifest values as package values of every Agent Plugins profile target), and namespace data and directories only for the profile's own extension dialect. The package SHALL validate against the pinned Agent Plugins 1.0 schemas (commit `ff8ab5e392cc87bd88d87c060815a87490e51003`).

#### Scenario: ACF capability to Codex
- **WHEN** an ACF capability with two skills and one stdio server is emitted with the Codex profile
- **THEN** the package contains `plugin.json`, `skills/<a>/SKILL.md`, `skills/<b>/SKILL.md` and `mcp.json`, and validates against the pinned schemas

### Requirement: Lossless Agent Plugins round trip
An Agent Plugins source written for a client whose profile requires no rewrite of its content, with no transformation applied, SHALL be emitted byte-, path- and mode-identical to the preserved source, including unknown extension namespaces and unreferenced files.

#### Scenario: Unknown namespace and irregular JSON
- **WHEN** an unchanged Agent Plugins package with an unknown `com.example.client` namespace, an unreferenced executable file and irregularly formatted JSON is installed for Codex with the plugin carrier
- **THEN** the Codex package tree is byte-, path- and mode-identical to the source

### Requirement: Client profiles
A client profile SHALL bind a target to its support column, placeholder dialect, extension namespaces and installation route. Profiles: `generic` (any conforming consumer; root components only), `codex`, `copilot`, `vscode` and `cursor`. The `generic` profile SHALL refuse any restricting field that the generic column cannot carry, because conforming consumers may ignore every extension. Cursor does not expand `${PLUGIN_ROOT}` or `${PLUGIN_DATA}` and expands `${CURSOR_PLUGIN_ROOT}`; the Cursor profile SHALL rewrite capability-root references in `args` and `env` values to `${CURSOR_PLUGIN_ROOT}` and refuse packaged `command` paths, data-directory references and `cwd` (Agent Plugins MCP support columns).

#### Scenario: Cursor placeholder dialect
- **WHEN** the same server with `${ACF_CAPABILITY_DIR}` in `args` is written with the `codex` and the `cursor` profile
- **THEN** the Codex package uses `${PLUGIN_ROOT}` and the Cursor package uses `${CURSOR_PLUGIN_ROOT}`

### Requirement: Agent Plugins skill support columns
Skill writers SHALL apply these cells for the plugin carrier (AP generic, CX Codex profile, CP Copilot, VS VS Code, CU Cursor profile), in addition to the skill table of `plugin-interop-foundation`.

| Canonical | Class | AP | CX | CP | VS | CU |
|---|---|---|---|---|---|---|
| `name`, `description` | functional | N | N | N | N | N |
| `license`, `compatibility`, `metadata` | descriptive | N | N | N | N | N |
| `invocation.model: false` | restricting | R | N `policy.allow_implicit_invocation: false` in `agents/openai.yaml` (R until the Codex verification records that plugin skills read it) | N `disable-model-invocation: true` | N `disable-model-invocation: true` | N `disable-model-invocation: true` |
| `invocation.user: false` | restricting | R | R | N `user-invocable: false` | R | R |
| `argument-hint` | descriptive | D | D | N | N | D |

Copilot documents that `user-invocable: false` disables `/SKILL-NAME`; VS Code documents the same key only as slash-menu visibility, which does not establish that explicit invocation is refused, so the VS Code cell is a refusal until a `verified` test shows otherwise. Cells for Copilot, VS Code and Cursor rest on documentation evidence and SHALL record it.

#### Scenario: User-only skill to Copilot and VS Code
- **WHEN** a skill with `invocation.user: false` is planned for Copilot and VS Code
- **THEN** the Copilot package contains `user-invocable: false`, and the skill is refused for VS Code with no VS Code package file containing it

### Requirement: Agent Plugins MCP support columns
MCP writers SHALL apply these cells for the plugin carrier, in addition to the MCP table of `plugin-interop-foundation`. The Agent Plugins 1.0 MCP schema is closed: no field outside it SHALL be written into `mcp.json`.

| Canonical | Class | AP, CP, VS | CX | CU |
|---|---|---|---|---|
| `transport: stdio` | functional | N `type: stdio` | N `type: stdio` | N |
| `transport: http` | functional | N `type: streamable-http` | N `type: streamable-http` | R |
| `transport: sse` | functional | N `type: sse` (deprecated; `info`) | R | R |
| `command` under `${ACF_CAPABILITY_DIR}` | functional | T `./x` | T `./x` | R |
| `command` (absolute path) | functional | R | R | R |
| `args`, `env` | functional | N | N | N |
| `cwd: ${ACF_CAPABILITY_DIR}` | functional | T omitted (the 1.0 default) | T omitted | R |
| other `cwd` | functional | N | N | R |
| `url`, literal `headers` | functional | N | N | R |
| `${ACF_CAPABILITY_DIR}` in `args`, `env`, `cwd` | functional | T `${PLUGIN_ROOT}` | T `${PLUGIN_ROOT}` | T `${CURSOR_PLUGIN_ROOT}` in `args` and `env` |
| `${ACF_DATA_DIR}` in `args`, `env`, `cwd` | functional | T `${PLUGIN_DATA}` | T `${PLUGIN_DATA}` | R |

Evidence for the cells that differ from the Agent Plugins column: Agent Plugins 1.0 allows only a bare executable or a `./` path in `command` and expands no placeholder there (`research/plugin-interop/tools/agent-plugins.md`, MCP fields and expansion). Cursor documents `${CURSOR_PLUGIN_ROOT}` in `command` only for its own plugin MCP format and does not document resolving a `./` command or a default working directory for Agent Plugins packages (`tools/cursor.md`, MCP), so packaged commands and every `cwd` are refused for Cursor until a `verified` Cursor test shows that `./x` and the default working directory resolve against the plugin root, after which those cells become T `./x` and T omitted; a native `.cursor-plugin` writer is a separate follow-up. Codex documents only STDIO and Streamable HTTP and its SSE runtime support is unknown (`tools/codex.md`, MCP), so SSE is refused for Codex until Codex documentation or a `verified` test shows that a plugin SSE server connects.

#### Scenario: Packaged command for Cursor
- **WHEN** a server with `command: ${ACF_CAPABILITY_DIR}/bin/server` is written with the Codex and the Cursor profile and no `verified` Cursor command cell exists
- **THEN** the Codex `mcp.json` contains `"command": "./bin/server"`, the server is refused for Cursor with `acf.support.refused`, and no Cursor `mcp.json` contains a placeholder in `command`

#### Scenario: SSE server for Codex
- **WHEN** a server with `transport: sse` is written with the Copilot and the Codex profile
- **THEN** the Copilot `mcp.json` contains `"type": "sse"` and the server is refused for Codex

#### Scenario: Data directory in an Agent Plugins package
- **WHEN** a server declares `args: ["--db", "${ACF_DATA_DIR}/index.db"]` and is written with the Codex profile
- **THEN** `mcp.json` contains `"${PLUGIN_DATA}/index.db"`

### Requirement: Package output location
Generated packages SHALL be written at `<install-root>/.acf/plugins/<capability>/`, where `<install-root>` is the target's install root for the scope (SPEC.md §22.2), except where the client's verified route requires a fixed location (Cursor user scope: `~/.cursor/plugins/local/<capability>/`). Cursor has no documented project-scope plugin location; a project-scope Cursor plugin carrier SHALL fall back to `loose` with an `info` diagnostic.

#### Scenario: Project scope for Cursor
- **WHEN** a project-scope apply selects Cursor with `carrier: plugin`
- **THEN** Cursor output is loose and the plan states why

### Requirement: Client registration
After writing a package, caplet SHALL register it with the client only through a route recorded as `verified` in the registry, and SHALL otherwise report host state `registration required` with the exact documented command or setting. Codex SHALL be the first client whose route is verified and automated; Copilot SHALL be second. Planned routes: Codex adds the package to a local catalog (`.agents/plugins/marketplace.json` or `~/.agents/plugins/marketplace.json`) and enables it through the verified headless route, otherwise reporting the `[plugins."<p>@<m>"]` enablement; Copilot `copilot plugin install <dir>` and `copilot plugin enable|disable <name>` (or a directory marketplace in `~/.copilot/settings.json` or `.github/copilot/settings.json` when it live-loads updates); VS Code reuses Copilot CLI installations and otherwise reports the `chat.pluginLocations` entry, which caplet SHALL NOT write into user-owned VS Code settings; Cursor needs no registration beyond its local plugin directory and a reload. Registration failure SHALL leave written files in place, SHALL NOT fall back to the loose carrier, and SHALL be reported per target.

#### Scenario: Unverified route
- **WHEN** the VS Code route has no `verified` evidence and a VS Code package is written
- **THEN** apply succeeds for files, `caplet status` shows `vscode: registration required`, and the output names the `chat.pluginLocations` entry to add

#### Scenario: Registration refused by policy
- **WHEN** `copilot plugin install` fails because an organization policy blocks local plugins
- **THEN** the target reports `blocked by host policy` and no loose Copilot files are written instead

### Requirement: Agent Plugins host state
For each plugin-carrier target and capability, `caplet status` and `caplet apply` SHALL report the file state (current, drifted, missing) and the host state: `registered`, `registration required`, `disabled by user`, `blocked by host policy`, or `unknown` (client not installed or state not readable), the same vocabulary as Claude host state in `plugin-interop-foundation`. A package that the user disabled in the client SHALL NOT be re-enabled by caplet; updates SHALL still write files and keep it disabled.

#### Scenario: User disabled the plugin
- **WHEN** the user disables a caplet-installed Codex plugin and runs `caplet apply` after an update
- **THEN** the package files are updated, the plugin stays disabled, and status shows `disabled by user`
