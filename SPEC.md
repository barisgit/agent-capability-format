# Agent Capability Format Specification

Status: draft

This document is the normative specification of the Agent Capability Format
(ACF). It defines the portable source format for agent capabilities and the
rules that conforming implementations MUST follow to read, validate, resolve,
and emit ACF capabilities.

Reference implementation notes, TypeScript types, the target registry, and
the reference CLI live in `IMPLEMENTATION.md`. Domain language, axioms, and
naming aliases live in `CONTEXT.md`. A high-level overview lives in
`README.md`.

## 1. Conformance

### 1.1 Requirement keywords

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this
document are to be interpreted as described in RFC 2119 / RFC 8174 when, and
only when, they appear in all capitals.

### 1.2 Conformance roles

This specification defines conformance for four roles:

1. **Conforming ACF Capability** — a directory that follows §3–§13.
2. **Conforming ACF Implementation** — software that reads, validates,
   resolves, or emits ACF capabilities, including reference CLIs, plugins,
   and direct SDK consumers.
3. **Conforming Target Adapter** — an implementation component that maps
   ACF to one specific host ecosystem (§22).
4. **Conforming Resolver** — an implementation component that materializes
   a `capabilities.yml` declaration into an on-disk capability tree (§17).

Conformance is per-section and per-feature. An implementation MAY omit
support for some optional facet families or target adapters provided it
reports the omission via diagnostics (§14).

### 1.3 Spec version

The current ACF spec version is `1`. The `acf` field in each capability
manifest declares the spec version the capability targets. Implementations
MUST reject capabilities whose declared `acf` version is unknown to them.

This specification is final-ish: future additive changes MUST remain
backward-compatible within `acf: 1`. Breaking changes require a new spec
version.

### 1.4 Scope and non-goals

ACF defines:

- a portable source format for shareable agent capabilities;
- the file layout, file shapes, and validation rules for that format;
- a portable resolution model for fetching and locating capabilities on
  disk (`capabilities.yml`, scopes, source types, lockfile);
- the boundary at which portable references to operations, events,
  permissions, and message surfaces are resolved against a separate runtime
  taxonomy;
- a default handler wire protocol that adapters MAY override.

ACF does **not** define:

- a universal runtime protocol or agent-to-host wire format;
- a replacement for MCP, Agent Skills, or any host's native plugin system;
- a permission policy language, secret-management format, or sandboxing
  model;
- install paths or native artifact layout (owned by adapters, §22);
- caplet configuration (owned by the reference CLI, `IMPLEMENTATION.md`).

## 2. Terminology

The terms below have specific normative meaning. See `CONTEXT.md` for
non-normative discussion and cross-ecosystem aliases.

**ACF** — Agent Capability Format.

**Capability** — A self-contained, shareable bundle of facets at a
directory with an `acf.yml` (or `acf.yaml`) manifest at its root. A
capability is the unit of distribution, versioning, and target
applicability.

**Manifest** — The root `acf.yml` (or `acf.yaml`) of a capability. Defines
capability identity, metadata, target applicability, and target extension
data.

**Capability Root** — The directory containing the manifest. All facet
discovery is relative to the capability root.

**Facet** — One of the canonical kinds of agent behavior or configuration
declared inside a capability: a single skill, agent, command, instruction,
hook entry, or MCP server.

**Facet Family** — One of the six canonical kinds: `skill`, `agent`,
`command`, `instruction`, `hook`, `mcp`.

**Adapter** — Implementation code that emits one capability to one target
host's native artifacts.

**Target** — A supported host ecosystem with a defined identifier in the
target registry, such as `claude`, `codex`, `cursor`, `opencode`, or `pi`.

**Native Artifact** — A file, directory, or config entry in a target host's
own format produced by an adapter.

**Lossiness** — A semantic gap where an ACF facet or capability cannot be
represented exactly in a target host. Lossiness MUST be reported (§14.3).

**Runtime Taxonomy / Registry** — A separate versioned vocabulary of
canonical operation, event, permission, and message-surface identifiers
used in portable runtime-facing fields. The taxonomy is intentionally
**not** defined inside this specification; it MAY later be extracted into a
sibling specification. ACF defines only the slots that reference taxonomy
identifiers, a small provisional operation set (§24), and the diagnostics
when references are unmapped.

**Diagnostic** — A structured message emitted by an implementation
describing a validation, applicability, resolution, or lossiness condition.
Diagnostics have severity levels and namespaced codes (§14).

**Target Registry** — The implementation-level data structure that
enumerates known targets, their capability support levels, their extension
schemas, and their install-path conventions (§22, `IMPLEMENTATION.md`).

**Scope** — One of two well-known load locations for capabilities:
**user** (`~/.agents/`) and **project** (`./.agents/`). Project shadows
user (§17).

**Source** — A capability origin declared in `capabilities.yml`: a Git
repository, GitHub shorthand, or local path (§18).

**Lockfile** — A machine-managed file that records resolved capability
identity, version, and content integrity for each entry in
`capabilities.yml` (§19).

## 3. Capability layout

### 3.1 Canonical layout

The canonical ACF capability layout is:

```txt
<capability-root>/
  acf.yml              # required manifest
  ACF.md               # optional capability-level Markdown
  assets/              # optional non-facet support files
  skills/
  agents/
  commands/
  instructions/
  hooks/
  mcp/
```

All facet folders are OPTIONAL. A capability consisting only of a manifest
is valid (and meaningless).

### 3.2 Required and optional files

- The manifest is REQUIRED. See §4.
- `ACF.md` is OPTIONAL. See §3.6.
- `README.md` MAY exist at the capability root, but is NOT semantically
  consumed by ACF. It is permitted for repository/distribution purposes
  only.
- `assets/` is OPTIONAL. See §3.7.
- Hidden files and directories (starting with `.`) at or below the
  capability root MUST be ignored by ACF unless explicitly referenced from
  a semantic input.

### 3.3 Canonical facet folders

The canonical top-level facet folders are exactly:

| Folder          | Family       |
| --------------- | ------------ |
| `skills/`       | skill        |
| `agents/`       | agent        |
| `commands/`     | command      |
| `instructions/` | instruction  |
| `hooks/`        | hook         |
| `mcp/`          | mcp          |

Folder names are plural. Singular aliases (`skill/`, `agent/`, `command/`,
`instruction/`, `hook/`, `mcps/`) are NOT canonical and MUST produce a
diagnostic of severity `error` if encountered at the capability root.

Missing or empty canonical folders are valid and have no effect.

### 3.4 Semantic and non-semantic files

ACF defines its semantic inputs explicitly. Implementations MUST treat the
following as semantic inputs:

- the manifest at the capability root;
- the optional `ACF.md`;
- files inside canonical facet folders that match family-specific discovery
  rules (§9–§13);
- files explicitly referenced from semantic inputs, including files under
  `assets/` (§16).

All other files and folders at or below the capability root are
non-semantic. Implementations MUST NOT raise validation errors solely
because non-semantic files exist. Repository tooling MAY include or
exclude such files at its discretion.

### 3.5 Capability root vs repository root

A capability root is a semantic root, not necessarily a Git repository
root. A repository MAY contain one capability at its root (`acf.yml` at
repo root) or multiple capabilities under an `acf/` directory (§20).

### 3.6 `ACF.md`

`ACF.md` is the OPTIONAL capability-level Markdown document. It is
human-readable prose for capability overview, prerequisites, caveats, and
target notes.

`ACF.md` MAY begin with a YAML frontmatter block. The frontmatter MAY
contain the following OPTIONAL fields:

| Field         | Type           | Notes                                                 |
| ------------- | -------------- | ----------------------------------------------------- |
| `sections`    | list of string | Author-declared section order hints. Advisory only.  |
| `targets`     | mapping        | Target extension data for the document itself (§7).  |

No `ACF.md` field is REQUIRED. Unknown frontmatter fields MUST emit an
`info` diagnostic. Implementations MUST NOT treat `ACF.md` as a
substitute for the manifest.

The body of `ACF.md` is plain CommonMark Markdown. ACF does NOT define
specific section headings or required content. Asset references in
`ACF.md` follow §16.

### 3.7 `assets/`

`assets/` is OPTIONAL and is a non-facet support folder. Implementations
MUST NOT treat `assets/` as a facet family. Implementations SHOULD only
copy or include assets that are referenced from the manifest, `ACF.md`,
or a facet source file under the rules in §16.

`assets/` MAY contain images, screenshots, icons, and Markdown documents
referenced by other semantic inputs. ACF does NOT constrain its internal
structure.

## 4. Manifest (`acf.yml`)

### 4.1 Filename and format

- The canonical manifest filename is `acf.yml`.
- `acf.yaml` is accepted as an alias.
- If both `acf.yml` and `acf.yaml` exist in the same capability root, the
  capability is invalid. Implementations MUST emit `error` and refuse to
  proceed.
- Manifests in JSON or TOML are NOT part of this specification.
  Implementations MUST NOT attempt to read alternative formats as
  manifests.

### 4.2 Top-level fields

The manifest is a YAML mapping with the following fields:

| Field         | Type                  | Required | Notes                                                  |
| ------------- | --------------------- | -------- | ------------------------------------------------------ |
| `acf`         | integer               | yes      | Spec version. MUST be `1` for this specification.      |
| `name`        | slug string           | yes      | Capability identity; matches `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `version`     | SemVer string         | yes      | SemVer 2.0.0 string.                                   |
| `description` | string                | no       | Short, single-paragraph capability description.        |
| `authors`     | list of string        | no       | Free-form author lines (`"Name <email>"`).             |
| `license`     | SPDX string           | no       | SPDX identifier or `"LicenseRef-…"`.                   |
| `homepage`    | URL string            | no       | HTTP(S) URL.                                           |
| `repository`  | URL string            | no       | HTTP(S) or SSH URL.                                    |
| `keywords`    | list of string        | no       | Lowercase tags for indexing.                           |
| `only`        | list of TargetId      | no       | Capability-level target applicability (§6).            |
| `except`      | list of TargetId      | no       | Capability-level target applicability (§6).            |
| `targets`     | mapping by TargetId   | no       | Capability-level target extension data (§7).           |

Implementations MUST reject manifests that contain top-level fields not
listed above unless those fields are defined as forward-compatible
extensions in a later spec version, in which case they MUST emit an
`info` diagnostic.

### 4.3 Example

```yaml
acf: 1
name: example-pack
version: 0.1.0
description: A sample ACF capability.
license: MIT
authors:
  - "Alice <alice@example.com>"
homepage: https://example.com/pack
repository: https://github.com/example/pack
keywords:
  - typescript
  - testing

only: [claude, codex]

targets:
  claude:
    pluginAuthor: "Example"
  codex:
    appId: "com.example.pack"
```

### 4.4 Validation

Implementations MUST:

- parse the manifest as YAML, rejecting non-mapping documents;
- validate `acf`, `name`, `version`, and all other declared fields against
  their types;
- reject `name` values that do not match the slug regex (§5);
- reject the capability if both `only` and `except` are present (§6.2);
- validate `targets` keys against the target registry (§7);
- emit a diagnostic for any field whose value is the wrong type or whose
  value fails its constraint.

## 5. Identifiers and slugs

### 5.1 Slug regex

Wherever this specification requires a "slug" identifier, the value MUST
match:

```regex
^[a-z0-9]+(-[a-z0-9]+)*$
```

Valid examples: `typescript-style`, `reviewer`, `dangerous-command-check`,
`pre-tool`, `v1`.

Invalid examples: `TypeScript Style`, `@scope/foo`, `foo_bar`, `foo.bar`,
`foo/bar`, `foo--bar`, `foo-`.

### 5.2 Where slugs are required

Slug-form names are REQUIRED for:

- capability `name` (§4.2);
- facet `name` for skills, agents, commands, and instructions (§9–§12);
- hook entry `name` (§13.4);
- MCP server `name` (§13a.3);
- target identifiers in the registry (§22).

### 5.3 Facet name and discovery

Facet `name` is the stable machine identifier of a facet. It is NOT a
display title. ACF does not define a separate `id` field; `name` is the
id. The relationship between `name` and the discovered file or directory
basename is family-specific and defined in §9–§13.

ACF does not define a canonical `title` or `displayName` field for facets
in this version. A future spec version MAY add one.

### 5.4 Uniqueness within a capability

Within a single capability, `(family, name)` MUST be unique. Two skills
with the same `name`, or two agents with the same `name`, are invalid.

Across families, a skill and an agent MAY share the same `name`. This is
permitted because they cross families; users SHOULD avoid such collisions
in practice.

### 5.5 Uniqueness across capabilities

After resolution (§17), the effective set of facets in one scope MUST have
unique `(family, name)` across capabilities, after applicability filtering
(§6). Collisions are resolved by §17.6.

## 6. Target applicability (`only` / `except`)

### 6.1 Semantics

`only` and `except` declare which targets a unit applies to:

- `only: [a, b]` — applies only when emission targets `a` or `b`.
- `except: [a, b]` — applies for all targets except `a` and `b`.

A unit with neither field applies to all targets.

### 6.2 Mutual exclusivity

A unit MUST NOT declare both `only` and `except`. Implementations MUST
emit `error` and treat the unit as invalid.

### 6.3 Where applicability is allowed

`only` / `except` MAY appear at:

- the manifest top level (§4.2);
- the frontmatter of any Markdown-backed facet (§9–§12);
- any entry under a hook bucket in `hooks/hooks.yml` (§13.4);
- any entry under `servers[]` in `mcp/mcp.yml` (§13a.3).

### 6.4 Applicability cascade

Capability-level `only`/`except` and facet-level `only`/`except` cascade
by intersection:

- A facet that declares neither inherits the capability's applicability
  set (the set of targets after applying capability-level `only`/`except`
  to all known targets).
- A facet that declares `only` or `except` produces its own applicability
  set, and the **effective** applicability is the **intersection** of the
  capability set and the facet set.
- If the intersection is empty, the facet does not apply to any target.
  Implementations MUST emit an `info` diagnostic and skip the facet for
  emission.

This rule applies recursively at the entry level for hooks and MCP servers
(§13.4, §13a.3): entry applicability intersects with the capability set,
not the family set.

### 6.5 Unknown target ids

If `only` or `except` lists a target id not present in the target
registry, implementations MUST emit an `error` diagnostic and ignore the
unknown id when computing applicability for known targets.

## 7. Target extension data (`targets.<target>`)

### 7.1 Purpose

`targets.<target>` is a mapping from a TargetId to a target-specific
extension payload validated against the target's extension schema in the
registry (§22).

It exists to carry native-only options that have no portable canonical
representation. It is **not** a deep merge patch over canonical fields,
**not** a replacement object for canonical data, and **not** a place to
restate mappings that the adapter already knows from canonical fields.

### 7.2 Where extension data is allowed

`targets.<target>` MAY appear at:

- the manifest top level (§4.2);
- the frontmatter of any Markdown-backed facet (§9–§12);
- any entry under a hook bucket in `hooks/hooks.yml`;
- any entry under `servers[]` in `mcp/mcp.yml`;
- the family-level `targets.<target>` block in `hooks/hooks.yml` (§13.9)
  and `mcp/mcp.yml` (§13a.5).

### 7.3 Validation

Implementations MUST:

- reject unknown target ids and emit a diagnostic of severity `error`;
- look up the per-target, per-family extension schema in the target
  registry;
- validate the extension payload against that schema;
- emit a diagnostic when a target has no extension schema declared for the
  current family or location, and treat the payload as invalid;
- emit a diagnostic when extension fields are unknown to the schema.

### 7.4 No deep merge

Implementations MUST NOT silently merge `targets.<target>` over canonical
fields. Adapters interpret extension data however the target requires, but
the canonical fields remain authoritative for portable semantics.

## 8. Facet families overview

The canonical facet families are:

| Family       | Source location                                                  | Source shape           |
| ------------ | ---------------------------------------------------------------- | ---------------------- |
| skill        | `skills/<name>/SKILL.md`                                         | Markdown + assets      |
| agent        | `agents/<name>.md` or `agents/<name>/AGENT.md`                   | Markdown               |
| command      | `commands/<name>.md` or `commands/<name>/COMMAND.md`             | Markdown               |
| instruction  | `instructions/<name>.md` or `instructions/<name>/INSTRUCTION.md` | Markdown               |
| hook         | `hooks/hooks.yml`                                                | YAML, family-level     |
| mcp          | `mcp/mcp.yml`                                                    | YAML, family-level     |

Skills are directory-only. Agents, commands, and instructions accept both
a simple file form and a directory form. Hooks and MCP are family-level
YAML configurations: one file per family, not one file per declaration.

ACF-authored configuration files are YAML in v1. Implementations MUST NOT
accept JSON or TOML as portable ACF source config. Native artifacts emitted
by adapters MAY use any format the target requires (§14.4).

## 9. Skills

### 9.1 Source shape

Skills are directory-oriented. The required shape is:

```txt
skills/
  <name>/
    SKILL.md
    [scripts/]
    [assets/]
    [...]
```

`SKILL.md` is REQUIRED. The directory name `<name>` MUST match the slug
regex. Any other files inside the skill directory are local support files
(scripts, assets, fixtures). ACF does not constrain their structure beyond
§3.

### 9.2 Frontmatter

`SKILL.md` MUST begin with a YAML frontmatter block delimited by `---`
lines. Required and optional frontmatter fields:

| Field            | Type        | Required | Notes                                            |
| ---------------- | ----------- | -------- | ------------------------------------------------ |
| `name`           | slug string | yes      | MUST equal the discovered directory basename.    |
| `description`    | string      | yes      | One-line discovery/menu text.                    |
| `invocation`     | mapping     | no       | Canonical invocation control (§9.3).             |
| `assets`         | list        | no       | Explicit asset references (§16).                 |
| `only`           | list        | no       | Target applicability (§6).                       |
| `except`         | list        | no       | Target applicability (§6).                       |
| `targets`        | mapping     | no       | Target extension data (§7).                      |

### 9.3 Invocation control

Skills MAY declare:

```yaml
invocation:
  user: true       # user may explicitly invoke
  model: true      # agent/model may select automatically
```

Both fields default to `true` when omitted. Adapters MAY map these to
host-specific names such as Claude's `user-invocable` /
`disable-model-invocation` or Codex's implicit invocation policy. If a
target cannot represent one of the booleans, the adapter MUST emit a
`lossy` diagnostic.

### 9.4 Body

The body of `SKILL.md` is plain CommonMark Markdown. It is the skill's
prompt content. Asset references follow §16.

### 9.5 Example

`skills/typescript-style/SKILL.md`:

```md
---
name: typescript-style
description: TypeScript style and architecture rules for this capability.
invocation:
  user: true
  model: true
---

# TypeScript Style

Prefer explicit domain types over broad `Record<string, unknown>` shapes.
Avoid adding new generic helpers unless two call sites already need them.
```

## 10. Agents

### 10.1 Source shape

Agents accept two shapes:

```txt
agents/
  <name>.md                 # simple form
  <name>/
    AGENT.md                # directory form
    [support files...]
```

`AGENT.md` is REQUIRED when the directory form is used. The basename
`<name>` MUST match the slug regex. A single agent MUST NOT appear in
both forms; if it does, implementations MUST emit `error` and refuse to
proceed.

### 10.2 Frontmatter

| Field         | Type        | Required | Notes                                                          |
| ------------- | ----------- | -------- | -------------------------------------------------------------- |
| `name`        | slug string | yes      | MUST equal the file or directory basename.                     |
| `description` | string      | yes      | Concise delegation/menu text.                                  |
| `mode`        | enum        | no       | One of `primary`, `subagent`, `all`. Default: `all`.           |
| `model`       | enum        | no       | Only `inherit` is canonical. Default: `inherit`.               |
| `assets`      | list        | no       | Explicit asset references (§16).                               |
| `only`        | list        | no       | Target applicability (§6).                                     |
| `except`      | list        | no       | Target applicability (§6).                                     |
| `targets`     | mapping     | no       | Target extension data (§7).                                    |

### 10.3 `mode`

- `primary`: the agent may be selected or run as the main agent.
- `subagent`: the agent may be delegated to / invoked by another agent.
- `all`: both behaviors are allowed.

If a target cannot represent the requested mode, the adapter MUST emit a
`lossy` diagnostic and SHOULD prefer the closest available behavior.

### 10.4 `model`

Canonical `model` accepts only `inherit` in v1. Concrete model aliases or
provider model ids MUST be provided via `targets.<target>` extension
data and are non-portable.

### 10.5 No canonical tools/permissions

ACF v1 does NOT define canonical agent `tools`, `access`, or
`permissions` fields. Tool and permission syntax MUST be expressed via
`targets.<target>` extension data. A future spec version MAY add
canonical fields backed by the runtime taxonomy (§24).

### 10.6 Body

The body of `agents/<name>.md` or `AGENT.md` is the agent's system prompt
content as plain CommonMark Markdown.

### 10.7 Example

`agents/reviewer.md`:

```md
---
name: reviewer
description: Performs strict pull-request review focused on correctness.
mode: subagent
model: inherit
targets:
  claude:
    tools:
      - "Read"
      - "Grep"
      - "Bash(git log:*)"
  codex:
    permissions:
      readOnly: true
---

# Reviewer

You are a strict code reviewer. Focus on correctness, regressions, and
missing tests. Do not write code unless explicitly asked.
```

## 11. Commands

### 11.1 Source shape

Commands accept two shapes:

```txt
commands/
  <name>.md
  <name>/
    COMMAND.md
    [support files...]
```

### 11.2 Frontmatter

| Field         | Type            | Required | Notes                                                |
| ------------- | --------------- | -------- | ---------------------------------------------------- |
| `name`        | slug string     | yes      | MUST equal the file or directory basename.           |
| `description` | string          | yes      | Concise menu text.                                   |
| `arguments`   | list of slug    | no       | Ordered argument names; default `[]`.                |
| `agent`       | string          | no       | Symbolic preferred agent reference (§11.4).          |
| `assets`      | list            | no       | Explicit asset references (§16).                     |
| `only`        | list            | no       | Target applicability (§6).                           |
| `except`      | list            | no       | Target applicability (§6).                           |
| `targets`     | mapping         | no       | Target extension data (§7).                          |

ACF v1 does NOT define canonical `argumentHint`, `model`, or `subtask`
fields. Targets that need such information MUST express it via
`targets.<target>`.

### 11.3 `arguments`

`arguments` is a list of slug names representing positional argument
names.

```yaml
arguments: [focus, ticket]
```

Implementations MUST validate each entry against the slug regex. Detailed
help, requiredness, and structured argument schemas are out of scope for
v1; authors SHOULD document them in the Markdown body.

### 11.4 `agent`

`agent` is a symbolic preferred agent reference. The reference resolves
in this order, stopping at the first match:

1. an ACF agent facet declared in the same capability whose `name`
   matches;
2. an ACF agent facet declared in any sibling capability resolved in the
   same scope (§17), after applicability filtering;
3. a target-native agent identifier supported by the selected target.

If none of these resolves for the selected target, the adapter MUST emit
a `lossy` diagnostic and SHOULD continue emission with the host default.

### 11.5 Example

`commands/review.md`:

```md
---
name: review
description: Review the focused area of the diff.
arguments: [focus]
agent: reviewer
targets:
  claude:
    argumentHint: "[focus]"
---

# /review

Use the `reviewer` agent on the focus area `{focus}`. Surface regressions,
missing tests, and over-engineering risks.
```

## 12. Instructions

### 12.1 Source shape

Instructions accept two shapes:

```txt
instructions/
  <name>.md
  <name>/
    INSTRUCTION.md
    [support files...]
```

### 12.2 Frontmatter

| Field         | Type              | Required | Notes                                          |
| ------------- | ----------------- | -------- | ---------------------------------------------- |
| `name`        | slug string       | yes      | MUST equal the file or directory basename.     |
| `description` | string            | yes      | Concise discovery/rulebook text.               |
| `activation`  | string \| mapping | yes      | `always` or `{ when: {...} }` (§12.3).         |
| `assets`      | list              | no       | Explicit asset references (§16).               |
| `only`        | list              | no       | Target applicability (§6).                     |
| `except`      | list              | no       | Target applicability (§6).                     |
| `targets`     | mapping           | no       | Target extension data (§7).                    |

### 12.3 Activation grammar

`activation` is either the literal string `always` or a mapping
`{ when: ... }`.

```yaml
activation: always
```

or:

```yaml
activation:
  when:
    <triggerName>: <triggerBlock>
    [...]
```

`activation.when` is a mapping keyed by trigger name. Each value is a
trigger block (§12.5). Multiple trigger names MAY appear; their semantics
are ORed (any trigger may fire).

ACF v1 defines a generic top-level `when` field for facet selection as
**not allowed**. `activation.when.<triggerName>` is the only sanctioned
use of the `when` key in canonical fields.

### 12.4 Surface semantics

- `activation: always` instructions are **system-surface** initial
  context. They MUST be injected at session start and MUST NOT change
  once the session has started.
- `activation.when.<triggerName>` instructions are **conversation-surface**
  context injected later when their trigger fires. They MUST contribute
  zero prompt or context tokens before activation.
- Triggered instructions are NOT rulebook entries and MUST NOT be
  advertised to the model as discoverable items costing context tokens.
  Discoverable on-demand knowledge belongs in skills.

When activated, the Markdown body following frontmatter is injected
exactly as authored. `description` is metadata and MUST NOT be injected
by default.

Retention, deduplication, pruning, and re-injection of triggered context
are runtime responsibilities and are intentionally not specified here.

### 12.5 Trigger blocks

The canonical trigger names in v1 are:

```txt
assistant_output
operation_input
operation_result
file_context
```

Each block is a YAML mapping with the following fields:

| Field        | Applies to                                                  | Required                          | Notes                                                |
| ------------ | ----------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `conditions` | `assistant_output`, `operation_input`, `operation_result`  | yes (non-empty)                   | Regex strings; ORed.                                 |
| `paths`      | `file_context`                                              | yes (non-empty) for `file_context` | Path globs; ORed.                                    |
| `scope`      | all                                                         | no                                | Registry-defined scope entries; ORed.                |
| `interrupt`  | all                                                         | no                                | `never` \| `always`. Defaults per trigger (§12.10).  |
| `repeat`     | all                                                         | no                                | `once` \| `always`. Default `once`.                  |
| `debounce`   | all                                                         | no                                | Positive integer turns. Only when `repeat: always`. |

### 12.6 Trigger names

- `assistant_output` — watches assistant-visible generated text/output.
  Fires when buffered output matches at least one `conditions` entry
  (ANDed with optional `scope`).
- `operation_input` — fires before a runtime operation begins, against
  its registry-defined input (e.g. shell command line, file write
  payload).
- `operation_result` — fires after a runtime operation completes,
  against its registry-defined result.
- `file_context` — fires when files/paths matching `paths` are present in
  conversation/runtime context.

### 12.7 `conditions`

`conditions` is a list of plain regex pattern strings. Each pattern:

- MUST be a bare regex pattern, NOT `/pattern/flags` notation;
- MUST be ECMAScript-compatible where the runtime supports it;
- has no default flags;
- is ORed with other entries in the same trigger block.

Implementations MUST emit an `error` diagnostic for patterns that fail to
compile in the chosen runtime.

### 12.8 `paths`

`paths` is a list of forward-slash globs interpreted relative to the
**workspace root**. The workspace root is the directory the host treats
as the active project (typically the cwd of the agent session). If a
host has no workspace concept, the path it considers "the current
working directory" is used. Globs MUST NOT be interpreted relative to
the capability root; capability-local paths are not addressable through
`file_context`. Absolute paths and backslash separators are invalid.

`paths` matching is case-sensitive. Implementations on case-insensitive
or case-preserving filesystems MUST still match case-sensitively against
the path strings as recorded; they MUST emit `acf.runtime.case-folding`
at severity `lossy` for each glob whose match outcome could differ from
case-sensitive evaluation (best-effort detection).

`paths` MAY appear:

- as the direct matcher of `file_context` (REQUIRED);
- inside a `scope` entry (OPTIONAL) to restrict another trigger to files
  matching the globs.

### 12.9 `scope`

`scope` is a list of scope entries. Each entry is a mapping:

```yaml
scope:
  - operation: <operation-id>     # registry-defined, singular per entry
    paths: ["**/*.ts"]            # optional
```

Scope entries are ORed. A trigger fires only if its matcher (`conditions`
or `paths`) succeeds AND any scope entry succeeds.

When `scope` is omitted, the trigger applies to all runtime contexts
supported by that trigger type. Negated scope is not defined in v1.

`operation` MUST be an identifier from the runtime taxonomy (§24).
Native target tool names MUST NOT appear as scope operations.

### 12.10 `interrupt`

`interrupt` is one of:

- `never` — the runtime SHOULD defer injection to the next safe boundary
  without aborting the current generation or operation.
- `always` — the runtime SHOULD inject immediately, aborting and
  retrying generation or blocking the operation as appropriate.

Defaults per trigger:

| Trigger              | Default `interrupt` |
| -------------------- | ------------------- |
| `assistant_output`   | `always`            |
| `operation_input`    | `always`            |
| `operation_result`   | `never`             |
| `file_context`       | `never`             |

### 12.11 `repeat` and `debounce`

`repeat` controls how many times a trigger may fire per session:

- `once` (default) — the trigger fires at most once per session.
- `always` — the trigger may fire repeatedly.

`debounce` is a positive integer specifying minimum turns between
consecutive firings. `debounce` is valid ONLY when `repeat: always`;
otherwise implementations MUST emit an `error` diagnostic.

A **turn** is exactly one of:

1. one user message submitted to the host, or
2. one assistant message (one complete model response, regardless of
   length or number of tool calls inside it), or
3. one operation invocation, where a **batch of parallel operations
   issued in the same assistant message counts as one turn**, not N.

Implementations MUST count turns this way. Hosts that cannot distinguish
these categories MUST count any of (1)-(3) as a single increment and
emit `acf.runtime.turn-granularity` at severity `lossy` once per session.

A turn is one of:

- a user message,
- an assistant output,
- an operation turn (a single operation or a single batch of parallel
  operations).

### 12.12 Trigger combinations

An instruction MAY declare multiple trigger names under `activation.when`.
Their semantics are ORed; each block's `interrupt`, `repeat`, and
`debounce` apply to that block only.

### 12.13 Target-specific trigger data

`targets.<target>` MAY contain target-specific trigger knobs or native
trigger forms validated by the target's instruction extension schema.
These are non-portable. ACF does not define per-instruction strictness;
lossiness severity is a tool policy (§14.6).

### 12.14 Examples

Always-on instruction:

```md
---
name: typescript-style
description: TypeScript style and architecture rules.
activation: always
---

Prefer explicit domain types over broad `Record<string, unknown>` shapes.
Avoid adding new generic helpers unless two call sites already need them.
```

`assistant_output` trigger blocking direct fetch mocks in test file
writes:

```md
---
name: no-global-fetch-mock
description: Use hookFetch instead of mocking globalThis.fetch in tests.
activation:
  when:
    assistant_output:
      conditions:
        - "globalThis\\.fetch\\s*="
        - "spyOn\\(globalThis.*fetch"
      scope:
        - operation: file_write
          paths: ["**/*.test.{ts,tsx,js,jsx}"]
      interrupt: always
---

Do not assign or spy on `globalThis.fetch` in tests. Use the `hookFetch`
helper from `src/test/hook-fetch.ts` instead.
```

`operation_input` dangerous shell guard:

```md
---
name: no-rm-rf
description: Block dangerous recursive deletes.
activation:
  when:
    operation_input:
      conditions:
        - "\\brm\\s+-rf\\b"
      scope:
        - operation: shell
      interrupt: always
---

Do not run `rm -rf` from within this capability. Use the `clean` script.
```

`operation_result` missing-module diagnosis:

```md
---
name: missing-module-diagnosis
description: Suggest a workspace install when a module is missing.
activation:
  when:
    operation_result:
      conditions:
        - "Cannot find module|MODULE_NOT_FOUND"
      scope:
        - operation: shell
      interrupt: never
---

If a `Cannot find module` error appears, suggest `pnpm install` at the
capability root before retrying.
```

`file_context` `package.json` discipline:

```md
---
name: package-json-care
description: Edit package.json with extra care.
activation:
  when:
    file_context:
      paths:
        - "**/package.json"
---

When editing `package.json`, never delete unrelated fields. Preserve sort
order. Run `pnpm install` after dependency changes.
```

Multiple triggers:

```md
---
name: shell-guard
description: Block dangerous shell commands at input and on tooling output.
activation:
  when:
    operation_input:
      conditions:
        - "\\brm\\s+-rf\\b"
      scope:
        - operation: shell
    assistant_output:
      conditions:
        - "rm\\s+-rf\\s+/"
      interrupt: always
      repeat: always
      debounce: 3
---

Never run or suggest `rm -rf /` or other destructive root deletes.
```

## 13. Hooks

### 13.1 Source shape

Hooks are declared in a single family-level YAML file:

- Canonical: `hooks/hooks.yml`.
- Alias: `hooks/hooks.yaml` is accepted.
- If both exist, the capability is invalid.

The file is a YAML mapping keyed by canonical hook type (§13.2). It MAY
also contain a top-level `targets` mapping for target-native hooks
(§13.9).

### 13.2 Canonical hook types

ACF v1 defines the following canonical hook types:

| Hook type             | Lifecycle phase                                              | `match` REQUIRED? |
| --------------------- | ------------------------------------------------------------ | ----------------- |
| `session_start`       | Session initialization.                                      | no                |
| `user_prompt_submit`  | Before the user prompt enters the model.                     | no                |
| `pre_tool`            | Before a runtime operation/tool executes.                    | yes               |
| `permission_request`  | Host asks whether an operation may be performed.             | yes               |
| `post_tool`           | After a runtime operation/tool completes.                    | yes               |
| `stop`                | When generation/turn would otherwise stop.                   | no                |
| `pre_compact`         | Before context compaction/summarization runs.                | no                |

Canonical hook type names are `snake_case`. Native PascalCase or dotted
names (e.g. Claude `PreToolUse`, OpenCode `tool.execute.before`) are NOT
canonical hook types in ACF; they MAY appear only under
`targets.<target>.hooks` (§13.9).

### 13.3 File shape

```yaml
session_start:
  - <entry>
  - <entry>
user_prompt_submit:
  - <entry>
pre_tool:
  - <entry>
permission_request:
  - <entry>
post_tool:
  - <entry>
stop:
  - <entry>
pre_compact:
  - <entry>

targets:
  claude:
    hooks:
      <NativeEventName>:
        - <native-entry>
```

Each canonical hook key holds a YAML sequence of hook entries. Order
within the sequence is the canonical execution order (§13.8).

### 13.4 Hook entry fields

Each entry is a mapping with the following fields:

| Field         | Type        | Required                                            | Notes                                                              |
| ------------- | ----------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `name`        | slug string | yes                                                 | Unique within its hook type. Diagnostic identity.                  |
| `description` | string      | no                                                  | Short description.                                                 |
| `only`        | list        | no                                                  | Entry-level applicability (§6).                                    |
| `except`      | list        | no                                                  | Entry-level applicability (§6).                                    |
| `match`       | mapping     | yes for `pre_tool`/`post_tool`/`permission_request` | Event filter (§13.5).                                              |
| `run`         | mapping     | yes                                                 | Handler description (§13.6).                                       |
| `effect`      | enum        | yes                                                 | Declared intent. Allowed values depend on hook type (§13.7).       |
| `timeout`     | integer ms  | no                                                  | Suggested handler timeout in milliseconds. Default 30000.          |
| `targets`     | mapping     | no                                                  | Entry-level target extension data.                                 |

Hook entries are not "facets" in the same sense as skills or agents.
`name` is required for diagnostics and for adapter-side ordering, not for
external addressing.

### 13.5 `match`

`match` is an event filter ANDed across its fields:

```yaml
match:
  operation: <operation-id>       # registry-defined, singular
  paths:                          # optional, list of globs, ORed inside
    - "**/*.ts"
  conditions:                     # optional, list of regex, ORed inside
    - "regex"
```

Semantics:

- All fields present in `match` MUST evaluate to true (AND).
- Each list-typed field is internally ORed (`paths` and `conditions`).
- `operation` is singular per `match`; alternative operations MUST be
  modeled as separate hook entries.
- `operation: any` is a registry-defined alias meaning "any operation";
  when authors want a broad pre/post tool hook they MUST write it
  explicitly.
- For `pre_tool`, `post_tool`, and `permission_request`, `match` MUST be
  present and non-empty. For `session_start`, `user_prompt_submit`,
  `stop`, and `pre_compact`, `match` MAY be omitted; if present, the
  same rules apply.

Native target tool names MUST NOT appear in canonical `match.operation`.

### 13.6 `run`

`run` describes how to execute the handler. It is always a mapping; ACF
v1 does NOT accept a string shorthand.

| Field     | Type            | Required | Notes                                                  |
| --------- | --------------- | -------- | ------------------------------------------------------ |
| `command` | string          | yes      | Executable name/path or shell command line.            |
| `args`    | list of string  | no       | Exec form: argv vector. Mutually exclusive with `shell`. |
| `shell`   | enum            | no       | `bash` \| `powershell`. Mutually exclusive with `args`. |
| `env`     | mapping         | no       | Environment variable overrides (§13.6.4).              |

#### 13.6.1 Exec vs shell form

- **Exec form (default and when `args` is present)**: `command` is
  spawned directly. `args` is the argv vector; each entry is exactly one
  argv token. No shell, no tokenization, no quoting.
- **Shell form (when `shell` is set)**: `command` is passed to the named
  shell. Pipes, redirects, globs, and shell variables work.
- `args` and `shell` MUST NOT both be present. Implementations MUST emit
  `error`.

#### 13.6.2 `command` resolution

- A `command` containing `/` is resolved relative to the directory
  containing `hooks/hooks.yml` (the "hook directory"). Absolute paths
  are used as given. Bare names without `/` are resolved on PATH.
- After placeholder substitution (§13.6.3), the same rules apply to the
  substituted value.

#### 13.6.3 Path placeholders

Path placeholders are substituted in `command` and each `args` element
before spawning:

| Placeholder              | Value                                                           |
| ------------------------ | --------------------------------------------------------------- |
| `${ACF_CAPABILITY_DIR}`  | absolute path to the capability root.                           |
| `${ACF_PACKAGE_DIR}`     | alias for `${ACF_CAPABILITY_DIR}`; kept for compatibility.      |
| `${ACF_HOOK_DIR}`        | absolute path to the directory containing `hooks/hooks.yml`.    |

Placeholder substitution is literal text replacement before spawn.
Placeholders are NOT shell-expanded; they work identically in both exec
and shell forms.

Implementations MUST NOT perform additional environment-variable
expansion on `command` or `args` in exec form. Shell form delegates all
expansion to the shell.

#### 13.6.4 `env`

`env` is a mapping of environment variables added to the handler's
environment, on top of the parent process environment.

Values in `env` MAY reference path placeholders from §13.6.3. They MUST
NOT reference arbitrary shell-style variables. Implementations MUST NOT
perform recursive expansion.

#### 13.6.5 Default cwd

The handler's working directory is the capability root unless the
adapter explicitly maps a different cwd for the target.

#### 13.6.6 Default wire protocol

The default handler wire protocol is:

- **stdin**: the event payload encoded as JSON, whose schema is defined
  by the runtime taxonomy and adapter. A single JSON document terminated
  by EOF.
- **stdout**: an OPTIONAL JSON document describing the handler's
  decision (e.g. `{ "decision": "allow" }`, `{ "context": "…" }`). The
  exact schema is owned by the runtime taxonomy and adapter. Non-JSON
  stdout SHOULD be treated as `add_context` plain text where the hook
  type allows it; otherwise it is ignored.
- **stderr**: free-form. SHOULD be surfaced as diagnostic text.
- **exit code**:
  - `0` — continue. Any stdout decision applies.
  - `2` — block. The hook's `effect` is enforced as `block`,
    `block_result`, or `deny` depending on hook type.
  - any other non-zero — non-blocking error. Surfaced as a `warn`
    diagnostic; the hook is treated as `observe`.

Adapters MAY override this protocol for hosts that require a different
contract (e.g. JSON-RPC, a wrapper script). The default applies in the
absence of an adapter override.

`timeout` MUST be honored by the host or runner; on timeout the hook is
treated as a non-blocking error.

### 13.7 `effect`

`effect` declares the handler's intent. Each entry MUST declare exactly
one effect. The allowed effects per hook type are:

| Hook type             | Allowed effects                          |
| --------------------- | ---------------------------------------- |
| `session_start`       | `observe`, `add_context`                 |
| `user_prompt_submit`  | `observe`, `block`, `add_context`        |
| `pre_tool`            | `observe`, `block`                       |
| `permission_request`  | `observe`, `decide`                      |
| `post_tool`           | `observe`, `add_context`, `block_result` |
| `stop`                | `observe`, `continue`                    |
| `pre_compact`         | `observe`, `add_context`                 |

Effect meanings:

- `observe` — side effect only (logging, telemetry, no decision channel).
- `block` — may cancel or refuse the event (input prompt, tool
  execution).
- `add_context` — may inject additional context into the session/turn.
- `continue` — may instruct the runtime to continue past a stop boundary.
- `block_result` — may replace or annotate a completed operation result.
  It does NOT undo the side effect of the executed operation; it changes
  what the assistant sees as the result.
- `decide` — may emit a host-native permission decision (allow / deny /
  ask); the exact decision payload is owned by the adapter.

If a target cannot map an entry's effect to a native decision channel for
that hook type, the adapter MUST emit a `lossy` diagnostic and SHOULD
treat the entry as `observe` for emission purposes.

### 13.8 Hook order

Within each hook type, the YAML sequence order is the canonical execution
order. Adapters:

- MUST preserve order when the target supports ordered execution;
- MUST emit a `lossy` diagnostic when the target executes hooks
  concurrently or in undefined order.

ACF v1 does NOT define `priority`, `before`, or `after` fields. Future
spec versions MAY add dependency-style fields if real pressure appears;
numeric priority sorts are explicitly discouraged.

### 13.9 Target-native hook events

Target-native event names (e.g. Claude `InstructionsLoaded`, OpenCode
`file.edited`, Pi `tool_call`) are NOT canonical hook types. They MAY
appear only under the family-level `targets.<target>.hooks` mapping in
`hooks/hooks.yml`:

```yaml
targets:
  claude:
    hooks:
      InstructionsLoaded:
        - name: load-extra-claude-context
          run:
            command: ./claude/instructions-loaded.sh
          effect: add_context
  opencode:
    hooks:
      "file.edited":
        - name: opencode-on-file-edited
          run:
            command: ./opencode/on-file-edited.ts
          effect: observe
```

Native entries reuse the canonical entry shape (`name`, `description`,
`run`, `effect` where supported, `timeout`). Only the event key is
non-portable. Their schema is validated by the target's hook extension
schema (§7).

Mixing canonical and target-native events for the same effect is allowed
and is not deduplicated by ACF.

### 13.10 Hook example

`hooks/hooks.yml`:

```yaml
session_start:
  - name: load-project-context
    description: Inject project rules at session start.
    run:
      command: ./session-start/load-context.ts
    effect: add_context

user_prompt_submit:
  - name: secrets-scan
    description: Scan user prompt for accidental secrets.
    run:
      command: ./prompt/secrets-scan.ts
    effect: block

pre_tool:
  - name: block-dangerous-shell
    description: Block destructive shell commands.
    match:
      operation: shell
      conditions:
        - "\\brm\\s+-rf\\b"
        - "\\bmkfs\\b"
    run:
      command: ./pre-tool/block-dangerous-shell.ts
    effect: block
  - name: typecheck-on-edit
    description: Run typecheck before edits to TS sources.
    only: [claude, codex]
    match:
      operation: file_write
      paths: ["**/*.ts", "**/*.tsx"]
    run:
      command: tsx
      args: ["${ACF_HOOK_DIR}/pre-tool/typecheck.ts"]
    effect: observe

permission_request:
  - name: deny-prod-shell
    description: Deny shell access to prod environment.
    match:
      operation: shell
      conditions:
        - "\\bprod\\b"
    run:
      command: ./permission/deny-prod-shell.ts
    effect: decide

post_tool:
  - name: review-test-writes
    description: Sanity-check generated test files.
    match:
      operation: file_write
      paths: ["**/*.test.ts", "**/*.test.tsx"]
    run:
      command: ./post-tool/review-test-writes.ts
    effect: add_context

stop:
  - name: enforce-typecheck
    description: Run typecheck before declaring done.
    run:
      command: pnpm
      args: ["typecheck"]
    effect: continue

pre_compact:
  - name: preserve-active-tasks
    description: Inject the active task list into the compacted summary.
    run:
      command: ./pre-compact/preserve-tasks.ts
    effect: add_context

targets:
  claude:
    hooks:
      InstructionsLoaded:
        - name: load-extra-claude-context
          run:
            command: ./claude/instructions-loaded.sh
          effect: add_context
```

## 13a. MCP

### 13a.1 Source shape

MCP server declarations live in a single family-level YAML file:

- Canonical: `mcp/mcp.yml`.
- Alias: `mcp/mcp.yaml`.
- If both exist, the capability is invalid.

### 13a.2 File shape

```yaml
servers:
  - name: <slug>
    description: <string>
    transport: stdio | http | sse
    # stdio fields:
    command: <string>
    args: [<string>, ...]
    env:
      <KEY>: <string>
    # http / sse fields:
    url: <https-url>
    headers:
      <Header-Name>: <string>
    only: [...]
    except: [...]
    targets:
      <TargetId>: { ... }

targets:
  <TargetId>:
    servers:
      - <native-entry>
```

### 13a.3 Server entry fields

| Field         | Type        | Required | Notes                                                              |
| ------------- | ----------- | -------- | ------------------------------------------------------------------ |
| `name`        | slug string | yes      | MCP server identity within the capability.                         |
| `description` | string      | no       | Short description.                                                 |
| `transport`   | enum        | yes      | `stdio` \| `http` \| `sse`.                                        |
| `command`     | string      | conditional | REQUIRED for `transport: stdio`. Forbidden for `http`/`sse`.    |
| `args`        | list        | no       | stdio only. argv vector.                                           |
| `env`         | mapping     | no       | stdio only. Environment variables for the spawned process.         |
| `url`         | URL string  | conditional | REQUIRED for `http`/`sse`. Forbidden for `stdio`.               |
| `headers`     | mapping     | no       | `http`/`sse` only. HTTP request headers.                           |
| `only`        | list        | no       | Entry-level applicability (§6).                                    |
| `except`      | list        | no       | Entry-level applicability (§6).                                    |
| `targets`     | mapping     | no       | Entry-level target extension data.                                 |

### 13a.4 Transport rules

- For `transport: stdio`, `command` is REQUIRED. `args` and `env` are
  OPTIONAL. `url` and `headers` MUST be absent.
- For `transport: http` or `transport: sse`, `url` is REQUIRED and MUST
  use the `https://` scheme unless the capability explicitly opts in to
  local dev via a `targets.<target>` flag (§22). `headers` is OPTIONAL.
  `command`, `args`, and `env` MUST be absent.

#### 13a.4.1 Placeholders and env substitution

The path placeholders defined in §13.6.3 (`${ACF_CAPABILITY_DIR}`,
`${ACF_PACKAGE_DIR}`, `${ACF_HOOK_DIR}`) MAY appear in `command`, `args`,
and `env` values for stdio servers, and in `url` and `headers` for
http/sse servers. They are substituted literally before emission.

Implementations MUST NOT perform additional environment-variable
expansion in canonical MCP fields. Authors who need runtime
host-environment substitution MUST use the target's native artifact
mechanism via `targets.<target>` extension data, or document the
required environment via `description`.

### 13a.5 Family-level `targets.<target>.servers`

`targets.<target>.servers` allows native-only MCP server entries that
have no canonical equivalent. Native entries reuse the canonical entry
shape and are validated by the target's MCP extension schema.

### 13a.6 Boundary

ACF declares MCP servers; the MCP protocol itself defines how clients
invoke tools, resources, and prompts. ACF MUST NOT redefine MCP
semantics. Where a host treats MCP servers differently (e.g. Claude
`.mcp.json`, Codex `mcp` config), the adapter emits the native artifact
from these canonical fields.

Discovery, tool listing, and runtime negotiation between MCP client and
server are out of scope for ACF.

### 13a.7 Example

`mcp/mcp.yml`:

```yaml
servers:
  - name: filesystem
    description: Local filesystem access.
    transport: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "${ACF_CAPABILITY_DIR}"
    env:
      LOG_LEVEL: info
    only: [claude, codex]

  - name: company-search
    description: Company doc search.
    transport: http
    url: https://mcp.example.com/search
    headers:
      Authorization: "Bearer placeholder"
    targets:
      claude:
        scope: project
```

## 14. Diagnostics, lossiness, and emission

### 14.1 Diagnostic shape

Implementations MUST emit structured diagnostics. Each diagnostic carries:

- `severity`: `error` | `warn` | `info` | `lossy`.
- `code`: a stable string identifier (e.g.
  `acf.manifest.invalid-name`).
- `message`: a human-readable message.
- `path`: a file path, where applicable.
- `location`: a line/column or YAML node pointer, where applicable.
- `targetId`: the affected target id, where applicable.
- `family`: the affected facet family, where applicable.
- `capability`: the capability name + version, where applicable.

Diagnostic codes are namespaced under `acf.` and family/section keys
(e.g. `acf.hook.match.operation.unknown`). Implementations SHOULD keep
codes stable across versions.

### 14.2 Severity behavior

- `error` — the affected unit MUST NOT be emitted; emission MAY proceed
  for other units. A capability with any `error` diagnostic is
  non-conforming for that emission.
- `warn` — the affected unit MAY be emitted; the implementation MUST
  surface the warning.
- `info` — informational; does not affect emission.
- `lossy` — the affected unit's emission lost portable semantics; the
  implementation MUST surface this and SHOULD include a description of
  the gap.

### 14.3 Lossiness

Adapters MUST emit a `lossy` diagnostic whenever:

- a canonical field cannot be represented by the target;
- an effect, scope operation, or trigger has no equivalent in the target;
- an ordering or surface guarantee cannot be preserved;
- a target-specific extension uses fields outside the registered schema;
- an asset reference cannot be transported to the target.

### 14.4 Native artifacts

Adapters MAY emit native artifacts in any format the target requires
(`plugin.json`, `.mcp.json`, TOML config, native hook scripts, etc.).
These artifacts are NOT ACF source. Implementations MUST NOT attempt to
read native artifacts as if they were canonical ACF inputs.

Install paths and native artifact layout per target are owned by the
target adapter and are documented in §22 and `IMPLEMENTATION.md`. SPEC
does not constrain on-disk artifact paths.

### 14.5 Runtime taxonomy boundary

Portable runtime-facing fields — instruction trigger scopes, hook event
selectors, future agent permission/access fields, MCP scope tags — MUST
NOT use target-native tool names as their portable vocabulary. They MAY
reference registry-defined identifiers for:

- operations (e.g. `file_read`, `file_write`, `shell`, `web_fetch`),
- events (e.g. `session_start`, `pre_tool`),
- permissions,
- message surfaces.

The taxonomy and its mappings are owned by a versioned runtime
taxonomy/registry that is intentionally outside this specification. §24
defines a small provisional operation set for `acf: 1`. Implementations
MUST diagnose unsupported or unmapped identifiers.

### 14.6 Diagnostic code namespaces

Implementations MUST follow this namespace convention:

| Namespace prefix                     | Meaning                                          |
| ------------------------------------ | ------------------------------------------------ |
| `acf.manifest.*`                     | Manifest validation.                             |
| `acf.skill.*`, `acf.agent.*`, etc.   | Facet family validation.                         |
| `acf.command.*`, `acf.instruction.*` | Per-family validation for commands/instructions. |
| `acf.hook.*`, `acf.mcp.*`            | Family-level validation.                         |
| `acf.markdown.*`                     | Markdown frontmatter and body validation.        |
| `acf.layout.*`                       | Capability directory layout violations.          |
| `acf.applicability.*`                | `only`/`except` cascade and unknowns.            |
| `acf.target.*`                       | Target id and extension validation.              |
| `acf.runtime.*`                      | Runtime taxonomy reference validation.           |
| `acf.assets.*`                       | Asset reference resolution.                      |
| `acf.resolve.*`                      | Resolver / `capabilities.yml` validation.        |
| `acf.capabilities-yml.*`             | Resolver source spec validation.                 |
| `acf.lock.*`                         | Lockfile validation.                             |
| `acf.emit.*`                         | Emission orchestrator and diff application.      |
| `acf.adapter.*`                      | Adapter-specific degradation diagnostics.        |
| `acf.cli.*`                          | CLI-host reported diagnostics.                   |
| `acf.scope.*`                        | Scope discovery diagnostics.                     |
| `acf.capability.*`                   | Cross-capability diagnostics (shadow, collision).|
| `acf.facet.*`                        | Cross-facet diagnostics (name mismatch, duplicates).|
| `acf.lossy.*`                        | Cross-cutting lossy emission diagnostics.        |

The authoritative code list (with severity, phase, trigger, source.path,
and recovery columns) is maintained in `IMPLEMENTATION.md` §11.2 as the
reader conformance matrix. Implementations MUST emit codes from that
matrix; they MAY emit additional, more specific codes under these
namespaces; they MUST NOT collapse listed codes into broader ones.

### 14.7 Visible management notices

An emitter that persists native artifacts MUST make ACF ownership visible to
people inspecting the destination without requiring them to discover the
machine sidecar.

- Every install root containing ACF-managed output MUST contain a generated
  `ACF-MANAGED.md` inventory. The inventory MUST identify each owning
  capability and its managed whole-file, shared-region, and fully-owned
  directory artifacts.
- Every top-level fully-owned artifact directory, such as an emitted skill
  directory, MUST contain one local `ACF-MANAGED.md`. Emitters MUST NOT place
  notices recursively in that directory's descendants.
- Shared directories and shared files MUST be represented only in the install
  root inventory. Emitters MUST NOT place an extra Markdown file in a host
  directory whose direct children have host-defined discovery semantics.
- Notice content MUST be deterministic and MUST NOT contain timestamps,
  absolute paths, source URLs, credentials, or other source-sensitive data.
- Notices are final emitted artifacts. They MUST NOT be written into canonical
  capability sources or resolved capability snapshots and MUST NOT contribute
  to capability hashes.
- `ACF-MANAGED.md` is reserved at notice locations. A source asset that maps to
  a reserved notice path MUST produce an `error` diagnostic. An existing
  destination notice that is not owned in `.acf-managed.json` MUST NOT be
  overwritten and MUST produce an `error` diagnostic.
- Notices MUST be tracked, drift-checked, reconciled, and removed through the
  same ownership sidecar as other emitted files. The install-root inventory is
  system-owned rather than owned by any one capability so it can be
  deterministically rebuilt after capability removal. A target-filtered emit
  MUST preserve inventory entries for artifacts still owned through unselected
  targets at the same install root.

The visible notices are explanatory only. `.acf-managed.json` remains the
machine authority for ownership and safe mutation.

## 15. Reserved fields and forward compatibility

The following are explicitly reserved for future spec versions and MUST
NOT be used in `acf: 1` capabilities:

- canonical facet `title` or `displayName`;
- canonical agent `tools`, `access`, `permissions` fields;
- canonical command `model`, `subtask`, `argumentHint` fields;
- top-level `tools/` facet family (tools are MCP servers, hooks, or
  target-native);
- a full canonical event payload schema;
- canonical MCP `scope: project | user | global` field (MAY be added
  later if targets converge);
- canonical instruction `priority`, `before`, `after`;
- hook entry `priority`, `before`, `after`.

Future spec versions MUST remain backward-compatible within `acf: 1` for
additive fields under unknown-field diagnostics (§4.2). Breaking changes
require `acf: 2`.

## 16. Asset references

### 16.1 Goals

Asset references let facets reference files inside or outside the
capability so adapters can transport them with emitted artifacts.

### 16.2 Reference forms

Two reference forms are recognized:

**Markdown body references.** A facet body or `ACF.md` body MAY use
standard CommonMark image/link syntax to reference local files:

```md
![Architecture diagram](./assets/architecture.png)

See [the worked example](./assets/example.md).
```

References are interpreted as paths relative to the file containing the
reference. Implementations MUST walk the Markdown body to collect such
references.

**Explicit frontmatter `assets`.** Frontmatter MAY include an `assets`
list of paths relative to the facet's source file (Markdown form) or to
the facet directory (directory form):

```yaml
assets:
  - ./screenshots/before.png
  - ./screenshots/after.png
```

Explicit references are useful for files the Markdown body does not
link directly (e.g. scripts, fixtures).

### 16.3 Resolution rules

- Paths use forward slashes. Backslashes are invalid.
- Paths MUST stay inside the capability root. Implementations MUST emit
  `error` for any reference that resolves outside the capability root
  (path traversal).
- Implementations MUST emit `error` for references whose target file is
  missing.
- Absolute paths and URLs in Markdown body references are NOT treated as
  ACF assets. They pass through unmodified to the emitted artifact.

### 16.4 Emission

Adapters MUST copy or otherwise transport all referenced assets to the
emission destination such that the emitted Markdown body resolves them
correctly in the target host. If the target host cannot host
co-located assets, the adapter MUST emit a `lossy` diagnostic.

Adapters MAY rewrite reference paths in emitted Markdown to match the
target host's expected layout.

## 17. Resolution scopes

### 17.1 Scope locations

ACF defines two well-known resolution scopes loaded by hosts and
adapters:

| Scope     | Capability root                | Config file                      |
| --------- | ------------------------------ | -------------------------------- |
| user      | `~/.agents/capabilities/`      | `~/.agents/capabilities.yml`     |
| project   | `./.agents/capabilities/`      | `./.agents/capabilities.yml`     |

`~/` is the user's home directory. `./` is the current project working
directory.

### 17.2 What's autoloaded

Implementations MUST autoload all capabilities present under
`~/.agents/capabilities/` and `./.agents/capabilities/` at runtime.

Each immediate subdirectory containing an `acf.yml` (or `acf.yaml`) is
treated as one capability. Subdirectories without a manifest are
ignored with an `info` diagnostic.

### 17.3 `capabilities.yml` purpose

`capabilities.yml` is OPTIONAL. It is the declarative source for fetching
remote and local capabilities into the scope's `capabilities/` directory.

`capabilities.yml` does NOT change what is loaded at runtime; it
describes what `caplet update` (or an equivalent resolver) should place
into the scope's `capabilities/` directory.

### 17.4 `capabilities.yml` shape

```yaml
acf: 1                # spec version of this file

capabilities:
  - source: github:mattpocock/skills
    ref: v1.5.6
    path: skills       # optional: subdirectory inside the source repo
    include:
      skills: ["pocock-handoff", "pocock-review"]
    rename:
      "pocock-review": "review-modified"

  - source: github:my-org/private-tools
    ref: main
    capabilities: [engineering, hardware/*] # optional collection selectors
    auth: gh           # optional: auth method override (§17.5)

  - source: git:git@github.com:vendor/pack.git
    ref: 5ec15aa
    except: [pi]

  - source: path:./../my-private
    # local development path; resolved relative to capabilities.yml
```

### 17.5 `capabilities.yml` fields

| Field           | Type           | Required | Notes                                                                |
| --------------- | -------------- | -------- | -------------------------------------------------------------------- |
| `acf`           | integer        | yes      | MUST be `1`.                                                         |
| `capabilities`  | list           | yes      | List of capability source entries.                                   |

Each entry under `capabilities[]`:

| Field      | Type    | Required | Notes                                                                          |
| ---------- | ------- | -------- | ------------------------------------------------------------------------------ |
| `source`   | string  | yes      | Source identifier (§18).                                                       |
| `ref`      | string  | conditional | Required for `github:` and `git:` sources. Branch, tag, or SHA.             |
| `path`     | string  | no       | Subdirectory inside the source to use as the selected source root.             |
| `capabilities` | string or non-empty list | no | Exact/glob discovered capability selectors; manifested collections use paths relative to `acf/`, synthesized skills use capability names; omitted selects all. |
| `auth`     | enum    | no       | `gh` \| `ssh` \| `token` \| `anonymous`. Override resolver default.            |
| `include`  | mapping | no       | Family-keyed allowlist of facet names. Globs allowed. Implicit `*`.            |
| `exclude`  | mapping | no       | Family-keyed denylist of facet names. Globs allowed.                           |
| `rename`   | mapping | no       | Map `<old-name>: <new-name>` for collision resolution. Applies post-filter.    |
| `only`     | list    | no       | Entry-level target applicability (§6).                                         |
| `except`   | list    | no       | Entry-level target applicability (§6).                                         |

`include`/`exclude` family keys are the canonical facet family names
(`skills`, `agents`, `commands`, `instructions`, `hooks`, `mcp`). For
hooks and MCP, the values match against hook entry `name` or MCP server
`name`.

### 17.6 Cross-capability collisions

After resolution and applicability filtering, the effective set of
facets per scope MUST have unique `(family, name)`.

Collisions are resolved by these rules, in order:

1. **Project shadows user.** A project-scope facet with the same
   `(family, name)` as a user-scope facet wins; the user-scope facet is
   skipped with an `info` diagnostic.
2. **Within one scope:** if `(family, name)` collides across
   capabilities, emission MUST fail with an `error` diagnostic.
   Resolution is the author's responsibility via `rename` or `exclude`
   in `capabilities.yml`.

ACF does NOT define implicit "first-wins" or alphabetical resolution
within a scope. Explicit `rename` or `exclude` is REQUIRED.

### 17.7 Scope selection at emission

Implementations MUST support three scope-selection modes when emitting:

- `all` (default) — process both scopes; emit per-scope artifacts to
  the scope's native install location.
- `user` — process only the user scope.
- `project` — process only the project scope.

When running outside any project, `all` and `project` fall back to
`user` only, with an `info` diagnostic.

Adapters use the source scope of each capability to choose the target
native install location (§22).

## 18. Source types

`capabilities.yml` recognizes the following source forms:

### 18.1 `github:<owner>/<repo>`

GitHub shorthand. Equivalent to `git:https://github.com/<owner>/<repo>.git`.
`ref` is REQUIRED and MAY be a branch, tag, or commit SHA. Resolver MAY
choose shallow / blobless / sparse fetch (§19).

### 18.2 `git:<url>`

Arbitrary Git URL. Supports HTTPS and SSH forms. `ref` is REQUIRED.

### 18.3 `path:<location>`

Local filesystem path:

- absolute (`path:/abs/path/to/pack`),
- home-relative (`path:~/Programming/my-pack`),
- relative to the directory containing `capabilities.yml`
  (`path:./../my-private`).

`path:` sources are user-local and not shareable across machines.
Resolvers MUST NOT include `path:` entries in the lockfile content hash.

### 18.4 Credentials

Source URLs MUST NOT carry credentials, because `capabilities.yml`, the lockfile, caches, plans and diagnostics all repeat them. Resolvers MUST reject, both when a source is added and when it is resolved, a `git:` URL whose authority contains userinfo (an SSH user name without a password, such as `ssh://git@host/repo.git` or `git@host:repo.git`, is not a credential) or whose query or fragment holds a credential-looking parameter (for example `token`, `access_token`, `password`, `secret`, a signature, or a well-known token value such as `ghp_…`). The rejection is the `error` diagnostic `acf.source.credential-in-url`; its message names the URL with every credential part masked, and the credential is never written to any file or output. Authentication instead comes from the environment: `github:` sources use `GITHUB_TOKEN` when it is set, and `git:` sources use SSH or the user's git credential configuration.

### 18.5 Forward compatibility

Future spec versions MAY define additional source schemes (e.g.
`registry:`, `acf:`). Unknown source schemes MUST emit
`acf.resolve.unknown-source-scheme` of severity `error`.

## 19. Lockfile

### 19.1 Filename and location

The lockfile is named `capabilities.lock` and lives next to its
`capabilities.yml`.

### 19.2 Purpose

The lockfile records resolved identity, version, and content integrity
for each entry in `capabilities.yml`. It exists so that:

- a re-fetch produces a byte-identical (modulo timestamps) tree;
- multiple machines pulling the same capability arrive at the same code;
- a project repository committing both files reproduces the same
  effective capability set.

### 19.3 Lockfile shape

```yaml
acf: 1
generatedBy:
  name: caplet
  version: 0.1.0
generatedAt: "2026-05-13T12:34:56Z"

entries:
  - source: github:mattpocock/skills
    ref: v1.5.6
    resolvedSha: "abc123…"
    resolvedAt: "2026-05-12T10:00:00Z"
    capabilityHash: "sha256-…"
    capabilityNames: ["pocock-skills"]
    include:
      skills: ["pocock-handoff", "pocock-review"]

  - source: git:git@github.com:vendor/pack.git
    ref: 5ec15aa
    resolvedSha: "5ec15aa…"
    capabilityHash: "sha256-…"
    capabilityNames: ["vendor-pack"]
```

### 19.4 Fields

| Field             | Type   | Required | Notes                                                              |
| ----------------- | ------ | -------- | ------------------------------------------------------------------ |
| `acf`             | int    | yes      | MUST be `1`.                                                       |
| `entries[].source` | string | yes     | Mirrors `capabilities.yml`.                                        |
| `entries[].ref`   | string | yes      | Mirrors `capabilities.yml`.                                        |
| `entries[].resolvedSha` | string | conditional | Required for `github:` / `git:`. Forbidden for `path:`.   |
| `entries[].resolvedAt`  | RFC3339 string | no | Time the resolver recorded the SHA.                         |
| `entries[].capabilityHash` | string | yes  | `sha256-<hex>` of the materialized capability content (§19.5). |
| `entries[].capabilityNames` | list | yes   | Final names of capabilities produced (one entry MAY produce multiple). |
| `entries[].capabilities` | list | no | Normalized collection selectors from `capabilities.yml`. |
| `entries[].selectorsByCapability` | mapping | no | Final capability name to exact inventory selector, used for selector-safe removal. |
| `entries[].include` / `exclude` / `rename` | mapping | no | Mirrors `capabilities.yml`.                          |

### 19.5 Hash computation

`capabilityHash` is computed over the materialized capability tree on
disk after `path:`, capability selection, `include`/`exclude`/`rename`, and
applicability filtering, but BEFORE any adapter emission. The hashing
algorithm is normative and MUST be stable for `acf: 1`:

1. Enumerate every regular file under the materialized capability root
   (recursive). Symlinks MUST be rejected by the resolver before hashing;
   special files (devices, sockets, fifos) MUST NOT appear.
2. Compute each file's path relative to the capability root using
   forward-slash separators. Paths MUST be NFC-normalized Unicode.
3. Sort the relative-path list lexicographically by byte value.
4. Initialize a SHA-256 hash. For each file in sorted order, update the
   hash with: the UTF-8 bytes of the relative path, a single `0x00` byte,
   the exact file bytes, a single `0x00` byte.
5. The lockfile value is `sha256-<lowercase-hex>` of the final digest.

Implementations MUST NOT include file mode, timestamps, ownership, or
extended attributes in the hash. File contents are hashed byte-for-byte
with no line-ending normalization.

`path:` sources MUST NOT be included in `capabilityHash`-based
reproducibility guarantees; the lockfile records only `source` and
optional `capabilityNames` for `path:` entries.

### 19.6 Payload digest

`payloadDigest` is an integrity digest of the same materialized tree as
`capabilityHash`. Unlike the v1 hash it frames every length and includes
the executable bit, so it changes when only a file mode changes and cannot
confuse where a path ends and its content begins. The algorithm is
normative:

1. Enumerate every regular file under the materialized capability root as
   in §19.5 steps 1–2. Symlinks and special files MUST be rejected. Two
   paths that are equal after NFC normalization MUST be rejected.
2. Sort the files by the bytes of their UTF-8 NFC relative paths.
3. Initialize a SHA-256 hash. For each file in sorted order, update the
   hash with this frame:
   - the entry kind, one byte: `0x01` for a regular file (the only kind a
     snapshot contains; other values are reserved);
   - the path length in bytes as an unsigned 64-bit big-endian integer,
     then the UTF-8 bytes of the NFC relative path;
   - the executable bit, one byte: `0x01` when the owner execute
     permission (`0o100`) is set, else `0x00`;
   - the content length in bytes as an unsigned 64-bit big-endian
     integer, then the exact file bytes.
4. The value is `acf-tree-2:sha256:<lowercase-hex>` of the final digest.

Timestamps, ownership, extended attributes and permission bits other than
the owner execute bit MUST NOT be included.

### 19.7 Drift handling

When `capabilities.yml` and `capabilities.lock` disagree:

- `caplet update` (or equivalent) MUST re-resolve from `capabilities.yml`
  and update `capabilities.lock`.
- `caplet apply` (or equivalent) MUST emit a `warn` diagnostic and
  refuse to proceed without an explicit `--update-lock` (or equivalent)
  flag.

This guarantees emission never silently runs against an updated
manifest without a fresh lockfile.

## 20. Repository layouts

A repository MAY host capabilities in two layouts. The two are mutually
exclusive:

### 20.1 Single-capability repository

```txt
some-repo/
  acf.yml
  skills/
  agents/
  ...
```

`acf.yml` at the repository root indicates the entire repository is one
capability. Resolution with no `path:` lands at the repository root.

### 20.2 Multi-capability repository

```txt
some-repo/
  acf/
    pack-one/
      acf.yml
      skills/
    nested/
      pack-two/
        acf.yml
        agents/
```

An `acf/` directory at the selected source root may contain capabilities at
arbitrary depth. Each capability is the directory containing its own
`acf.yml`. The optional source-entry `path` first changes the selected source
root; `capabilities` selectors then select paths beneath that root's `acf/`.

### 20.3 Unmanifested skill import

When neither a root `acf.yml` nor an `acf/` collection exists,
implementations MAY import bare Agent Skills repositories. Discovery MUST use
the first matching layout in this order and MUST NOT combine layouts:

1. a root `SKILL.md`,
2. immediate `skills/<directory>/SKILL.md` children,
3. immediate `<directory>/SKILL.md` children at the selected source root.

Each discovered skill is synthesized as one independent capability named from
its validated skill frontmatter. Generated capability state MUST be staged
outside the source checkout; a resolver MUST NOT write an `acf.yml` or other
metadata into a local `path:` source. The generated version identifies the
capability as unmanifested and SHOULD include the resolved source revision.

Imported skill contents include every recursively contained regular file
except hidden paths, dependency trees such as `node_modules`, generated
`ACF-MANAGED.md` notices, symbolic links, and special files. This implicit
asset rule applies only to synthesized imports; authored ACF capabilities keep
their declared/reference-driven asset behavior.

If a repository has either manifested layout, manifested discovery takes
precedence and bare-skill import MUST NOT run.

### 20.4 Selecting a capability with `path:`

`path:` in `capabilities.yml` selects a subdirectory of the source.
Resolver behavior:

- If the path is exactly a directory containing an `acf.yml`, that one
  capability is materialized.
- If the path is an `acf/` directory or a parent of multiple `acf.yml`
  files, every contained capability is materialized.
- If the path resolves to nothing, the entry fails with an `error`
  diagnostic.

### 20.5 Selecting capabilities from a collection

A source entry MAY declare `capabilities` as one selector string or a non-empty
list. Scalar syntax normalizes to a one-item list. Omission selects every
discovered capability. Manifested collections match selectors against normalized
POSIX paths relative to the selected source root's `acf/` directory. A direct
manifested capability and a synthesized skill use their validated capability
name as the selector:

- an exact path matches one complete capability path;
- `*` matches zero or more characters within one segment;
- `?` matches exactly one character within one segment;
- a `**` segment matches zero or more path segments.

Only manifested capability roots and synthesized skills discovered by §§20.1–20.3
are candidates. Every selector MUST match at least one candidate; overlapping matches are deduplicated.
Absolute paths, backslashes, empty segments, `.`/`..` segments, and `**` embedded
inside another segment are invalid. Invalid or unmatched selection MUST NOT
change existing snapshots or the lockfile.

`path` is applied first, then `capabilities`, then facet-level `include` and
`exclude`. Lock entries preserve both normalized selector intent and sorted final
capability names. Selector drift MUST trigger
reconciliation in modes that permit fetching, including removal of snapshots no
longer selected after a fully successful resolution.

## 21. Caplet command surface (informative)

This section is informative. The reference CLI (`caplet`) provides:

| Command             | Purpose                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `caplet init`       | Create a project `.agents/capabilities.yml`.                                              |
| `caplet add`        | Add source entries to `capabilities.yml`, resolve, and apply (`--no-apply` edits only).   |
| `caplet remove`     | Remove a capability selection or entry and its managed output.                            |
| `caplet update`     | Re-resolve sources to their latest refs, refresh the lockfile, and apply (`--no-apply`).  |
| `caplet apply`      | Resolve declared sources as needed and reconcile native artifacts (`--dry-run`, `--offline`, `--frozen`). |
| `caplet status`     | Summarize scopes, capabilities, and pending changes; the default with no command.         |
| `caplet list`       | List installed capabilities across scopes (alias `caplet ls`).                            |
| `caplet show`       | Show one capability's contents and target support.                                        |
| `caplet check`      | Validate capabilities and `capabilities.yml` and detect stale outputs without writing.    |
| `caplet doctor`     | Check git, `.agents/` access, target registry, and lockfiles.                             |
| `caplet completion` | Print shell completions.                                                                  |

Earlier command names remain as deprecated aliases: `inspect` runs `show`,
`diff` runs `apply --dry-run` (a plan of emitted-file changes, not a lockfile
diff), `emit` runs `apply --offline`, and `fetch` runs `update --no-apply`.

Other tools MAY implement a different command surface; the above is the
reference shape used in `IMPLEMENTATION.md`.

## 22. Target adapters

### 22.1 Target registry

The target registry is owned by `IMPLEMENTATION.md`. It declares, per
target:

- target id (slug);
- canonical capability support level per family;
- per-family extension schema;
- canonical-to-native mapping tables for hook events and instruction
  triggers;
- install-path conventions per scope.

ACF v1 declares the following targets as canonical:

- `claude` — Claude Code (Anthropic).
- `codex` — OpenAI Codex.
- `cursor` — Cursor.
- `opencode` — OpenCode.
- `pi` — Pi (oh-my-pi / SessionLoom ecosystem).

### 22.2 Install-path conventions

Install paths are NOT specified normatively in SPEC. Adapters define
them per target and per scope. As an informative starting point:

| Target     | User scope path        | Project scope path     | Notes                                  |
| ---------- | ---------------------- | ---------------------- | -------------------------------------- |
| `claude`   | `~/.claude/`           | `./.claude/`           | Plugins, hooks, MCP.                   |
| `codex`    | `~/.codex/`            | `./.codex/`            | Plugins/apps, MCP.                     |
| `cursor`   | `~/.cursor/`           | `./.cursor/`           | Rules, MCP.                            |
| `opencode` | `~/.opencode/`         | `./.opencode/`         | Plugins, agents, MCP.                  |
| `pi`       | `~/.pi/`               | `./.pi/`               | Skills, agents, hooks, MCP.            |

Targets that do not support per-project install MUST declare `null` for
that scope and emit a `lossy` diagnostic if asked to emit there.

**Skill family install roots (canonical + optional native emit).** The
`skill` family has an ecosystem-shared canonical install root at
`~/.agents/skills/` (user scope) and `./.agents/skills/` (project scope).
For each requested scope, adapters MUST emit every supported skill to the
canonical root. If the target declares a native skill install path for
that scope, adapters MUST also emit the same skill to that native
directory. The default behavior is dual-emit for targets with native skill
install paths, except when the target already discovers the canonical root.
Such targets (currently Codex, OpenCode, and Pi) MUST default to canonical-only emission to avoid
duplicate skill-name warnings, while allowing users to explicitly enable the
native destination. Targets without native skill install paths MUST NOT skip
skills merely because no native location exists.

Each destination is an independent `file`-owned artifact; implementations
MUST apply and remove the canonical and native copies idempotently.
Referenced skill assets follow §16.4 and MUST be transported to every
emitted skill destination so Markdown paths resolve in each copy.
Implementations MAY offer configuration to suppress canonical or native
emission for a target. Native emission defaults to `false` when the target
discovers the canonical root and to `true` otherwise. The canonical/native
split applies only to skills in `acf: 1`; other facets remain per-target.

### 22.3 Hook event mapping

Canonical hook types map to target-native events as follows
(informative; the normative table lives in the target registry):

| ACF hook type         | Claude              | Codex              | OpenCode                   | Cursor              | Pi                  |
| --------------------- | ------------------- | ------------------ | -------------------------- | ------------------- | ------------------- |
| `session_start`       | `SessionStart`      | `SessionStart`     | `session.start`            | (none — lossy)      | `session_start`     |
| `user_prompt_submit`  | `UserPromptSubmit`  | `UserPromptSubmit` | `prompt.before`            | (none — lossy)      | `prompt_submit`     |
| `pre_tool`            | `PreToolUse`        | `PreToolUse`       | `tool.execute.before`      | (none — lossy)      | `tool_call_before`  |
| `permission_request`  | (PreToolUse w/ ask) | `PermissionRequest`| `permission.asked`         | (none — lossy)      | (none — lossy)      |
| `post_tool`           | `PostToolUse`       | `PostToolUse`      | `tool.execute.after`       | (none — lossy)      | `tool_call_after`   |
| `stop`                | `Stop`              | `Stop`             | `agent.stop`               | (none — lossy)      | `stop`              |
| `pre_compact`         | `PreCompact`        | (none — lossy)     | `session.compact.before`   | (none — lossy)      | `pre_compact`       |

Adapters MUST emit a `lossy` diagnostic for any "(none — lossy)" cell.

### 22.4 Instruction trigger support

Instruction trigger support is summarized as one of:

- `full` — host supports the trigger semantics natively.
- `partial` — host supports a subset; the adapter MUST emit a `lossy`
  diagnostic detailing the gap.
- `none` — host has no equivalent; the adapter MAY fall back to
  always-on or skip the instruction with a `lossy` diagnostic.

`acf: 1` adapter support (informative):

| Trigger              | Claude  | Codex   | OpenCode | Cursor  | Pi      |
| -------------------- | ------- | ------- | -------- | ------- | ------- |
| `assistant_output`   | partial | partial | partial  | none    | full    |
| `operation_input`    | full    | full    | full     | none    | full    |
| `operation_result`   | partial | partial | partial  | none    | partial |
| `file_context`       | full    | full    | partial  | partial | partial |

### 22.5 MCP install location

| Target     | MCP artifact                              | Scope             |
| ---------- | ----------------------------------------- | ----------------- |
| `claude`   | `.mcp.json` (project) / user MCP settings | user, project     |
| `codex`    | `codex.mcp.json` (or `mcp` config block)  | user, project     |
| `opencode` | `opencode.json` `mcp` section             | user, project     |
| `cursor`   | `.cursor/mcp.json`                        | user, project     |
| `pi`       | `mcp.json` per Pi config                  | user, project     |

### 22.6 Effect mapping

Per-target effect support is declared in the target registry. When a
host cannot honor an effect, the adapter MUST emit a `lossy` diagnostic
and degrade as follows:

| Effect          | Degradation                                               |
| --------------- | --------------------------------------------------------- |
| `observe`       | Always supported.                                         |
| `block`         | Degrade to `observe`; emit `lossy`.                       |
| `add_context`   | Degrade to `observe`; emit `lossy`.                       |
| `continue`      | Degrade to `observe`; emit `lossy`.                       |
| `block_result`  | Degrade to `observe`; emit `lossy`.                       |
| `decide`        | Degrade to `observe`; emit `lossy`.                       |

### 22.7 Adapter contract

Adapter contract semantics (informative summary; the concrete TypeScript
definition is normative in `IMPLEMENTATION.md` §4.2):

- An adapter is a pure function from a resolved capability plus emit
  options plus a read-only filesystem port to a list of file diffs and
  diagnostics. Adapters MUST NOT write to disk directly; the caplet host
  (or any other emit driver) applies diffs.
- A diff carries `path`, `before` (current content or `null` if absent),
  `after` (desired content or `null` if delete), and `owns` — a list of
  ACF-owned regions inside the file. Ownership is either whole-file or
  a structural pointer (JSON pointer, YAML pointer, TOML pointer, or a
  named region marker).
- The emit driver MUST record ownership in a per-install-root sidecar
  named `.acf-managed.json` (canonical shape in `IMPLEMENTATION.md`
  §4.2.2). Each entry records the target, carrier, capability, facet,
  path, owned regions, content hash and, for whole files, the file mode.
  The sidecar enables clean re-emit, removal of stale ACF pointers, and
  drift detection without nuking user-authored content in the same file.
- When applying a plan, the emit driver MUST check that each file still
  matches the state the plan was computed from. A file that changed in
  between is left untouched, keeps its sidecar entry, and is reported as
  drift. On each apply, ACF-owned paths and regions no longer in the
  desired plan are removed, even when their capability and facet remain.
- Every write and delete MUST resolve, after following existing parent
  directories, inside the declared output root of its target and scope.
  A symlinked parent that leads outside fails that target before any
  write and names the offending path.
- Adapters MUST preserve unowned content byte-for-byte in any file they
  patch. Reformatting outside owned regions is forbidden.
- Adapters MUST emit the listed degradation diagnostics (`acf.adapter.*`,
  `acf.lossy.*`) for every effect, hook event, instruction trigger, MCP
  transport, or facet family they cannot fully honor.

## 22b. Direct ACF consumers (informative)

A host MAY consume ACF capabilities directly, without going through an
emit adapter, by reading capabilities at runtime via the published SDK.
Direct consumers operate on the resolved capability tree (§17) in place,
the same tree that adapters consume.

In `acf: 1` there are no direct consumers; `pi` and `opencode` are emit
targets. Direct-consumer extensions for those hosts are planned but
deferred. The rules below define the semantics that apply once they
ship; they are informative for `acf: 1`.

- A direct consumer reads `~/.agents/capabilities/` and the nearest
  project's `./.agents/capabilities/` via `@caplet/sdk`. It MUST apply the
  same applicability cascade (§6.4) as adapters, with its own target id
  passed explicitly.
- A direct consumer MUST handle each facet family natively at runtime
  (loading skills, registering hooks, mounting MCP servers, etc.). For
  any facet family it cannot handle, it MUST emit
  `acf.runtime.family-unsupported` (lossy) at the time the facet would
  have applied.
- For instruction activation, a direct consumer MUST emit
  `acf.runtime.trigger-unsupported` (lossy) once per session when an
  instruction declares a trigger the consumer does not implement, and
  MUST NOT silently treat the instruction as always-on.
- A direct consumer MUST NOT install or duplicate native artifacts that
  the corresponding emit adapter would produce. If both a direct
  consumer extension and an emit adapter are present for the same host,
  caplet `emit --target <host>` SHOULD emit `acf.adapter.superseded`
  (info) and skip emission, deferring to the extension.

## 23. Naming aliases

Cross-ecosystem naming hints for searchability (informative):

| ACF term       | Other ecosystems                                     |
| -------------- | ---------------------------------------------------- |
| Capability     | "pack", "module", "agent kit" (informal)             |
| Facet          | "item", "rule", "entry" (informal)                   |
| Skill          | "Agent Skill" (Anthropic), "skill" (npx skills)      |
| Agent          | "subagent", "sub-agent", "persona", "agent profile" |
| Command        | "slash command", "prompt", "macro"                  |
| Instruction    | "rule" (Cursor, Cline, oh-my-pi), "ambient context", "rulebook entry" |
| Hook           | "hook" (Claude, Codex, OpenCode), "lifecycle handler" |
| MCP server     | "MCP server", "MCP" (Model Context Protocol)        |

`CONTEXT.md` carries the authoritative aliases list.

## 24. Provisional operation set

To make `match.operation` and instruction `scope.operation` validatable
before the runtime taxonomy is published, `acf: 1` defines this
provisional set of operation identifiers:

| Operation         | Meaning                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `shell`           | Shell / system command execution.                                  |
| `file_read`       | Read file content from the workspace.                              |
| `file_write`      | Create or overwrite file content in the workspace.                 |
| `file_edit`       | Modify file content in place (edit-style operations).              |
| `web_fetch`       | Fetch content over HTTP(S).                                        |
| `web_search`      | Issue a web search query.                                          |
| `code_search`     | Search code in the workspace.                                      |
| `doc_search`      | Search vendor / library documentation.                             |
| `agent_delegate`  | Invoke another agent or subagent.                                  |
| `task_management` | Manage durable task lists or todo state.                           |
| `mcp`             | Any MCP-mediated tool call.                                        |
| `context`         | Context capture / compression / memory operations.                 |
| `any`             | Alias for "any operation"; matches all of the above.               |

Implementations MUST accept any of these identifiers wherever
`operation` is permitted (§12.9, §13.5). Implementations MUST emit
`acf.runtime.unknown-operation` of severity `error` for identifiers
outside this set unless the runtime taxonomy registry adds them.

A future sibling specification MAY replace this set wholesale.
`capability.yml` and capability files conforming to that spec version
MUST declare a higher `acf` version.

## 25. Open questions

The following remain genuinely open and tracked in `IMPLEMENTATION.md`:

- Whether instruction triggers need additional named triggers beyond the
  v1 four (e.g. `user_message`, `assistant_thinking`).
- Exact shape, versioning, and ownership of the runtime taxonomy/registry,
  and how the provisional operation set in §24 migrates into it.
- Whether ACF publishes a generic hook runner / instruction runtime
  alongside the reference adapters, or leaves runtimes to hosts.
- Whether canonical agent `tools`/`access`/`permissions` and canonical
  command `model`/`subtask`/`argumentHint` are added in a future spec
  version after the runtime taxonomy stabilizes.
- Whether MCP server entries gain a canonical `scope: project | user |
  global` field once targets converge.
- Whether Markdown-backed facets need a separate `title`/`displayName`
  field distinct from the stable `name` slug.
- Whether `path:` source resolution gains a watch-mode for local
  development (`caplet dev`).
