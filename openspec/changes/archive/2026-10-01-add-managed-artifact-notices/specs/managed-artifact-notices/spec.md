## ADDED Requirements

### Requirement: Every managed install root has a visible inventory
An ACF emit driver MUST create `ACF-MANAGED.md` at every install root containing desired ACF-managed output. The notice MUST state that the root is shared, MUST identify only the artifacts and regions ACF manages, and MUST group inventory entries by owning capability and facet or ownership kind. When no desired managed output remains beneath the root, the driver MUST remove the inventory.

#### Scenario: Mixed managed and unmanaged root
- **WHEN** ACF manages two agent files and one hook region beneath a root that also contains user-authored files
- **THEN** the root notice lists the two agent artifacts and the shared hook ownership without claiming the complete root or unrelated files

#### Scenario: Last managed artifact removed
- **WHEN** reconciliation removes the final desired ACF-managed artifact beneath an install root
- **THEN** the root `ACF-MANAGED.md` is removed while unrelated root content remains

### Requirement: Fully owned artifact directories have local notices
Every top-level artifact directory that ACF owns completely MUST contain `ACF-MANAGED.md`. The local notice MUST identify the owning capability and direct agents to find the capability in `capabilities.yml`, edit its declared source, and run `caplet apply`. Child asset directories MUST NOT receive recursive notices.

#### Scenario: Emitted skill directory
- **WHEN** ACF emits a skill as a fully owned directory containing `SKILL.md` and referenced assets
- **THEN** that skill directory also contains one `ACF-MANAGED.md` and no child asset directory receives another notice

#### Scenario: Shared facet directory
- **WHEN** ACF emits one agent file into a shared `agents/` directory
- **THEN** ACF does not place a local directory notice in `agents/` and instead represents that file in the root inventory

### Requirement: Notices do not alter capability payloads
Management notices MUST be generated only in final emitted output. Emitters MUST NOT add notices to capability source repositories, resolved snapshots, payload files, binary files, JSON files, or partially owned shared files. Notice generation MUST NOT affect capability content hashes.

#### Scenario: Source and snapshot remain byte-identical
- **WHEN** a capability is resolved and emitted
- **THEN** its source and resolved snapshot contain no generated notice while final fully owned artifact directories do

### Requirement: Notice output is deterministic and non-sensitive
For identical desired ownership plans, notice bytes MUST be identical. Inventories MUST sort capabilities, facets, ownership summaries, and relative paths lexicographically and MUST use fixed prose and LF line endings. Notices MUST NOT include timestamps, absolute machine paths, source URLs, credentials, lock hashes, or other environment-specific values.

#### Scenario: Repeated emission
- **WHEN** the same desired capability set is emitted twice on different machines
- **THEN** corresponding notice content is byte-identical

### Requirement: Notice paths are reserved and collision-safe
`ACF-MANAGED.md` MUST be reserved at install roots and fully owned artifact roots. Planning MUST fail with an error when a source artifact would emit to a reserved notice path. Planning or application MUST fail rather than overwrite or merge when an existing destination notice path is not owned by ACF according to the authoritative sidecar.

#### Scenario: Source asset collision
- **WHEN** a skill references a source asset that would emit as `ACF-MANAGED.md`
- **THEN** emission fails with a diagnostic identifying the capability and reserved path

#### Scenario: Unowned destination collision
- **WHEN** an install root already contains an `ACF-MANAGED.md` absent from its sidecar ownership
- **THEN** ACF reports an error and leaves that file unchanged

#### Scenario: Existing owned notice
- **WHEN** the destination notice exists and its sidecar entry records ACF whole-file ownership
- **THEN** normal drift detection and reconciliation may update or restore it

### Requirement: Notices participate in managed lifecycle
Every notice MUST be represented as a whole-file diff and recorded in `.acf-managed.json`. The root inventory MUST use reserved system ownership independent of any one capability; a local directory notice MUST follow the lifecycle of its owning artifact. Edited or deleted notices MUST produce managed drift and MUST be restorable. Removing a capability MUST update aggregate inventories and remove obsolete local notices without deleting unrelated files.

#### Scenario: Notice edited directly
- **WHEN** a user or agent changes a managed notice
- **THEN** drift detection reports the path and `caplet apply` restores deterministic content

#### Scenario: One capability removed from a shared root
- **WHEN** one of several capabilities is removed
- **THEN** its local notices disappear and the system-owned root inventory is regenerated with the remaining capabilities

#### Scenario: Targeted apply preserves shared-root ownership
- **GIVEN** a shared install root contains artifacts emitted through more than one target
- **WHEN** the user applies only one target
- **THEN** the root inventory overlays that target's desired plan on retained authoritative sidecar ownership
- **AND** artifacts managed through unselected targets remain listed

### Requirement: Notice changes remain observable without flooding output
Notice creation, update, deletion, and drift MUST remain part of exact programmatic diff and operation counts. Human terminal output SHOULD group repeated notice changes under a concise `Management notices` section rather than print every marker as an unrelated payload change.

#### Scenario: First emission of many skills
- **WHEN** an apply plan creates notices for many fully owned skill directories
- **THEN** exact diffs contain every notice while human output presents them as one grouped management-notice category

### Requirement: Notice locations are host-safe
A built-in target MUST emit notices only at locations that the host ignores for automatic prompt loading and facet discovery. Compatibility MUST be verified for every supported target before enabling notices. If a target would interpret the standard location as agent instructions or a facet, its adapter MUST choose the nearest visible ignored location while preserving the ownership semantics.

#### Scenario: Host discovery scan
- **WHEN** a supported host scans an install root and a skill directory containing ACF notices
- **THEN** the host discovers the intended facets and payloads but does not load either notice as instructions or as an additional facet
