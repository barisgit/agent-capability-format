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
**Status**: Planned

**Problem**: caplet is a private bun workspace app; nobody can run it.

**Implementation**:

- Bundle to single-file executable per platform (bun build --compile) OR publish as npm package with bun/node dual runtime — decide: npm package first (npx caplet onramp mirrors npx skills), compiled binaries later
- `npx caplet` / `bunx caplet` must work. The unscoped npm name `caplet` is taken (2.0.0, 2022), and the `@acf` scope belongs to someone else, so publish under another scope or name
- CI: publish workflow on tag, provenance enabled
- README quickstart rewritten around npx onramp

**Acceptance**: `npx caplet@latest add github:vercel-labs/skills` works on a clean machine (macOS + Linux)

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
