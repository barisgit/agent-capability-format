## Purpose

Lets a native ACF capability be packed as an Agent Plugins 1.0 package, and lets a single-capability ACF repository root also be a valid Agent Plugins package without giving up `acf.yml` as the authority.

## ADDED Requirements

### Requirement: Pack to a separate directory
`caplet pack --agent-plugins --out <dir>` SHALL write a capability as an Agent Plugins 1.0 package using the `generic` profile and SHALL fail with the refusals of that profile when a generic consumer cannot honor a declaration.

#### Scenario: Pack a simple capability
- **WHEN** an ACF capability with one plain skill and one stdio server is packed with `--out dist/pkg`
- **THEN** `dist/pkg` contains `plugin.json`, `skills/<name>/SKILL.md` and `mcp.json` that validate against the pinned schemas

### Requirement: Repository root as an Agent Plugins package
A single-capability native ACF repository root MAY also be a valid Agent Plugins 1.0 package. `caplet pack --agent-plugins --root` SHALL derive `plugin.json` from `acf.yml` and `mcp.json` from the capability's MCP servers using the `generic` profile and write them at the root for the author to commit. A root qualifies only when every root skill's `SKILL.md` uses plain Agent Skills frontmatter, unless the user decides otherwise in this change. When a root Agent Plugins `plugin.json` exists beside `acf.yml`, `caplet check` SHALL verify that it is current (equal to a fresh derivation), that its `name` equals the ACF name, that every root skill qualifies, and that the `generic` profile refuses nothing; any failure SHALL be an `error`. `acf.yml` SHALL remain authoritative: caplet SHALL read such a repository as ACF and SHALL NOT read data from the derived files. No ACF extension namespace SHALL be emitted until the namespace question of `plugin-interop-foundation` is answered.

#### Scenario: Stale derived manifest
- **WHEN** an author changes `description` in `acf.yml` without re-running `caplet pack --agent-plugins --root`
- **THEN** `caplet check` fails naming `plugin.json` as stale

#### Scenario: ACF-only skill fields at the root
- **WHEN** a root skill declares `invocation: {model: false}` and the author runs `caplet pack --agent-plugins --root`
- **THEN** packing fails explaining that a generic Agent Plugins consumer cannot honor the skill and suggesting `--out`

#### Scenario: Agent Plugins consumer reads the root
- **WHEN** a conforming Agent Plugins 1.0 consumer loads a repository that passed `caplet check`
- **THEN** it finds a valid `plugin.json`, every root skill and the root `mcp.json`, and nothing it loads behaves less restrictively than the ACF declaration
