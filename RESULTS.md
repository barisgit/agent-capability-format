# ACF Reference Implementation — Results

> **Historical report, superseded.** This records the first reference
> implementation pass and is kept as evidence of that outcome. Its command
> list (`inspect`, `ls`, `emit`, `fetch`, `diff`), file counts, and CI
> timings describe that point in time. For the current command surface see
> `README.md` and `IMPLEMENTATION.md` §14; for planned work see `backlog.md`.
> Run `bun run ci` for current health.

Implementation of the Agent Capability Format reference monorepo on branch
`feature/reference-implementation`. Built end-to-end against `SPEC.md`,
`IMPLEMENTATION.md`, `CONTEXT.md`, and `README.md`.

## TL;DR

- **5 packages + 1 app** shipped: `@acf/core`, `@acf/adapters`, `@acf/installer`,
  `@acf/sdk`, `@acf/runtime-taxonomy`, plus the `caplet` CLI.
- **~7,300 LOC** of production TypeScript across the workspaces (TS strict,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any`).
- **45 test files** with real fixture-backed assertions; 24/24 turbo tasks
  green; `bun run ci` finishes in ~3s on a warm cache.
- **18 of 21 charter VAL-* criteria** verified by command verifier; the
  remaining 3 cover RESULTS, video, and the final commit and are addressed
  in this document.

## What was built

### Packages

| Package                   | Role                                                     | Files | LOC* |
| ------------------------- | -------------------------------------------------------- | ----- | ---- |
| `@acf/runtime-taxonomy`   | SPEC §24 operation set + canonical hook/trigger names    | 1     | ~60  |
| `@acf/core`               | types, schemas, diagnostics, reader, validator, applicability, asset resolver, scope discovery, target registry, content hash, emit orchestration, caplet config | 13 dirs | ~3,400 |
| `@acf/adapters`           | five real adapters (claude M1, codex M2, pi M3, opencode M4, cursor M5) + shared `common/` helpers (json-merge, markers, placeholders, skills emitter) | 14 src files | ~1,500 |
| `@acf/installer`          | `capabilities.yml` reader, lockfile read/write, `path:`/`git:`/`github:` source drivers, prune, drift detection, content-hash cache | 9 src files | ~620 |
| `@acf/sdk`                | re-exports `core`/`adapters`/`installer` plus the high-level helpers (`getSkills`, `getAgents`, `getCommands`, `getInstructions`, `getHooks`, `getMcpServers`, `getFacets`) + global `onDiagnostic` subscription | 12 src files | ~520 |
| `apps/caplet`             | 11-command CLI (`check`, `inspect`, `ls`, `emit`, `fetch`, `apply`, `add`, `remove`, `update`, `diff`, `doctor`), `applyDiffs` driver, `.acf-managed.json` sidecar | 21 src files | ~1,200 |

*LOC counts include both source and module index files; per-file cap is
400 LOC per the implementation contract.*

### Key invariants honored

- **Adapter contract**: every adapter returns `{ diffs: FileDiff[];
  diagnostics: Diagnostic[] }`. No adapter writes to disk; no adapter
  returns `EmittedFile[]`. Driving the diffs is the diff applier in caplet
  (`apps/caplet/src/apply/apply-diffs.ts`).
- **JSON-pointer ownership** for shared files: ACF entries inside
  `~/.claude/settings.json`, `.mcp.json`, etc. are owned by JSON pointers,
  so user-authored keys survive `caplet emit`, `caplet apply`, and
  `caplet remove`. Tested in `apps/caplet/tests/integration/ownership.test.ts`.
 - **Canonical + optional native skills**: the `skill` family emits to
   the ecosystem-shared canonical root (`~/.agents/skills/`,
   `./.agents/skills/`) AND each target's native skills dir
   (`~/.claude/skills/`, `~/.codex/skills/`, `~/.config/opencode/skills/`,
   `~/.pi/agent/skills/`) when declared. Per-target toggles live under
   `caplet.yml` `targets.<id>.skills.{canonical,native}`. Pi defaults to
   canonical-only because it already discovers `.agents/skills`; native Pi
   emission remains an explicit opt-in. `cursor` has no native skills dir.
   See SPEC §22.2 and the adapter tests.
 - **Skill asset transport (SPEC §16.4)**: referenced skill assets
   (Markdown links + frontmatter `assets`) are copied next to `SKILL.md`
   in every destination. Assets are carried byte-for-byte and retain their
   executable permission bits.
- **Marker ownership** for prose files: instruction `activation: always`
  emits a marker block inside the host's main rules file (e.g. `CLAUDE.md`)
  using `<!-- acf:begin <capability>.<name> --> ... <!-- acf:end ... -->`,
  preserving the rest of the file.
- **`.acf-managed.json` sidecar**: written at each install root, records
  every owned region with its content hash, enables drift detection
  (`acf.emit.drift`) and clean removal.
- **Visible ownership notices**: every emitted install root has a deterministic
  aggregate `ACF-MANAGED.md`, and every fully-owned skill directory has one
  local marker. Notices are sidecar-owned, drift-repaired, reconciled on
  removal, excluded from source snapshots and hashes, and protected against
  source or destination collisions.
- **SPEC §19.5 byte-exact content hash**: regular files only, NFC-normalized
  forward-slash relpaths, byte-lex sorted, NUL-separated, `sha256-` prefix.
  Lives in `packages/core/src/hash/` with focused fixture tests.
- **Applicability cascade**: capability `only`/`except` is the default set;
  facet declarations intersect it. Empty resulting set is informational,
  unknown target id is an error.
- **Definition-first target registry**: targets declared via
  `defineTargets([...])` with duplicate-id rejection; install paths,
  support matrix, hook event maps, trigger support, extension schemas, and
  adapter binding all derived from the same definition. Adapters self-register
  via `registerAdapter()`.
- **Two-scope resolution**: `~/.agents/` (user) and `./.agents/` (project);
  project shadows user with `acf.resolver.shadowed` info diagnostic;
  same-scope collisions are errors.

### Test coverage

| Package                 | Test files | Notable tests                                         |
| ----------------------- | ---------- | ----------------------------------------------------- |
| `runtime-taxonomy`      | 1          | provisional operation set + canonical hook/trigger names |
| `core`                  | 12         | hash, manifest, every facet family, applicability, assets, resolver, layout, diagnostics coverage |
| `adapters`              | 7          | contract (every adapter), one per target (claude/codex/pi/opencode/cursor) |
| `installer`             | 6          | path-source round-trip, lockfile canonical order, drift, prune, capabilities.yml validation, git-source (gated on `ACF_E2E_GIT`) |
| `sdk`                   | 5          | target/scope/fetch policy, instruction trigger filter, hook type filter, `onDiagnostic`, re-exports |
| `caplet`                | 15         | sidecar, idempotence, ownership preservation, every one of the 11 commands |

All test suites pass. `bun run ci` runs `check-types`, `lint`, `test`,
`build` across the workspace.

## Charter status

Charter `acf-reference-impl` (`0ed014dc-b545-43ab-8d37-3da1389e300e`):
18 of 21 VAL-* criteria verified by command verifier as of this report;
the remaining three (`VAL-RESULTS`, `VAL-VIDEO`, `VAL-FINAL-COMMIT`) are
the deliverables themselves and are addressed in this document, the
recorded video, and the final commit.

| Milestone        | Criteria | Status                                                 |
| ---------------- | -------- | ------------------------------------------------------ |
| m1-bootstrap     | 3 / 3    | install, ci, packages                                  |
| m2-core          | 2 / 2    | hash, core tests                                       |
| m3-adapters      | 6 / 6    | contract + M1-M5                                       |
| m4-installer     | 1 / 1    | installer                                              |
| m5-sdk           | 1 / 1    | sdk                                                    |
| m6-caplet        | 2 / 2    | caplet commands, sidecar                               |
| m7-integration   | 3 / 3    | idempotence, ownership preservation, diagnostic codes  |
| m8-deliverables  | this PR  | results (this file), video (see below), final commit   |

## What is NOT in this implementation

Called out explicitly for honesty:

- **`git:` and `github:` sources are guarded by `ACF_E2E_GIT`** in
  `packages/installer/tests/git-source.test.ts`; the implementation is
  there (`git.ts` wraps `node:child_process`) but the network-dependent
  test runs only when explicitly opted in to keep CI offline-deterministic.
- **No watch mode** for `path:` sources during local development — flagged
  in `CONTEXT.md` as an open item, not implemented here.
- **Runtime taxonomy beyond the provisional operation set** is reserved
  in `@acf/runtime-taxonomy` but kept intentionally small per `SPEC.md` §24
  and `CONTEXT.md` Axiom 10a; this is the spec's intent, not a regression.
- **No publish step** — packages are `private: true`. Publishing is left
  to a future release tooling pass.

## Lessons learned during build-out (process)

- **Concurrent fixers in a shared worktree fight over `git status`**. An
  early adapters fixer ran `git restore --source=HEAD packages/installer &&
  git clean -fd -- packages/installer` repeatedly to "clean up unrelated
  changes" while a parallel installer fixer was actively writing files;
  the installer files were rescued from `git stash@{N}^3` (untracked tree)
  and re-landed. The SDK + caplet fan-out that followed used disjoint
  package scopes and explicit anti-vandalism rules (`git add packages/sdk/`
  only, never `git add -A` or `git stash`/`git clean` outside own
  directory) and ran cleanly in parallel.

## Repro

```bash
git clone <repo>
cd agent-capability-format
git checkout feature/reference-implementation
bun install
bun run ci
```

## Video evidence

Walk-through of `bun run ci` and a quick `caplet apply` round-trip is
recorded at `evidence/video/acf-reference-implementation.mov` (also see
`evidence/video/README.md` for what is shown).
