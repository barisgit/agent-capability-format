## Context

ACF emits whole files, fully owned skill directories, and owned regions inside shared host files. Caplet records exact machine ownership in a hidden `.acf-managed.json` sidecar, but agents inspecting generated output receive no visible warning. Notices must be generated only at emission time, remain outside source/snapshot hashes, aggregate ownership across capabilities, and avoid altering prompt payloads or shared configuration formats.

## Goals / Non-Goals

**Goals:**
- Give agents and humans visible, actionable ownership guidance.
- Provide one deterministic inventory per install root and one local notice per fully owned top-level artifact directory.
- Preserve exact sidecar authority, collision safety, drift detection, and stale removal.
- Keep notices ignored by every supported host's discovery and automatic prompt loading.
- Keep diff output transparent without listing dozens of repetitive marker paths.

**Non-Goals:**
- Injecting comments, frontmatter, or banners into payload files.
- Making generated files read-only.
- Exposing source URLs, credentials, machine paths, timestamps, or snapshot hashes.
- Claiming that a shared install root or facet container is wholly managed.
- Adding notice configuration or opt-outs.

## Decisions

### Separate visible guidance from machine authority

`ACF-MANAGED.md` is a deterministic human/agent projection. `.acf-managed.json` remains the sole authority for hashes, exact file paths, pointers, marker blocks, ownership, drift, and reconciliation. Caplet never reads Markdown notices to decide ownership.

Alternative: make the Markdown authoritative. Rejected because prose is unsuitable for structural ownership and may be edited by users or agents.

### Generate notices only in the final emission plan

Source repositories and resolved capability snapshots remain unchanged. The emit driver augments the desired diff plan after adapter output is known. For a full emit, that plan supplies the complete inventory. For a target-filtered emit, Caplet overlays the selected plan onto retained sidecar ownership so artifacts managed through other targets remain listed at shared roots such as `.agents`. This preserves one aggregate inventory across capabilities and targets without executing unselected adapters. Notice diffs use whole-file ownership and a reserved system owner; local notices are associated with their owning capability for removal.

### Use two notice levels

Every install root with desired ACF output receives `ACF-MANAGED.md`, explicitly stating that the root is shared and listing managed artifact roots and shared files/regions grouped by capability and facet. Each top-level directory wholly owned as one artifact receives its own `ACF-MANAGED.md`. No notices are emitted recursively into child asset directories.

Current fully owned directory artifacts are emitted skills. The contract is facet-agnostic so future adapters may declare other complete directory roots.

### Keep inventories concise and deterministic

The root inventory lists complete artifact directories once, whole-file artifacts individually, and partially owned files with ownership kinds rather than every child asset or structural pointer. Capability names, facet groups, and paths sort lexicographically. Fixed prose and LF line endings are used; timestamps and concrete source locations are forbidden.

### Reserve and protect the notice path

`ACF-MANAGED.md` is reserved at install roots and fully owned artifact roots. If a source asset would emit there, planning fails. If an unowned destination file already occupies a reserved notice path, planning/apply fails rather than overwriting or merging it. A notice already owned in the sidecar may be updated normally.

### Reconcile notices as ordinary managed output

Notice files appear as whole-file `FileDiff` values, receive sidecar hashes, participate in drift detection, and are removed when their corresponding desired ownership disappears. The root notice disappears when the install root has no remaining desired ACF artifacts. Edited or deleted notices are restored on apply.

### Group notice changes in terminal reporting

Dry-run and diff remain transparent: notice changes count as file operations, but repeated paths are summarized in a `Management notices` group. JSON/programmatic diff contracts remain exact and uncollapsed.

## Risks / Trade-offs

- [A host auto-loads arbitrary Markdown] → Verify official behavior for every built-in target and add compatibility fixtures before enabling the location.
- [A visible root notice appears to claim user files] → Fixed prose explicitly says the root is shared and only listed entries are managed.
- [Aggregate inventory ownership complicates targeted apply and capability removal] → Treat it as system-owned desired state regenerated from the selected plan overlaid on authoritative retained sidecar ownership, never as one capability's payload.
- [Reserved filename breaks an existing user file] → Fail safely with a path-specific diagnostic and require explicit relocation; never overwrite.
- [Large installations produce long inventories] → List artifact roots and shared ownership summaries, while the sidecar keeps exhaustive details.

## Migration Plan

1. Add the normative notice, reservation, determinism, and lifecycle contract.
2. Add emission-plan metadata sufficient to distinguish complete directory artifacts from shared outputs.
3. Generate local and root notices, validate collisions, and integrate system ownership into apply/removal.
4. Add grouped CLI reporting and comprehensive tests, including all target layouts.
5. Run full CI and compatibility checks, then apply to the live user and Claude roots. Existing outputs gain notices on the next apply; rollback removes notice-owned sidecar entries and files without touching payloads.

## Open Questions

None.
