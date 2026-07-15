## 1. Source Inventory and Discovery

- [ ] 1.1 Add failing public-interface tests for manifested precedence, root-skill, `skills/*`, one-level skill discovery, no-source mutation, invalid layouts, and duplicate names
- [ ] 1.2 Implement one deterministic source-inventory abstraction shared by installer inspection and normal resolution
- [ ] 1.3 Remove the mutating legacy-manifest fallback and preserve existing manifested repository behavior

## 2. Per-skill Capability Materialization

- [ ] 2.1 Add failing resolver tests for one-capability-per-skill snapshots, deterministic names/versions, private import markers, lock provenance, and atomic failure
- [ ] 2.2 Materialize each allowed imported skill tree into an independent staged capability and record backward-compatible synthesized lock metadata
- [ ] 2.3 Add failing reader/adapter tests for missing-description warnings, byte-identical primary files, implicit recursive assets, and path exclusions
- [ ] 2.4 Implement marker-aware imported-skill reading and implicit asset collection without changing authored ACF capability semantics
- [ ] 2.5 Add update/removal tests proving synthesized capabilities and sidecar-owned target files reconcile without touching unmanaged files

## 3. Exact Source Capability Selection

- [ ] 3.1 Add failing parser and manifest tests for `github:owner/repo@name`, canonical persisted sources, empty/invalid suffixes, and native `@` characters in Git/path sources
- [ ] 3.2 Implement add-only GitHub suffix parsing and inventory-based exact capability translation
- [ ] 3.3 Add failing integration tests for exact manifested and synthesized selection, unknown candidates, duplicate names, and no durable mutation on failure
- [ ] 3.4 Implement pre-mutation selection, existing `capabilities:` lock round-tripping, and unmatched selected-skill protection on update
- [x] 3.5 Add failing removal tests and make `caplet remove <name>` retain sibling selectors sharing the same source entry

## 4. Interactive Numbered Multi-select

- [x] 4.1 Add parser-first tests for comma/range selection, all/default, invalid retry, stable result ordering, cancellation, and EOF
- [x] 4.2 Implement a dependency-free line-oriented numbered picker using the existing terminal/console infrastructure
- [ ] 4.3 Add command tests for TTY manifested and synthesized choice, non-TTY install-all, `--yes`, cancellation, and `--no-apply`
- [ ] 4.4 Refactor `caplet add` to inspect before manifest mutation and reuse that command's fetched source during resolution

## 5. Product Surfaces and Documentation

- [ ] 5.1 Label synthesized imports in `show` and JSON payloads and report selected capability names/counts during add
- [ ] 5.2 Update COMMAND_SPECS help/examples and shell completions without introducing a second command metadata source
- [ ] 5.3 Update README, SPEC.md, IMPLEMENTATION.md, backlog status, and affected codemaps

## 6. Verification

- [ ] 6.1 Run focused core/installer/adapter/Caplet tests after each vertical slice and full `bun run ci` at green
- [ ] 6.2 Validate the OpenSpec change strictly and run `git diff --check`
- [ ] 6.3 Dogfood a local bare multi-skill fixture plus one pinned public bare-skill repository, including exact selection and a PTY picker session
- [ ] 6.4 Obtain an independent code review focused on source mutation, selector safety, prompt cancellation, lock compatibility, and reconciliation; resolve important findings
