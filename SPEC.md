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
Only `descriptive` and `granting` fields may be emitted with a gap; a gap in
a `restricting` or `functional` field is a refusal (§14.3).

**Safety Class** — The class the target registry gives every core field,
value condition, and known native key: `restricting`, `granting`,
`functional`, or `descriptive` (§14.3). Native keys the registry does not
know are `unclassified`.

**Native Extra** — Target-native data in the target's own spelling, authored
or imported under `targets.<target>.native` or in a `native/<target>/` tree
and emitted verbatim to that target only (§7.5–§7.8).

**Carrier** — The native shape in which a target receives a capability:
`plugin` (one generated host plugin package per capability) or `loose`
(files and config entries in the host's own discovery locations). Claude
has both; the other `acf: 1` targets are loose only (§22.8).

**Foreign Source** — A source whose selected root is an Agent Plugins 1.0
package, a Claude plugin, or bare Agent Skills instead of native ACF. A
format reader projects it into a capability and preserves the original
package (§20.6).

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
enumerates known targets, their carriers, their per-field support cells
(§14.3), family-level support for the families without field tables, their
extension schemas, and their install-path conventions (§22,
`IMPLEMENTATION.md`).

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
| `authors`     | list                  | no       | `{name, email?, url?}` entries or legacy strings (§4.2.1). |
| `license`     | SPDX string           | no       | SPDX identifier or `"LicenseRef-…"`.                   |
| `homepage`    | URL string            | no       | HTTP(S) URL.                                           |
| `repository`  | URL string            | no       | HTTP(S) or SSH URL.                                    |
| `keywords`    | list of string        | no       | Lowercase tags for indexing.                           |
| `only`        | list of TargetId      | no       | Capability-level target applicability (§6).            |
| `except`      | list of TargetId      | no       | Capability-level target applicability (§6).            |
| `targets`     | mapping by TargetId   | no       | Extension data, native extras, package values (§7).    |

Implementations MUST reject manifests that contain top-level fields not
listed above unless those fields are defined as forward-compatible
extensions in a later spec version, in which case they MUST emit an
`info` diagnostic.

#### 4.2.1 Authors

An `authors` entry is either a mapping with a required `name` and optional
`email` and `url`, or a free-form string. String entries remain valid for
manifests written before structured authors and MUST be kept unchanged in
the capability, so validation, the lockfile, `capabilityHash`, and the
payload digest of an existing manifest do not change. A writer of a format
with structured authors decodes a string as `{name, email}` only when it has
the form `<name> <<email>>` and re-encoding the parts reproduces the string
byte for byte; any other string becomes `{name: <string>}`.

#### 4.2.2 Native package manifests

Every package metadata field is `descriptive`. The Claude plugin writer
(§22.8) maps them into `.claude-plugin/plugin.json`, and the Claude plugin
and Agent Plugins readers (§20.6) apply the inverse mapping:

| Field                                          | Claude plugin `plugin.json`                       | Agent Plugins 1.0 `plugin.json` (read) |
| ---------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| `name`                                         | `name`                                            | `name`                                 |
| `version`                                      | `version` with the build suffix of §22.8.2        | `version`                              |
| `description`, `license`, `homepage`, `keywords` | same key                                        | same key                               |
| `repository`                                   | `repository` (string)                             | `repository`                           |
| `authors`                                      | first entry to `author`; further entries dropped (`lossy`) | `author` to a one-entry list  |

A structured author keeps `name`, `email`, and `url`. A string author becomes
`author.name`, except that a string of the exact form `Name <email>` becomes
`name` and `email`.

A target-specific value for a key the writer generates from package metadata
is declared with `targets.<target>.package` (§7.6). Native manifest fields
with no core meaning (for Claude: `displayName`, `icon`, listing URLs,
`metadata`, `defaultEnabled`, `dependencies`, `settings`, `userConfig`,
`channels`, component path overrides) are authored with package-level
`targets.claude.native` and emitted verbatim into the generated manifest;
Claude, not caplet, acts on them.

### 4.3 Example

```yaml
acf: 1
name: example-pack
version: 0.1.0
description: A sample ACF capability.
license: MIT
authors:
  - name: Alice
    email: alice@example.com
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

It carries target-only data that has no portable canonical representation,
in three forms: registry-typed extension options, inline native extras
(`native`, §7.5), and per-target package values (`package`, §7.6). A
`native/<target>/` tree carries file-level native extras (§7.7). None of
them is a deep merge patch over canonical fields, a replacement object for
canonical data, or a place to restate mappings that the adapter already
knows from canonical fields.

The portable core holds a meaning only when at least two tools implement it
with documented or verified equivalent semantics: the same value domain,
default, effect, and scope after a lossless encoding mapping. A shared key
name with a weaker effect does not count. Every other meaning, including a
meaning whose core contract is deferred, is a native extra of each target
that has it.

### 7.2 Where extension data is allowed

`targets.<target>` MAY appear at:

- the manifest top level (§4.2);
- the frontmatter of any Markdown-backed facet (§9–§12);
- any entry under a hook bucket in `hooks/hooks.yml`;
- any entry under `servers[]` in `mcp/mcp.yml`;
- the family-level `targets.<target>` block in `hooks/hooks.yml` (§13.9)
  and `mcp/mcp.yml` (§13a.5).

`targets.<target>.package` is allowed only at the manifest top level.

### 7.3 Validation

Implementations MUST:

- reject unknown target ids and emit a diagnostic of severity `error`;
- look up the per-target, per-family extension schema in the target
  registry;
- validate the extension payload against that schema;
- emit a diagnostic when a target has no extension schema declared for the
  current family or location, and treat the payload as invalid;
- emit a diagnostic when extension fields are unknown to the schema;
- validate and classify the keys inside `native` that the registry knows,
  reporting a value outside the key's native value domain as the `error`
  `acf.extras.native-value-invalid`, and accept unknown keys with the
  `info` diagnostic `acf.extras.unclassified`;
- report `acf.core.pending` (`info`) for a `native` key whose meaning is
  pending core, naming the future core field (§7.8).

### 7.4 No deep merge

Implementations MUST NOT silently merge `targets.<target>` over canonical
fields. Adapters interpret extension data however the target requires, but
the canonical fields remain authoritative for portable semantics. A
`native` key that the writer also generates from a core field (for example
`targets.claude.native.description` on a skill) MUST be the `error`
`acf.extras.conflict`.

### 7.5 Inline native extras (`targets.<target>.native`)

At every location in §7.2, `native` is a mapping in the target's native
spelling. The writer for that target merges it verbatim into the native
object the location maps to: the skill frontmatter, the MCP server entry, or,
at the manifest top level, the plugin manifest (which exists only on a plugin
carrier). Native ACF can express everything a foreign package of a supported
format carries to that format's target, through a core field, a `native`
extra, a package value, or a file under `native/<target>/`.

```yaml
# acf.yml
targets:
  claude:
    native:
      displayName: Docs Kit
    package:
      version: "2024.10"
```

### 7.6 Per-target package values (`targets.<target>.package`)

`package` maps native manifest keys that the target's writer generates from
package metadata (§4.2.2; for Claude: `version`, `description`, `author`,
`license`, `homepage`, `repository`, `keywords`) to values in the target's
native value domain. A set key replaces the mapped value for that target
only and is validated against the target's manifest schema
(`acf.extras.package-value-invalid` when it fails). `name` cannot be set;
the capability slug stays the identity. Setting the same key in the
package-level `native` mapping is `acf.extras.conflict`. Readers record a
foreign manifest value the core field cannot represent exactly, such as a
non-SemVer version, as the package value of the source format's target.

### 7.7 File-level native extras (`native/<target>/`)

A capability MAY contain `native/<target>/`. A plugin carrier of that target
copies its files byte- and mode-exact to the same relative paths inside the
generated package. Paths MUST stay inside the package after normalization;
a path that collides with a generated path (equals it, lies inside a
generated directory, or is a file where a generated path needs a
directory, such as `native/claude/.claude-plugin/plugin.json` or
`native/claude/skills/<skill>`) is the `error` `acf.native.collision`. Every other target, and every loose carrier, drops
the tree with `acf.extras.dropped`. Files under `native/` are never read as
ACF facets.

### 7.8 Pending core meanings

A meaning that may satisfy the promotion rule (§7.1) but whose core contract
is deferred is pending core: host-neutral permission expressions, argument and body placeholder dialects, agent coupling,
isolated execution, MCP requirements, path-scoped activation, MCP
authentication and host-environment references, and the MCP meanings in
§13a.4.2. It is authored with the target's `native` extras in the same
spelling a foreign package uses. When a later spec version promotes the
meaning, that version defines the migration, and an extra that duplicates
the promoted field becomes `acf.extras.conflict`. Body placeholders such as
`$ARGUMENTS`, `$ARGUMENTS[N]` and `${CLAUDE_SKILL_DIR}` reach a target other
than Claude as written, and the skill writer reports them with
`acf.skill.placeholder-unexpanded` (`lossy`).

### 7.9 Extras on other targets

When a component is emitted to a target other than an extra's target, the
extra is dropped with `acf.extras.dropped` (`lossy`). An extra the registry
classifies as `restricting`, with no core equivalent the target carries,
instead refuses the component for that target (§14.3). Unclassified extras
are dropped; `diagnostics.failOnLossy` and strict mode turn the drop into a
failure. A grant in an extra, such as `targets.claude.native.allowed-tools`,
never reaches another target.

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
accept JSON or TOML as portable ACF source config. A mapping key `__proto__`
anywhere in a YAML file or frontmatter block is an error: JavaScript readers
and hosts cannot keep it as an ordinary key, so it would vanish silently. Native artifacts emitted
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
| `license`        | string      | no       | License of the skill.                            |
| `compatibility`  | string      | no       | Environment requirements; at most 500 characters. |
| `metadata`       | mapping     | no       | String keys to string values.                    |
| `argument-hint`  | string      | no       | Hint shown for the skill's arguments.            |
| `allowed-tools`  | string or list | no    | Agent Skills tool pre-approval (§9.3).           |
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

Both fields default to `true` when omitted. `model: false` means the model
never selects the skill on its own. `user: false` means the host refuses
explicit invocation by the user (typing the skill name or slash command);
hiding the skill from a menu or picker is not the same meaning, and a host
that only hides it does not support the field.

Both booleans are `restricting`. A target that cannot honor a declared
`false` value refuses the skill (§14.3): the skill is not emitted for that
target, and the plan names the recovery. Support in `acf: 1` (N = native
spelling, R = refused):

| Field                 | Claude (plugin and loose)          | Codex                                                     | Cursor                              | OpenCode | Pi                                  |
| --------------------- | ---------------------------------- | --------------------------------------------------------- | ----------------------------------- | -------- | ----------------------------------- |
| `invocation.model: false` | N `disable-model-invocation: true` | N `policy.allow_implicit_invocation: false` in `agents/openai.yaml` | N `disable-model-invocation: true` | R        | N `disable-model-invocation: true` |
| `invocation.user: false`  | N `user-invocable: false`          | R                                                         | R                                   | R        | R                                   |

`license`, `compatibility`, `metadata`, `name`, `description`, and bundled
files with their executable bits are native on every target. Keys written to
Codex `agents/openai.yaml` are merged into a bundled `agents/openai.yaml`, which
keeps its other keys; a bundled value that contradicts a written one is
`acf.extras.conflict`.
`argument-hint` is native on Claude and dropped with a `lossy` diagnostic
elsewhere.

`allowed-tools` is the Agent Skills field (`granting`). It is written
unchanged for Claude, on both carriers, because Claude reads the same field
with the same spelling as a pre-approval; every other target drops it with
the `lossy` `acf.support.degraded` diagnostic, which narrows what runs
without asking and never widens it. Caplet never translates the value into
another host's permission syntax. `targets.<target>.native.allowed-tools`
sets a target-specific value: it replaces the top-level value on that
target, which then reports no drop, and reaches no other target. Readers
of Agent Plugins skills and bare imported skills read the field the same
way; the Claude plugin reader keeps it as a Claude extra, with the same
output.

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

### 9.6 Native skill keys

Target-native frontmatter keys are not core fields and MUST be authored as
`targets.<target>.native` extras (§7.5). A top-level native key in ACF
source (`allowed-tools` is a core field, §9.2) is an `error`
(`acf.skill.native-key-not-core`) naming its core
equivalent or its extra form, for example `invocation.model: false` for
`disable-model-invocation`; a descriptive native key such as Claude
`when_to_use` only warns. Top-level `paths` is the `error`
`acf.skill.paths-not-core`: path-scoped activation is a `restricting`
per-target extra (`targets.claude.native.paths`,
`targets.cursor.native.paths`), emitted only to that target and refusing the
skill elsewhere, because the glob dialects and activation scopes of the tools
are not documented as equivalent.

### 9.7 Native serialization

Writers serialize each target's frontmatter from the core fields plus that
target's native extras. Canonical-only keys (`invocation`, `only`, `except`,
`targets`) MUST NOT appear in emitted `SKILL.md` files, and emitted
frontmatter MUST be valid for every target that discovers its location.

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

Native entries reuse the canonical entry shape (§13.4) and get its
checks, except the effect matrix (§13.7) and the required `match`, which
belong to canonical hook types. Only the event key is non-portable; an
unknown `<target>` is an error (§7.3). Readers give each entry the
applicability `<target>` intersected with its own `only`/`except` (§6),
so it is selected like a canonical entry and reaches only that target's
hook writer, which writes it to the named native event as declared,
after the canonical entries mapped to the same event. A target without
hook support reports it like a canonical entry.

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
    cwd: <string>
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
| `name`        | slug string | yes      | MCP server identity within the capability; unique among `servers[]` (`acf.facet.duplicate`). |
| `description` | string      | no       | Short description.                                                 |
| `transport`   | enum        | yes      | `stdio` \| `http` \| `sse`.                                        |
| `command`     | string      | conditional | REQUIRED for `transport: stdio`. Forbidden for `http`/`sse`.    |
| `args`        | list        | no       | stdio only. argv vector.                                           |
| `env`         | mapping     | no       | stdio only. Environment variables for the spawned process.         |
| `cwd`         | string      | no       | stdio only. Working directory (§13a.4).                            |
| `url`         | URL string  | conditional | REQUIRED for `http`/`sse`. Forbidden for `stdio`.               |
| `headers`     | mapping     | no       | `http`/`sse` only. HTTP request headers.                           |
| `only`        | list        | no       | Entry-level applicability (§6).                                    |
| `except`      | list        | no       | Entry-level applicability (§6).                                    |
| `targets`     | mapping     | no       | Entry-level target extension data: `native` extras only (§7.5).    |

### 13a.4 Transport rules

- For `transport: stdio`, `command` is REQUIRED. `args`, `env`, and `cwd`
  are OPTIONAL. `url` and `headers` MUST be absent.
- `cwd` MUST start with `${ACF_CAPABILITY_DIR}`, `${ACF_DATA_DIR}`, or `./`
  (the capability directory) and MUST NOT leave that base through `..`
  (`acf.mcp.cwd.invalid`). An omitted `cwd` means the server assumes no
  working directory, and writers emit none.
- For `transport: http` or `transport: sse`, `url` is REQUIRED. It MUST
  use `https://`, or `http://` only for `localhost`, `127.0.0.1`, or
  `[::1]` (`acf.mcp.url.insecure`), and MUST NOT contain userinfo
  (`acf.mcp.url.credential-in-url`, whose message masks the credential;
  credentials belong in `headers`). `headers` is OPTIONAL. `command`,
  `args`, `env`, and `cwd` MUST be absent.
- `transport: http` means Streamable HTTP.

Readers write a source format's documented default working directory into
`cwd` so relative paths keep their meaning on every target: an Agent
Plugins stdio server without `cwd` reads as `cwd: ${ACF_CAPABILITY_DIR}`.
Claude ignores a server `cwd` and starts plugin servers in its launch
directory, so the Claude plugin reader leaves `cwd` omitted. A writer whose
target cannot carry a declared `cwd` refuses the server instead of dropping
`cwd`.

#### 13a.4.1 Placeholders and env substitution

The path placeholders defined in §13.6.3 (`${ACF_CAPABILITY_DIR}`,
`${ACF_PACKAGE_DIR}`, `${ACF_HOOK_DIR}`) MAY appear in `command`, `args`,
`env`, and `cwd` values for stdio servers and are substituted before
emission. A Claude plugin writes `${CLAUDE_PLUGIN_ROOT}` for
`${ACF_CAPABILITY_DIR}` and `${ACF_PACKAGE_DIR}`, and
`${CLAUDE_PLUGIN_ROOT}/<dir>` for `${ACF_HOOK_DIR}`, where `<dir>` is the
directory of the MCP file inside the capability; loose carriers write
absolute paths. Claude refuses `cwd` (§13a.4.3), placeholders included. A
path placeholder in `url` or `headers` is refused on every
target, because no tool shares a meaning for a filesystem path in a URL.

`${ACF_DATA_DIR}` is a persistent, writable directory per capability and
install scope that survives updates. It MAY appear in stdio `command`,
`args`, `env`, and `cwd`, and MUST NOT appear in `url` or `headers`
(`acf.mcp.placeholder.unsupported`). A Claude plugin maps it to
`${CLAUDE_PLUGIN_DATA}`; a loose carrier maps it to the absolute directory
`<install-root>/.acf/data/<capability>/`, which apply creates.

Readers map Agent Plugins `${PLUGIN_ROOT}` and Claude `${CLAUDE_PLUGIN_ROOT}`
to `${ACF_CAPABILITY_DIR}`, Agent Plugins `${PLUGIN_DATA}` and Claude
`${CLAUDE_PLUGIN_DATA}` to `${ACF_DATA_DIR}`, and an Agent Plugins `command`
beginning `./` to `${ACF_CAPABILITY_DIR}/`, in exactly the fields the source
format expands.

Implementations MUST NOT perform additional environment-variable
expansion in canonical MCP fields. The placeholders above are the only
`${...}` references a canonical MCP `command`, `args`, `env`, `cwd`,
`url`, or `headers` value may hold; any other, such as `${API_KEY}`, is a
pending host reference (§13a.4.2) and an error
(`acf.mcp.placeholder.pending`), so no host expands it after emission. The
same holds for the other reference syntaxes a writer target expands in the
config caplet writes: `{env:NAME}` and `{file:PATH}` (OpenCode, anywhere in
`opencode.json`) and `$env:NAME` (pi-mcp-adapter). A reader keeps a server
whose source value holds such text whole as native remainder, because the
text is literal only to its source host. A
server whose meaning depends on a host
environment reference, `${user_config.*}`, `headersHelper`, or OAuth has no
canonical form in `acf: 1`: a reader keeps such a server whole as native
remainder of its source format (§20.6), and native ACF authors it as a
native entry for one target, for Claude under package-level
`targets.claude.native.mcpServers`, which only the Claude plugin carrier
emits, verbatim in `.claude-plugin/plugin.json` next to the generated
`.mcp.json`.

#### 13a.4.2 Pending MCP meanings

Server enablement, tool allow- and denylists, startup and tool timeouts,
`envFile`, Unix-socket transport, `headersHelper`, OAuth settings, tool
auto-approval, deferred-loading and promotion hints, watch-restart, and
references to host environment variables, files, or user options are
pending core (§7.8). On an otherwise canonical server they are authored as
`targets.<target>.native` extras on the server, for example
`targets.codex.native.required: true` or `targets.claude.native.timeout`.

#### 13a.4.3 Per-target support

N = native, T = translated, R = refused. Claude columns apply to both
carriers unless a cell names the plugin carrier. Pi refers to the
`pi-mcp-adapter` configuration, since Pi core has no MCP.

| Field                                         | Claude                                          | Codex                    | Cursor   | OpenCode                     | Pi       |
| --------------------------------------------- | ----------------------------------------------- | ------------------------ | -------- | ---------------------------- | -------- |
| `transport: stdio`                            | N `command`                                     | N                        | N        | T `type: local`, command array | N      |
| `transport: http`                             | N `type: http`                                  | N `url`                  | N `url`  | N `type: remote`             | N        |
| `transport: sse`                              | N `type: sse`                                   | R                        | R        | R                            | R        |
| `command`, `args`, `env`, `url`, literal `headers` | N                                          | N (`http_headers`)       | N        | T `environment` for `env`    | N        |
| `cwd`                                         | R                                               | N                        | R        | N                            | N        |
| `${ACF_CAPABILITY_DIR}` in `command`, `args`, `env`, `cwd` | T `${CLAUDE_PLUGIN_ROOT}` (plugin), absolute (loose); R in `cwd` | T absolute | T absolute | T absolute             | T absolute |
| `${ACF_CAPABILITY_DIR}` in `url`, `headers`   | R                                               | R                        | R        | R                            | R        |
| `${ACF_DATA_DIR}` in `command`, `args`, `env`, `cwd` | T `${CLAUDE_PLUGIN_DATA}` (plugin), caplet dir (loose); R in `cwd` | T caplet dir      | T caplet dir | T caplet dir             | T caplet dir |

The `${ACF_CAPABILITY_DIR}` rows apply to each path placeholder:
`${ACF_PACKAGE_DIR}` translates the same way, and `${ACF_HOOK_DIR}` becomes
`${CLAUDE_PLUGIN_ROOT}/<directory of the MCP file>` in a Claude plugin and
that directory's absolute path on loose carriers. A `${ACF_CAPABILITY_DIR}`
row follows the row of its field: where `cwd` is refused, so is every
placeholder in it.

The Claude `cwd` refusal is verified (Claude 2.1.97): Claude ignores the
key and a POSIX `cd` wrapper would change the executed command and fail on
Windows. Cursor documents `cwd` only for plugin MCP servers, so its loose
behavior is unknown and refused.

### 13a.5 Family-level `targets.<target>.servers`

`targets.<target>.servers` declares servers for one target only. Each
entry reuses the canonical entry shape and gets the same checks as
canonical servers (§13a.3, §13a.4), including its own `targets` extension
data; an unknown `<target>` is an error (§7.3). Readers add each entry to
the capability's servers as a server whose applicability is `<target>`
intersected with the entry's own `only`/`except` (§6), so it is selected,
checked against the support table, and written exactly like a canonical
server with `only: [<target>]`. An entry whose name repeats a canonical
server or another entry of the same `<target>` is the `error`
`acf.facet.duplicate`; entries of different targets may share a name.

A server name MUST be unique among the servers caplet writes to one native
MCP file. When two capabilities declare the same name, or a user-defined
entry caplet does not own already uses it, every such server is withheld
from that file with the `error` `acf.mcp.config-conflict`, which stops
apply before it writes anything; the recovery is
`exclude: { mcp: [<name>] }` on one entry.

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

### 14.3 Support table, refusal, and lossiness

The target registry declares support for skills, MCP servers, and package
metadata per core field or value condition, per target, and per carrier,
as one of:

- **native** — with the native spelling, location, and any value-domain
  condition under which the mapping is exact;
- **translated** — with the deterministic rule;
- **degraded** — with the declared loss and diagnostic severity;
- **refused** — with the reason.

Each cell cites its evidence as `documented` or `verified` (with the host
version tested). A cell for a `restricting` or `functional` field whose host
behavior is unknown is a refusal until evidence exists. Diagnostics and
documentation tables are derived from the cells. Family-level support
levels (`full`, `partial`, `none`) apply only to agents, commands,
instructions, and hooks, which have no field table in `acf: 1`.

Every core field, distinct value condition, and known native key has one
safety class; a native key value with a distinct effect, such as Codex MCP
`enabled: false`, is a value condition with its own class:

| Class         | Meaning                                                                 | Example                          |
| ------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `restricting` | Narrows invocation, activation, availability, or authority.             | `invocation.model: false`        |
| `granting`    | Pre-approves or widens authority.                                       | Claude `allowed-tools`           |
| `functional`  | Required for the component to work as declared.                         | MCP `cwd`                        |
| `descriptive` | Presentation, metadata, or advisory hints; absence keeps host defaults. | `argument-hint`                  |

Only `descriptive` and `granting` fields MAY be degraded. A `restricting`
or `functional` field is native, translated, or refused, because dropping a
restriction widens what the agent may do and dropping a functional field
changes what the component does without notice.

**Refusal.** When the cell for a declared field is a refusal, the writer
omits the component for that target and emits the `error`
`acf.support.refused`, naming the field, component, target, consequence,
and recovery. A refusal blocks that capability on that target regardless of
strict mode: apply writes, updates, and deletes nothing of that capability
for that target (its earlier output and ownership entries stay), applies
every other capability and target, and exits non-zero. Recovery is
`except: [<target>]` on the component or the `capabilities.yml` entry, or
`exclude: { <family>: [<name>] }` in `capabilities.yml` to drop the
component everywhere. A writer MUST NOT substitute a weaker artifact for a
refused restriction: no description hint, no permission rule, no
menu-visibility key, and no observing hook in place of a blocking one.

**Component omission.** When a target has no carrier for a whole component
type, such as a Claude plugin agent planned for Codex, the component is
omitted with the `lossy` diagnostic `acf.support.component-omitted`. A
`restricting` component (a hook that can block or decide, a native policy
file) instead refuses the whole package for that target. Until Claude hook
events are classified, the Claude plugin reader classifies every hook as
`restricting`, so a Claude plugin with any hook is refused for every other
target.

**Lossy diagnostics.** Adapters MUST emit a `lossy` diagnostic whenever:

- a `descriptive` or `granting` field is degraded as its cell declares;
- a native extra is dropped for another target (§7.9);
- an effect, scope operation, or trigger of a family without a field table
  has no equivalent in the target;
- an ordering or surface guarantee cannot be preserved;
- an asset reference cannot be transported to the target.

**Compatibility report.** The plan summarizes, per selected target, each
component as native, translated, changed behavior, omitted, or blocked,
before listing files. Each non-native outcome names the source field or
component, the target, the consequence, and the recovery; descriptive drops
are grouped into one line per target. JSON output carries the same
outcomes.

### 14.4 Native artifacts

Adapters MAY emit native artifacts in any format the target requires
(`plugin.json`, `.mcp.json`, TOML config, native hook scripts, etc.).
These artifacts are NOT ACF source. Implementations MUST NOT attempt to
read native artifacts as if they were canonical ACF inputs.

A native plugin package MAY be installed through a declared format reader
as a foreign source (§20.6); it is then projected into a capability, never
accepted as ACF source. Inside a native ACF capability, native files live
only under `native/<target>/` (§7.7). When the Claude plugin writer
generates a plugin from a capability not read as a Claude plugin, it leaves
out the entries Claude would read as plugin configuration without a
manifest naming them (`.claude-plugin/`, `.mcp.json`, `.lsp.json`,
`settings.json`, `agents/`, `commands/`, `hooks/hooks.json`,
`output-styles/`, `workflows/`) and reports each with the `info` diagnostic
`acf.claude.plugin-file-ignored`, which points a native ACF capability to
`native/claude/`.

Install paths and native artifact layout per target are owned by the
target adapter and are documented in §22 and `IMPLEMENTATION.md`.

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
| `acf.support.*`                      | Support-table refusals, degradations, omissions. |
| `acf.extras.*`, `acf.native.*`       | Native extras and `native/<target>/` trees.      |
| `acf.core.*`                         | Pending core meanings.                           |
| `acf.source.*`                       | Format detection, foreign readers, snapshots.    |
| `acf.selection.*`                    | `include`/`exclude`/`only`/`except` selection.   |
| `acf.apply.*`                        | Plan-time drift and output containment.          |
| `acf.claude.*`, `acf.migration.*`    | Claude carrier, host registration, migration.    |

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
- Generated plugin packages and their marketplace (§22.8) are the exception:
  no notice is written inside them, because a plugin package's files are its
  published content and same-format output must equal the source package.
  The install-root inventory lists the marketplace directory
  `.acf/marketplace/` under the reserved `acf-system` owner and each plugin
  directory `.acf/marketplace/plugins/<capability>/` under its capability
  instead.
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
    capabilities: [pocock-handoff, pocock-review] # bare skills: one capability each
    rename:
      pocock-review: review-modified

  - source: github:my-org/private-tools
    ref: main
    capabilities: [engineering, hardware/*] # optional collection selectors
    exclude:
      mcp: [legacy-search]

  - source: github:acme/claude-plugins
    ref: v2.0.0
    path: plugins/docs-kit  # one plugin inside a marketplace repository
    format: claude-plugin   # optional: override format detection (§20.6)
    except: [pi]

  - source: git:git@github.com:vendor/pack.git
    ref: 5ec15aa

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
| `path`     | string  | no       | Subdirectory inside the source to use as the selected source root, such as one plugin of a marketplace repository. |
| `format`   | enum    | no       | `acf` \| `agent-plugins` \| `claude-plugin` \| `skills`. Overrides format detection (§20.6). |
| `capabilities` | string or non-empty list | no | Exact/glob discovered capability selectors; manifested collections use paths relative to `acf/`, other capabilities their discovered name before `rename`; omitted selects all. |
| `include`  | mapping | no       | Family-keyed allowlist of facet names. Globs allowed. Implicit `*`.            |
| `exclude`  | mapping | no       | Family-keyed denylist of facet names. Globs allowed.                           |
| `rename`   | slug or mapping | no | Renames capabilities: a slug for an entry that yields one capability, or a map `<discovered-name>: <new-name>`. Required for a foreign package whose name is not a slug. |
| `only`     | list    | no       | Entry-level target applicability (§6).                                         |
| `except`   | list    | no       | Entry-level target applicability (§6).                                         |

`include`/`exclude` family keys are the facet folder names (`skills`,
`agents`, `commands`, `instructions`, `hooks`, `mcp`), the plural forms of
the facet family kinds; any other key is invalid. Values are names or
globs (`*` matches any run of characters, `?` exactly one) and match
hook entry `name` and MCP server `name` for hooks and MCP, including the
entries under `targets.<target>`. In a foreign package they also select its
native agents, commands, hooks, and MCP servers by name; other native
components follow the package. A value that matches nothing is reported
as the warning `acf.selection.unmatched`. Excluding or renaming inside a
package that keeps native components reports the `lossy` diagnostic
`acf.selection.remainder-references`, because those components may still
reference what was removed or renamed.

Selection (`only`, `except`, `include`, `exclude`) is applied when an
installed capability is read, in that order (`only` and `except` of the
entry and the capability intersect), not when its snapshot is fetched.
Snapshots, `capabilityHash`, and the payload digest therefore describe the
unfiltered package, and changing a selection never refetches. Changing
`ref`, `path`, `capabilities`, `rename`, or `format` re-resolves the entry.

Credentials do not belong in `capabilities.yml`; authentication comes from
the environment (§18.4).

### 17.6 Cross-capability collisions

After resolution and applicability filtering, the effective set of
facets per scope MUST have unique `(family, name)`.

Collisions are resolved by these rules, in order:

1. **Project shadows user.** A project-scope facet with the same
   `(family, name)` as a user-scope facet wins; the user-scope facet is
   skipped with an `info` diagnostic.
2. **Within one scope:** if `(family, name)` collides across
   capabilities, emission MUST fail with an `error` diagnostic.
   Resolution is the author's responsibility via `exclude` (a facet
   collision) or `rename` (a capability-name collision) in
   `capabilities.yml`.

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

Source URLs MUST NOT carry credentials, because `capabilities.yml`, the lockfile, sidecars, caches, plans and diagnostics all repeat them. Resolvers MUST reject, both when a source is added and when it is resolved, a `git:` URL whose authority contains userinfo (an SSH user name without a password, such as `ssh://git@host/repo.git` or `git@host:repo.git`, is not a credential) or whose query or fragment holds a credential-looking parameter (for example `token`, `access_token`, `password`, `secret`, a signature, or a well-known token value such as `ghp_…`). The rejection is the `error` diagnostic `acf.source.credential-in-url`; its message names the URL with every credential part masked, and the credential is never written to any file or output. Authentication instead comes from the environment: `github:` sources use `GITHUB_TOKEN` when it is set, and `git:` sources use SSH or the user's git credential configuration. MCP server URLs follow the narrower rule of §13a.4: only userinfo is rejected (`acf.mcp.url.credential-in-url`), and credentials belong in `headers`.

### 18.4.1 Approval of executable content

Adding or updating a source pins its resolved revision and payload digest
in the lockfile; that explicit act is the approval of the content. `caplet
add`, `caplet update`, and `caplet apply` (human and `--json` output,
including `--dry-run`) list, per capability and target, every executable
component added, changed, or removed relative to the previously locked or
installed content: MCP stdio commands, hooks, LSP servers, monitors, Claude
workflows, files with the executable bit, Claude `bin/` entries, and other
code the registry classifies as executing. The list is shown whenever it is non-empty,
including in non-interactive runs, and never prompts or blocks. Caplet keeps
no acceptance store, pre-approves no tool, permission, or MCP server, and
never writes or bypasses a host's own trust, approval, or policy state.

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

The lockfile is deterministic JSON: entries sorted by `sourceId`, selector
values sorted (strings by UTF-16 code unit, independent of locale), no
generation timestamp outside `resolvedAt`.

```json
{
  "acf": 1,
  "entries": [
    {
      "capabilityHash": "sha256-…",
      "capabilityNames": ["docs-kit"],
      "except": ["pi"],
      "ref": "v2.0.0",
      "resolvedAt": "2026-05-12T10:00:00.000Z",
      "resolvedCapabilities": [
        {
          "capabilityHash": "sha256-…",
          "format": "claude-plugin",
          "name": "docs-kit",
          "path": "plugins/docs-kit",
          "payloadDigest": "acf-tree-2:sha256:…"
        }
      ],
      "resolvedSha": "5ec15aa…",
      "source": "github:acme/claude-plugins",
      "sourceId": "github:acme/claude-plugins#path=plugins%2Fdocs-kit"
    }
  ]
}
```

### 19.4 Fields

| Field             | Type   | Required | Notes                                                              |
| ----------------- | ------ | -------- | ------------------------------------------------------------------ |
| `acf`             | int    | yes      | MUST be `1`.                                                       |
| `entries[].source` | string | yes     | Mirrors `capabilities.yml`.                                        |
| `entries[].sourceId` | string | yes   | Source identity: the canonical source plus `#path=<path>` when the entry has a `path`. |
| `entries[].ref`   | string | conditional | Mirrors `capabilities.yml`; absent for `path:`.                 |
| `entries[].resolvedSha` | string | conditional | Required for `github:` / `git:`. Forbidden for `path:`.   |
| `entries[].resolvedAt`  | RFC3339 string | no | Time the resolver recorded the SHA.                         |
| `entries[].capabilityHash` | string | yes  | v1 hash (§19.5) of the entry's first capability by name; kept for older readers. |
| `entries[].capabilityNames` | list | yes   | Final names of capabilities produced (one entry MAY produce multiple). |
| `entries[].resolvedCapabilities` | list | no | One record per capability: `name`, `format`, `formatVersion` (when the format has one), `path` (package root relative to the source root, `.` for the root), `payloadDigest` (§19.6), and `capabilityHash`. |
| `entries[].capabilities` | list | no | Normalized collection selectors from `capabilities.yml`. |
| `entries[].selectorsByCapability` | mapping | no | Final capability name to exact inventory selector, used for selector-safe removal. |
| `entries[].format` | enum | no | Mirrors `capabilities.yml` `format`; absent when the format was detected. The format each capability was read as is in `resolvedCapabilities`. |
| `entries[].include` / `exclude` | mapping | no | Selection copied from `capabilities.yml` (§17.5).               |
| `entries[].only` / `except` | list | no | Selection copied from `capabilities.yml`.                      |
| `entries[].rename` | slug or mapping | no | Mirrors `capabilities.yml`.                                  |
| `entries[].synthesized` | `true` | no | The entry's capabilities were synthesized from bare skills (§20.3). |

`resolvedCapabilities` is additive within `acf: 1`: readers accept a lock
entry without it, and the next resolution writes it. Before emitting from
the lock, an implementation recomputes each capability's payload digest
from its snapshot and fails with `acf.lock.digest-mismatch`, writing nothing
for that capability, when it differs. A capability counts as installed only
when its digest verifies. A frozen restore fetches the recorded
`resolvedSha`, never the moving `ref`. A restore MUST reproduce exactly
the locked capability names and their payload digests; otherwise it fails
with `acf.lock.digest-mismatch` and installs nothing from that entry.

### 19.5 Hash computation

`capabilityHash` is computed over the materialized snapshot of the
selected package root on disk, after `path`, `capabilities`, `format`, and
`rename` select and name it, and BEFORE `include`, `exclude`, `only`,
`except`, and any adapter emission. Selection is applied when the snapshot
is read (§17.5), so one snapshot serves every selection and a selection
change needs no refetch and keeps the hash stable. The hashing algorithm is
normative and MUST be stable for `acf: 1`:

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

- `caplet update` (or equivalent) MUST re-resolve every entry from
  `capabilities.yml` and update `capabilities.lock`.
- `caplet apply` (or equivalent) MUST re-resolve the entries whose source,
  `path`, `ref`, `capabilities`, `rename`, or `format` changed, rewrite
  their lock entries, and copy a changed selection into the lock without
  refetching.
- When fetching is not allowed (`--offline`), any disagreement MUST be the
  `error` `acf.lock.drift` (`acf.lock.missing-entry` for an entry without a
  lock entry), and emission does not run. A lock entry whose source
  `capabilities.yml` no longer declares is a disagreement too.
- A frozen apply (`--frozen`) MUST exit without writing when any lock
  diagnostic is present. Every fetch it makes, including one `--mode force`
  requests, MUST be a restore from the recorded `resolvedSha` (§19.4), so it
  never installs content the lock does not describe.

This guarantees emission never runs against a lockfile that does not
describe the current `capabilities.yml`.

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
A skill whose frontmatter holds a target's native key with a value outside
that host's domain is left out with a warning, as in every foreign source
format; the same value in an authored skill is an error.

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
manifested capability, a synthesized skill, and an Agent Plugins or Claude
plugin package use their discovered name (the manifest or skill name, before
`rename`) as the selector; `rename` then applies once to the selected
capabilities. Selectors match as follows:

- an exact path matches one complete capability path;
- `*` matches zero or more characters within one segment;
- `?` matches exactly one character within one segment;
- a `**` segment matches zero or more path segments.

Only manifested capability roots, synthesized skills, and foreign packages
discovered by §§20.1–20.3 and §20.6 are candidates. Every selector MUST match at least one candidate; overlapping matches are deduplicated.
Absolute paths, backslashes, empty segments, `.`/`..` segments, and `**` embedded
inside another segment are invalid. Invalid or unmatched selection MUST NOT
change existing snapshots or the lockfile.

`path` is applied first, then `capabilities`; facet-level `include` and
`exclude` apply when the snapshot is read (§17.5). Lock entries preserve both
normalized selector intent and sorted final capability names. Selector drift MUST trigger
reconciliation in modes that permit fetching, including removal of snapshots no
longer selected after a fully successful resolution.

### 20.6 Foreign package formats

A selected source root is read as exactly one format, by this precedence:

1. native ACF: a root `acf.yml`/`acf.yaml` or an `acf/` collection
   (§20.1–§20.2);
2. Agent Plugins 1.0: a root `plugin.json` whose `$schema` is the Agent
   Plugins 1.0 plugin schema;
3. Claude plugin: `.claude-plugin/plugin.json`;
4. bare Agent Skills (§20.3).

When more than one format is recognized, the `info` diagnostic
`acf.source.format-selected` names the chosen format and the ignored
manifests; formats are never merged. The entry's `format` overrides
detection, and naming a format that is not present is an `error`. A
recognized manifest that is invalid fails resolution and never falls back
to another format. A source whose only manifest is a marketplace or catalog
(`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`)
fails with `acf.source.marketplace-unsupported`, listing the plugin paths
it declares as candidates for `path`. A source that holds bare skills and a
plugin manifest is read as the plugin; `format: skills` reads it as skills.

An Agent Plugins or Claude plugin package becomes one capability. Its name
is the manifest `name`, which MUST be a slug or be renamed with the entry's
`rename`. Its version is the manifest `version` when it is SemVer, else
`0.0.0-unversioned+<resolved-revision-or-local>`; the Claude plugin reader
keeps the original value as `targets.claude.package.version` (§7.6).

The snapshot holds every regular file under the package root except
`.git/`, including hidden files, with exact bytes and the executable bit.
Symbolic links, special files, and sibling names that collide after NFC
normalization or case folding fail resolution with
`acf.source.snapshot-rejected`. The snapshot is immutable and enough to
re-read the capability offline with an identical projection.

Readers project into the canonical model:

- **Agent Plugins 1.0**: manifest metadata, every `skills/<dir>/SKILL.md`,
  and root `mcp.json` servers. Other schema versions fail with
  `acf.source.format-version-unsupported`. Unknown root manifest keys warn
  and are preserved; an invalid skill or server is excluded with a warning;
  an invalid `mcp.json` top level disables only MCP. `extensions`
  namespaces are preserved as native remainder.
- **Claude plugin**: manifest metadata, skills from `skills/` and manifest
  `skills` paths, and MCP servers from `.mcp.json` and manifest
  `mcpServers` (inline or a relative path). Agents, commands (each file or
  manifest `commands` map entry is one component), hooks, output styles,
  workflows (each module is one component), LSP servers, monitors, `bin/`,
  plugin `settings.json`, `userConfig`,
  channels, dependencies, and listing metadata are kept as
  Claude native remainder with their safety class. Pending keys are read as
  Claude extras.

Written in its source format with no transformation (no `rename`,
`include`, or `exclude`, and no applicability filter removing content), a
foreign package is emitted equal to its snapshot: the same paths, bytes,
and executable bits, including unknown fields, comments, and unreferenced
files. A transformation regenerates only the manifest, skills, and MCP
configuration, copies every other file unchanged, and emits no file of an
excluded component. A Claude plugin with native remainder reaches Claude
only through the plugin carrier (§22.8); on the loose carrier it is refused
for Claude with the recovery `carrier: plugin` or `except: [claude]`.

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
- carriers (§22.8) and the default carrier;
- support cells per field, value condition, and carrier for skills, MCP
  servers, and package metadata (§14.3), and a support level per family for
  agents, commands, instructions, and hooks;
- the safety class of each core field and known native key;
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

| Target     | User scope path        | Project scope path     | Native skill root      |
| ---------- | ---------------------- | ---------------------- | ---------------------- |
| `claude`   | `~/.claude/`           | `./.claude/`           | `skills/`              |
| `codex`    | `~/.codex/`            | `./.codex/`            | `skills/`              |
| `cursor`   | `~/.cursor/`           | `./.cursor/`           | none                   |
| `opencode` | `~/.config/opencode/`  | `./.opencode/`         | `skills/`              |
| `pi`       | `~/.pi/agent/`         | `./.pi/`               | `skills/`              |

Targets that do not support per-project install MUST declare `null` for
that scope and emit a `lossy` diagnostic if asked to emit there.

**Skill family install roots (shared + native emit).** The `skill` family
has an ecosystem-shared install root at `~/.agents/skills/` (user scope)
and `./.agents/skills/` (project scope). Codex, Cursor, OpenCode, and Pi
discover it; Claude does not. Adapters MUST emit a skill there only when at
least one selected target discovers that root, so a Claude-only selection
writes nothing under `.agents/skills/`. A target that discovers the shared
root defaults to shared-only emission to avoid duplicate skill names; a
target that does not emits to its native skill root.

The shared copy is one artifact read by every selected target that
discovers it, so its rendering MUST satisfy the support cells of all of
them, and an extra rendered into it counts as emitted to each. When any of
them refuses the skill or a restricting extra in it, the shared copy is not
written: each target that can carry the skill receives it in its native
skill root instead, Cursor (which has no native skill root) omits it with
`acf.support.component-omitted`, and the refusing target reports
`acf.support.refused`. Because a blocked capability keeps its earlier
output (§14.3), a shared copy written before the refusal stays until the
refusal is resolved, and a target such as Pi may meanwhile discover the
skill twice, in the shared root and in its native root.

Each destination is an independent `file`-owned artifact; implementations
MUST apply and remove the canonical and native copies idempotently.
Referenced skill assets follow §16.4 and MUST be transported to every
emitted skill destination so Markdown paths resolve in each copy.
Implementations MAY offer configuration to force or suppress shared or
native emission for a target (caplet: `targets.<id>.skills.canonical` and
`targets.<id>.skills.native`). The shared/native split applies only to
skills in `acf: 1`; other facets remain per-target.

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

| Target     | Project scope                                   | User scope                                   |
| ---------- | ----------------------------------------------- | -------------------------------------------- |
| `claude` (plugin) | `.mcp.json` inside the generated package (§22.8) | `.mcp.json` inside the generated package |
| `claude` (loose)  | `./.mcp.json` `mcpServers`               | omitted (see below)                          |
| `codex`    | `./.codex/config.toml` `[mcp_servers.<name>]`   | `~/.codex/config.toml` `[mcp_servers.<name>]` |
| `cursor`   | `./.cursor/mcp.json` `mcpServers`               | `~/.cursor/mcp.json` `mcpServers`            |
| `opencode` | `./opencode.json` `mcp`                         | `~/.config/opencode/opencode.json` `mcp`     |
| `pi`       | `./.pi/mcp.json` `mcpServers`                   | `~/.pi/agent/mcp.json` `mcpServers`          |

On loose carriers caplet owns each server entry, not the file: JSON
entries by JSON pointer, Codex tables by a `# acf:begin`/`# acf:end` marker
region per server, each marker a whole line. A plugin's `.mcp.json` is a whole file of the package,
and package-level `targets.claude.native.mcpServers` go into its
`plugin.json` (§13a.4.1). Claude reads user-scope MCP servers only from
`~/.claude.json`, a state file Claude rewrites, so the loose Claude carrier
omits user-scope servers with `acf.support.component-omitted` (`lossy`) and
the recovery `targets.claude.carrier: plugin`.

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
  drift. A region one capability hands to another keeps its old owner's
  entry until the new owner's write lands, so it is never left unowned.
  On each apply, ACF-owned paths and regions no longer in the
  desired plan are removed, even when their capability and facet remain.
  One whose owned content no longer matches the recorded hash was edited
  by the user: it is kept with its sidecar entry and reported as drift
  until the user deletes or restores it.
- Every write and delete MUST resolve, after following existing parent
  directories and an existing symbolic link at the path itself, inside the
  declared output root of its target and scope; the root's sidecar and
  `ACF-MANAGED.md` included. A symlinked parent or file that leads
  outside, or dangles, fails that target before any write and names the
  offending path. A host file the driver only merges owned regions into
  (`settings.json`, `CLAUDE.md`, `.mcp.json`, `config.toml`, ...) is
  the user's: an existing link at that file itself, such as one into a
  dotfiles checkout, is written through wherever it points; its parent
  directories are still checked.
- Adapters MUST preserve unowned content byte-for-byte in any file they
  patch. Reformatting outside owned regions is forbidden.
- Adapters MUST emit the listed degradation diagnostics (`acf.adapter.*`,
  `acf.lossy.*`) for every effect, hook event, instruction trigger, or
  facet family they cannot fully honor, and MUST apply the support cells
  of §14.3 to skills, MCP servers, and package metadata, refusing where a
  cell refuses.

### 22.8 Carriers and the Claude plugin carrier

#### 22.8.1 Carrier selection

Caplet selects a carrier per target with `targets.<target>.carrier` in
`caplet.yml`. Claude accepts `plugin` (the default) and `loose`; every
other `acf: 1` target accepts only `loose`, and setting `plugin` for one is
a configuration error naming the target. Switching Claude to `loose`
writes the capabilities' loose files and uninstalls caplet's Claude
plugins; each plugin's files are deleted once Claude no longer lists it.

The Claude plugin carrier holds skills, MCP servers, Claude native
remainder, and `native/claude/` files. A native ACF capability that also
has agents, commands, hooks, or instructions for Claude stays whole on the
loose carrier, reported with the `info` diagnostic
`acf.claude.legacy-carrier`, because splitting one capability across two
carriers would give its parts different names and lifecycles.

#### 22.8.2 Generated plugin package

Each capability becomes one package at
`<claude-install-root>/.acf/marketplace/plugins/<capability>/`, where the
Claude install root is `./.claude/` for project scope and `~/.claude/` for
user scope. It contains `.claude-plugin/plugin.json` (`name` is the
capability slug; metadata per §4.2.2 plus package-level native extras),
`skills/<name>/`, `.mcp.json` when a server is emitted, preserved Claude
remainder, the `native/claude/` files, and the capability's other files
outside ACF-defined paths (such as a server script), copied unchanged. Of
those files, only the directories of skills the plugin regenerates or that
selection or applicability removed are left out; a directory holding a
`SKILL.md` that is no projected skill (documentation, an example) is copied.
Claude invokes its skills as `/<capability>:<skill>`.

The manifest `version` is `<base>+acf.<d>`: `<base>` is
`targets.claude.package.version` when set, else the capability version, and
`<d>` is the first 12 hex digits of the payload digest (§19.6) of the
generated package with `plugin.json` at the base version. When `<base>`
already has build metadata, `.acf.<d>` is appended instead. A foreign
Claude plugin's version is replaced in place, or inserted when absent. The
suffix changes whenever the package content changes, which is how Claude
notices an update.

#### 22.8.3 Marketplace and registration

`<claude-install-root>/.acf/marketplace/.claude-plugin/marketplace.json`
lists `./plugins/<capability>` for every desired plugin, under the
marketplace name `acf-user` or `acf-project-<hash>`, where `<hash>` is the
first 8 hex digits of the SHA-256 of the project root's real path, because
Claude keeps one marketplace record per name for the whole user. The
install root's sidecar records the marketplace name and Claude scope, so a
later apply can retire the registration after the last plugin is gone.
Caplet registers
through the `claude` CLI only, as an argument vector rather than a shell
command and always with `--scope`: `claude plugin marketplace add <dir>`
(idempotent), `claude plugin install` for a new plugin, `claude plugin
update` for a changed version, and `claude plugin uninstall` for a removed
one, reading state with `claude plugin list --json`. It never runs
`install` for a plugin Claude already has, because that re-enables a plugin
the user disabled. It never writes Claude's private plugin state
(`~/.claude/plugins/`) or edits `enabledPlugins` or
`extraKnownMarketplaces`. It removes the marketplace only when no plugin
in it is desired and the removal touches nothing but caplet's registration,
because `claude plugin marketplace remove` uninstalls the marketplace's
plugins in every scope and directory and drops its declarations from the
user settings and the working directory's project and local settings. When
another of those settings files declares the marketplace or cannot be read,
or a plugin from it is installed outside caplet's registration, the
marketplace stays registered, `marketplace.json` is rewritten to list no
plugins, and the warning `acf.claude.marketplace-kept` names what keeps it
and the `claude plugin marketplace remove` command to run by hand.

File changes that do not depend on Claude are applied before the `claude`
commands run. Deleting a removed plugin's files waits until Claude no
longer lists it, because Claude keeps serving an installed plugin from its
cache, and deleting `marketplace.json` waits until the marketplace is
removed; a change whose condition is not met stays, with its sidecar
entry, for the next apply. When apply skips a write of a plugin package or
of `marketplace.json` because the file changed after planning, the install
root's packages are incomplete: no `claude` command runs for that root,
every change that waits on Claude there (including the retirement of loose
output, §22.8.5) stays for the next apply, and the warning
`acf.claude.host-deferred` says so.

ACF user scope registers at Claude user scope; ACF project scope registers
at Claude local scope (`.claude/settings.local.json`), so registration
stays on the machine that ran caplet. On its first local-scope write Claude
itself adds `**/.claude/settings.local.json` to the user's global git
ignore. Caplet never registers at Claude project or managed scope, and a
plugin it finds in another scope is reported (`acf.claude.other-scope`), not
changed. `claude plugin list --json` also shows the project and local
installs of other directories; caplet ignores them.

#### 22.8.4 Host state

`caplet apply` and `caplet status` report each plugin's file state
(`current`, `drifted`, or `missing` against the sidecar) and one host
state:

- `registered` — Claude lists the plugin, enabled, at caplet's Claude
  scope (for project scope, Claude local scope of that project root).
- `disabled by user` — Claude lists it disabled; caplet updates the files
  and never re-enables it.
- `not installed` — Claude does not list it at caplet's Claude scope: a
  removed plugin after its uninstall, a plugin that a dry run or status
  shows apply would install, or a plugin installed only at another Claude
  scope (`acf.claude.other-scope`), which apply leaves alone.
- `registration required` — the `claude` CLI is missing or fails to start,
  or the install failed and Claude does not list the plugin. Without the
  CLI the package is written, the warning `acf.claude.cli-unavailable`
  lists the exact commands, and apply exits 0. A CLI that stops starting
  partway leaves the remaining commands to the user the same way.
- `blocked by host policy` — a command failed with a Claude policy message
  (`acf.claude.policy-blocked`, warning); caplet does not fall back to
  loose output.
- `unknown` — Claude's state could not be read (a list command failed,
  `acf.claude.command-failed`, or printed output caplet cannot parse,
  `acf.claude.state-unreadable`), or Claude still lists another version
  than caplet generated: after its commands succeeded, or in a dry run or
  status before apply updates it (`acf.claude.version-mismatch`), or after
  its update or install failed (the `acf.claude.command-failed` error
  explains it).

Any other failed `claude` command is the error `acf.claude.command-failed`
carrying Claude's message. The commands that depend on it are skipped,
other plugins' commands still run, and apply exits 2.

#### 22.8.5 Migration from loose output

Each capability and scope migrates as one unit. Once Claude reports the
plugin `registered` or `disabled by user`, caplet removes the capability's
earlier loose Claude output that the sidecar owns and that has not
drifted, including owned JSON pointers, and keeps `.agents/skills` copies
that a still-selected target discovers. A disabled plugin counts, because
keeping the loose copies would keep the capability active against the
user's choice. A drifted loose artifact is left in place, its sidecar entry
is released, and the warning `acf.migration.drifted` names the path, the
duplicate, and the command that removes it. When registration fails, the
loose output stays and the next apply retries. Because plugin skills are
namespaced, the apply that retires a capability's loose skills shows each
rename (for example `/review` to `/review-kit:review`) and lists them in
`--json` `renames`. Retirement happens once per migration, so later
applies stay silent and a capability that migrates later in the same
install root still gets its notice.

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
