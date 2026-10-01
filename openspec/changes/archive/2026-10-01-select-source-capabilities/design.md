## Context

ACF repository discovery already supports arbitrary-depth capabilities beneath a source root's `acf/` directory. A source entry can select one exact directory with `path`, but cannot curate several capabilities without repeating the source. Selection must occur after discovery and before copying/locking, and changing selectors must remove stale snapshots without risking unrelated capabilities.

## Goals / Non-Goals

**Goals:**
- Select exact and globbed capability paths from one discovered collection.
- Keep omission equivalent to selecting the complete collection.
- Make typos observable and overlapping patterns deterministic.
- Persist selector intent and resolved names in the lock.
- Reconcile snapshots removed by a selector change.
- Preserve `path` as a source-root/subtree locator for monorepos.

**Non-Goals:**
- Capability dependency resolution.
- Shared resources between capabilities.
- Changing facet-level `include`/`exclude` semantics.
- Selecting capabilities by mutable manifest display metadata.

## Decisions

### Select by collection-relative path

Selectors match normalized POSIX paths from the selected source root's `acf/` directory to directories containing `acf.yml`. Directory paths are stable, support grouping such as `group1/*`, and avoid ambiguity when manifest names are renamed. Manifest capability names remain the installed destination and lock `capabilityNames` values.

Alternative: select by manifest name. Rejected because names cannot express repository grouping and may be transformed by `rename`.

### Accept scalar or list syntax

`capabilities` accepts a non-empty string or non-empty string array and normalizes internally to an array. Omission selects all. Exact selectors and glob selectors share one field. `*` matches within one segment, a complete `**` segment crosses path segments, and `?` matches one character. Backslashes, absolute paths, `.`/`..`, empty selectors, and `**` embedded in another segment are invalid.

### Treat every unmatched selector as an error

Each supplied selector must match at least one discovered capability. This catches typos even if another pattern matched successfully. Overlapping patterns deduplicate by canonical capability root.

### Apply selectors after repository discovery

Discovery remains responsible for locating valid capability roots. The installer derives each root's path relative to `<selected source>/acf`, filters those roots, then reads/materializes the selected capabilities. If the selected source is a direct single-capability root, specifying `capabilities` is an error. `path` may first narrow a monorepo to a repository root containing `acf/`; selectors are relative to that resulting collection.

### Keep source identity independent of selectors

A source plus `path` remains one declarative entry and one lock identity. The lock records normalized `capabilities` selectors and resulting `capabilityNames`. Selector changes create lock drift and force reconciliation without treating the same repository as a second source.

### Reconcile only snapshots formerly owned by the same lock entry

Stage all fetched capability trees outside the live snapshot directory. Only after every source entry validates, replace the selected snapshots, then remove names present in previous lock entries but absent from the new result unless another retained entry claims that name. Discard staging and preserve the prior lock and snapshots on parse, source validation, or unmatched-selector failure. Emitted stale-output reconciliation remains owned by Caplet's sidecar workflow.

## Risks / Trade-offs

- [Glob behavior can surprise users] → Specify a small path-glob grammar and test exact, `*`, `**`, overlap, and unmatched cases.
- [Selector changes could delete snapshots] → Delete only after complete successful materialization and only from the previous entry's recorded names.
- [Directory path and manifest name can diverge] → Match paths, report both selector and discovered paths in diagnostics, and keep installed names unchanged.
- [Scalar-or-list broadens schema complexity] → Normalize at the schema boundary so downstream code sees only `string[]`.

## Migration Plan

1. Add schema/types/diagnostics and lock compatibility.
2. Implement filtering and snapshot reconciliation with focused tests.
3. Update normative and implementation documentation.
4. Rename the personal canonical repository collection from `capabilities/` to `acf/`.
5. Change the live source entry to root source plus `capabilities: engineering-workflows`, force-fetch, check, dry-run, and apply.
6. Verify hashes, sidecar ownership, and a clean post-apply diff. Roll back using the repository commit and pre-migration manifest/snapshot backup if any check fails.

## Open Questions

None.
