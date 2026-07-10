# Charter Report

## Objective

Make Caplet safe for canonical personal capability authoring, create `~/Programming_local/Capatibilities` as the canonical Git repository, and migrate one live skill through a fully verified user-scope Pi workflow without losing content.

## Criteria

### C1. Caplet has regression-tested canonical authoring semantics

Evidence: pass — target, add, update, source-id, drift, path-safety, and legacy-never regression tests passed in the full workspace run; the live lock migrated to `path:/Users/blaz/Programming_local/Capatibilities#path=capabilities%2Fsimplify` and remained clean (`work/live-lock-migration.txt`, `work/final-checks.txt`, 2026-07-10).

### C2. Caplet preserves skill assets byte-for-byte and retains executable modes

Evidence: pass — `binary-assets.test.ts` passed in the full workspace run, proving snapshot/canonical/Pi-native byte equality, mode 0755 retention, idempotence, mode-only drift detection, and repair (`work/final-checks.txt`, 2026-07-10).

### C3. The requested canonical repository is a valid, documented Git repository

Evidence: pass — clean Git repository at `/Users/blaz/Programming_local/Capatibilities`, root commit `e3fc7c2`, documented local/GitHub authoring loop, and valid `capabilities/simplify` source; Caplet check reported one valid capability (`work/live-verification.txt`, 2026-07-10).

### C4. One real user-scope Pi capability is migrated reversibly through Caplet

Evidence: pass — linked `caplet` added/fetched/checked/diffed/applied `simplify`; canonical and Pi-native hashes match, parsed frontmatter/body match the source with zero diagnostics, final diff is clean, sidecar owns both outputs, and the original remains at `~/.agents/backups/caplet-migration-20260710/original-live-simplify` (`work/live-add.txt`, `work/live-fetch-check.txt`, `work/live-diff-before-apply.txt`, `work/live-apply.txt`, `work/live-verification.txt`, 2026-07-10).

### C5. Relevant repository checks and an independent review pass

Evidence: pass — all 18 workspace type/test/build tasks passed, changed-file Biome error-level check passed, and `git diff --check` passed (`work/final-checks.txt`); final independent review approved with 0 critical/important issues after its never-fetch concern was fixed. Existing 43-error repository-wide formatting baseline is captured at `work/full-lint-baseline.txt` (2026-07-10).

## Artifacts

- work/final-checks.txt
- work/full-lint-baseline.txt
- work/live-add.txt
- work/live-apply.txt
- work/live-diff-before-apply.txt
- work/live-fetch-check.txt
- work/live-lock-migration.txt
- work/live-verification.txt

## Summary

Caplet is now suitable for the personal canonical-authoring workflow:

- Pi user output uses `~/.pi/agent`, while skills default to the canonical
  `~/.agents/skills` root that Pi already discovers; native skill emission is
  opt-in to avoid duplicate-name warnings.
- `update <name>` refreshes only the owning source while preserving unrelated lock state.
- `add --path` supports multiple independently locked capabilities from one monorepo, migrates legacy source-only lock IDs safely, and rejects source-root escapes.
- File diffs transport arbitrary bytes and preserve file modes; sidecar drift and apply logic are byte-aware.
- The canonical repository exists at `~/Programming_local/Capatibilities` with the committed `simplify` capability and authoring documentation.
- The live `simplify` skill is Caplet-managed at the canonical location, with
  the redundant Pi-native copy removed and a retained rollback copy.
- A repository atlas was initialized under `codemap.md` and `.slim/cartography.json` for future maintenance.

The only known repository-level follow-up is the pre-existing Biome formatting backlog captured in `work/full-lint-baseline.txt`; it was deliberately not mixed into this functional change.
