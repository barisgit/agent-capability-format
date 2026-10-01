# Implementer Audit — ACF Parallel Passes

> **Historical report, superseded.** This audit of the May 2026 parallel
> implementer branches is kept as evidence. Its verdicts, command list, and
> script shapes describe those branches, not the current repository. For the
> current command surface and scripts see `README.md` and
> `IMPLEMENTATION.md`; for planned work see `backlog.md`.

Date: 2026-05-17

This is a synthesis of four autonomous implementation branches. Treat the
branches as experiments. Do not merge yet.

## Branches audited

| Branch | SHA audited | Verdict | Short read |
|---|---:|---|---|
| `feature/implementer-a` | `f8abcbd` | fail | Large code volume, dirty tree, missing deliverables, typecheck/test/lint failures. Useful scaffolding, not merge-ready. |
| `feature/implementer-b` | `30457a4` | fail-but-best | Most coherent runnable slice. Build/test pass. Misses several SPEC-required diagnostics and diagnostic fixture rigor. Best candidate base/cherry-pick source. |
| `feature/implementer-c` | `d9bdcb9` | fail | Locked-stack-ish, useful pieces, but uncached build/typecheck fail, root test script fails, Zod v3, incomplete CLI/diagnostics. |
| `feature/implementer-d` | `cb63586` | fail | Similar to C but slightly cleaner build/typecheck. Root test script fails, exact optional types disabled, incomplete CLI/diagnostics, multi-capability resolution missing. |

## Executive synthesis

The experiment worked. The repeated failures are more useful than the code.

The main implementation target is clear:

1. Use **B** as the primary reference for project shape and runnable slice.
2. Cherry-pick from **C/D** only where they independently solved something
   B missed, especially fixtures, adapter smoke tests, resolver/hash details,
   and CLI ergonomics.
3. Treat **A** mostly as a scavenging branch: inspect for good ideas in reader,
   schemas, Claude emit, and path fetch, but do not base on it.
4. Before another autonomous implementation round, tighten the brief and spec
   around diagnostics, command completeness, clean-clone checks, and repository
   layout edge cases.

No branch meets the brief's definition of done.

## Common failure patterns

### 1. Diagnostic rigor was under-specified operationally

All branches either missed SPEC-required diagnostics or faked diagnostic coverage.

Observed:

- B accepts duplicate `acf.yml` + `acf.yaml` without an error.
- B accepts singular root folder `skill/` without an error.
- B accepts unknown `ACF.md` frontmatter fields without info diagnostics.
- B accepts invalid instruction regex patterns.
- C/D cover only a subset of diagnostic codes.
- D collapses specific codes into generic `acf.manifest.invalid` or
  `acf.facet.invalid`.
- A has many diagnostic fixtures but skips/fails some and misses 14 codes.

Derived problem:

The spec names many diagnostics, but implementers need a normative
**diagnostic conformance matrix**: code, severity, triggering fixture shape,
expected source path, and whether emission must continue.

Recommended change:

Add a new spec/implementation artifact:

- `DIAGNOSTICS.md` or `openspec/specs/diagnostics/spec.md`
- Table columns: code, severity, owner phase, trigger, minimal fixture,
  expected path, recovery behavior.
- Require a generated fixture test to assert every normative diagnostic.

### 2. Clean-clone command semantics were not strict enough

Observed:

- C passes cached Turbo build but fails `turbo run build --force`.
- C/D pass direct `bun test` but fail root `bun run test` because packages
  without tests exit non-zero.
- A has no build script and fails typecheck/lint/test.
- B passes documented checks, but its `lint` is only `tsc --noEmit`, not a
  real Biome format/lint check.

Derived problem:

The brief said commands should pass, but did not define canonical root scripts
strictly enough.

Recommended locked root scripts:

```jsonc
{
  "scripts": {
    "build": "turbo run build --force",
    "typecheck": "turbo run typecheck --force",
    "test": "turbo run test --force",
    "lint": "biome check .",
    "check": "bun run typecheck && bun run lint && bun run test && bun run build"
  }
}
```

Package-level rule:

- Every package MUST have a `test` script.
- Packages with no tests MUST use a non-failing explicit script, e.g.
  `"test": "echo 'no tests for @acf/runtime-taxonomy'"`.
- Turbo cache must not be accepted as evidence. Audit with `--force`.

### 3. CLI completeness was easy to fake

Observed:

- A stubs `add/remove/update/diff/doctor` but exits 0.
- C lacks `add/remove/update`; `apply/diff` are stubs.
- D lacks `add/remove/update`; `apply/diff` are stubs.
- B has the best CLI, but still needs negative runtime probes.

Derived problem:

The brief listed commands, but did not specify command-level minimum behavior
and exit-code semantics.

Recommended change:

Add a Caplet CLI conformance table:

| Command | Minimum real behavior | Stub allowed? | Exit semantics |
|---|---|---:|---|
| `check` | parse + validate + print diagnostics | no | 0 no error, 1 error diagnostics |
| `inspect` | print resolved capability/facet graph | no | 0 success, 1 invalid |
| `ls` | list scopes/capabilities/facets | no | 0 success |
| `emit` | emit at least implemented adapters | no | 0 success or lossy, 1 errors |
| `fetch` | support `path:` sources and lockfile | no | 0 success, 4 network/fetch |
| `apply` | fetch + emit composite | no | composed |
| `add/remove/update` | mutate `capabilities.yml` | yes only if exits non-zero with clear unsupported diagnostic | non-zero if not implemented |
| `diff` | compare planned changes | yes only if exits non-zero with clear unsupported diagnostic | non-zero if not implemented |
| `doctor` | environment/scope/lock health | yes only if exits non-zero with clear unsupported diagnostic | non-zero if not implemented |

Rule: a placeholder command MUST NOT exit 0.

### 4. Resolver/repository layout edge cases need fixture-first treatment

Observed:

- D does not resolve multi-capability repos under `acf/` arbitrary depth.
- B/C/D vary in lockfile and path-source handling quality.
- A's lockfile misses `capabilityHash` despite path fetch working.

Derived problem:

The repository-layout and fetch rules are normative, but there is no canonical
fixture pack for resolver behavior.

Recommended canonical resolver fixture pack:

- `fixtures/repos/single-root-acf-yml/`
- `fixtures/repos/multi-acf-one-level/`
- `fixtures/repos/multi-acf-nested/`
- `fixtures/repos/legacy-root-skills/`
- `fixtures/repos/invalid-both-root-acf-and-acf-dir/`
- `fixtures/scopes/user-and-project-shadow/`
- `fixtures/scopes/same-scope-collision/`
- `fixtures/sources/path-source-with-rename/`
- `fixtures/sources/path-source-include-exclude/`

Every implementation should run the same fixture suite.

### 5. The locked stack needs to be in the baseline, not only the brief

Observed:

- C used Zod v3 and disabled `exactOptionalPropertyTypes`.
- D disabled `exactOptionalPropertyTypes`.
- A used a pre-lock stack and lacked Turborepo.
- B followed the stack most closely.

Derived problem:

The implementation brief can drift from persistent repo docs. Future agents
will read different documents depending on launch timing.

Recommended change:

Move the locked implementation stack into `IMPLEMENTATION.md` §1, not just
`IMPLEMENTER-BRIEF.md`:

- Bun >= 1.1
- Turborepo
- Bun workspaces
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- Zod v4
- citty
- bun test
- Biome
- `yaml`
- gray-matter
- shell out to `git`
- runtime-agnostic libraries; `Bun.*` only in `apps/caplet`
- optional Effect only when justified

### 6. Adapter expectations need narrower milestone language

Observed:

- A only has Claude registered.
- B emits all 5 targets, but audit only validated artifact existence and some
  lossy diagnostics.
- C/D have adapter smoke tests but no manual host loading.

Derived problem:

"At least Claude + one other adapter" is useful, but agents optimized for
breadth over correctness. A staged adapter plan would work better.

Recommended next milestone:

- M1: Claude adapter complete enough to inspect emitted file tree.
- M2: Codex adapter complete enough to inspect emitted file tree.
- M3: Cursor/OpenCode/Pi adapter stubs must emit explicit unsupported/lossy
  diagnostics, not fake output.
- Manual host loading remains stretch until the core is stable.

## Useful code by branch

### Branch B — primary candidate

Keep/inspect:

- Runnable Bun/Turbo/Zod v4/citty workspace.
- `apps/caplet`, `packages/core`, `packages/adapters`,
  `packages/runtime-taxonomy` structure.
- Passing `bun install`, build, test, and CLI smoke.
- All-five-target emit skeleton.
- Path fetch + lock drift tests.
- Host-smoke notes in `NOTES.md`.

Fix before merge:

- Add real Biome lint script.
- Add missing SPEC diagnostics and negative fixtures.
- Strengthen diagnostic fixture tests to assert actual runtime diagnostics,
  not only folder names.
- Clean dirty/package modifications and cache artifacts.

### Branch C — useful but not base

Keep/inspect:

- Hash determinism / mtime tests.
- Resolver shadow/collision tests.
- Applicability cascade tests.
- Fetch path producing `sha256-...` lock entry.
- Adapter smoke structure.

Reject/fix:

- Zod v3.
- `exactOptionalPropertyTypes: false`.
- TS project-reference / Turbo build failure.
- Root `bun run test` failure.
- CLI stubs and missing commands.

### Branch D — useful but not base

Keep/inspect:

- Clean build/typecheck/lint except root test issue.
- Direct tests around hash/resolver/minimal/diagnostics/applicability/adapters.
- Negative CLI check for missing path.

Reject/fix:

- `exactOptionalPropertyTypes: false`.
- Multi-capability `acf/` arbitrary-depth missing.
- Specific diagnostics collapsed into generic codes.
- Wrong implementer label in deliverables.
- CLI stubs/missing commands.

### Branch A — scavenging only

Keep/inspect:

- Reader/schema/validator/resolver/hash scaffolding.
- Minimal fixture with all six facet families.
- Claude adapter output shape.
- `inspect`/`ls` behavior.

Reject/fix:

- Dirty tree and emitted artifacts checked out.
- Missing `NOTES.md` and `RESULTS.md`.
- Typecheck/lint/test failures.
- Missing second adapter.
- Lockfile missing `capabilityHash`.

## Better next plan

### Phase 0 — Freeze and preserve

- Do not delete branches A/B/C/D yet.
- Tag or record their SHAs in this audit.
- Do not merge any branch wholesale.

### Phase 1 — Amend docs before next implementation

Use OpenSpec now. Suggested changes:

1. `define-implementation-stack`
   - Move locked stack into `IMPLEMENTATION.md`.
   - Add canonical root scripts and cache-forbidden audit commands.

2. `diagnostic-conformance-matrix`
   - Add normative diagnostic matrix and fixture expectations.
   - Clarify exact codes for manifest/version/only-except/hook-run/etc.
   - Require one fixture per code and exact code/severity/source assertions.

3. `caplet-cli-conformance`
   - Define command minimum behavior and placeholder exit semantics.
   - Forbid success exit for unimplemented commands.

4. `resolver-fixture-pack`
   - Add canonical resolver/repo-layout fixtures.
   - Especially `acf/` arbitrary-depth multi-capability repos.

### Phase 2 — Pick implementation base

Default recommendation: base next pass on **B**.

Why:

- Best stack compliance.
- Most coherent runnable slice.
- Broadest adapter skeleton.
- Easiest to harden with failing negative tests.

But do not merge B directly. Instead:

1. Create `feature/reference-impl-v0` from latest main.
2. Cherry-pick B's workspace/package scaffold in small commits.
3. Add doc-driven failing tests for the audit gaps.
4. Cherry-pick C/D tests or implementation pieces only when they make those
   tests pass.
5. Keep A as reference-only.

### Phase 3 — Test-first hardening order

1. Root scripts and toolchain:
   - `bun install`
   - `bun run build --force` or root script wrapping Turbo `--force`
   - `bun run typecheck --force`
   - `bun run test --force`
   - `bunx biome check .`

2. Diagnostic conformance:
   - duplicate manifest files
   - singular root facet folders
   - unknown `ACF.md` frontmatter fields
   - invalid regex patterns
   - hook `run.args` + `run.shell`
   - MCP missing URL/command by transport
   - target extension unknown fields
   - path traversal/backslash

3. Resolver conformance:
   - single root `acf.yml`
   - multi `acf/<arbitrary-depth>/acf.yml`
   - legacy root `skills/`
   - project shadows user
   - same-scope collision
   - `path:` source install + `capabilityHash`

4. CLI conformance:
   - help for every command
   - non-zero unimplemented commands if any remain
   - `check`, `inspect`, `ls`, `emit`, `fetch`, `apply` minimum behavior

5. Adapter conformance:
   - Claude complete first.
   - Codex second.
   - Others emit explicit lossy/unsupported diagnostics until real.

## Spec/implementation changes to make now

These are concrete doc changes derived from the branch failures:

1. Add a diagnostic conformance matrix.
2. Pin canonical root scripts and forbid cached Turbo evidence in audits.
3. Move locked tech stack from brief into `IMPLEMENTATION.md`.
4. Clarify unimplemented CLI commands must exit non-zero.
5. Add canonical resolver fixture names and required coverage.
6. Clarify that `lint` means Biome, not `tsc`.
7. Clarify `test` scripts in packages with no tests must be non-failing by
   design, not accidental failure.
8. Clarify adapter milestone: complete Claude + Codex before breadth stubs.

## Merge recommendation

Do not merge yet.

Best path:

1. Create the OpenSpec changes above.
2. Update docs/brief.
3. Create a new implementation branch based on main.
4. Cherry-pick B's scaffold.
5. Hardening through tests from this audit.
6. Cherry-pick C/D/A selectively.

If time is short and you want one branch to continue manually: continue from
B, not C/D/A.
