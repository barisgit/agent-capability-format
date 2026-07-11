## ADDED Requirements

### Requirement: Source entries can select capabilities from a collection
A `capabilities.yml` source entry MAY contain a `capabilities` field as either one selector string or a non-empty list of selector strings. The implementation MUST normalize scalar syntax to a one-item list. When omitted, the source entry MUST select every discovered capability in the collection.

#### Scenario: Scalar exact selector
- **WHEN** a source collection contains `acf/cap1/acf.yml` and the entry declares `capabilities: cap1`
- **THEN** the resolver selects `cap1`

#### Scenario: Selector omitted
- **WHEN** a source collection contains multiple capabilities and the entry omits `capabilities`
- **THEN** the resolver selects every discovered capability

### Requirement: Selectors match collection-relative capability paths
Selectors MUST match normalized forward-slash paths relative to the selected source root's `acf/` directory. An exact selector MUST match one complete capability path. `*` MUST match zero or more characters within one path segment, `?` MUST match one character within one segment, and a complete `**` segment MUST match zero or more path segments. Only directories containing `acf.yml` or `acf.yaml` are candidates.

#### Scenario: Group glob
- **WHEN** the collection contains `group1/cap3` and `group1/cap4` and the entry declares `capabilities: group1/*`
- **THEN** both capabilities are selected

#### Scenario: Recursive glob
- **WHEN** capabilities exist at multiple depths under `group1` and the entry declares `capabilities: group1/**`
- **THEN** every capability below `group1` is selected

#### Scenario: Overlapping selectors
- **WHEN** two selectors match the same capability path
- **THEN** that capability is materialized exactly once

### Requirement: Invalid and unmatched selectors fail safely
Selector values MUST be non-empty relative POSIX paths or globs and MUST reject absolute paths, backslashes, `.` or `..` segments, and `**` embedded inside another segment. Every supplied selector MUST match at least one candidate capability. The resolver MUST emit an error and MUST NOT mutate snapshots or the lock when validation or matching fails.

#### Scenario: Unmatched selector
- **WHEN** an entry declares `capabilities: missing/*` and no candidate path matches it
- **THEN** resolution fails with an error identifying the unmatched selector and leaves prior state unchanged

#### Scenario: Traversal selector
- **WHEN** an entry declares a selector containing `..`
- **THEN** manifest validation rejects the selector

### Requirement: Selection composes with path and facet filters
`path` MUST first select a repository subtree. Capability selectors MUST then match relative to that subtree's `acf/` collection. Facet-level `include` and `exclude` MUST apply only after capability selection. An entry whose selected subtree is a direct single-capability root MUST reject a simultaneous `capabilities` field.

#### Scenario: Collection inside a monorepo
- **WHEN** `path` selects a subtree containing `acf/group/cap/acf.yml` and `capabilities: group/*` is declared
- **THEN** the resolver selects the capability and then applies facet filters

#### Scenario: Direct capability conflict
- **WHEN** `path` selects a directory containing `acf.yml` and the entry also declares `capabilities`
- **THEN** resolution fails without mutating installed state

### Requirement: Lockfiles preserve selection and resolved results
A lock entry produced from a selected source MUST record normalized `capabilities` selectors and the final sorted `capabilityNames`. Changing the selectors MUST be detected as lock drift and MUST cause the source to be reconciled in modes that permit fetching.

#### Scenario: Selected lock entry
- **WHEN** selectors resolve two capabilities
- **THEN** the lock entry records the selectors and both resulting installed capability names

### Requirement: Selector changes reconcile stale snapshots
After a source is successfully resolved with changed selectors, the installer MUST remove snapshot directories recorded by that source's previous lock entry but absent from its new result. It MUST NOT remove a name retained by another active lock entry, and it MUST perform removal only after the new selection has fully validated and materialized.

#### Scenario: Capability removed from selection
- **WHEN** the previous lock selected `cap1` and `cap2` and the new selector selects only `cap1`
- **THEN** the installer retains `cap1`, removes the stale `cap2` snapshot, and records only `cap1` in the lock
