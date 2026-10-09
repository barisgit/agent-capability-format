# Caplet Roadmap

Feature backlog and priorities for caplet, the ACF capability manager. Format follows spec-per-entry with Problem / Implementation / Acceptance. Canonical format behavior lives in `SPEC.md`; CLI behavior contract lives in `apps/caplet/tests/`.

**Positioning**: caplet is the declarative *manager* (capabilities.yml is truth, `apply` reconciles, sidecar owns emitted files). The vercel-labs `skills` CLI has the *store* (skills.sh registry, discovery, npx onramp) but only handles bare skills imperatively. Strategy: keep the stronger manager core, adopt their supply.

---

## Completed

### CLI Output Redesign

Plan-view tree (scope → destination → directory rollups) with action-count summary table; 140-file apply renders in ≤25 lines. Message-first deduped diagnostics with summary line. Glyph status lines (`✓/✗/!`, ASCII `ok/fail/warn` piped), banner removed. Hand-rolled `render.ts` (no table deps). `--verbose` expansion, home-anchored `~` paths.

### Command Grammar v0.2

Command surface: `init add remove update apply list show check doctor status completion`. `ls` is a supported alias of `list` with no deprecation notice. Deprecated aliases print a notice: `inspect`→`show`, `diff`→`apply --dry-run`, `emit`→`apply --offline`, `fetch`→`update --no-apply`. Self-applying `add`/`update` (`--no-apply` opt-out). Scope inference for mutations. Bare `caplet` = status. `check` exit codes 0/1/2/3 (`--frozen`, `--strict`). Shorts `-s -t -C -n -y -q -v`. Global `--json` envelope. Grouped root help, `-V`, `caplet completion bash|zsh|fish`.

### Skills Migration (dogfood)

Personal skills adopted into managed capabilities: `engineering-workflows` 2.0.0, `knowledge-ops` 1.0.0, `macos-personal` 1.0.0 in the Capatibilities repo. Learned: aux files require `assets:` frontmatter declaration (see Spec C2).

### Unified Help + Reach Visibility

Single `COMMAND_SPECS` table renders root help, per-command help, and completions from one source; citty demoted to pure parser (its help renderer unreachable, args generated from spec). `apply`/`status` always show reach: sources (with capability counts) and targets (with install roots).

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

- `caplet add github:vercel-labs/skills` installs each discovered skill as a managed capability, apply emits to all targets, and remove cleans up
- `caplet add github:anthropics/skills` works
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

**Acceptance**: `caplet add github:vercel-labs/skills@find-skills` installs exactly one skill; picker appears on TTY only; `-y` skips picker

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

### Spec B1: npm Distribution

**Priority**: High (blocks all external adoption)
**Estimate**: 2-3 days
**Status**: In progress. Packaging is done: `@caplet/*` 0.1.0 tarballs build
for Node ≥ 20, and CI plus a tag-driven release workflow exist. Remaining: create
the `caplet` npm org, add the `NPM_TOKEN` secret, push the first tag, and check
the acceptance below on clean machines.

**Problem**: caplet is not on npm yet; nobody outside the repo can run it.

**Implementation**:

- npm packages first (Node-compatible `dist/`, runs under Bun too); single-file compiled binaries later
- The unscoped npm name `caplet` is taken (2.0.0, 2022) and the `@acf` scope belongs to someone else, so the packages publish as `@caplet/*` with the CLI in `@caplet/cli` (bin `caplet`)
- npm provenance stays off while the repository is private; enable `--provenance` in `release.yml` once it is public
- README quickstart rewritten around the npx onramp

**Acceptance**: `npx @caplet/cli@latest add github:vercel-labs/skills` works on a clean machine (macOS + Linux)

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

**Problem**: 5 targets (canonical, claude, codex, opencode, pi) vs ecosystem's 70+. Most are table entries: install root + layout conventions.

**Implementation**: add adapters for cursor (exists in packages/adapters — verify wiring), gemini-cli, github-copilot, cline, windsurf; adapter contract test already parameterized

**Acceptance**: `caplet apply -t cursor` emits; doctor lists new targets

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

- **Cognitive complexity rule is off.** `biome.json` does not enable `complexity/noExcessiveCognitiveComplexity` (max 15); 24 functions exceed it, worst `validateActivationConstraints` (34, `packages/core/src/reader/validation.ts`), `tomlDefinesTable` (31, `packages/adapters/src/common/toml.ts`), `buildPlanView` (30, `apps/caplet/src/internal/plan-view.ts`), `unknownFlagError` (29, `apps/caplet/src/internal/spec.ts`). Split them, then enable the rule.
- **Two apply flows.** `apps/caplet/src/commands/apply.ts` plans and applies on its own while `add`/`update` go through `planAndApply` in `apps/caplet/src/internal/apply-flow.ts`; fixes to one flow miss the other.
- **Locale-dependent order in emitted bytes.** `localeCompare` still orders written output: `packages/adapters/src/claude/plugin.ts` (MCP server order in `.mcp.json` and the plugin version digest), `packages/adapters/src/common/{mcp,hooks,emitter,skills,assets}.ts`, `apps/caplet/src/internal/claude-marketplace.ts` (`marketplace.json`), core reader/format sorts. Output can differ between machines; use `compareCodeUnits`.

### Correctness

- **Unreadable lockfile is an internal error.** `readLockfile` (`packages/core/src/lock/index.ts`) rethrows everything but ENOENT, so a directory at the lock path surfaces as `acf.cli.internal` instead of a diagnostic, and `list` exits 0.
- **Pending inline MCP server fingerprinted by the whole manifest.** `remainderExecutables` (`packages/core/src/emit/executables.ts`) fingerprints every file in a remainder component's `paths`; a foreign Claude plugin's pending server lists `.claude-plugin/plugin.json`, so a version-only bump reports an executable change. `nativeServerExecutables` already drops the manifest path; the foreign path should do the same.
- **Root-layer config resolution can over-include ACF files.** `packageLayers` (`packages/core/src/emit/executables.ts`) falls back to the capability root without the `ACF_OWNED`/`CLAUDE_DISCOVERED` exclusions emission applies (`packages/adapters/src/claude/plugin.ts`), so a native key naming an ACF-owned path is fingerprinted though never copied. Errs toward reporting more.
- **Loose hook pointers are positional.** `packages/adapters/src/common/hooks.ts` owns `/hooks/<event>/<index>`; when a user inserts or removes a hook before an owned one, the recorded pointer names the user's entry and the next apply can overwrite or remove it.
- **`no-capabilities` severity differs.** `acf.resolve.no-capabilities` is `info` in `packages/core/src/resolver/index.ts` and `error` in `packages/installer/src/inventory.ts`; the same empty source passes or fails depending on the path taken.
- **SDK omits native hooks.** `hookViews` (`packages/sdk/src/helpers/views.ts`) reads only `capability.hooks.buckets`, so `getHooks` misses hooks a capability ships under `targets.<id>.native` or as plugin remainder.
- **Component name collisions across capabilities.** Only MCP servers (`apps/caplet/src/internal/mcp-conflicts.ts`) and whole capabilities (`acf.capability.name-collision`) are checked; two capabilities emitting the same skill, agent or command name silently overwrite one another.
- **Remainder report rows keyed by name.** Two remainder components of different kinds with the same name share one row in the compatibility report (`apps/caplet/src/internal/compatibility.ts`).
- **`caplet remove` is not atomic across roots.** `apps/caplet/src/commands/remove.ts` now refuses before changing anything when a root would be violated, but it rewrites the manifest before `applyEmitPlan`; a write failure in a later root leaves the manifest and earlier roots changed.
- **Containment check races the write.** The containment preflight and the later write are separate steps (TOCTOU); a symlink swapped in between is followed.
- **Dry run overstates gated deletions.** Without the Claude CLI, `apply --dry-run` and `status` (`apps/caplet/src/internal/claude-host-flow.ts`, `claude-gates.ts`) list deletions that the real apply would hold back.
- **`--offline` with a missing snapshot.** `mode: "never"` in `packages/installer/src/resolve.ts` fetches nothing; an entry with no snapshot may be skipped without a diagnostic that names it. Not reproduced.
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
- **Pending change `claude-loose-hooks-repair`.** Its proposal predates the hook markers that carry the hook type or native event (`acf:<capability>:<type>:<name>`, `acf:<capability>:native:<event>:<name>`, plus the legacy `acf:<capability>:<name>` takeover in `packages/adapters/src/common/hooks.ts`); its tasks must migrate every marker form.

Dropped as fixed: `research/plugin-interop/facets/distribution.md` lock-types row (the core and installer lock types are one schema; the row now says so).

### Product decisions (decided 2026-10-09, design.md D27)

- `-t/--target` is not remembered; default targets come from configuration.
- Codex project config keeps absolute paths: Codex resolves no `[mcp_servers]` path against the config file (checked in source; `research/plugin-interop/tools/codex.md`, Relative paths in `[mcp_servers]`).
- The same capability at user and project scope appears twice in Claude; caplet warns.
- Invalid native values: foreign and imported sources leave out only the invalid component with a warning; native ACF stays strict.

### Codex

- **Machine paths in a committed `.codex/config.toml`.** At project scope `packages/adapters/src/common/mcp.ts` writes `${ACF_CAPABILITY_DIR}`, `${ACF_PACKAGE_DIR}`, `${ACF_HOOK_DIR}`, `${ACF_DATA_DIR}` and `./` `cwd` values as absolute paths (all under the project: `.agents/capabilities/<capability>/` and `.codex/.acf/data/<capability>/`). A teammate's clone runs the wrong paths until their `caplet apply` rewrites the block, and the block differs per machine. Codex resolves none of these fields relative to the config file (openai/codex `2351d9e1b608`, `config/src/mcp_types.rs:367-377`, `config/src/loader/mod.rs:1462-1472`). Revisit when Codex resolves `[mcp_servers]` paths per layer, or install through a Codex plugin (`agent-plugins-output`).
