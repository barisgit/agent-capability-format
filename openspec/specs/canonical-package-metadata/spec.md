# canonical-package-metadata Specification

## Purpose
Defines the canonical package metadata that every reader fills and the Claude plugin writer maps to its native manifest, so a capability's identity and descriptive data survive conversion between ACF, Agent Plugins 1.0 and Claude plugins. Amends SPEC.md §4.2. A canonical `display-name` is added by the `canonical-skill-mcp-extensions` change; the Agent Plugins manifest writer by the `agent-plugins-output` change.

## Requirements

### Requirement: Canonical package metadata fields
The canonical capability SHALL carry these package metadata fields, each with one meaning and its SPEC.md §4.2 definition: `name` (slug, SPEC.md §5.1), `version` (SemVer 2.0.0), `description`, `authors` (list of entries, each `{name, email?, url?}` or a legacy free-form string; see Legacy author strings), `license` (SPDX expression), `homepage` (URL), `repository` (URL), and `keywords` (list of strings).

#### Scenario: Agent Plugins metadata to Claude
- **WHEN** an Agent Plugins package with `name`, `version`, `description`, `author` and `license` is applied for Claude
- **THEN** the generated `.claude-plugin/plugin.json` carries the same values in Claude's spelling

### Requirement: Package metadata mapping
The Claude plugin writer SHALL map package metadata as follows, and readers SHALL apply the inverse mapping for both formats; every field is `descriptive`. A single native `author` becomes a one-entry `authors` list.

| Canonical | Claude plugin `.claude-plugin/plugin.json` (read and written) | Agent Plugins 1.0 `plugin.json` (read) |
|---|---|---|
| `name` | N `name` | N `name` |
| `version` | N `version` (with the build suffix of the Claude plugin output requirements) | N `version` |
| `description` | N `description` | N `description` |
| `authors` | T first entry to `author` (legacy strings decoded per Legacy author strings); further entries D (`lossy`) | T `author` to a one-entry list |
| `license` | N `license` | N `license` |
| `homepage` | N `homepage` | N `homepage` |
| `repository` | N `repository` (string) | N `repository` |
| `keywords` | N `keywords` | N `keywords` |

#### Scenario: Two authors to Claude
- **WHEN** a capability with two authors is written as a Claude plugin
- **THEN** `plugin.json` has `author` equal to the first author and the plan reports the second author as dropped

### Requirement: Legacy author strings
`acf.yml` SHALL keep accepting `authors` entries as free-form strings (SPEC.md §4.2 `acf: 1`), alongside `{name, email?, url?}` objects. A string entry SHALL be kept unchanged in the canonical capability, so validation, the lock, `capabilityHash`, the payload digest and any ACF output are unaffected. Writers of formats with structured authors SHALL decode a string as `{name, email}` only when it has the form `<name> <<email>>` and re-encoding the decoded parts reproduces the string byte for byte; any other string SHALL become `{name: <string>}`. Decoding SHALL NOT drop or rewrite characters.

#### Scenario: Existing manifest with author strings
- **WHEN** an existing `acf.yml` declares `authors: ["Ada Lovelace <ada@example.com>", "The Docs Team"]` and is written as a Claude plugin
- **THEN** validation succeeds unchanged, its v1 `capabilityHash` equals the value computed before this change, and `plugin.json` has `author` `{"name": "Ada Lovelace", "email": "ada@example.com"}` with the second author reported as dropped

### Requirement: Per-target package values
The package level of `acf.yml` SHALL accept `targets.<target>.package`, a mapping from native manifest keys that the target's writer generates from package metadata (for Claude: `version`, `description`, `author`, `license`, `homepage`, `repository`, `keywords`) to values in that target's native spelling and value domain. A set key SHALL replace the mapped value for that target only and SHALL be validated against the target's manifest schema, not the core value domain. `name` SHALL NOT be set this way; the capability slug stays the identity. A key that is also set in the same target's package-level `native` mapping SHALL be `acf.extras.conflict`. Readers SHALL record a foreign manifest value that the core field cannot represent exactly (a non-SemVer `version`, an `author` that does not round-trip through `authors`) as the per-target package value of the source format's target, so transformed output and native ACF use the same path.

#### Scenario: Non-SemVer version for Claude
- **WHEN** `acf.yml` declares `version: 1.0.0` and `targets.claude.package.version: "2024.10"` and is written as a Claude plugin
- **THEN** `plugin.json` `version` starts with `2024.10+acf.`, and other targets use `1.0.0`

### Requirement: Manifest-only native fields stay native
Native manifest fields with no core meaning in this change (Claude `displayName`, `icon`, listing URLs, `metadata`, `defaultEnabled`, `dependencies`, `settings`, `userConfig`, `channels`, component path overrides; Agent Plugins `extensions`) SHALL be preserved as native remainder of the source format and emitted only to that format. Native ACF capabilities SHALL be able to declare any of them through package-level `targets.claude.native`, emitted verbatim into the generated Claude plugin manifest (Native ACF expressiveness parity). Caplet SHALL NOT itself act on them: Claude resolves `dependencies`, prompts for `userConfig` and applies its own policy.

#### Scenario: Claude icon round trip
- **WHEN** an unchanged Claude plugin with `icon` is installed for Claude and Codex
- **THEN** the generated `plugin.json` keeps `icon`, and no Codex output contains it

#### Scenario: Native ACF declares a Claude display name
- **WHEN** `acf.yml` declares `targets.claude.native.displayName: Docs Kit`
- **THEN** the generated Claude `plugin.json` contains `"displayName": "Docs Kit"`
