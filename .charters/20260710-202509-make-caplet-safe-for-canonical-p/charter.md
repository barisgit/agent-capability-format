# Charter: Canonical Caplet authoring readiness

## Objective

Make Caplet safe for canonical personal capability authoring, create `~/Programming_local/Capatibilities` as the canonical Git repository, and migrate one live skill through a fully verified user-scope Pi workflow without losing content.

## Scope

In scope: correct Pi global paths; named update isolation; monorepo source identity and safe subpaths; byte-preserving assets and executable modes; a canonical Git repository; one reversible live migration. Existing unrelated untracked documentation is out of scope.

## Criteria

### C1. Caplet has regression-tested canonical authoring semantics
Pi user output resolves under `~/.pi/agent`; `update <name>` refreshes only that source; multiple `add --path` entries from one monorepo resolve independently and legacy locks migrate without violating never-fetch mode.
Evidence: pass — target, add, update, source-id, drift, path-safety, and legacy-never regression tests passed in the full workspace run; the live lock migrated to `path:/Users/blaz/Programming_local/Capatibilities#path=capabilities%2Fsimplify` and remained clean (`work/live-lock-migration.txt`, `work/final-checks.txt`, 2026-07-10).

### C2. Caplet preserves skill assets byte-for-byte and retains executable modes
An end-to-end fixture must include a binary file and executable script and prove emitted bytes and permissions match the source.
Evidence: pass — `binary-assets.test.ts` passed in the full workspace run, proving snapshot/canonical/Pi-native byte equality, mode 0755 retention, idempotence, mode-only drift detection, and repair (`work/final-checks.txt`, 2026-07-10).

### C3. The requested canonical repository is a valid, documented Git repository
`~/Programming_local/Capatibilities` has a monorepo-ready structure, README, and one valid capability sourced from an existing live skill.
Depends: C1, C2
Evidence: pass — clean Git repository at `/Users/blaz/Programming_local/Capatibilities`, root commit `e3fc7c2`, documented local/GitHub authoring loop, and valid `capabilities/simplify` source; Caplet check reported one valid capability (`work/live-verification.txt`, 2026-07-10).

### C4. One real user-scope Pi capability is migrated reversibly through Caplet
The real CLI must add, fetch, check, diff, and apply the capability; canonical and Pi-native output must preserve equivalent frontmatter/body and match each other; the prior live directory must remain backed up.
Depends: C1, C2, C3
Evidence: pass — linked `caplet` added/fetched/checked/diffed/applied `simplify`; canonical and Pi-native hashes match, parsed frontmatter/body match the source with zero diagnostics, final diff is clean, sidecar owns both outputs, and the original remains at `~/.agents/backups/caplet-migration-20260710/original-live-simplify` (`work/live-add.txt`, `work/live-fetch-check.txt`, `work/live-diff-before-apply.txt`, `work/live-apply.txt`, `work/live-verification.txt`, 2026-07-10).

### C5. Relevant repository checks and an independent review pass
All workspace type checks, tests, and builds plus changed-file lint/error checks and diff hygiene must pass; a focused reviewer must find no unresolved critical or important issue. The unrelated repository-wide formatting baseline is captured rather than expanded into this change.
Depends: C1, C2, C4
Evidence: pass — all 18 workspace type/test/build tasks passed, changed-file Biome error-level check passed, and `git diff --check` passed (`work/final-checks.txt`); final independent review approved with 0 critical/important issues after its never-fetch concern was fixed. Existing 43-error repository-wide formatting baseline is captured at `work/full-lint-baseline.txt` (2026-07-10).
