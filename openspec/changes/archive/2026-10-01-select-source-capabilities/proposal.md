## Why

A single ACF repository can publish many capabilities, but consumers currently must either install all of them or repeat the same source with one `path` entry per capability. Entry-level capability selectors make curated installation concise while preserving the standard `acf/` collection layout.

## What Changes

- Add an optional `capabilities` selector to each `capabilities.yml` source entry.
- Accept one selector string or a list of exact/glob selectors relative to the selected source collection's `acf/` directory.
- Select all discovered capabilities when the field is omitted; reject selectors that match nothing; deduplicate overlapping matches.
- Record selectors and resulting capability names in `capabilities.lock` and reconcile snapshots removed from the selected set.
- Document interaction with `path`, facet `include`/`exclude`, and direct single-capability sources.
- Rename the canonical personal capability repository from `capabilities/` to the standard `acf/` collection layout and use the selector syntax in the live user manifest.

## Capabilities

### New Capabilities
- `source-capability-selection`: Selection and reconciliation of exact or globbed capabilities from a multi-capability source.

### Modified Capabilities

None.

## Impact

Affected surfaces include the normative ACF source/repository/lock contract, core schemas and types, installer discovery/materialization/lock drift, Caplet manifest serialization, tests and documentation, and the live canonical repository at `~/Programming_local/Capatibilities`.
