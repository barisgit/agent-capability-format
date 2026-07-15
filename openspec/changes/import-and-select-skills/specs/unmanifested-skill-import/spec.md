## ADDED Requirements

### Requirement: Manifested repositories take precedence
When a source contains a valid root `acf.yml` or an `acf/` capability collection, the resolver SHALL use the existing manifested-capability path and SHALL NOT synthesize bare-skill capabilities from other `SKILL.md` files in that repository.

#### Scenario: Repository contains ACF and skills
- **WHEN** a source contains an `acf/` collection and a top-level `skills/` directory
- **THEN** only capabilities discovered through the ACF collection are offered and resolved

### Requirement: Recognized bare-skill layouts are imported without source mutation
When no ACF capability is present, the installer SHALL discover skills from exactly one deterministic layout in this precedence order: a root `SKILL.md`, immediate `skills/<directory>/SKILL.md` children, then immediate `<directory>/SKILL.md` children. Discovery SHALL ignore hidden paths, dependency directories, and deeper incidental `SKILL.md` files, and SHALL NOT write generated files into the source checkout.

#### Scenario: Standard multi-skill repository
- **WHEN** an unmanifested source contains `skills/pdf/SKILL.md` and `skills/docs/SKILL.md`
- **THEN** the installer discovers exactly the `pdf` and `docs` skills without modifying the source

#### Scenario: Root skill wins over nested files
- **WHEN** an unmanifested source contains a root `SKILL.md` and nested referenced examples that also contain `SKILL.md`
- **THEN** the source is imported as the single root skill and nested files are not independently discovered

#### Scenario: No recognized capability or skill
- **WHEN** a source contains neither an ACF capability nor a recognized bare-skill layout
- **THEN** resolution fails with an actionable no-capabilities diagnostic and preserves the previous lock and snapshots

### Requirement: Each bare skill becomes one synthesized capability
The installer SHALL materialize every discovered bare skill as a separate canonical capability whose name is the skill's validated frontmatter name and whose version identifies it as unmanifested and includes the resolved revision when available. The source lock entry SHALL mark synthesized provenance and list those capability names using the same fields as manifested collections.

#### Scenario: GitHub repository synthesis
- **WHEN** `github:acme/agent-skills` at a pinned revision exposes `pdf`, `docs`, and `slides`
- **THEN** the snapshots and lock contain three synthesized capabilities named `pdf`, `docs`, and `slides`, each labeled as an unmanifested import and tied to the resolved SHA

#### Scenario: Synthesized name collision
- **WHEN** a synthesized capability name collides with another capability in the same scope
- **THEN** resolution reports the existing capability-name collision and performs no partial mutation

### Requirement: Imported skill metadata is interoperable
An imported skill SHALL require a valid deterministic skill name. A missing description SHALL produce a warning rather than exclude the skill, while malformed or duplicate names SHALL fail resolution with source paths in the diagnostics.

#### Scenario: Missing description
- **WHEN** a discovered `SKILL.md` has a valid name but no description
- **THEN** the skill remains importable and resolution emits a warning identifying that file

#### Scenario: Duplicate names
- **WHEN** two discovered skill directories declare the same skill name
- **THEN** resolution fails before writing the manifest, lock, or snapshots

### Requirement: Imported skill contents are complete and portable
Each synthesized capability SHALL include the imported skill's primary file and all recursively contained regular files as skill-owned assets except hidden paths, `node_modules`, generated managed notices, and unsupported file types such as symbolic links. Explicit upstream `assets` fields SHALL NOT cause other portable files to be dropped from an imported skill.

#### Scenario: References and scripts need no asset declaration
- **WHEN** an imported skill contains `references/guide.md` and `scripts/run.py` but declares no `assets` field
- **THEN** apply emits both files alongside `SKILL.md` to every selected target

#### Scenario: Dependency and managed paths are excluded
- **WHEN** an imported skill contains `node_modules/`, `.cache/`, and `ACF-MANAGED.md`
- **THEN** none of those paths enter the synthesized snapshot, content hash, plan, or target output

### Requirement: Synthesized imports reconcile like managed capabilities
Updating, narrowing, or removing synthesized capabilities SHALL use the existing lock and sidecar ownership model to create, update, transfer, and delete managed output without touching unmanaged files.

#### Scenario: Upstream skill disappears from an unfiltered source
- **WHEN** a previously imported skill is absent at the newly resolved revision of an unfiltered source
- **THEN** update plans and applies deletion of only that capability's snapshot and sidecar-owned output

#### Scenario: Explicitly selected skill disappears
- **WHEN** a `capabilities:` selector names a synthesized skill that is absent at the newly resolved revision
- **THEN** update reports an unmatched capability selector and preserves the prior lock, snapshots, and outputs
