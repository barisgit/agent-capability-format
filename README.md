# Agent Capability Format

Agent Capability Format (ACF) is a portable source format for declaring agent
capabilities once and emitting native artifacts for multiple agent hosts
(Claude Code, Codex, Cursor, OpenCode, Pi, …).

ACF coexists with:

- MCP for runtime tool protocols.
- Agent Skills for skill directories.
- Native host plugin / config systems.

ACF is **not** a universal plugin runtime, an MCP replacement, or an Agent
Skills replacement. It is a source format plus adapter model that emits
native artifacts and reports diagnostics whenever semantics do not map
cleanly.

## Terminology in one minute

- **Capability** — the bag with an `acf.yml` manifest. The unit of
  distribution and the unit of import. (Other ecosystems sometimes call this
  a "skill pack" or "plugin bundle".)
- **Facet** — one entry inside a capability: a skill, agent, command,
  instruction, hook entry, or MCP server.
- **Facet family** — `skill`, `agent`, `command`, `instruction`, `hook`,
  `mcp`.
- **Target** — a supported host such as `claude`, `codex`, `cursor`,
  `opencode`, `pi`.
- **Adapter** — code that emits one capability into one target's native
  artifacts.
- **Instruction** — ambient guidance (other ecosystems often call this a
  "rule" or "ambient context").

## Three YAML files, three different jobs

ACF has three files whose names all start with `acf` or `capabilities`. Do not
confuse them.

| File                   | Where it lives                                                                  | What it does                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `acf.yml`              | Inside one capability directory, at its root.                                   | The **capability manifest**. Declares one capability's identity, version, and applicability.  |
| `capabilities/`        | `~/.agents/capabilities/` (user) and `./.agents/capabilities/` (project).       | A **directory**, not a file. Every subdirectory containing `acf.yml` is autoloaded.           |
| `capabilities.yml`     | `~/.agents/capabilities.yml` and/or `./.agents/capabilities.yml`. Optional.     | A **scope-level import list**. Declares what `caplet fetch` should place under `capabilities/`. |

Short version: `acf.yml` is *inside* one capability. `capabilities/` is the
autoloaded directory. `capabilities.yml` is the import list that populates it.

## Capability layout

```txt
my-capability/
  acf.yml          # required manifest
  ACF.md           # optional capability-level Markdown
  assets/          # optional non-facet support files
  skills/
  agents/
  commands/
  instructions/
  hooks/           # hooks/hooks.yml (one file)
  mcp/             # mcp/mcp.yml (one file)
```

Only `acf.yml` is required. `acf.yaml` is accepted as an alias. `ACF.md` is
optional capability-level Markdown with optional YAML frontmatter.
`README.md` is allowed for distribution but is **not** consumed by ACF
semantics.

## Facet families

| Family       | Source                                                        | Notes                                                            |
| ------------ | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Skill        | `skills/<name>/SKILL.md`                                      | Directory form only.                                             |
| Agent        | `agents/<name>.md` or `agents/<name>/AGENT.md`                | `mode: primary \| subagent \| all`, `model: inherit`.            |
| Command      | `commands/<name>.md` or `commands/<name>/COMMAND.md`          | Ordered `arguments: []`, symbolic `agent`.                       |
| Instruction  | `instructions/<name>.md` or `instructions/<name>/INSTRUCTION.md` | `activation: always` or `activation.when.<triggerName>`.       |
| Hook         | `hooks/hooks.yml`                                             | Keyed by canonical hook type.                                    |
| MCP          | `mcp/mcp.yml`                                                 | `transport: stdio \| http \| sse`.                               |

All Markdown-backed facets require frontmatter `name` and `description`.
`name` matches the discovered file/directory basename and is a slug
(`^[a-z0-9]+(-[a-z0-9]+)*$`).

## Resolution scopes

Capabilities are autoloaded from two scopes:

- **User** — `~/.agents/capabilities/`.
- **Project** — `./.agents/capabilities/` (searched upward).

Each scope may have a `capabilities.yml` declaring remote and local sources
to fetch into that scope's `capabilities/` directory:

```yaml
capabilities:
  - source: github:vercel-labs/agent-skills
    ref: v1.5.6
    include:
      skill: [react-best-practices, next-app-router]
  - source: path:../my-private
    capabilities: engineering-workflows
  - source: github:myorg/capability-pack
    ref: main
    capabilities: [software/*, hardware/**]
```

A multi-capability repository uses `acf/<capability-path>/acf.yml`.
`capabilities` selects exact or globbed paths relative to that `acf/` directory;
a scalar selects one, a list selects several, and omission selects all. `*`
stays within one segment, `?` matches one character, and a `**` segment is
recursive. Use `path` first when the collection lives in a monorepo subtree.

Sources are `github:owner/repo`, `git:<url>`, or `path:<location>`. The
resolver writes one copy into `capabilities/<name>/`. Per-host fan-out
happens at emit time, not resolve time. Project shadows user on name
collision with an info diagnostic; same-scope collisions are an error unless
resolved by `rename:` or `exclude:`.

Repositories do not need to adopt ACF before caplet can consume their skills.
When no root `acf.yml` or `acf/` collection exists, caplet recognizes a root
`SKILL.md`, `skills/<name>/SKILL.md`, or one-level-deep
`<name>/SKILL.md`. Each discovered skill becomes one synthesized capability,
and its portable references and scripts are included automatically.

Select one capability directly from GitHub with the add-only `@name`
shorthand:

```bash
caplet add github:vercel-labs/skills@find-skills --pin main
```

The persisted source remains `github:vercel-labs/skills` with
`capabilities: [find-skills]`. On an interactive terminal, adding an
unqualified source with multiple capabilities opens a numbered multi-select;
non-interactive use and `--yes` keep the deterministic install-all behavior.

For a monorepo source, set `path:` to the subtree containing either an
`acf/` collection or one direct capability. The equivalent CLI for a direct
capability subtree is:

```bash
caplet add github:owner/monorepo --ref main --path packages/my-capability
```

Referenced assets are emitted byte-for-byte; executable permission bits are
preserved in resolved and emitted trees.

## Resolve vs. emit

ACF has two distinct phases:

1. **Resolve** — capabilities land in `capabilities/<name>/` per scope. One
   copy, host-agnostic.
2. **Emit** — adapters render each capability into native artifacts in each
   target's install location (`~/.claude/`, `./.cursor/`, …). Re-targeting is
   a re-emit, not a re-install.

The reference CLI `caplet` exposes both:

- `caplet fetch` — reconcile `capabilities.yml` into `capabilities/`.
- `caplet emit` — render native artifacts for one or more targets.
- `caplet apply` — `fetch` then `emit`.

Plus inspection: `caplet check`, `caplet inspect`, `caplet ls`, `caplet
diff`, `caplet doctor`.

Emitted destinations contain visible `ACF-MANAGED.md` notices: one aggregate
inventory at each install root and one local marker inside each fully-owned
skill directory. Edit the declared capability source, not these generated
files, then run `caplet apply`. The machine-readable `.acf-managed.json`
sidecar remains the authority used for drift detection and safe cleanup.

## Packages

The reference implementation ships as one app plus five libraries:

| Package | Role |
| --- | --- |
| `apps/caplet` | CLI binary. Only place `Bun.*` is allowed. |
| `packages/core` | Pure SPEC logic: types, schemas, reader, validator, applicability, hash, diagnostics, emission orchestrator. No network, no git, no logger, browser-safe modulo a filesystem port. |
| `packages/adapters` | Per-target emit functions (claude, codex, cursor, opencode, pi). Shared file utilities live under `src/common/`. |
| `packages/installer` | Git + network fetch of remote capability sources. Resolves `capabilities.yml`. Writes the lockfile. |
| `packages/sdk` | Re-exports core + adapters + installer plus convenience helpers for direct ACF consumers. |
| `packages/runtime-taxonomy` | Stub for the future sibling registry spec. |

CI linters and browser validators import `@acf/core` only. Caplet and
direct consumers import `@acf/sdk` for the ergonomic API.

## SDK in 20 lines

Direct ACF consumers (e.g. a future Pi extension) skip emit entirely and
read the canonical capability tree at runtime via `@acf/sdk`:

```ts
import { getSkills, getInstructions, getMcpServers } from '@acf/sdk';

const skills = await getSkills({
  target: 'pi',          // required
  scope: 'all',          // 'all' | 'user' | 'project' (default 'all')
  cwd: process.cwd(),    // for project-scope discovery
  fetch: 'auto',         // 'auto' | 'never' | 'force'
});

// Each entry: { family, name, capability:{name,scope,root},
//               frontmatter, body, assets, ... }
```

Helpers are stateless; every call re-reads disk. Capture diagnostics
either with `{facets, diagnostics} = await getSkills({includeDiagnostics:
true})` or a global `onDiagnostic((d)=>{ ... })`. `error` diagnostics
still throw `AcfError`.

## Instructions in one paragraph

An instruction is either always-on (`activation: always`, system-surface
context fixed at session start) or triggered (`activation.when.<triggerName>`,
zero-token until fired). v1 triggers are `assistant_output`,
`operation_input`, `operation_result`, and `file_context`. Regex matchers go
in `conditions: [...]`; path matchers go in `paths: [...]`. Optional `scope`
narrows to registry-defined operations and globs. `interrupt: never | always`
controls whether activation aborts the current generation/operation;
`repeat: once | always` controls firing frequency, with optional `debounce`
in turns when `repeat: always`. Triggered injection drops the Markdown body
verbatim; `description` stays metadata.

## Hooks in one paragraph

Hooks live in a single `hooks/hooks.yml` keyed by canonical type:
`session_start`, `user_prompt_submit`, `pre_tool`, `permission_request`,
`post_tool`, `stop`, `pre_compact`. Each entry has `name`, optional
`description`, optional `only`/`except`, an event filter `match`
(`operation`, `paths`, `conditions`) required for tool and permission types,
a handler `run` that uses Claude-style exec/shell duality (`command` plus
`args` xor `shell: bash | powershell`), and an `effect` declaring intent
(`observe`, `block`, `add_context`, `continue`, `block_result`, `decide`).
Target-native event names live only under `targets.<target>.hooks`. The
default wire protocol is stdin JSON event in, stdout JSON decision out, exit
0 continue / exit 2 block / other non-zero non-blocking error; adapters MAY
override.

## MCP in one paragraph

MCP servers are declared in `mcp/mcp.yml` under `servers: [...]`. Each server
has `name`, `transport: stdio | http | sse`, the transport-specific fields
(`command`/`args`/`env` for stdio; `url`/`headers` for http/sse), and
optional `only`/`except`/`targets`. ACF declares servers; MCP itself owns
runtime protocol semantics.

## Runtime taxonomy boundary

Portable runtime-facing fields (instruction trigger scopes, hook event
operations, future agent permission/access fields) reference
**registry-defined identifiers**, not target-native tool names. `SPEC.md`
§24 pins a provisional operation set for `acf: 1` (`shell`, `file_read`,
`file_write`, `file_edit`, `web_fetch`, `web_search`, `code_search`,
`doc_search`, `agent_delegate`, `task_management`, `mcp`, `context`, `any`).
The full versioned runtime taxonomy is intentionally separable from ACF and
may later become a sibling specification.

## Out of scope

- canonical facet `title` / `displayName`;
- canonical agent `tools`, `access`, or `permissions`;
- canonical command `model`, `subtask`, `argumentHint`;
- top-level `tools/` facet family;
- a generic hook runner binary (default wire protocol only);
- watch-mode for `path:` sources.

## See also

- [CONTEXT.md](./CONTEXT.md) — domain language, axioms, naming aliases,
  glossary.
- [SPEC.md](./SPEC.md) — full normative specification.
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) — TypeScript reference
  implementation notes: registry, schemas, resolver, caplet config, emission
  pipeline, diagnostics.
