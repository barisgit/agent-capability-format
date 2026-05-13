# Implementer Brief — ACF Reference Implementation

You are an autonomous implementer. Three of you are running in parallel on
separate branches (`feature/implementer-a/b/c`). Build as much of ACF as you
can, end to end. The other two are doing the same independently. We will
compare outputs and merge or respec.

This brief intentionally contains **no spec content**. SPEC.md is the spec.
Don't restate it; read it.

## Read in this exact order

1. `README.md` (overview, terminology, three-YAML-files sidebar)
2. `CONTEXT.md` (axioms, glossary, naming aliases — internalize the axioms)
3. `SPEC.md` (the normative spec, ~2200 LOC; this is the contract)
4. `IMPLEMENTATION.md` (reference TS types, schemas, registry sketch — the
   skeleton you're fleshing out)

`SPEC.md` is the only normative source. If `SPEC.md` and `IMPLEMENTATION.md`
disagree, follow SPEC and flag the divergence in `NOTES.md` (see below).

## Scope: build it all

You're building the v1 reference implementation. Not a slice. Not a prototype.
Aim for "another implementer could ship from this." Concretely:

```
apps/
  caplet/                  # CLI binary
    src/
      bin/caplet.ts        # entrypoint
      commands/*.ts        # add/remove/update/fetch/emit/apply/check/inspect/ls/diff/doctor
packages/
  core/                    # spec implementation; zero target-specific code
    src/
      types/               # AcfCapability, FacetFamily, etc. per SPEC + IMPLEMENTATION
      schemas/             # zod schemas
      reader/              # discovery + parsing (filesystem -> AcfCapability)
      validator/           # cross-field validation, diagnostics
      resolver/            # scopes, capabilities.yml, lockfile, fetch
      diagnostics/         # codes, severity, formatters
      emit/                # generic emission pipeline (per-target adapters plug in)
      hash/                # capabilityHash per SPEC §19.5
  adapters/                # one per target
    src/
      claude/
      codex/
      opencode/
      cursor/
      pi/
  runtime-taxonomy/        # provisional operation set from SPEC §24, isProvisionalOperation
```

If a slice doesn't fit cleanly, deviate — but document why in `NOTES.md`.

## Tech choices (your call)

Not locked. Weigh the options and pick what produces the strongest reference
implementation. Justify non-obvious picks in `NOTES.md`. Treat this as a real
design decision, not a default-to-the-first-thing-Google-suggests pick.

Dimensions to deliberate before writing the first `package.json`:

- **Runtime / package manager** — Node + npm/pnpm/yarn, Bun, Deno. Tradeoffs:
  install speed, binary distribution, native TS, ecosystem reach, what your
  CI/host realistically runs.
- **Monorepo orchestration** — Turborepo, Nx, plain workspaces, none. Cost vs
  benefit at this size; don't over-tool a 3-package repo.
- **Language / type safety strategy** — vanilla TS strict, or push further
  with libraries that give richer type-driven invariants (Effect, ts-pattern,
  branded types, etc.). If a library buys real correctness for a parsing/
  validation/diagnostics-heavy spec implementation, weigh it seriously —
  don't reach for it just because it's trendy.
- **Schema validation** — Zod, Valibot, ArkType, Effect Schema, hand-rolled.
  Diagnostic message shape, perf, tree-shake, integration with chosen
  type-safety library.
- **CLI framework** — citty, commander, oclif, cac, yargs, hand-rolled. The
  CLI surface is small (≈10 commands); a heavy framework may be overkill.
  Hand-rolled with a tiny arg parser is a defensible answer.
- **Test framework** — Vitest, Bun's built-in, Node's built-in, Jest. Match
  to runtime. Snapshot support matters for emit fixtures.
- **Lint / format** — ESLint + Prettier, Biome, dprint, oxlint. Pick one
  combo and commit.
- **YAML / Markdown frontmatter parsing** — there are several mature options;
  pick the one whose error positions are easiest to surface in diagnostics.
- **Hashing** — should be a runtime built-in. No external dep.
- **Git for fetch** — shell out to `git` binary or use a JS implementation
  (isomorphic-git). Shelling out is simpler; pure-JS gives platform
  independence. Pick and document.

Pin versions. No floating ranges in `package.json`.

## Success criteria (verifiable, do these in order)

### Must pass

1. **Repo bootstraps**: your documented install / build / test / lint
   commands all exit 0 from a clean clone.
2. **Minimal fixture**: A fixture under `packages/core/test/fixtures/minimal/`
   containing one capability with one of each facet family (skill, agent,
   command, instruction, hook entry, MCP server). It must parse cleanly with
   zero error/warn diagnostics. Use this as your reader smoke test.
3. **`caplet check`** on the minimal fixture exits 0 with no diagnostics.
4. **Diagnostic fixtures**: For every diagnostic code listed in
   `IMPLEMENTATION.md` (§Diagnostics codes namespace), produce a fixture that
   triggers exactly that code. One folder per code under
   `packages/core/test/fixtures/diagnostics/<code>/`. Tests assert (code,
   severity, source path) per fixture.
5. **`capabilityHash` reproducibility**: write a test that builds a capability
   tree in a tmpdir, hashes it twice, asserts identical output. Then mutate
   one byte in any file, assert hash changes. Then change a file's mtime
   without changing contents, assert hash unchanged. The hash MUST match
   SPEC §19.5 byte-for-byte (NFC, UTF-8 relpath, NUL separators,
   `sha256-<hex>` prefix).
6. **Resolver**: given a temp `~/.agents/` + `./.agents/` with one
   `capabilities/<name>/acf.yml` each, autoload both, project shadows user,
   `acf.capability.shadowed` info diagnostic emitted. Add a same-scope
   name collision: assert `acf.capability.name-collision` error.
7. **At least 2 working adapters**: `claude` and one other (`codex` or
   `cursor` recommended — `pi` and `opencode` are nice-to-have). Each adapter
   must:
   - emit native artifacts to a tmpdir for the minimal fixture
   - produce non-empty output for every facet family it supports
   - emit a `lossy` diagnostic for every facet family marked `partial` or
     `none` in its support table
   - be loadable by the actual host (Claude Code, Codex CLI, etc. — verify
     manually with a screenshot or note in NOTES.md if you cannot install
     the host)
8. **CLI surface**: `caplet --help`, `caplet check --help`, etc., return
   non-empty text. `caplet check`, `caplet emit`, `caplet inspect`,
   `caplet ls` are functionally complete. `caplet fetch` works for at least
   `path:` sources; `github:`/`git:` are nice-to-have.

### Should pass

9. **applyApplicability** intersection cascade: capability-level `only` AND
   facet-level `only` are intersected. Test for: cap-only, facet-only,
   both, neither, empty intersection (emit `acf.applicability.empty`).
10. **Hook validation**: every entry in `hookMatchRequired` rejects entries
    without `match`. Every entry in `hookEffectMatrix` rejects unsupported
    effects.
11. **Asset reference resolver**: Markdown body image/link refs +
    `frontmatter.assets` list are collected and validated; path traversal
    rejected.
12. **Lockfile**: `caplet fetch` produces a `capabilities.lock` matching the
    documented shape. Drift handling per SPEC §19.6.

### Stretch

13. **All 5 adapters working** with manual smoke tests against each host.
14. **`caplet doctor`** detects: drifted lock, missing scope dirs, broken
    capability manifests, capabilities.yml/lock mismatch, unknown sources.
15. **`caplet diff`** shows what would change between two capability roots
    or between two scopes.
16. **OpenSpec changes** for any spec gaps you discover (`openspec/changes/<id>/`).

## Quality bar

- **Tests first for fixable bugs**: if you find a SPEC violation in your own
  code, write a failing test before fixing.
- **No silent invention**: anywhere SPEC is genuinely ambiguous, do not pick
  silently. Either (a) implement the most spec-consistent interpretation and
  write the open question into `NOTES.md`, or (b) draft a one-line
  OpenSpec change proposal under `openspec/changes/`.
- **Match existing style** implied by `IMPLEMENTATION.md` TS examples. Don't
  reinvent type names. Don't rename `AcfCapability`/`FacetFamily`/etc.
- **No emojis in code or docs**.
- **Strict TS**. Discriminated unions for any union type. No `as any`
  without a comment explaining why.
- **Diagnostic codes** match `IMPLEMENTATION.md` namespace exactly. Don't
  invent new codes silently; if you need one, add it to a `NEW-DIAGNOSTICS.md`
  list in your branch.
- **Error messages** include the source path and a one-line fix hint where
  reasonable.
- **Keep dep footprint reasonable**. You're picking your stack; justify each
  non-trivial dep in `NOTES.md`.

## Process discipline

- Commit often. Small, scoped commits with imperative messages. The other
  two implementers might steal good commits.
- Use the existing git identity. Do NOT pass `-c user.name=` or
  `-c user.email=` to `git commit`. The user's `~/.gitconfig` is correct.
- Use OpenSpec **only after the first pass**. The current `SPEC.md` is the
  baseline; structural OpenSpec migration is a separate task.

## Deliverables

In your branch root, on top of the code:

- `NOTES.md` — required. Use these sections:
  - **What I built** (one paragraph + bullet list of packages/features)
  - **What I skipped and why** (be honest)
  - **Spec ambiguities I hit** (cite SPEC section, describe both readings,
    say which I picked)
  - **Spec contradictions I hit** (SPEC vs IMPLEMENTATION mismatches)
  - **Gaps I want to push back on** (things SPEC should clarify)
  - **Manual verification** (which adapters loaded successfully into hosts)
  - **Open todos** (smaller than gaps; just incomplete code)
- `RESULTS.md` — required. Verification matrix:
  - For each Must Pass / Should Pass / Stretch item above: status
    (pass / partial / skip), one-line note, command to reproduce.
  - Final summary: `pnpm install && pnpm test && pnpm lint` output, doc'd.

If you finish everything, propose the next slice in NOTES.md. The user
will compare your branch with the other two implementers' branches and
either merge yours, cherry-pick across, or respec based on common gaps.

## Running locally

```bash
# you start here:
cd $(git rev-parse --show-toplevel)
pwd  # should be the worktree dir, not main
```

Document your bootstrap commands in `RESULTS.md` so the human can reproduce.
Whatever stack you pick, expose:

- a single install command
- a single build command (or none if your runtime executes TS directly)
- a single test command
- a single lint/format-check command
- `caplet check <path>` and `caplet emit <path> --target <id> --out <dir>` as
  the manual-verification entry points

## What not to do

- Do not modify root-level `SPEC.md`, `IMPLEMENTATION.md`, `CONTEXT.md`,
  or `README.md`. Those are the spec. If something
  in them is wrong, write it up in `NOTES.md` and let the human decide.
- Do not push to remote. Just commit on your branch.
- Do not run destructive git ops (rebase root, force push, branch delete).
- Do not delete the other two implementers' worktrees. They are
  `.worktrees/feature-implementer-{a,b,c}/`.
- Do not add emojis. Do not add a `CHANGELOG.md`. Do not add CI config
  (that's the human's call after seeing what shipped).

## Definition of done

From a clean clone of your branch, your documented install / build / test /
lint commands all exit 0. `RESULTS.md` is filled in honestly, `NOTES.md`
documents every non-obvious decision (including stack choices), and at
least the Must Pass criteria are green. Commit. Stop. Wait for human
review.
