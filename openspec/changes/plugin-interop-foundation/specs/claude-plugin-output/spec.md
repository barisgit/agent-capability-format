## Purpose

Defines how caplet emits Claude capabilities as a real Claude plugin, registers and enables it through a caplet-owned local marketplace and the `claude plugin` CLI, maps ACF scopes to Claude scopes, reports host state, and migrates existing loose Claude output safely. Amends SPEC.md §14.7, §22.2 and §22.5.

## ADDED Requirements

### Requirement: Claude carrier selection
`caplet.yml` SHALL accept `targets.claude.carrier: plugin | loose`, defaulting to `plugin`. In this change every other target supports only `loose`; `targets.<id>.carrier: plugin` for another target SHALL be a configuration error naming the target. Selecting `loose` for Claude SHALL keep today's loose Claude output for eligible capabilities and SHALL uninstall caplet's Claude plugins through the same ownership rules as the migration. That uninstall SHALL pass `--keep-data`. Because Claude deletes the options and secrets it saved for a plugin on the uninstall of the id's last install even with `--keep-data` (verified with Claude 2.1.97), caplet SHALL keep such a plugin installed while user settings hold `pluginConfigs` for it or cannot be read, or its generated manifest declares `userConfig`, a channel `userConfig` or an MCP bundle, and SHALL warn with `acf.claude.uninstall-held` giving the uninstall command to run by hand.

#### Scenario: Switching to loose keeps Claude's plugin data
- **WHEN** `targets.claude.carrier` changes to `loose` for a project whose capability `review` is installed as a plugin with no saved options
- **THEN** apply writes the loose files and runs `claude plugin uninstall review@acf-project-<h> --scope local --keep-data`, so the plugin's data directory survives

#### Scenario: Switching to loose holds a plugin with saved options
- **WHEN** the switch to `loose` finds `pluginConfigs` for `review@acf-project-<h>` in the user settings and no other install of it
- **THEN** apply does not uninstall it, keeps its plugin files and marketplace, and warns with `acf.claude.uninstall-held` naming `claude plugin uninstall review@acf-project-<h> --scope local --keep-data`

#### Scenario: Plugin carrier for Codex
- **WHEN** `caplet.yml` sets `targets.codex.carrier: plugin`
- **THEN** configuration loading fails naming `codex` and stating that only `loose` is available

### Requirement: Claude plugin package
For the Claude plugin carrier, caplet SHALL write one Claude plugin per capability at `<install-root>/.acf/marketplace/plugins/<capability>/`, where `<install-root>` is the Claude install root of the scope (`.claude/` for project, `~/.claude/` for user; SPEC.md §22.2), containing `.claude-plugin/plugin.json` (mapped package metadata plus package-level Claude extras, `name` equal to the capability slug), `skills/<name>/` for each emitted skill, `.mcp.json` when at least one server is emitted, and the capability's Claude native remainder and `native/claude/` files. `version` SHALL be `<base>+acf.<d>`, where `<base>` is `targets.claude.package.version` when set and the capability version otherwise, `<d>` is the first 12 hex digits of the payload digest, and the separator is `.` instead of `+` when `<base>` already contains `+`, so every content change produces a new Claude plugin version. The version rule applies to Claude plugin sources too, with `<base>` the `version` their `plugin.json` declares: Claude copies installed plugins into a cache keyed by version, and `claude plugin update` ignores a content change under an unchanged version (verified with Claude 2.1.97). An unchanged Claude plugin source SHALL therefore be written byte-identically except the `plugin.json` `version` value, which caplet SHALL replace in place, or insert when the source declares none, without changing any other byte.

#### Scenario: Unchanged Claude plugin source
- **WHEN** an unchanged Claude plugin declaring `"version": "2.0.1"` is applied for Claude
- **THEN** the generated plugin equals the source except that the `version` value reads `2.0.1+acf.<d>`, and a later upstream content change without a version bump is picked up by `claude plugin update`

#### Scenario: ACF capability to Claude
- **WHEN** ACF capability `review` version `1.2.0` with one skill and one stdio server is applied for Claude at project scope
- **THEN** `.claude/.acf/marketplace/plugins/review/` contains `.claude-plugin/plugin.json` with `"name": "review"` and a version starting `1.2.0+acf.`, `skills/<skill>/SKILL.md` and `.mcp.json`

### Requirement: Claude configuration in a source not read as a Claude plugin
When caplet writes a capability that was not read as a Claude plugin (native ACF, Agent Plugins, bare skills) as a Claude plugin, it SHALL leave out of the plugin each entry Claude would read as plugin configuration without a manifest naming it (`.claude-plugin/`, `.mcp.json`, `.lsp.json`, `settings.json`, `agents/`, `commands/`, `hooks/hooks.json`, `output-styles/`, `workflows/`) and report each with an `info` diagnostic `acf.claude.plugin-file-ignored` that names the entry. For a native ACF capability it points to `native/claude/`, where files for the capability's Claude plugin belong (SPEC.md §14.4); for a foreign source it points to `format: claude-plugin`. The preserved source keeps these files. The capability's own `plugin.json` and `.mcp.json` are generated from its manifest and MCP servers. A Claude plugin source is not affected: those files are its own configuration.

#### Scenario: Agent Plugins package with a Claude MCP config
- **WHEN** an Agent Plugins package also contains `.mcp.json` declaring a stdio server and is applied for Claude
- **THEN** the generated plugin has no `.mcp.json` from the source, the server does not run, and the plan shows `acf.claude.plugin-file-ignored` for `.mcp.json`

#### Scenario: Native ACF capability with a .claude-plugin directory
- **WHEN** ACF capability `review` has a `.claude-plugin/` directory at its root and is applied for Claude with the plugin carrier
- **THEN** the generated plugin's `.claude-plugin/` holds only the generated `plugin.json`, and the plan shows `acf.claude.plugin-file-ignored` for `.claude-plugin` with a hint to use `native/claude/`

### Requirement: Claude capabilities eligible for the plugin carrier
A capability SHALL use the Claude plugin carrier when every Claude-selected component is a skill, an MCP server, Claude native remainder, or a `native/claude/` file. A native ACF capability that also selects agents, commands, hooks or instructions for Claude SHALL stay whole on the loose Claude carrier with an `info` diagnostic `acf.claude.legacy-carrier`; caplet SHALL NOT split one capability across both carriers.

#### Scenario: Capability with a hook
- **WHEN** an ACF capability with one skill and one hook is applied for Claude
- **THEN** both are emitted with the loose Claude carrier and the plan shows `acf.claude.legacy-carrier`

### Requirement: Caplet-owned local marketplace
Caplet SHALL maintain one Claude marketplace per install scope at `<install-root>/.acf/marketplace/` with `.claude-plugin/marketplace.json` listing every caplet-generated Claude plugin of that scope by relative `./plugins/<capability>` source. The marketplace name SHALL be `acf-user` for user scope and `acf-project-<h>` for project scope, where `<h>` is the first 8 hex digits of the SHA-256 of the project root's real path, because Claude keeps one marketplace record per name for the whole user and adding a second directory under a known name silently repoints it (verified with Claude 2.1.97); the name and the scope SHALL be recorded in the sidecar. When `claude plugin marketplace list --json` shows the name from a source other than `directory`, or from a directory whose real path is not caplet's marketplace directory, caplet SHALL run no `claude` command for that scope, SHALL report its plugins as `unknown`, and SHALL fail with the error `acf.claude.marketplace-foreign` naming the registered source, because `marketplace add` would repoint the name and uninstalling its plugins or removing it would change state caplet does not own. Caplet SHALL remove its marketplace only when the scope has no desired plugin, the sidecar records the marketplace, and the removal changes nothing caplet does not own, because `claude plugin marketplace remove` uninstalls that marketplace's plugins in every scope and directory and drops its declarations from the user settings and the working directory's project and local settings (verified with Claude 2.1.97). When another of those settings files declares the marketplace or cannot be read, or a plugin from it is installed outside caplet's registration, caplet SHALL keep the registration, rewrite `marketplace.json` with no plugins, and warn with `acf.claude.marketplace-kept` naming what keeps it and the removal command to run by hand. Caplet SHALL NOT write Claude's private plugin state (`~/.claude/plugins/` caches, install records or known-marketplace files) and SHALL NOT edit `enabledPlugins` or `extraKnownMarketplaces` directly.

#### Scenario: Marketplace listing follows desired state
- **WHEN** capability `lint` is removed from `capabilities.yml` and apply runs
- **THEN** `marketplace.json` no longer lists `lint` and the `lint` plugin directory is deleted after uninstall succeeds

#### Scenario: Caplet's marketplace name belongs to another directory
- **WHEN** `claude plugin marketplace list --json` lists `acf-user` as a directory source at `/srv/team` and apply desires `review` at user scope
- **THEN** caplet runs no `claude plugin marketplace`, `install`, `update` or `uninstall` command, reports `review` as `unknown`, and exits 2 with `acf.claude.marketplace-foreign` naming `/srv/team`

#### Scenario: Another settings file declares the marketplace
- **WHEN** the last user-scope plugin is removed and the working directory's `.claude/settings.json` also declares `acf-user`
- **THEN** caplet uninstalls the plugin, does not run `claude plugin marketplace remove acf-user`, rewrites `marketplace.json` with no plugins, and warns with `acf.claude.marketplace-kept` naming that file and the command

### Requirement: Registration and enablement through the Claude CLI
Caplet SHALL register and enable Claude plugins only with the `claude` CLI, in this order: `claude plugin marketplace add <marketplace-dir> --scope <claude-scope>` (idempotent, exit 0 when already known) before any install; `claude plugin install <capability>@<marketplace> --scope <claude-scope>` for each newly desired plugin; `claude plugin update <capability>@<marketplace> --scope <claude-scope>` for each installed plugin whose generated version changed; and `claude plugin uninstall <capability>@<marketplace> --scope <claude-scope>` for each plugin no longer desired, with `--keep-data` when its capability moved to the loose carrier (Carrier selection). `--scope` SHALL always be passed because these commands default to `user`. Caplet SHALL NOT run `install` for an already-installed plugin, because it re-enables a plugin the user disabled. It SHALL read host state with `claude plugin list --json` (an array of `{id, version, scope, enabled, installPath, ...}`). Flags, exit codes and JSON shapes are pinned by verified evidence from Claude 2.1.97 (`research/plugin-interop/tools/claude-code.md`, Runtime verification) and the fake-CLI fixtures under `apps/caplet/tests/fixtures/claude-cli/`; arguments SHALL be passed as an argument vector, never through a shell.

#### Scenario: First install
- **WHEN** apply installs capability `review` at user scope and the marketplace is not registered
- **THEN** caplet runs `claude plugin marketplace add ~/.claude/.acf/marketplace --scope user`, then `claude plugin install review@acf-user --scope user`, and `claude plugin list --json` reports `review@acf-user` as enabled

#### Scenario: Content update is visible to Claude
- **WHEN** a skill body of an installed capability changes and apply runs
- **THEN** a new Claude session loads the changed skill body

### Requirement: Scope mapping
ACF `user` scope SHALL map to Claude `user` scope. ACF `project` scope SHALL register the project marketplace and install its plugins at Claude `local` scope (`.claude/settings.local.json`), because Claude records a directory marketplace as a machine-specific absolute path in the scope's settings file, so `project` scope would commit one teammate's path into `.claude/settings.json` (verified with Claude 2.1.97; open question 7). Each teammate's `caplet apply` registers the project's plugins for their own checkout from the committed `capabilities.yml` and lock. Caplet SHALL NOT register at Claude `project` or `managed` scope. When `claude plugin list --json` shows the same plugin at another scope, caplet SHALL report it and SHALL NOT change that state. Caplet's own installation is the one at its Claude scope and, for `local`, its project root; Claude also lists the project and local installs of other directories (each with its `projectPath`), which caplet SHALL neither report nor treat as its own. When a project-scope plugin is also caplet's user plugin `<name>@acf-user`, wanted by the same run or installed and enabled at user scope, Claude loads the capability twice in that project and caplet cannot hide the user plugin for one project, so caplet SHALL warn with `acf.claude.duplicate-scope`.

#### Scenario: Project registration stays out of committed settings
- **WHEN** project apply registers capability `review`
- **THEN** caplet runs `claude plugin marketplace add <project>/.claude/.acf/marketplace --scope local` and `claude plugin install review@acf-project-<h> --scope local`, and `.claude/settings.json` is not changed by registration

#### Scenario: Capability at user and project scope
- **WHEN** `review@acf-user` is installed and enabled at user scope and project apply installs `review@acf-project-<h>`
- **THEN** apply installs the project plugin, leaves the user plugin alone, and warns with `acf.claude.duplicate-scope` that Claude loads `review` twice in the project

#### Scenario: Teammate disabled the plugin
- **WHEN** a teammate disabled `review@acf-project-<h>` in Claude and runs project apply after an update
- **THEN** apply updates the files with `claude plugin update`, does not re-enable the plugin, and status shows `disabled by user`

### Requirement: Claude host state
`caplet status` and `caplet apply` SHALL report, per Claude-plugin capability and scope, the file state (current, drifted, missing) and the host state: `registered`, `registration required`, `disabled by user`, `blocked by host policy`, `unknown` (state not readable, or Claude reports a version other than the generated one, whether its commands succeeded, failed or, in a dry run or status, have not run yet), or `not installed` (a plugin caplet no longer wants is gone from Claude, a dry run or status shows a plugin apply would install, or a desired plugin is installed only at another Claude scope), adding `unknown` when caplet's marketplace name is registered from another source. When the `claude` CLI is missing or fails to start, including partway through the commands, caplet SHALL write the plugin and marketplace, report `registration required` with the exact commands not run, and SHALL NOT treat this as an apply failure. Any other failed `claude` command, including the `list --json` reads of host state, SHALL be an error `acf.claude.command-failed` carrying Claude's message (list output caplet cannot parse is the warning `acf.claude.state-unreadable`), SHALL NOT stop the commands of other plugins, and SHALL make apply exit 2; a plugin whose install failed and that Claude does not list is `registration required`. When the CLI reports a policy block (strict or blocked marketplaces, plugin-only customization), the state SHALL be `blocked by host policy` and caplet SHALL NOT fall back to the loose carrier. A plugin the user disabled in Claude SHALL NOT be re-enabled by caplet; updates SHALL still write files and keep it disabled. Because `claude plugin install` rewrites a settings `enabledPlugins` value of `false` to `true` (verified with Claude 2.1.97), caplet SHALL NOT install a plugin Claude does not list whose deciding settings disable it (the user file for a user install; for a local install the most specific of the user, project and local files naming it) and SHALL report it `disabled by user`.

#### Scenario: No Claude CLI
- **WHEN** `claude` is not on `PATH` during apply
- **THEN** plugin files are written, apply exits 0 with a warning, and the warning lists the `marketplace add` and `install` commands

#### Scenario: Failed update
- **WHEN** `claude plugin update` fails during apply and Claude still lists the plugin at its previous version
- **THEN** apply exits 2 with `acf.claude.command-failed` carrying Claude's message, and the host state is `unknown`

#### Scenario: A disable left only in settings
- **WHEN** Claude does not list `review@acf-user` and the user settings set `enabledPlugins["review@acf-user"]` to `false`
- **THEN** apply writes the plugin files, does not run `claude plugin install review@acf-user`, and status shows `disabled by user`

#### Scenario: User disabled the plugin
- **WHEN** the user disables a caplet-installed Claude plugin and runs `caplet apply` after an update
- **THEN** the plugin files are updated, the plugin stays disabled, and status shows `disabled by user`

### Requirement: Migration from loose Claude output
When a capability moves from the loose Claude carrier to the plugin carrier (first apply after upgrade, or a carrier change), caplet SHALL plan the migration as one unit per capability and scope: write the plugin, register and install it, and only after the host reports it installed at caplet's Claude scope for that install root, at the generated version (`registered` or `disabled by user`), retire that capability's loose Claude artifacts. A plugin the user disabled counts as installed, because keeping its loose copies would keep the capability active against that choice. Retirement SHALL delete only paths recorded in the sidecar as owned by that capability for target `claude` whose current content hash equals the recorded hash; it SHALL remove owned keys from merged files such as `.mcp.json` by JSON pointer, leaving other keys intact; and it SHALL keep `.agents/skills/<name>/` copies that a still-selected target discovers. A drifted artifact SHALL be left in place, its sidecar entry released, and a warning `acf.migration.drifted` SHALL name the path, the duplicate it causes, and the removal command. When registration does not succeed, the loose artifacts SHALL stay installed and owned.

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
The migration SHALL move Claude skills to plugin-qualified invocation names (`/<skill>` becomes `/<capability>:<skill>`). The plan and apply output of the apply that retires a capability's loose Claude skills SHALL show one notice listing each old and new invocation name, and `--json` output SHALL carry the renames as structured data on that apply. Retirement happens once per migration, so later applies SHALL NOT repeat the notice, and a capability that migrates after others of its install root, or again after a switch back to `loose`, SHALL get its own notice. Caplet SHALL NOT record shown notices in the sidecar, because such a record would suppress the notice of a later migration in the same install root.

#### Scenario: Notice shown once
- **WHEN** a project with loose Claude skill `review` from capability `review-kit` is migrated, and apply runs again afterwards
- **THEN** the first apply shows `/review -> /review-kit:review` and the second apply shows no rename notice

#### Scenario: Later migration in the same install root
- **WHEN** capability `review-kit` migrated earlier and capability `lint`, loose until now because it had a hook, drops the hook and is applied
- **THEN** that apply shows `/lint -> /lint:lint`

### Requirement: Managed notices outside plugin packages
SPEC.md §14.7 SHALL be amended: caplet SHALL NOT write `ACF-MANAGED.md` inside generated plugin packages or preserved foreign payloads. The install-root `ACF-MANAGED.md` inventory SHALL list each generated plugin directory and the marketplace directory as caplet-owned, and the per-artifact notices of retired loose skill directories SHALL be removed with those directories.

#### Scenario: Notice placement
- **WHEN** a Claude plugin is generated
- **THEN** no `ACF-MANAGED.md` exists under `.acf/marketplace/plugins/<capability>/`, and the install-root inventory lists that directory
