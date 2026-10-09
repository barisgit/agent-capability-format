## Why

Loose Claude hook output is broken today. `hookSettingsEntry` in `packages/adapters/src/common/hooks.ts` (around lines 234-268) writes caplet's canonical hook object (`acfMarker`, `name`, `type`, `event`, `effect`, `timeoutMs`, `run`) into `.claude/settings.json`, but Claude reads `{"hooks": {"<Event>": [{"matcher": ..., "hooks": [{"type": "command", "command": ...}]}]}}` with handler `timeout` in seconds (`research/plugin-interop/tools/claude-code.md`, Hooks). The target registry also maps `permission_request` to `PreToolUse` for Claude (`packages/core/src/targets/registry.ts:75`), although Claude has a separate `PermissionRequest` event with different input. Mixed native ACF capabilities with hooks stay on loose Claude output in `plugin-interop-foundation`, so this defect is still reachable; it is recorded there as a known defect and fixed here.

## What Changes

- Emit loose Claude hooks in Claude's settings shape, with a caplet ownership marker that Claude tolerates, timeouts converted to seconds, and per-entry removal that leaves user hooks intact.
- Map `permission_request` to Claude `PermissionRequest`.
- **BREAKING (emission)**: amend SPEC.md §22.6 so a target that cannot honor a hook's `block`, `decide` or `block_result` effect refuses that hook instead of degrading it to `observe`.
- Later step, outside this change: emit ACF hooks into the Claude plugin carrier so mixed capabilities can leave loose output.

## Capabilities

### New Capabilities

- `claude-hook-output`: Claude loose hook settings shape, event mapping, and refusal of restricting hook effects (amends SPEC.md §22.6).

### Modified Capabilities

None in `openspec/specs/`. Builds on the support-table and refusal rules of `plugin-interop-foundation`.

## Impact

- `packages/adapters/src/common/hooks.ts` hook emission, `packages/core/src/targets/registry.ts` Claude event mapping, SPEC.md §22.6. Existing broken `.claude/settings.json` entries owned by caplet are replaced on the next apply.
