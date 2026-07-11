## Why

Agents and humans can currently edit ACF-emitted artifacts without seeing that the files are generated, while the authoritative `.acf-managed.json` sidecar is intentionally machine-facing and hidden. Visible, deterministic management notices make ownership clear without altering agent payload files or falsely claiming shared directories are wholly managed.

## What Changes

- Require a visible `ACF-MANAGED.md` inventory at every install root containing ACF-managed output.
- Require a local `ACF-MANAGED.md` inside each top-level artifact directory that ACF owns completely.
- Keep source repositories, resolved snapshots, payload files, JSON, binaries, and partially owned files unchanged.
- Reserve `ACF-MANAGED.md`; reject collisions with unowned destination files or source artifacts that would emit to the reserved path.
- Generate deterministic, capability-grouped inventories without timestamps, machine paths, source URLs, or secrets.
- Track notices as system-owned `FileDiff` and sidecar artifacts, reconcile their drift and removal, and group notice changes in Caplet output.
- Verify that all supported hosts ignore these notice files for discovery and automatic prompt loading.

## Capabilities

### New Capabilities

- `managed-artifact-notices`: Visible ownership notices and inventories for fully and partially managed emitted artifacts.

### Modified Capabilities

None.

## Impact

Affected surfaces include the normative emission and ownership contract in `SPEC.md`, target adapter planning, Caplet workflow aggregation and diff reporting, managed sidecar lifecycle, reserved-path validation, host compatibility fixtures/tests, implementation documentation, codemaps, and live user/Claude emitted skill trees.
