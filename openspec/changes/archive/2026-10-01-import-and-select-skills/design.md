## Context

Caplet already resolves manifested root capabilities and `acf/` collections, filters collections through entry-level `capabilities`, and reconciles snapshots and target outputs by capability name. Its legacy `skills/` fallback writes `acf.yml` into the fetched root, mutates live `path:` sources, treats a whole repository as one capability, and still drops undeclared auxiliary files. `caplet add` writes capabilities.yml before source inspection, which caused the user's first multi-capability install to select everything.

The existing `include`/`exclude` facet fields are parsed and locked but are not consumed during emission. Using them for imported skill selection would create a second, currently nonfunctional selector namespace. Bare skills instead become ordinary capabilities so selection, locking, naming collisions, narrowing, and reconciliation reuse the shipped capability model.

## Goals / Non-Goals

**Goals:**
- Consume common bare-skill repositories without publisher changes.
- Represent each imported skill as one ordinary synthesized capability.
- Select manifested and synthesized capabilities through the same exact shorthand and numbered picker.
- Inspect before durable mutation and reuse that acquisition within the add operation.
- Preserve byte-identical SKILL.md content, complete portable assets, and non-interactive compatibility.

**Non-Goals:**
- Synthesizing agents, MCP servers, commands, hooks, or instructions from non-ACF layouts.
- Activating or redesigning facet-level `include`/`exclude` selectors.
- Registry/discovery, npm publication, or a raw-mode terminal UI.
- Glob syntax in `@name`; direct YAML retains advanced selectors.
- Globally enabling implicit assets for authored ACF capabilities.

## Decisions

### One imported skill equals one capability

A repository containing N bare skills yields N generated capabilities named from validated skill frontmatter. This makes `github:owner/repo@name` a direct shorthand for the existing `capabilities: [name]` selector, with no special facet filtering. The source retains one lock entry whose `capabilityNames` lists selected synthesized capabilities.

Alternative: one repository capability containing N skill facets. Rejected because it requires making dead facet selectors operational, gives `@name` two meanings, complicates removal, and bypasses existing capability-level reconciliation.

### Share one source inventory between inspection and resolution

An installer inventory classifies a fetched root as a manifested capability set or synthesized bare skills and returns stable capability candidates with names, source paths, and materialization descriptors. Both `caplet add` preflight and normal resolution consume it.

### Manifested sources win; bare layout discovery is shallow and deterministic

Detection checks root `acf.yml`, then `acf/`. Only without ACF does it choose the first matching bare layout: root `SKILL.md`, immediate `skills/*/SKILL.md`, then immediate `*/SKILL.md`. It never recursively combines layouts, preventing examples and vendored files from becoming accidental capabilities.

### Synthesize into staging without rewriting upstream content

Replace `ensureLegacyManifest()` with staged canonicalization. For each skill, generate a capability root containing `acf.yml`, a private `.acf-import.json` marker, and `skills/<declared-name>/` copied from the portable source tree. The version is `0.0.0-unmanifested+<revision-or-local>`. The marker enables import-aware reader behavior but is never emitted; the lock also records `synthesized: true` for user-visible provenance.

The import-aware reader tolerates a missing description with a warning and in-memory fallback, collects all portable regular files as skill assets, and leaves SKILL.md bytes unchanged. Hidden paths, `node_modules`, `ACF-MANAGED.md`, symlinks, and special files are excluded. Authored ACF capabilities retain reference/frontmatter-driven assets.

### GitHub suffix is exact and add-only

Parse `github:owner/repo@name` before normal source validation, remove the suffix from the persisted source, and validate `name` against the inventory. Git/path syntax is untouched because native URLs and paths may contain `@`. The suffix maps directly to `capabilities: [name]`; unmatched or duplicate names fail before durable mutation.

### Use a numbered line picker, not raw mode

For interactive unqualified sources with multiple candidates, print a numbered list and read one line using existing console infrastructure. Accept comma-separated numbers and ranges, `a`, empty-as-all, or `q`. Invalid input explains and retries. This avoids raw-mode restoration hazards and is accessible in ordinary terminals. Non-TTY and `--yes` preserve install-all behavior.

### Inspect before mutation and reuse the fetched lease

Interactive unqualified adds and explicit suffix adds inspect first. Once confirmed, the add command writes the manifest and passes the fetched lease through resolution so a remote repository is not cloned twice. Cancelled/invalid selection leaves manifest, lock, snapshots, and targets unchanged. Non-TTY unqualified adds use the existing single fetch path.

### Removal edits selectors before deleting source entries

When a lock entry maps a named capability to a manifest entry with multiple explicit capability selectors, `remove` deletes only that selector and retains siblings. The lock records each final capability name's exact inventory selector so collection paths remain stable even when they differ from manifest names or originated from a glob. It removes the whole source entry only when it represented solely the removed capability. Existing orphan sweeping deletes only the removed capability's outputs.

## Risks / Trade-offs

- [Repositories contain ambiguous layouts] -> strict precedence and source-path diagnostics.
- [Two repositories publish the same skill name] -> existing same-scope collision error; rename remains the escape hatch.
- [Large repositories produce many capabilities] -> compact add output and existing plan rollups; measure before adding limits.
- [Inspection and resolution diverge] -> one inventory implementation and one-use fetched lease.
- [Imported trees contain generated/dependency content] -> explicit portable-tree exclusions and regular-file-only copying.
- [Old locks lack synthesized metadata or exact selector mappings] -> optional backward-compatible fields with no lock schema bump; ambiguous legacy collection removal fails safely with an update instruction.
- [Selector-aware removal regresses unfiltered entries] -> tests for selected siblings, sole selection, and install-all entries.

## Migration Plan

1. Add inventory and non-mutating per-skill synthesis behind existing resolution.
2. Replace the legacy fallback and add backward-compatible lock provenance.
3. Add exact suffix parsing, inspection, selector-aware removal, and the numbered picker.
4. Update surfaces/docs/codemaps and run full CI plus local/public dogfood.

Existing manifests and locks remain valid. Rollback is code-only; synthesized snapshots are ordinary managed capabilities and current sidecar sweeping removes them safely.

## Open Questions

None.
