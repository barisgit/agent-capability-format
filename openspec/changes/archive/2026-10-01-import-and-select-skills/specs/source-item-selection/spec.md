## ADDED Requirements

### Requirement: GitHub source suffix selects one capability
`caplet add` SHALL accept `github:owner/repo@<capability>` as an add-only exact-selector shorthand. Caplet SHALL persist the canonical source without the suffix and translate the selected name into the existing `capabilities:` field for manifested and synthesized sources. Git and path source strings SHALL remain unchanged because `@` can be part of their native syntax.

#### Scenario: Select a manifested capability
- **WHEN** `github:acme/caps@engineering` identifies a discovered manifested capability
- **THEN** Caplet writes the canonical `github:acme/caps` source with `capabilities: [engineering]`

#### Scenario: Select a synthesized skill capability
- **WHEN** `github:acme/skills@pdf` identifies a synthesized `pdf` capability
- **THEN** Caplet writes the canonical source with `capabilities: [pdf]` and emits only that skill capability

### Requirement: Explicit selection is deterministic and safe
The shorthand SHALL match one exact discovered capability name. An empty, unknown, or ambiguous item SHALL fail with candidate information before capabilities.yml, lockfiles, snapshots, or target outputs are changed. Advanced glob and path selection SHALL remain available only through direct YAML editing.

#### Scenario: Selector matches nothing
- **WHEN** the requested name matches no discovered capability
- **THEN** add exits with an unmatched-item diagnostic listing valid candidates and leaves the scope unchanged

#### Scenario: Duplicate synthesized names
- **WHEN** two imported directories declare the requested capability name
- **THEN** inventory creation fails with both source paths before selection or mutation

### Requirement: Interactive add inspects before mutation
When stdin and stdout are interactive terminals, `--yes` is absent, no explicit item is supplied, and the source exposes multiple capabilities, `caplet add` SHALL present a dependency-free numbered multi-select before modifying capabilities.yml. Manifested and synthesized capabilities SHALL use the same interaction and selector representation.

#### Scenario: Choose capabilities from a collection
- **WHEN** an interactive user adds an unqualified source with three capabilities
- **THEN** Caplet prompts with those three names and persists exactly the confirmed selection

#### Scenario: Accept the default selection
- **WHEN** the user submits an empty response at the picker
- **THEN** Caplet confirms the displayed all-capabilities default and continues

#### Scenario: Cancel selection
- **WHEN** the user enters the cancellation choice or reaches end-of-input before confirming
- **THEN** Caplet exits as cancelled and writes no manifest, lock, snapshot, or target output

#### Scenario: Invalid numbered selection
- **WHEN** the user enters an invalid number or token
- **THEN** the picker explains the valid input and prompts again without mutation

### Requirement: Automation remains deterministic
When either terminal stream is non-interactive, or `--yes` is supplied, an unqualified source SHALL retain install-all behavior and SHALL not attempt to prompt. An explicit source item SHALL still be validated and selected in every environment.

#### Scenario: Non-interactive add
- **WHEN** an unqualified multi-capability source is added with piped input or output
- **THEN** Caplet installs all capabilities and prints the selected names or count without reading terminal input

#### Scenario: Yes skips picker
- **WHEN** an interactive user supplies `--yes` for an unqualified multi-capability source
- **THEN** Caplet installs all capabilities without prompting

### Requirement: Selection happens with one reusable acquisition
Caplet SHALL inspect and resolve a remote source without performing duplicate clones for the same add operation, and SHALL not persist inspection artifacts as managed state when selection is cancelled or invalid.

#### Scenario: Selected remote add
- **WHEN** a remote source is inspected before manifest mutation and selection is confirmed
- **THEN** the fetched revision is reused for resolution and lock creation during that command

### Requirement: Removing one selected capability retains siblings
When multiple selected capabilities share one source entry, `caplet remove <name>` SHALL remove only that selector and its managed output. It SHALL delete the source entry only when no selected capabilities remain or the entry represented exactly that one capability.

#### Scenario: Remove one of three selected capabilities
- **WHEN** one source entry selects `alpha`, `beta`, and `gamma` and the user removes `beta`
- **THEN** the manifest retains the source with `alpha` and `gamma`, apply removes only `beta`, and subsequent check is clean
