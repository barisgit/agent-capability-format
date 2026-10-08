## ADDED Requirements

### Requirement: Skill display name
SKILL.md frontmatter in ACF SHALL accept `display-name` (string). The Codex writer SHALL emit it as `interface.display_name` in `agents/openai.yaml`; targets without a skill display name SHALL drop it with a `descriptive` diagnostic.

#### Scenario: Codex display name
- **WHEN** a skill with `display-name: Review` is emitted loose for Codex
- **THEN** the skill directory contains `agents/openai.yaml` with `interface.display_name: Review`, and `SKILL.md` contains no `display-name`

### Requirement: Path-scope promotion gate
Path-scoped automatic activation SHALL become a core field only when `verified` tests against Claude and Cursor show that both hosts accept the same glob subset with the same matching results and activate a path-scoped skill under the same conditions. Until then it SHALL stay a per-target `restricting` extra. If promoted, the core field SHALL state the verified glob subset, other glob syntax SHALL be a validation error, and every target without a native cell SHALL refuse the skill; no description hint or other substitute SHALL be emitted.

#### Scenario: Equivalence not shown
- **WHEN** the verification finds a glob that Claude and Cursor match differently
- **THEN** `paths` stays a per-target extra and the evidence is recorded in the registry
