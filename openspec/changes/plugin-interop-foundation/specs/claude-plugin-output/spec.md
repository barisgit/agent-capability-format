## Purpose

Defines how caplet emits Claude capabilities as a real Claude plugin, registers and enables it through a caplet-owned local marketplace and the `claude plugin` CLI, maps ACF scopes to Claude scopes, reports host state, and migrates existing loose Claude output safely. Amends SPEC.md §14.7, §22.2 and §22.5.

## ADDED Requirements

### Requirement: Claude carrier selection
`caplet.yml` SHALL accept `targets.claude.carrier: plugin | loose`, defaulting to `plugin`. In this change every other target supports only `loose`; `targets.<id>.carrier: plugin` for another target SHALL be a configuration error naming the target. Selecting `loose` for Claude SHALL keep today's loose Claude output for eligible capabilities and SHALL uninstall caplet's Claude plugins through the same ownership rules as the migration.

#### Scenario: Plugin carrier for Codex
- **WHEN** `caplet.yml` sets `targets.codex.carrier: plugin`
- **THEN** configuration loading fails naming `codex` and stating that only `loose` is available

### Requirement: Claude plugin package
For the Claude plugin carrier, caplet SHALL write one Claude plugin per capability at `<install-root>/.acf/marketplace/plugins/<capability>/`, where `<install-root>` is the Claude install root of the scope (`.claude/` for project, `~/.claude/` for user; SPEC.md §22.2), containing `.claude-plugin/plugin.json` (mapped package metadata plus package-level Claude extras, `name` equal to the capability slug), `skills/<name>/` for each emitted skill, `.mcp.json` when at least one server is emitted, and the capability's Claude native remainder and `native/claude/` files. `version` SHALL be `<base>+acf.<d>`, where `<base>` is `targets.claude.package.version` when set and the capability version otherwise, `<d>` is the first 12 hex digits of the payload digest, and the separator is `.` instead of `+` when `<base>` already contains `+`, so every content change produces a new Claude plugin version. An unchanged Claude plugin source SHALL be written byte-identically except `plugin.json` `version`, which SHALL NOT be rewritten when the source already declares one; in that case caplet SHALL use the update command of the registration requirement to refresh content.

#### Scenario: ACF capability to Claude
- **WHEN** ACF capability `review` version `1.2.0` with one skill and one stdio server is applied for Claude at project scope
- **THEN** `.claude/.acf/marketplace/plugins/review/` contains `.claude-plugin/plugin.json` with `"name": "review"` and a version starting `1.2.0+acf.`, `skills/<skill>/SKILL.md` and `.mcp.json`

### Requirement: Claude capabilities eligible for the plugin carrier
A capability SHALL use the Claude plugin carrier when every Claude-selected component is a skill, an MCP server, Claude native remainder, or a `native/claude/` file. A native ACF capability that also selects agents, commands, hooks or instructions for Claude SHALL stay whole on the loose Claude carrier with an `info` diagnostic `acf.claude.legacy-carrier`; caplet SHALL NOT split one capability across both carriers.

#### Scenario: Capability with a hook
- **WHEN** an ACF capability with one skill and one hook is applied for Claude
- **THEN** both are emitted with the loose Claude carrier and the plan shows `acf.claude.legacy-carrier`

### Requirement: Caplet-owned local marketplace
Caplet SHALL maintain one Claude marketplace per install scope at `<install-root>/.acf/marketplace/` with `.claude-plugin/marketplace.json` listing every caplet-generated Claude plugin of that scope by relative `./plugins/<capability>` source. The marketplace name SHALL be `acf-user` for user scope and SHALL be stable across machines yet distinct between projects for project scope; the name and the scope SHALL be recorded in the sidecar. Caplet SHALL NOT write Claude's private plugin state (`~/.claude/plugins/` caches, install records or known-marketplace files) and SHALL NOT edit `enabledPlugins` or `extraKnownMarketplaces` directly.

#### Scenario: Marketplace listing follows desired state
- **WHEN** capability `lint` is removed from `capabilities.yml` and apply runs
- **THEN** `marketplace.json` no longer lists `lint` and the `lint` plugin directory is deleted after uninstall succeeds

### Requirement: Registration and enablement through the Claude CLI
Caplet SHALL register and enable Claude plugins only with the `claude` CLI, in this order: `claude plugin marketplace add <marketplace-dir> --scope <scope>` when the marketplace is not yet known for that scope; `claude plugin install <capability>@<marketplace> --scope <scope>` for each newly desired plugin; the CLI's update command for each plugin whose generated content changed; and `claude plugin uninstall <capability>@<marketplace> --scope <scope>` for each plugin no longer desired. It SHALL read host state with `claude plugin list --json`. Exact flags of the update, uninstall and list commands, and what project-scope registration records in committed files, SHALL be pinned by the Claude registration verification task against the locally installed Claude Code (2.1.97 at the time of writing) before this requirement ships; arguments SHALL be passed as an argument vector, never through a shell.

#### Scenario: First install
- **WHEN** apply installs capability `review` at user scope and the marketplace is not registered
- **THEN** caplet runs `claude plugin marketplace add ~/.claude/.acf/marketplace --scope user`, then `claude plugin install review@acf-user --scope user`, and `claude plugin list --json` reports `review@acf-user` as enabled

#### Scenario: Content update is visible to Claude
- **WHEN** a skill body of an installed capability changes and apply runs
- **THEN** a new Claude session loads the changed skill body

### Requirement: Scope mapping
ACF `user` scope SHALL map to Claude `user` scope and ACF `project` scope to Claude `project` scope. Caplet SHALL NOT register at Claude `local` or `managed` scope. When `claude plugin list --json` shows the same plugin also enabled or disabled at `local` or `managed` scope, caplet SHALL report it and SHALL NOT change that state. Until the team-sharing question for project marketplaces is answered, project-scope registration SHALL NOT be enabled by default if the verification task shows that Claude records a machine-specific absolute path in a committed file; in that case host state is `registration required` with the exact command.

#### Scenario: Local override
- **WHEN** a teammate disabled `review@<project marketplace>` at Claude `local` scope
- **THEN** project apply keeps the project registration, does not touch local settings, and status shows `disabled by user (local scope)`

### Requirement: Claude host state
`caplet status` and `caplet apply` SHALL report, per Claude-plugin capability and scope, the file state (current, drifted, missing) and the host state: `registered`, `registration required`, `disabled by user`, `blocked by host policy`, or `unknown` (CLI not installed or state not readable). When the `claude` CLI is missing or fails to start, caplet SHALL write the plugin and marketplace, report `registration required` with the exact commands, and SHALL NOT treat this as an apply failure. When the CLI reports a policy block (strict or blocked marketplaces, plugin-only customization), the state SHALL be `blocked by host policy` and caplet SHALL NOT fall back to the loose carrier. A plugin the user disabled in Claude SHALL NOT be re-enabled by caplet; updates SHALL still write files and keep it disabled.

#### Scenario: No Claude CLI
- **WHEN** `claude` is not on `PATH` during apply
- **THEN** plugin files are written, apply exits 0 with a warning, and the warning lists the `marketplace add` and `install` commands

#### Scenario: User disabled the plugin
- **WHEN** the user disables a caplet-installed Claude plugin and runs `caplet apply` after an update
- **THEN** the plugin files are updated, the plugin stays disabled, and status shows `disabled by user`

### Requirement: Migration from loose Claude output
When a capability moves from the loose Claude carrier to the plugin carrier (first apply after upgrade, or a carrier change), caplet SHALL plan the migration as one unit per capability and scope: write the plugin, register and install it, and only after the host reports it registered, retire that capability's loose Claude artifacts. Retirement SHALL delete only paths recorded in the sidecar as owned by that capability for target `claude` whose current content hash equals the recorded hash; it SHALL remove owned keys from merged files such as `.mcp.json` by JSON pointer, leaving other keys intact; and it SHALL keep `.agents/skills/<name>/` copies that a still-selected target discovers. A drifted artifact SHALL be left in place, its sidecar entry released, and a warning `acf.migration.drifted` SHALL name the path, the duplicate it causes, and the removal command. When registration does not succeed, the loose artifacts SHALL stay installed and owned.

#### Scenario: Clean migration
- **WHEN** capability `review` was installed loose for Claude and the user upgrades caplet and applies
- **THEN** the plugin is installed, `.claude/skills/<skill>/` and its owned `.mcp.json` entry are removed, and the sidecar lists the plugin files

#### Scenario: Drifted loose skill
- **WHEN** the user edited `.claude/skills/<skill>/SKILL.md` before the migrating apply
- **THEN** the edited file is kept, the plugin is installed, and the warning `acf.migration.drifted` names the file

#### Scenario: Registration fails during migration
- **WHEN** `claude plugin install` fails during the migrating apply
- **THEN** the loose artifacts remain installed and owned, and the next apply retries the migration

### Requirement: One-time invocation rename notice
The migration SHALL move Claude skills to plugin-qualified invocation names (`/<skill>` becomes `/<capability>:<skill>`). The plan and apply output of the first migrating apply for an install root SHALL show one notice listing each old and new invocation name; the sidecar SHALL record that the notice was shown, and later applies SHALL NOT repeat it. `--json` output SHALL carry the renames as structured data on that apply.

#### Scenario: Notice shown once
- **WHEN** a project with loose Claude skill `review` from capability `review-kit` is migrated, and apply runs again afterwards
- **THEN** the first apply shows `/review -> /review-kit:review` and the second apply shows no rename notice

### Requirement: Managed notices outside plugin packages
SPEC.md §14.7 SHALL be amended: caplet SHALL NOT write `ACF-MANAGED.md` inside generated plugin packages or preserved foreign payloads. The install-root `ACF-MANAGED.md` inventory SHALL list each generated plugin directory and the marketplace directory as caplet-owned, and the per-artifact notices of retired loose skill directories SHALL be removed with those directories.

#### Scenario: Notice placement
- **WHEN** a Claude plugin is generated
- **THEN** no `ACF-MANAGED.md` exists under `.acf/marketplace/plugins/<capability>/`, and the install-root inventory lists that directory
