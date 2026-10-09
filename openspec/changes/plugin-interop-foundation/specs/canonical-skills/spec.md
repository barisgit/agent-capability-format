## Purpose

Defines the canonical skill fields that this change reads from Agent Skills, Agent Plugins and Claude plugin skills and writes to Claude and the existing loose targets, the skill meanings that stay pending as per-target extras, and the per-target, per-carrier support table for skills. Amends SPEC.md §9 and §22.2. Agent Plugins client columns (generic, Copilot, VS Code, Cursor plugin) are added by the `agent-plugins-output` change; `display-name` and the promotion of path-scoped activation are added by the `canonical-skill-mcp-extensions` change.

## ADDED Requirements

### Requirement: Canonical skill fields
SKILL.md frontmatter in ACF SHALL accept these core fields in addition to SPEC.md §9.2: `license` (string), `compatibility` (string, at most 500 characters), `metadata` (map of string to string) and `argument-hint` (string). `invocation.model` keeps its SPEC.md §9.3 meaning. `invocation.user: false` SHALL mean that the host refuses explicit invocation of the skill by the user (typing its name or slash command), not merely that the skill is hidden from a menu or picker; a host whose documented effect is visibility only SHALL NOT be counted as supporting it.

#### Scenario: Full skill frontmatter
- **WHEN** a SKILL.md declares `name`, `description`, `license`, `compatibility`, `metadata`, `argument-hint` and `invocation: {model: false}`
- **THEN** validation succeeds and the canonical skill holds each field once

#### Scenario: Path scope is not a core field
- **WHEN** a native ACF SKILL.md declares top-level `paths: ["src/**"]`
- **THEN** validation fails with an error that names `targets.claude.native.paths` and `targets.cursor.native.paths` as the authoring forms

#### Scenario: Native skill keys are not core fields
- **WHEN** a native ACF SKILL.md declares top-level `disable-model-invocation: true` and `allowed-tools: Read`
- **THEN** validation fails with an error naming `invocation.model: false` as the core equivalent of the first and the `targets.<t>.native.allowed-tools` forms for Claude, Codex and Pi for the second; a descriptive native key such as `when_to_use` only warns with its `targets.claude.native` form

### Requirement: Path-scoped activation stays per target
Path-scoped automatic activation (Claude `paths`, Cursor `paths` and its legacy `globs`) SHALL NOT be a core field in this change, because neither the glob dialects nor the scope of "working with matching files" are documented as equivalent between the two tools. It SHALL be authored and imported as a per-target extra classified `restricting` for each tool that documents it, emitted verbatim only to that tool, and SHALL refuse the skill for every other target (Dropping extras elsewhere). Writers SHALL NOT translate one tool's glob list into another tool's field.

#### Scenario: Claude path scope stays with Claude
- **WHEN** a skill declares `targets.claude.native.paths: ["src/**/*.ts"]` and is selected for Claude and Cursor
- **THEN** the Claude skill contains `paths` verbatim and the skill is refused for Cursor with `acf.support.refused`

### Requirement: Pending skill meanings
The following skill meanings SHALL be pending core in this change: tool pre-approval (`allowed-tools`), declared arguments and body placeholders (`arguments`, `$ARGUMENTS`, `$ARGUMENTS[N]`, named argument references, skill-directory placeholders), isolated execution (`context`), agent coupling (`agent`), MCP requirements (`requires.mcp`) and path-scoped activation. Native ACF SHALL author them through `targets.<target>.native` with the target's native spelling, exactly as a foreign package of that target carries them. Readers SHALL preserve them in the source snapshot and SHALL report them as untranslated when the skill is emitted to another target. A grant such as `allowed-tools` SHALL NOT be carried to any target other than the one whose native spelling declares it.

#### Scenario: Imported allowed-tools to another target
- **WHEN** a Claude plugin skill declaring `allowed-tools: Bash(git *)` is emitted for Codex
- **THEN** the Codex skill has no `allowed-tools` key and the plan reports the grant as not carried

#### Scenario: Body placeholder to another target
- **WHEN** a skill whose body uses `$ARGUMENTS` is emitted for Codex
- **THEN** the Codex skill body keeps `$ARGUMENTS` as written and the plan reports `acf.skill.placeholder-unexpanded` (lossy) naming the placeholder

### Requirement: Per-target skill support
Skill writers SHALL apply this table. N = native spelling, T = translated, D = degraded with a diagnostic, R = refused (`acf.support.refused`). Columns: CC/p Claude plugin carrier, CC/l Claude loose carrier, CX Codex, CU Cursor, OC OpenCode, PI Pi (all loose except CC/p).

| Canonical | Class | CC/p | CC/l | CX | CU | OC | PI |
|---|---|---|---|---|---|---|---|
| `name` | functional | N | N | N | N | N | N |
| `description` | functional | N | N | N | N | N | N |
| `license`, `compatibility`, `metadata` | descriptive | N | N | N | N | N (host ignores) | N |
| `invocation.model: false` | restricting | N `disable-model-invocation: true` | N `disable-model-invocation: true` | N `policy.allow_implicit_invocation: false` in `agents/openai.yaml` | N `disable-model-invocation: true` | R | N `disable-model-invocation: true` |
| `invocation.user: false` | restricting | N `user-invocable: false` | N `user-invocable: false` | R | R | R | R |
| `argument-hint` | descriptive | N | N | D | D | D | D |
| bundled files and executable bits | functional | N | N | N | N | N | N |

Evidence per cell: Claude documents that `user-invocable: false` disallows typed invocation, not only menu listing; Codex `allow_implicit_invocation: false` leaves explicit `$skill` invocation, so it carries `invocation.model` but not `invocation.user`; Cursor does not document `user-invocable`; OpenCode documents no invocation control and no user skill-invocation contract; Pi documents `/skill:name` user invocation and no switch for it. The registry SHALL record each cell's evidence level.

#### Scenario: Manual-only skill to Claude and Pi
- **WHEN** a skill with `invocation.model: false` is emitted for Claude and Pi
- **THEN** both SKILL.md files contain `disable-model-invocation: true`

#### Scenario: Codex sidecar
- **WHEN** a skill with `invocation.model: false` is emitted loose for Codex
- **THEN** the skill directory contains `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, and `SKILL.md` contains no `invocation` key

#### Scenario: Codex sidecar next to a bundled one
- **WHEN** that skill also bundles its own `agents/openai.yaml`
- **THEN** the written file keeps the bundled keys and comments and gains the generated keys, and a bundled value that contradicts a generated one, or a bundled file that is not a YAML mapping, is `acf.extras.conflict`

#### Scenario: User-only skill to Codex
- **WHEN** a skill with `invocation.user: false` is planned for Codex
- **THEN** the skill is refused for Codex, because explicit `$skill` invocation would remain possible

### Requirement: Native serialization replaces canonical passthrough
Skill writers SHALL serialize native frontmatter from the canonical skill plus the target's native extras and SHALL NOT copy canonical-only keys (`invocation`, `only`, `except`, `targets`) into emitted SKILL.md files. Emitted frontmatter SHALL be valid for every target that discovers the emitted location.

#### Scenario: Canonical keys stay out of output
- **WHEN** an ACF skill with `only: [claude, pi]` and `targets.pi.native.foo: bar` is emitted for Pi
- **THEN** the Pi SKILL.md contains `foo: bar` and contains neither `only` nor `targets`

### Requirement: Shared skill root discovery
SPEC.md §22.2 SHALL be amended so that the canonical `.agents/skills/<name>/` copy is emitted only when at least one selected target discovers that root (Codex, Cursor, OpenCode, Pi). Claude does not discover it; a Claude-only selection SHALL NOT produce a canonical copy. `targets.<id>.skills.canonical` keeps its meaning as an explicit override.

#### Scenario: Claude-only project
- **WHEN** only `claude` is selected
- **THEN** no file is written under `.agents/skills/`
