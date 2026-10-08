## Purpose

Makes loose Claude hook output loadable by Claude and stops degrading restricting hook effects. Amends SPEC.md §22.6.

## ADDED Requirements

### Requirement: Claude settings hook shape
The loose Claude writer SHALL emit each hook into the Claude settings file as `hooks.<Event>[]` groups of `{matcher, hooks: [{type: "command", command, timeout}]}`, with `timeout` in seconds, and SHALL NOT write caplet's canonical hook fields into the settings file. Caplet SHALL track ownership of each emitted handler so that update and removal change only caplet-owned handlers and leave user hooks in the same file intact.

#### Scenario: Pre-tool hook for Claude
- **WHEN** an ACF hook on `pre_tool` matching `Bash` with a 5000 ms timeout is applied loose for Claude
- **THEN** `.claude/settings.json` contains `hooks.PreToolUse` with a group whose `matcher` is `Bash` and whose handler has `type: command` and `timeout: 5`, and no `acfMarker`, `effect` or `run` key

### Requirement: Claude permission event mapping
The target registry SHALL map the canonical `permission_request` event to Claude `PermissionRequest`, not `PreToolUse`.

#### Scenario: Permission hook for Claude
- **WHEN** an ACF hook on `permission_request` is applied loose for Claude
- **THEN** it appears under `hooks.PermissionRequest` and not under `hooks.PreToolUse`

### Requirement: Restricting hook effects are refused, not degraded
SPEC.md §22.6 SHALL be amended so that a target that cannot honor a hook's `block`, `decide` or `block_result` effect refuses that hook for that target (`acf.support.refused`) instead of degrading it to `observe`. `add_context` and `continue` MAY still degrade to `observe` with a `lossy` diagnostic.

#### Scenario: Blocking hook on a target without blocking support
- **WHEN** a hook with `effect: block` is planned for a target whose registry entry lacks `block`
- **THEN** the plan refuses the hook for that target and does not emit an observing hook
