# Agent Capability Format Context

This document captures the domain language, axioms, and remaining ambiguities
behind ACF. It is not normative; `SPEC.md` is. When this document and `SPEC.md`
disagree, `SPEC.md` wins.

## Purpose

Agent Capability Format (ACF) defines a portable source format for agent
capabilities that can be emitted into native artifacts for multiple agent
hosts.

ACF exists to reduce duplicated configuration across tools such as Claude
Code, Codex, Cursor, OpenCode, and Pi without pretending those hosts share a
single plugin model.

## Core Axioms

### Axiom 1 — Source vs Host

ACF defines portable source capabilities. Hosts receive generated native
artifacts. The portable layer must not pretend all hosts share one plugin
model.

### Axiom 2 — ACF is a durable specification, not a v0 experiment

ACF specifies the intended stable model directly. Early implementation limits
belong in `IMPLEMENTATION.md`, not as weakened normative language in
`SPEC.md`. `acf: 1` is intended to be the long-lived schema; additive
evolution only.

### Axiom 3 — ACF is a format, not a runtime protocol

ACF is a static package/manifest format. It coexists with runtime protocols
such as MCP and leaf standards such as Agent Skills. ACF defines a default
hook handler wire protocol that adapters MAY override; it does not define a
universal runtime, agent loop, or event log.

### Axiom 4 — Native artifacts remain native

Each target host gets artifacts in its own native shape. ACF preserves host
semantics where possible and reports lossiness where it cannot.

### Axiom 5 — Direct SDK consumption is secondary

Advanced tools may consume ACF capabilities directly through an SDK, but
portability is defined by emission into target-native artifacts rather than
by hosts executing ACF as a shared runtime.

### Axiom 6 — Hooks have canonical and target-specific forms

Hooks are organized around a small canonical set of lifecycle hook types
(`session_start`, `user_prompt_submit`, `pre_tool`, `permission_request`,
`post_tool`, `stop`, `pre_compact`) keyed in `hooks/hooks.yml`. Target-native
event names are not canonical hook types and may appear only under
`targets.<target>.hooks`. ACF defines source shape, effect vocabulary, a
default wire protocol, and diagnostics; the runner itself is implementation,
not spec.

### Axiom 7 — Source syntax is YAML and Markdown

The canonical ACF manifest filename is `acf.yml` with `acf.yaml` as alias.
ACF-authored configuration uses YAML; family-level config files are
`hooks/hooks.yml` and `mcp/mcp.yml`. Markdown-backed facets use frontmatter
for metadata and Markdown body for content. TOML and JSON are not portable
ACF source formats; they may appear only as native emitted artifacts.

### Axiom 8 — Convention-first capability layout

Capabilities are file-native and convention-first. Standard facet files are
discovered from canonical paths; the manifest defines capability identity
and exceptions rather than listing every facet.

The canonical top-level facet folders are `skills/`, `agents/`, `commands/`,
`instructions/`, `hooks/`, and `mcp/`. Folder names are plural; singular
aliases are not canonical and produce a diagnostic.

Capability-level `assets/` is a standard non-facet support folder for
referenced icons, screenshots, images, and Markdown assets. `assets/` is not
a facet family and is not emitted unless referenced via Markdown body links
or explicit `frontmatter.assets`.

Unknown repository files are not capability semantics. Missing or empty
canonical folders are valid and meaningless.

### Axiom 9 — Manifest is the capability entrypoint

Every capability has a root manifest. The manifest defines the portable
capability boundary, identity, capability-level metadata, target
applicability (`only` / `except`), and target extension data
(`targets.<target>`). It does not define where native artifacts are emitted;
adapters own install paths.

`ACF.md` is the optional capability-level Markdown document with optional
YAML frontmatter. It is consumed semantically by ACF as overview/notes;
`README.md` is allowed as repository/distribution documentation but is not
semantically consumed by ACF.

### Axiom 10 — Instruction surface is derived from activation

ACF Instructions are ambient prompt/context injections whose surface is
derived from activation. `activation: always` instructions are system-surface
initial context and must not change after session start;
`activation.when.<triggerName>` instructions are conversation-surface context
injected later only when named runtime trigger conditions fire. Inactive
instructions contribute zero prompt/context tokens and are not rulebook
entries or model-selectable skills.

The v1 trigger names are `assistant_output`, `operation_input`,
`operation_result`, and `file_context`. Regex-backed triggers use
`conditions: string[]` with OR semantics; `file_context` uses direct
`paths`. `scope` is optional, ORed across entries, ANDed with the matcher.
`interrupt` is `never | always` with per-trigger defaults. `repeat` defaults
to `once`; `repeat: always` may use `debounce: <turns>`. A turn is a user
message, assistant output, or single/batched operation turn.

Existing hosts may not support this natively. Adapters or future generic
runners implement the behavior or report lossiness.

### Axiom 10a — Runtime taxonomy is registry-owned

ACF does not standardize host-native tool names, lifecycle events, permission
syntax, or full runtime event payloads. Portable runtime-facing fields in
instructions, hooks, and future agent permission/access models must reference
registry-defined operation, event, permission, or message-surface identifiers
rather than target-native names. ACF owns the package slots and diagnostics
around these references; `SPEC.md` §24 pins a provisional operation set for
`acf: 1`. The full versioned runtime taxonomy/registry remains separable and
may later be extracted into a sibling specification.

### Axiom 11 — Capabilities and facets may be target-scoped

Capabilities and facets may declare target scope using canonical Target
identifiers via `only` / `except`. Target scoping is not agent/persona
scoping. `only` and `except` are mutually exclusive within the same unit.

Applicability cascades: capability `only`/`except` is the default set; facet
`only`/`except`, when declared, intersects with the capability set. A facet
inherits the capability set if it declares neither.

Capability- and facet-level `targets.<target>` is reserved for adapter-
defined target-specific extension data. It augments canonical fields with
native-only options; it is not a deep merge, replacement object, or place to
restate mappings the adapter already knows from canonical fields. Unknown
target ids or unknown extension fields produce diagnostics.

### Axiom 12 — Raw native files are emitted artifacts, not ACF source

ACF capabilities do not use target-native plugin/config files as portable
source. Adapters may emit files such as `.codex-plugin/plugin.json`,
`.claude-plugin/plugin.json`, `.mcp.json`, or native hook JSON/TOML, but ACF
source keeps canonical and target-specific data in ACF-owned files and
schemas. JSON and TOML are native emission formats or implementation
details, not portable ACF source config.

### Axiom 13 — Definition-first registries

Implementation registries declare targets once. Target ids, target lists,
type guards, validation values, extension schemas, install paths, and
canonical-to-native mapping tables are all derived from the registry
definition. There are no manually synchronized target unions or capability
tables. The reference implementation uses an ordered const array of target
definitions with duplicate-id rejection and derived maps/unions/lists.

### Axiom 14 — Hook entries are not facets in the prose sense

Hook entries are not "facets" in the same sense as skills or agents in
terms of file shape; they are lifecycle handlers keyed by canonical hook
type and identified by a slug `name` for diagnostics and order. They are
still facets of the parent capability for accounting and naming. Canonical
action shape is `run`, with exec/shell duality mirroring Claude Code:
`command` plus `args` for exec form, `command` plus `shell: bash |
powershell` for shell form. Native handler types (HTTP, MCP, prompt, agent)
belong under `targets.<target>`.

### Axiom 15 — MCP server declarations are the only MCP surface

ACF declares MCP servers in `mcp/mcp.yml`. ACF does not redefine MCP
protocol semantics; tool listing, resource negotiation, and runtime calls
remain MCP's responsibility. Server `transport` is `stdio | http | sse`.

### Axiom 16 — Two scopes, one resolution model

Capabilities load from two scopes: user (`~/.agents/`) and project
(`./.agents/`). Both are autoloaded if present. Each scope has a
`capabilities/` directory of resolved capabilities plus an optional
`capabilities.yml` declaring remote and local sources to fetch into that
directory.

`capabilities.yml` does not configure caplet itself. It is portable: any
ACF-aware tool can read it. Caplet-specific behavior lives in `caplet.yml`,
which is implementation, not spec.

Project capabilities shadow user capabilities of the same name with an info
diagnostic. Same-scope name collisions are an error unless resolved by
`rename:` or `exclude:` in `capabilities.yml`.

Outside any project directory, `caplet` operations default to user scope and
emit an info diagnostic.

### Axiom 17 — Resolution and emission are separate phases

The canonical capability tree on disk is host-agnostic. Native artifacts are
produced by the emission phase of `caplet apply` (`--offline` skips fetching). There is no
install-time fan-out to per-host directories; the resolver writes one copy
into `capabilities/` and adapters emit from there. Re-targeting is a
re-emit, not a re-install.

This separation means:

- A capability fetched once works across every supported host.
- Adding a host requires no resolver change, only an adapter.
- Lockfile records identity of the resolved capability, not of any host
  install.

## Flagged ambiguities

Most early ambiguities have been resolved into `SPEC.md` and
`IMPLEMENTATION.md`. The remaining open items live in `IMPLEMENTATION.md`
§16 and `SPEC.md` §25; short list:

- Whether the v1 instruction trigger set needs additional named triggers
  (e.g. `user_message`, `assistant_thinking`) beyond the four locked in.
- Exact shape, versioning, and ownership of the runtime taxonomy/registry
  beyond the provisional operation set in `SPEC.md` §24.
- Whether a future generic hook runner / instruction runtime is published
  alongside ACF or as a sibling specification.
- Whether the canonical command surface needs a future `model`, `subtask`,
  or `argumentHint` field once a target survey justifies them.
- Whether the canonical agent surface needs a future `tools`, `access`, or
  `permissions` field once the runtime taxonomy is mature enough to back
  them portably.
- Whether MCP server entries need a canonical `scope: project | user |
  global` field once enough targets converge on installation scope.
- Whether Markdown-backed facets need a separate display/title field
  distinct from the stable `name` slug.
- Watch-mode behavior for `path:` sources during local development.

## Naming aliases (informative)

ACF uses precise names. Other ecosystems use overlapping or different terms.
This table is informative; documentation may include parenthetical aliases
when search ergonomics demand it.

| ACF term       | Other ecosystems also call it                                |
| -------------- | ------------------------------------------------------------ |
| **Capability** | "skill pack", "agent pack", "plugin bundle", sometimes "package" |
| **Facet**      | (no widely-used umbrella term)                               |
| **Skill**      | skill (Anthropic, Vercel npx skills, Agentloom)              |
| **Agent**      | agent, subagent, persona                                     |
| **Command**    | command, slash command, prompt                               |
| **Instruction**| "rule" (Cursor, Cline, oh-my-pi/TTSR, Agentloom), "ambient context", "rulebook entry", "always-on context" |
| **Hook**       | hook, lifecycle handler, plugin event handler                |
| **MCP Server** | MCP server (universal)                                       |

When ACF source documents describe an instruction in user-facing prose, it
is acceptable to include the alias once for discoverability, e.g.
"_Instruction (also: rule, ambient context)_".

## Glossary

### ACF

Agent Capability Format. The portable source format/specification.

### Capability

A directory with an `acf.yml` (or `acf.yaml`) manifest and file-native
contents that together describe one shareable bag of facets. The unit of
distribution and the unit of import in `capabilities.yml`.

_Other ecosystems_: "skill pack", "agent pack", "plugin bundle". Sometimes
called a "package" in colloquial usage; `package` is reserved in this
project for npm/pnpm packages.

### Capability Manifest

The `acf.yml` (or `acf.yaml`) file at the capability root. Defines identity,
metadata, target applicability, and target extension data.

### Capability Root

The directory containing a capability manifest. The semantic root of the
capability; not necessarily the repository root.

### Facet

One entry inside a capability: a skill, agent, command, instruction, hook
entry, or MCP server. The smallest unit of behavior or configuration ACF
ships.

### Facet Family

One of the canonical kinds of facet: `skill`, `agent`, `command`,
`instruction`, `hook`, `mcp`.

### Skill

A discoverable, on-demand behavior or knowledge facet declared in
`skills/<name>/SKILL.md`. Skills may be user- or model-invocable.

### Agent

A persona-bearing facet declared in `agents/<name>.md` or
`agents/<name>/AGENT.md` with `mode: primary | subagent | all`.

### Command

An invokable user action or reusable prompt facet declared in
`commands/<name>.md` or `commands/<name>/COMMAND.md`, with ordered
`arguments` and an optional symbolic `agent` reference.

### Instruction

Ambient guidance injected into agent context: either always as initial
system-surface context (`activation: always`), or later as conversation-
surface context when an `activation.when.<triggerName>` condition fires.
Inactive instructions contribute zero prompt/context tokens.

_Other ecosystems_: "rule" (Cursor, Cline, oh-my-pi/TTSR, Agentloom),
"ambient context", "rulebook entry", "always-on context".

### Hook

A lifecycle handler facet declared in `hooks/hooks.yml`, keyed by canonical
hook type and identified by a slug `name`. Hooks have `match`, `run`, and
an intent-declaring `effect`.

### MCP Server

A Model Context Protocol server facet declared in `mcp/mcp.yml` with a
transport (`stdio | http | sse`) and transport-specific fields. ACF
declares servers; MCP defines protocol semantics.

### Adapter

Implementation code that emits a capability into one target host's native
artifacts.

### Target

A supported host ecosystem with a defined identifier in the target registry,
such as `claude`, `codex`, `cursor`, `opencode`, or `pi`.

### Native Artifact

A file, directory, manifest, config entry, hook script, skill directory, or
other output in the target host's own format.

### Lossiness

Any semantic gap where an ACF facet cannot be represented exactly in a
target host. Reported via `lossy` diagnostics.

### Runtime Taxonomy / Registry

A versioned vocabulary of canonical operation, event, permission, and
message-surface identifiers used in portable runtime-facing fields. The
taxonomy is intentionally separable from `SPEC.md`. `SPEC.md` §24 pins a
provisional operation set for `acf: 1`; the full taxonomy may later become
a sibling specification.

### Target Registry

The implementation-level data structure that enumerates known targets, their
facet support levels, their install paths per scope, their canonical-to-
native mapping tables, and their extension schemas. Defined in
`IMPLEMENTATION.md` §4.

### Scope

A resolution context for capabilities. ACF defines two scopes: `user`
(`~/.agents/`) and `project` (`./.agents/`). Adapters expose per-scope
install paths.

### Source

A description in `capabilities.yml` of where to fetch a capability from:
`github:owner/repo`, `git:<url>`, or `path:<location>`.

### Lockfile

`capabilities.lock`, recording the resolved identity (source id, commit,
content hash) of each fetched capability per scope.

### Diagnostic

A structured message from an ACF implementation describing a validation,
applicability, or lossiness condition. Severity is one of `error`, `warn`,
`info`, `lossy`. Code is a namespaced string such as
`acf.hook.match.required`.

### Caplet

The reference CLI implementation for reading capabilities, fetching remote
sources, and emitting native artifacts. Caplet is not the standard itself;
its config (`caplet.yml`) is defined in `IMPLEMENTATION.md`, not `SPEC.md`.

### SDK

The `@acf/sdk` npm package. Re-exports `@acf/core`, `@acf/adapters`, and
`@acf/installer` plus a small set of convenience helpers (`getSkills`,
`getInstructions`, `getMcpServers`, `getFacets`, etc.) for direct ACF
consumers. Direct consumers (e.g. a future Pi extension) import the SDK
instead of subprocessing `caplet`; CI linters and browser validators
import `@acf/core` only.

### Installer

The `@acf/installer` npm package. Handles git + network fetch of remote
capability sources, resolves `capabilities.yml`, and writes the
lockfile. Separated from `@acf/core` so that core stays pure (no
network, no git, no `Bun.*`, no logger) and browser-safe modulo a
filesystem port. Caplet and the SDK both depend on the installer.

### Capability Tree

The canonical, host-agnostic directory layout produced by resolution:
`~/.agents/capabilities/<name>/` (user scope) and
`./.agents/capabilities/<name>/` (project scope). One resolved copy
serves every host. Adapters never produce the capability tree; emission
is a separate phase that translates the tree into per-host native
artifacts.

### Installed Tree

The per-host, host-specific output directory produced by an adapter
(e.g. `~/.claude/...`, `./.cursor/...`). The installed tree mirrors the
capability tree's logical content but in each host's native format.
Distinct from the capability tree: deleting the installed tree does not
delete the capability tree.

### File Diff

The unit of work returned by an adapter. A `FileDiff` carries `path`,
`before` (current content or `null`), `after` (desired content or
`null` to delete), and `owns` — a list of ACF-owned regions inside the
file (whole file, JSON pointer, YAML pointer, TOML pointer, or named
marker). Adapters return diffs; the emit driver applies them. This
lets adapters cohabit non-ACF content inside the same file (`.mcp.json`,
`settings.json`, target rules files) without nuking user-authored
regions.

### ACF Ownership Sidecar

The `.acf-managed.json` file written at each install root by the emit
driver. Records every `FileDiff` ownership (`{path, owns, capability,
facet?, hash}`). Enables clean re-emit (remove stale pointers without
touching unowned regions), drift detection (`acf.emit.drift`), and
safe removal when a capability or facet is unfetched. Adapters do not
write the sidecar; the emit driver writes it after diffs are applied.
