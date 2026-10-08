## ADDED Requirements

### Requirement: Package display name
`acf.yml` SHALL accept an optional `display-name` (human-readable package title), and SPEC.md §15 SHALL release the `displayName`/`title` reservation in favor of it. Writers SHALL map it to Claude `displayName`; formats without a package display name SHALL drop it with an `info` diagnostic. A package-level `targets.claude.native.displayName` that duplicates it SHALL be `acf.extras.conflict`.

#### Scenario: Display name in acf.yml
- **WHEN** `acf.yml` declares `display-name: Docs Kit`
- **THEN** validation succeeds and the generated Claude `plugin.json` contains `"displayName": "Docs Kit"`
