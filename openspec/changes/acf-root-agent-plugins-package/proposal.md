## Why

The user wants a native ACF repository to also be usable as an Agent Plugins package, so that clients without caplet can install it directly. This needs the Agent Plugins writer from `agent-plugins-output` and is not needed for the first milestone.

## What Changes

- Add `caplet pack --agent-plugins --out <dir>` to write a capability as a generic Agent Plugins package.
- Add `caplet pack --agent-plugins --root`, which writes `plugin.json` and `mcp.json` beside `acf.yml` for the author to commit, and `caplet check` rules that fail when those files are stale, name a different package, or would let a generic consumer behave less restrictively than the ACF declaration.
- `acf.yml` stays the only authored manifest; caplet always reads such a repository as ACF.
- Settle which repositories qualify (decision below).

### Decision to confirm with the user

Which ACF repositories may also be Agent Plugins packages at their root? Proposed answer: only those whose skills use plain Agent Skills frontmatter, with nothing ACF-specific in `SKILL.md` and no extra ACF file per skill. A repository whose skills use ACF-only fields (such as `invocation` or `targets`) packs to a separate directory with `--out` instead. The alternative is a per-skill ACF side file (for example `skill.acf.yml`) that moves ACF-only fields out of `SKILL.md`, so more repositories qualify at the cost of a second file per skill.

## Capabilities

### New Capabilities

- `acf-root-agent-plugins-package`: Packing ACF capabilities as Agent Plugins packages and checking derived root manifests (amends SPEC.md §22).

### Modified Capabilities

None in `openspec/specs/`. Depends on `agent-plugins-output` (generic profile, pinned schemas).

## Impact

- `apps/caplet` gains `caplet pack` and new `caplet check` rules; SPEC.md and README document the root profile. No ACF extension namespace is emitted until the namespace question in `plugin-interop-foundation` is answered.
