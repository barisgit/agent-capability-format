# Caplet Roadmap

Feature backlog and priorities for caplet, the ACF capability manager. Format follows spec-per-entry with Problem / Implementation / Acceptance. Canonical format behavior lives in `SPEC.md`; CLI behavior contract lives in `apps/caplet/tests/`.

**Positioning**: caplet is the declarative *manager* (capabilities.yml is truth, `apply` reconciles, sidecar owns emitted files). The vercel-labs `skills` CLI has the *store* (skills.sh registry, discovery, npx onramp) but only handles bare skills imperatively. Strategy: keep the stronger manager core, adopt their supply.

---

## Completed

### Spec B1: npm Distribution

Bootstrap completed and verified by the integrator on 2026-10-24: all six
`@caplet/*` packages are public at `0.1.0` on `latest`, npm archive integrities
match the local tarballs, and a clean `npx @caplet/cli@latest` install works.
Each package has a trusted publisher for `release.yml`, repository
`barisgit/agent-capability-format`, environment `npm-production`, with `publish`
and `stage publish` permissions. The workflow uses direct publication only;
the environment permits deployments only from `main`.

Later shared version bumps on `main` publish verified archives through OIDC,
then create the tag and GitHub Release. New packages still need a manual first
publish and publisher setup. See [npm releases](docs/release/npm.md) for the
process and the verification scope.

### Scope-qualified compatibility outcomes

Plans retain outcomes by scope, capability, target, family and component;
`show` uses only the matching scope's results. Multi-scope compatibility rows
name the scope and cannot group across scopes; JSON outcomes include `scope`.
Regression coverage distinguishes native user and refused project capabilities
with identical names and verifies only the unblocked user executables are
reported. Executable identities, blocked filters and file-plan JSON were
already scope-qualified; SDK merged-view name deduplication is intentional.

### Closed output preserves command completion

`EPIPE` drops subsequent writes only on the closed stream, without exiting early
or masking command failure. Node CLI regressions cover read-only commands,
first-line-closed mutating `add` with an artifact tree equal to an unpiped run,
and failed adds that retain exit 2 and restore the manifest with stdout or stderr
closed.

### Project shadowing preserves user selection

Separated the project-merged effective view from per-scope emission (SPEC §17.6).
Selected user Claude plugins stay installed, with or without saved config;
project applies preserve global loose output and sidecar ownership. Regression
coverage includes whole-capability and cross-capability facet shadows, and
Claude's duplicate-scope warning.

### CLI Output Redesign

Plan-view tree (scope → destination → directory rollups) with action-count summary table; 140-file apply renders in ≤25 lines. Message-first deduped diagnostics with summary line. Glyph status lines (`✓/✗/!`, ASCII `ok/fail/warn` piped), banner removed. Hand-rolled `render.ts` (no table deps). `--verbose` expansion, home-anchored `~` paths.

### Command Grammar v0.2

Command surface: `init add remove update apply list show check doctor status completion`. `ls` is a supported alias of `list` with no deprecation notice. Self-applying `add`/`update` (`--no-apply` opt-out). Scope inference for mutations. Bare `caplet` = status. `check` exit codes 0/1/2/3 (`--frozen`, `--strict`). Shorts `-s -t -C -n -y -q -v`. Global `--json` envelope. Grouped root help, `-V`, `caplet completion bash|zsh|fish`.

### Skills Migration (dogfood)

Personal skills adopted into managed capabilities: `engineering-workflows` 2.0.0, `knowledge-ops` 1.0.0, `macos-personal` 1.0.0 in the Capatibilities repo. Learned: aux files require `assets:` frontmatter declaration (see Spec C2).

### Unified Help + Reach Visibility

Single `COMMAND_SPECS` table renders root help, per-command help, and completions from one source; citty demoted to pure parser (its help renderer unreachable, args generated from spec). `apply`/`status` always show reach: sources (with capability counts) and targets (with install roots).

### Package smoke home isolation

The package smoke runner redirects HOME, USERPROFILE, Claude configuration and
XDG paths into its disposable directory, using the same path mapping as the
test runner.

---

## Phase 1: Consume the Ecosystem

### Spec A1: Implicit Capability Import (bare skill repos)

**Priority**: Highest — strategic; makes the entire skills.sh catalog installable via caplet
**Estimate**: 2-3 days
**Status**: Completed

**Problem**: caplet only installs sources with `acf.yml` manifests. The ecosystem standard (vercel-labs skills, Anthropic skills repos) is a bare repo of `<skill>/SKILL.md` directories — same SKILL.md format, no manifest. Today none of that supply is installable.

**Implementation**:

- Shared installer inventory: when a source has no ACF manifest but contains `SKILL.md` directories (root, `skills/`, or one level deep), synthesize one independent capability per skill using its validated frontmatter name and version `0.0.0-unmanifested+<revision>`
- Auto-declare every file in each skill dir as an asset (no `assets:` frontmatter needed for imports; also see Spec C2)
- Provenance recorded in lockfile entry (`synthesized: true`)
- `caplet show` marks these as `unmanifested import`
- Diagnostics: warn (not error) on missing description frontmatter

**Acceptance**:

- `caplet add github:vercel-labs/skills --pin main` installs each discovered skill as a managed capability, apply emits to all targets, and remove cleans up
- `caplet add github:anthropics/skills --pin main` works
- Existing manifested sources unaffected; `check` passes after import

### Spec A2: Source Filter Syntax + Interactive Picker

**Priority**: High
**Estimate**: 1-2 days
**Status**: Completed
**Depends on**: A1 (filters must work on synthesized capabilities too)

**Problem**: `add` takes a whole source. Users want one skill or capability from a multi-capability repo: `owner/repo@name` selection, and a picker when they don't know what's inside.

**Implementation**:

- Parse add-only `github:owner/repo@<capability-or-skill>` shorthand and store the translated selector in the existing entry-level `capabilities:` field
- TTY without selector and source has >1 capability (or >1 skill in an unmanifested repo): multi-select prompt (hand-rolled, consistent with render.ts aesthetic; no inquirer dep)
- Non-TTY without selector: install all (current behavior), print what was selected
- `caplet remove <name>` narrows a shared source entry and retains selected siblings

**Acceptance**: `caplet add github:vercel-labs/skills@find-skills --pin main` installs exactly one skill; picker appears on TTY only; `-y` skips picker

### Spec A3: `caplet find` — Discovery

**Priority**: High
**Estimate**: 2 days
**Status**: Planned

**Problem**: caplet has zero discovery; users must already know the source URL. skills.sh has a leaderboard/registry; GitHub is full of skill repos.

**Implementation**:

- `caplet find <query>`: search skills.sh public index (scrape/API — investigate endpoint) and GitHub code search (`filename:SKILL.md <query>`) as fallback
- Results table: name, source, installs/stars, description — with `caplet add <source>` hint per row
- No accounts, no telemetry; plain HTTPS
- Cache results 15 min in `~/.cache/caplet/`

**Acceptance**: `caplet find pdf` surfaces installable sources; `caplet find --json` machine output; offline → clear failure with hint

---

## Phase 2: Publish

### Spec B2: Registry-Style Docs & Onboarding Surface

**Priority**: Medium (after B1)
**Estimate**: 2-4 days
**Status**: Planned — needs design pass against ../context-overflow, ../lume, ../sessionloom reference projects

**Problem**: Current CLI assumes users read `--help` and know all options up front. Registry-style tools (skills.sh, npm) teach through the happy path: one obvious command, discovery built in, docs site with copy-paste blocks.

**Implementation** (first cut):

- Bare `caplet` on a machine with nothing configured: onboarding output (what caplet is, `caplet find`, `caplet add`) instead of empty status
- Docs site skeleton (mirror lume/sessionloom structure) with per-command pages generated from COMMAND_SPECS — single source of truth extends to docs
- Error hints always name the next command

**Acceptance**: new user reaches first applied skill with zero flag knowledge; docs pages generated, not hand-written

---

## Phase 3: Manager Depth

### Spec C1: More Targets

**Priority**: Medium
**Estimate**: ~0.5 day per target
**Status**: Planned

**Problem**: Five host targets ship (`claude`, `codex`, `cursor`, `opencode`,
`pi`); the shared canonical skill root is not a separate host.

**Implementation**: evaluate adapters for gemini-cli, github-copilot, cline, and
windsurf against their native semantics; the adapter contract test is already parameterized.

**Acceptance**: each added target emits conforming artifacts and appears in doctor.

### Spec C2: Implicit Assets for Skill Directories

**Priority**: Medium (paper cut found during skills migration)
**Estimate**: 1 day
**Status**: Planned

**Problem**: Skill aux files (references/, scripts/) silently drop unless declared in `assets:` frontmatter. Migrating 13 skills required hand-writing 340 asset lines. Silent data loss for authors.

**Implementation**: default = every file under a skill directory is an asset (excluding dotfiles, node_modules, ACF-MANAGED.md); `assets:` frontmatter becomes an override/allowlist; `doctor`/reader warns when directory files exist but are excluded

**Acceptance**: new skill dir with references/ ships whole without frontmatter; explicit `assets:` still narrows; migration-era declarations keep working

### Spec C3: `caplet use` — Ephemeral Skills

**Priority**: Low
**Estimate**: 1-2 days
**Status**: Idea

**Problem**: skills CLI has `use <package>@<skill>` — try a skill without installing. Useful for one-off tasks.

**Implementation**: fetch to cache, emit to a temp overlay or print SKILL.md path for the agent to read; no manifest/lockfile mutation. Design open: overlay vs stdout.

### Spec C4: Update Notice

**Priority**: Low (post-B1)
**Estimate**: 0.5 day
**Status**: Idea

Single dim line on TTY when a newer published version exists (npm registry check, cached 24h, `--no-update-check` / CI opt-out). No boxes, no banner.

---

## Tech Debt

- Loose-skill backups in `/tmp/skills-migration-backup/` — delete after a week of stable use
- `explain-canvas` skill: `tool/node_modules` excluded from migration; document install step in its SKILL.md or vendor a lockfile

---

## Plugin-Interop Foundation Follow-ups

Open work found while finishing `plugin-interop-foundation`. Each entry: path, symptom, suspected cause.

### Quality gates

- **Taxonomy package header describes the inverse dependency.** `packages/runtime-taxonomy/src/index.ts` says core owns the constants and this package re-exports them, but the declarations live here and core imports them. Its README also omits hook/trigger exports. Update those package-local docs; root documentation now reflects the actual ownership.
- **Cognitive complexity rule is off.** `biome.json` does not enable `complexity/noExcessiveCognitiveComplexity` (max 15). Remaining violations include `validateActivationConstraints` (`packages/core/src/reader/validation.ts`), `tomlDefinesTable` and `indexOutsideQuotes` (`packages/adapters/src/common/toml.ts`), and `buildPlanView` (`apps/caplet/src/internal/plan-view.ts`). Split the remaining complex functions, then enable the rule; CLI flag validation and installer recovery no longer exceed the limit.
- **Two apply flows.** `apps/caplet/src/commands/apply.ts` plans and applies on its own while `add`/`update` go through `planAndApply` in `apps/caplet/src/internal/apply-flow.ts`; fixes to one flow miss the other.
- **Locale-dependent order in emitted bytes.** `localeCompare` still orders written output: `packages/adapters/src/claude/plugin.ts` (MCP server order in `.mcp.json` and the plugin version digest), `packages/adapters/src/common/{mcp,emitter,skills,assets}.ts`, `apps/caplet/src/internal/claude-marketplace.ts` (`marketplace.json`), core reader/format sorts. Output can differ between machines; use `compareCodeUnits`.

### Correctness

- **Conflict counts are absent from human plan totals.** `apps/caplet/src/internal/output.ts` renders conflict rows, but its summary and totals table enumerate only create/update/delete while `plan-view.ts` also counts conflicts. A conflict-only plan has a misleading zero-change breakdown. Add a human-rendering regression and include conflict totals; deferred from the behavior-preserving refine pass.
- **Notice collisions produce duplicate ownership errors.** `apps/caplet/src/internal/managed-notices.ts` diagnoses an unowned notice as `acf.emit.managed-notice-destination-collision`, then `emit-plan.ts` checks it again and adds `acf.apply.unowned`. Choose one diagnostic classification per path while retaining the conflict action and apply-time race check; this changes the diagnostic contract and is deferred from refinement.

- **Claude retention manifest I/O errors abort planning.** `apps/caplet/src/internal/claude-marketplace.ts` `listedPlugins` and `declaresUserConfig` share `readPluginManifest`, which calls `readTextIfExists` outside its JSON parse catch. That helper handles only `ENOENT`, so filesystem errors such as `EACCES` or `EISDIR` abort apply instead of conservatively retaining a selected plugin. Separate from the lost-sidecar and refused-update fixes; needs an I/O-failure regression and a bounded unreadable-manifest policy.

- **The opt-in real-host test guards only `<real home>/.claude`.** `apps/caplet/tests/hosts/claude/real-host.test.ts`: a user whose real Claude config lives under their own `CLAUDE_CONFIG_DIR` is not covered, because `scripts/test-home.ts` overwrites that variable. Pass the original value through like `CAPLET_REAL_HOME`.
- **Local Bun 1.4.2 vs `packageManager: bun@1.3.12`** in the root `package.json`; the home-isolation behaviour (`os.homedir()` fixed at start) was confirmed on 1.4.2 only.
- **Same-name Claude plugin components in different folders share one outcome row.** `packages/core/src/targets/plugin-layout.ts` `perFileComponentName`: agents, commands and output styles keep Claude's basename name, so `agents/a/x.md` and `agents/b/x.md` are both `x` in outcome rows (workflows and `bin` entries are path-named since e3f971b). Also `targets.claude.native.workflows: .` resolves to `native/claude/.` and matches no snapshot file (`emit/plugin-executables.ts`, `emit/snapshot.ts` `layeredPath`).
- **Caplet files in a source tree can reach a Claude plugin.** `packages/adapters/src/claude/plugin.ts`: plugin copies exclude `acf.yml` and `.acf-import.json` but not a sidecar `.acf-managed.json` or `ACF-MANAGED.md` that a source tree happens to contain (the unchanged-plugin copy in particular). Suspected fix: one caplet-owned file list in core used by every plugin copy.

- **Invalid core field in a bare imported skill is an error, while Agent Plugins leaves such a skill out.** `packages/installer/src/inventory.ts` `readBareSkill` rejects the import with `acf.import.skill-frontmatter-invalid`; the Agent Plugins reader leaves the skill out with a warning. D27.4 covers native values only; decide whether core-field failures in foreign sources follow the same rule.

- **Root-level plugin skill copies its package root as support files.** `packages/adapters/src/claude/plugin.ts` `supportFiles`: a foreign skill at the package root (manifest `skills: "."`) maps to an empty relative path, so the package root's files are copied again next to the regenerated `skills/<name>/`. Predates the review round.
- **Capability rename projection is repeated across packages.** `packages/installer/src/materialize.ts` (`finalCapabilityName`), `packages/core/src/formats/shared.ts` (`packageIdentity`), and `apps/caplet/src/commands/add.ts` (`added.capabilities`) independently apply scalar/mapping aliases. No divergence observed; a shared core helper would keep identity projection consistent, but requires a cross-package export change.

- **Removed paths derived outside the component table.** `packages/adapters/src/claude/plugin-source.ts` decides removed paths and manifest keys from remainder components rather than from `claudePluginComponents`; no defect seen, but a second place that can drift from the table.

- **Frozen restore rewrites lock entries written before per-capability records.** `packages/installer/src/resolve.ts` `fetchEntry`: under `--frozen`, restoring such an entry writes the fresh entry, so the lock gains `resolvedCapabilities` at the same sha, and an entry keyed by a legacy source id keeps that id. Provenance is unchanged, but it is a lock write under frozen. Suspected fix: under frozen keep the locked entry (`withSelection(locked)`).
- **Non-EPIPE output errors bypass command error reporting.** `apps/caplet/src/bin.ts` throws from the stream error listener (for example `ENOSPC` writing to `/dev/full`), outside the command's catch. The process fails, but prints an uncaught stack and can omit the `--json` error envelope. This remains separate from dropping closed-pipe output.
- **Configured scope output roots can alias.** `apps/caplet/src/internal/workflow.ts` `installRootFor` accepts equal `targets.<t>.out.user` and `out.project` directories. Root and sidecar maps identify roots by path, so two same-named scope capabilities can address the same native artifacts despite scope-qualified report identities. Needs a separate output-root isolation contract and regression.
- **Target-excluded canonical facets may keep stale ownership.** `apps/caplet/src/internal/emit-plan.ts` records `resolvedFacets` before target applicability; `apps/caplet/src/internal/stale-sweep.ts` uses those names in `keptInCanonicalRoot`. Suspected: an excluded facet with no desired canonical writer can retain its earlier shared-root output. Needs a focused reproduction and a decision about unselected readers' shared-root ownership.
- **`caplet.yml`'s `emit.scope` is accepted but ignored by the CLI.** `packages/core/src/schemas/index.ts` validates it, but `apps/caplet/src/internal/args.ts` `readScope` defaults directly to `all` without consulting config, unlike target selection. `IMPLEMENTATION.md` §8.3 describes a flag override of config. Decide whether to honor the setting or remove it from the config contract.

- **Pending inline MCP server fingerprinted by the whole manifest.** `remainderExecutables` (`packages/core/src/emit/remainder-executables.ts`) fingerprints every file in a remainder component's `paths`; a foreign Claude plugin's pending server lists `.claude-plugin/plugin.json`, so a version-only bump reports an executable change. `nativeServerExecutables` already drops the manifest path; the foreign path should do the same.
- **Root-layer config resolution can over-include ACF files.** `packageLayers` (`packages/core/src/emit/executable-inventory.ts`) falls back to the capability root without the `ACF_OWNED`/`CLAUDE_DISCOVERED` exclusions emission applies (`packages/adapters/src/claude/plugin.ts`), so a native key naming an ACF-owned path is fingerprinted though never copied. Errs toward reporting more.
- **Native hook ownership for `claude-loose-hooks-repair`.** ACF hooks are refused in 0.1.0. When re-enabling native writers, replace the old positional `/hooks/<event>/<index>` ownership with identity-based reconciliation; user insertion or removal before an owned entry must not redirect ownership to user hooks.
- **`no-capabilities` severity differs.** `acf.resolve.no-capabilities` is `info` in `packages/core/src/resolver/index.ts` and `error` in `packages/installer/src/inventory.ts`; the same empty source passes or fails depending on the path taken.
- **SDK omits native hooks.** `hookViews` (`packages/sdk/src/helpers/views.ts`) reads only `capability.hooks.buckets`, so `getHooks` misses hooks a capability ships under `targets.<id>.native` or as plugin remainder.
- **Installed hook inventory is capability-granular.** `apps/caplet/src/internal/fetch-scopes.ts` treats any managed output as evidence for every hook in that snapshot. Partial hook selection while another facet remains can overstate installed hooks; MCP uses component-level installed evidence, but hooks need equivalent ownership identity (native hook pointers are positional). Project shadowing no longer removes global user hooks.
- **Remainder report rows keyed by name.** Two remainder components of different kinds with the same name share one row in the compatibility report (`apps/caplet/src/internal/compatibility.ts`).
- **Concurrent mutations are not serialized.** `packages/installer/src/fetch.ts` clears the cache directory shared by a source/ref before cloning; snapshot/lock commits and native sidecar read-modify-write operations have no interprocess lock. Concurrent runs can invalidate each other's reads or overwrite state. The pre-publish transaction fix assumes a single writer; a coordinated scope/output/cache locking contract needs a separate change.

- **No cross-root or crash-safe add journal.** `apps/caplet/src/commands/add.ts` preflights the complete plan and restores installer state on a later failure, but native output bytes and Claude host operations already completed in earlier roots remain. `packages/installer/src/resolve.ts` recovers snapshot/lock write failures in-process only; a crash between snapshot replacement and lock rename can still leave mismatched state. A durable cross-root journal is out of scope for the pre-publish fixes.

- **`caplet remove` is not atomic across roots.** `apps/caplet/src/commands/remove.ts` now refuses before changing anything when a root would be violated, but it rewrites the manifest before `applyEmitPlan`; a write failure in a later root leaves the manifest and earlier roots changed.
- **Containment check races the write.** The containment preflight and the later write are separate steps (TOCTOU); a symlink swapped in between is followed.
- **Dry run overstates gated deletions.** Without the Claude CLI, `apply --dry-run` and `status` (`apps/caplet/src/internal/claude-host-flow.ts`, `claude-gates.ts`) list deletions that the real apply would hold back.
- **`targets.<id>.out.<scope>` ignores native skill copies.** `apps/caplet/src/internal/workflow.ts` applies the override to generated output only; native skill copies keep the default location. Needs a SPEC decision on what `out` covers.
- **`exclude` is not per target.** `packages/core/src/resolver/selection.ts` applies `include`/`exclude` to every target, but `acf.mcp.config-conflict` is per native MCP file (SPEC §13a.5) and names `exclude` as its recovery, so resolving a conflict in one target drops the server from all of them.
- **Windows `claude` launcher.** `apps/caplet/src/hosts/claude/cli.ts` spawns `claude` without a shell, which cannot run the `claude.cmd` shim npm installs on Windows.
- **Old lockfiles may hold credential URLs.** New sources with userinfo are rejected (`packages/installer/src/fetch.ts`, `apps/caplet/src/internal/manifest.ts`), but `parseLockEntry` accepts a lock written before that check and keeps the URL until the entry is rewritten.
- **YAML merge keys in `agents/openai.yaml`.** `parseYaml` (`packages/core/src/yaml.ts`) does not enable merge keys, so `<<:` in a bundled `agents/openai.yaml` becomes a literal key. Codex's own handling is unverified.

### Output and messages

- **Reverse rename has no notice.** Moving a capability from plugin to loose output deletes the plugin and writes loose files with no notice of the switch, unlike the loose-to-plugin direction.
- **Compatibility block repeats diagnostics.** The compatibility block and the diagnostics list can state the same fact twice (`apps/caplet/src/internal/compatibility.ts`).
- **Placeholder description for imported skills.** A bare skill without `description` gets `Imported skill` (`packages/installer/src/inventory.ts`, `packages/core/src/reader/skills.ts`), which reaches agents as the skill's description; a missing description should be a warning that names the file.
- **No `caplet add --format`.** A source whose format detection picks the wrong reader cannot be forced from the CLI (`apps/caplet/src/internal/spec.ts`).

### Configuration

- **`CLAUDE_CONFIG_DIR` read deep in the flow.** `apps/caplet/src/internal/claude-host-flow.ts` reads `process.env.CLAUDE_CONFIG_DIR`; read it once at the composition root and pass it in, so tests and hosts share one value.
- **Pending change `claude-loose-hooks-repair`.** ACF hook emission is safely refused in 0.1.0; native writer delivery remains pending, including real-host fire/block checks and migration of every pre-gate marker form (`acf:<capability>:<type>:<name>`, `acf:<capability>:native:<event>:<name>`, and legacy `acf:<capability>:<name>`). Existing output stays untouched on refusal.

Dropped as fixed: `research/plugin-interop/facets/distribution.md` lock-types row (the core and installer lock types are one schema; the row now says so).

### Product decisions (decided 2026-10-09, design.md D27)

- `-t/--target` is not remembered; default targets come from configuration.
- Codex project config keeps absolute paths: Codex resolves no `[mcp_servers]` path against the config file (checked in source; `research/plugin-interop/tools/codex.md`, Relative paths in `[mcp_servers]`).
- The same capability at user and project scope appears twice in Claude; caplet warns (`acf.claude.duplicate-scope`).
- Invalid native values: foreign and imported sources leave out only the invalid component with a warning; native ACF stays strict.

### Codex

- **Machine paths in a committed `.codex/config.toml`.** At project scope `packages/adapters/src/common/mcp.ts` writes `${ACF_CAPABILITY_DIR}`, `${ACF_PACKAGE_DIR}`, `${ACF_HOOK_DIR}`, `${ACF_DATA_DIR}` and `./` `cwd` values as absolute paths (all under the project: `.agents/capabilities/<capability>/` and `.codex/.acf/data/<capability>/`). A teammate's clone runs the wrong paths until their `caplet apply` rewrites the block, and the block differs per machine. Codex resolves none of these fields relative to the config file (openai/codex `2351d9e1b608`, `config/src/mcp_types.rs:367-377`, `config/src/loader/mod.rs:1462-1472`). Revisit when Codex resolves `[mcp_servers]` paths per layer, or install through a Codex plugin (`agent-plugins-output`).
- **Codex native hook writer.** ACF hooks are refused in 0.1.0, resolving the misleading emission to `.codex/settings.json`. Future delivery needs native nested handlers in `hooks.json` beside each config layer or inline `[hooks]` in `config.toml` (`research/plugin-interop/tools/codex.md`, Hooks), portable command paths, trust handling, and real-host fire/block checks. Coordinate semantics and migration with `claude-loose-hooks-repair`; do not re-enable the old generic writer.
