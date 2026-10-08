## Purpose

Lets caplet install capabilities published as native ACF, bare Agent Skills, Agent Plugins 1.0 packages and Claude plugins (skills and MCP servers projected, everything else preserved) without rewriting them, by detecting each source's format, projecting it into the canonical model, and preserving the original package so same-format output is lossless. Amends SPEC.md §14.4 and §20 and CONTEXT.md Axiom 12.

## ADDED Requirements

### Requirement: Deterministic format detection
The installer SHALL classify a selected source root as exactly one format using this precedence: native ACF (root `acf.yml`/`acf.yaml` or an `acf/` collection), Agent Plugins 1.0 (root `plugin.json` whose `$schema` is the Agent Plugins 1.0 plugin schema), Claude plugin (`.claude-plugin/plugin.json`), then bare skills (SPEC.md §20.3). When more than one format is recognized, it SHALL report an `info` diagnostic `acf.source.format-selected` naming the chosen format and the ignored manifests. A `format:` field on the `capabilities.yml` entry (`acf`, `agent-plugins`, `claude-plugin`, `skills`) SHALL override detection; naming a format that is not present SHALL be an `error`. Manifests of other formats SHALL NOT be merged into the selected projection.

#### Scenario: Agent Plugins and Claude manifests together
- **WHEN** a source contains both a root Agent Plugins `plugin.json` and `.claude-plugin/plugin.json`
- **THEN** it is read as Agent Plugins, the plan shows `acf.source.format-selected` naming the ignored Claude manifest, and the Claude manifest remains in the preserved source

#### Scenario: Explicit format override
- **WHEN** the same source's entry declares `format: claude-plugin`
- **THEN** it is read as a Claude plugin

### Requirement: Recognized manifests never fall back
When a source contains a recognized manifest that is invalid, resolution SHALL fail with diagnostics pointing at that manifest and SHALL NOT fall back to bare-skill discovery or to another format.

#### Scenario: Broken plugin manifest
- **WHEN** `.claude-plugin/plugin.json` is malformed JSON and `skills/` contains valid skills
- **THEN** resolution fails with an error naming `.claude-plugin/plugin.json` and no capability is synthesized from `skills/`

### Requirement: Marketplace-only sources are reported
A source whose only recognized manifest is a marketplace or catalog (such as `.claude-plugin/marketplace.json` or `.agents/plugins/marketplace.json`) SHALL fail with `acf.source.marketplace-unsupported`, listing the plugin paths it declares as candidates for a `path:` selection.

#### Scenario: Claude marketplace repository
- **WHEN** a repository contains only `.claude-plugin/marketplace.json` listing `./plugins/review`
- **THEN** resolution fails and the diagnostic suggests the entry `path: plugins/review`

### Requirement: One package is one capability
An Agent Plugins or Claude plugin source SHALL become exactly one capability. Its name SHALL be the manifest `name`, which SHALL satisfy the ACF slug rule (SPEC.md §5.1) or be renamed with the entry's `rename`. Its version SHALL be the manifest `version` when it is SemVer 2.0.0, otherwise `0.0.0-unversioned+<resolved-revision-or-local>`; the original value stays in the preserved source, and a Claude plugin reader SHALL record it as `targets.claude.package.version` (canonical-package-metadata, Per-target package values) so transformed Claude output keeps it.

#### Scenario: Plugin with three skills
- **WHEN** an Agent Plugins package named `docs-kit` contains three skills
- **THEN** the lock lists one capability `docs-kit` with three skills, not three synthesized capabilities

#### Scenario: Name outside the slug rule
- **WHEN** an Agent Plugins package is named `acme.docs`
- **THEN** resolution fails with a diagnostic recommending `rename`, and succeeds once `rename: acme-docs` is set

### Requirement: Preserved source snapshot
For every source format the materialized snapshot SHALL contain every regular file under the selected package root except `.git/`, including hidden files, with exact bytes and the executable bit. Symbolic links, special files, and paths that collide after NFC and case-preserving normalization SHALL fail resolution with an error naming the path. The snapshot SHALL be immutable after materialization and SHALL be enough to re-read the capability offline with an identical projection.

#### Scenario: Hidden manifest and executable script
- **WHEN** a Claude plugin contains `.claude-plugin/plugin.json` and an executable `scripts/run.sh`
- **THEN** the snapshot contains both, and `scripts/run.sh` keeps its executable bit

#### Scenario: Symlink in a package
- **WHEN** a package contains a symbolic link
- **THEN** resolution fails with an error naming the link instead of silently omitting it

#### Scenario: Offline re-read
- **WHEN** caplet re-reads an installed foreign capability without network access
- **THEN** it detects the same format and produces the same projection and diagnostics

### Requirement: Agent Plugins 1.0 reader
The Agent Plugins reader SHALL accept packages whose `plugin.json` `$schema` is exactly the 1.0 plugin schema and SHALL fail with `acf.source.format-version-unsupported` for other Agent Plugins schema versions. It SHALL project manifest metadata, every immediate `skills/<dir>/SKILL.md`, and root `mcp.json` servers into the canonical model. Following the standard's loading rules, unknown root manifest keys SHALL produce a warning and be preserved; an invalid individual skill or MCP server SHALL be excluded from the projection with a warning while the rest of the package loads; an invalid `mcp.json` top level SHALL disable only MCP with a warning; unknown `author` keys and other fatal manifest violations SHALL fail resolution. Every `extensions` namespace and namespace directory SHALL be preserved as a native remainder for its dialect.

#### Scenario: One invalid skill
- **WHEN** one of three skills has no `description`
- **THEN** two skills are projected, the third is reported with a warning, and all three remain in the preserved source

#### Scenario: Agent Plugins 1.1 package
- **WHEN** `plugin.json` declares the 1.1.0 schema
- **THEN** resolution fails with `acf.source.format-version-unsupported`

### Requirement: Claude plugin reader
The Claude plugin reader SHALL project manifest metadata, skills from `skills/` and from additional manifest `skills` paths, and MCP servers from `.mcp.json` and manifest `mcpServers` (inline map or relative path) into the canonical model. Components it does not project in this change (agents, commands, hooks, output styles, LSP servers, monitors, `bin/`, plugin `settings.json`, `userConfig`, channels, dependencies, and listing metadata) SHALL be recorded as Claude native remainder with their safety class. An MCP server whose values use a mechanism the canonical schema cannot express (host environment references, `headersHelper`, `${user_config.*}`) SHALL remain a Claude native remainder component rather than be partially projected.

#### Scenario: Server with an environment reference
- **WHEN** `.mcp.json` declares a server whose header is `Bearer ${API_TOKEN}`
- **THEN** the server is not projected, it is emitted unchanged for Claude, and other targets report it as an untranslated component

### Requirement: Lossless same-format output
When a capability is written in the same format it was read from and no transformation applies (no `rename`, no `include`/`exclude`, no applicability filter removing content, and no client-profile rewrite required by the target), the emitted package SHALL equal the preserved source: identical relative paths, bytes and executable bits, including unknown fields, unknown extension namespaces, comments and unreferenced files. Caplet-owned bookkeeping SHALL be stored outside the package directory.

#### Scenario: Claude round trip
- **WHEN** an unchanged Claude plugin with an unknown manifest key, an unreferenced executable file and irregularly formatted JSON is installed for Claude
- **THEN** the generated plugin directory is byte-, path- and mode-identical to the source, except the `version` rule of the Claude plugin package requirement

### Requirement: Foreign Claude remainder needs the plugin carrier
A Claude plugin source whose projection leaves Claude native remainder (agents, commands, hooks, output styles, LSP servers, monitors, `bin/`, plugin settings) SHALL be emitted for Claude only through the Claude plugin carrier. When `targets.claude.carrier: loose` is selected, such a capability SHALL be refused for Claude with `acf.support.refused` naming the remainder components and the recovery (`carrier: plugin` or `except: [claude]`); caplet SHALL NOT translate the remainder into loose Claude files.

#### Scenario: Claude plugin with agents and loose carrier
- **WHEN** a Claude plugin with one skill and one agent is applied with `targets.claude.carrier: loose`
- **THEN** nothing is written for Claude and the plan reports the refusal with both recoveries

### Requirement: Transformed output
When a transformation applies, the writer SHALL regenerate only the native carriers it understands (manifest, skills, MCP configuration) from the projection, SHALL copy every other preserved file unchanged, and SHALL NOT emit any file belonging to an excluded component. `rename` and component exclusion on a package with native remainder SHALL emit a `lossy` diagnostic warning that preserved components may reference the renamed or excluded items. Byte-preserving edits inside native documents are not required.

#### Scenario: Excluded skill stays excluded
- **WHEN** the entry excludes skill `draft` from a Claude plugin
- **THEN** no file under `skills/draft/` appears in the generated plugin and the regenerated manifest does not list it

### Requirement: Native packages are foreign sources, not ACF source
SPEC.md §14.4 and CONTEXT.md Axiom 12 SHALL be amended: native plugin packages MAY be read through a declared format reader as foreign sources, but SHALL NOT be accepted as ACF source. Native ACF capabilities keep YAML and Markdown as their authored format and carry native files only under `native/<target>/`.

#### Scenario: Native manifest inside an ACF capability
- **WHEN** an ACF capability root contains `.claude-plugin/plugin.json` outside `native/claude/`
- **THEN** the ACF reader ignores it as non-semantic and reports an `info` diagnostic suggesting `native/claude/`
