## Why

`plugin-interop-foundation` keeps several shared skill, package and MCP meanings as per-target extras because their cross-tool equivalence or native value domains were not settled: display names, path-scoped skill activation, MCP server enablement, tool allow- and denylists, and timeouts. The spec review found that the draft core definitions for some of them were wrong (omitting disabled servers is lossy, Copilot's plugin carrier cannot carry tool filters, Claude's timeout has its own unit and minimum, and path-scope equivalence is unproved). This change promotes them with corrected, evidence-backed cells.

## What Changes

- Add package and skill `display-name`, releasing the SPEC.md §15 `displayName`/`title` reservation.
- Add MCP `enabled`, `tools.enabled`, `tools.disabled`, `timeouts.startupMs` and `timeouts.toolMs` with cells that state native value-domain conditions and declare the loss of omitting a disabled server.
- Promote path-scoped skill activation only after `verified` tests prove the shared glob subset and activation scope for Claude and Cursor; otherwise it stays a per-target extra.
- Define the migration from the per-target extras that `plugin-interop-foundation` accepts for these meanings to the new core fields.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None in `openspec/specs/`. Adds requirements to the `canonical-skills`, `canonical-mcp` and `canonical-package-metadata` capabilities introduced by `plugin-interop-foundation`; Agent Plugins client cells depend on `agent-plugins-output`.

## Impact

- `packages/core` schemas and registry cells, `packages/adapters` serializers, SPEC.md §§4.2, 9, 13a, 15, README support tables. Existing per-target extras for these meanings keep working with a migration warning.
