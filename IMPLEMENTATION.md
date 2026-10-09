# ACF Reference Implementation Notes

Status: draft

This document describes one TypeScript / Turborepo reference implementation of
the Agent Capability Format. It is **not** the portable specification (`SPEC.md`
is). Where this document conflicts with `SPEC.md`, `SPEC.md` wins.

The intent is to give implementers a concrete starting point: repository
layout, package boundaries, data types, schema validation strategy, registry
shape, parser / emitter / resolver pipelines, and diagnostic conventions.

Terminology used here matches `SPEC.md` exactly. In particular:

- **Capability** is the bag at `<root>/acf.yml` (what other ecosystems sometimes
  call a "package" or "skill pack"). The TypeScript type is `AcfCapability`.
- **Facet** is one entry inside a capability — a skill, agent, command,
  instruction, hook entry, or MCP server.
- **Facet family** is one of `skill`, `agent`, `command`, `instruction`,
  `hook`, `mcp`.

`Package` is used in this document only when referring to npm/pnpm packages.

## 1. Repository shape

```txt
agent-capability-format/
  apps/
    caplet/               # reference CLI binary
  packages/
    core/                 # pure SPEC logic; types, schemas, reader, validator, resolver (local), applicability, hash, diagnostics, emission helpers (applicability, outcomes, executables), per-target extension schemas, canonical EmitOptions
    adapters/             # per-target emit functions + shared file utilities
    installer/            # git + network fetch (capabilities.yml resolution, lockfile writes)
    sdk/                  # convenience helpers for direct consumers; re-exports core + adapters + installer
    runtime-taxonomy/     # reserved; may move to a sibling repo later
  openspec/               # change proposals and capability specs
    changes/
    specs/
    config.yaml
  CONTEXT.md
  SPEC.md
  IMPLEMENTATION.md
  README.md
```

Five packages and one app. Boundaries follow consumer needs, not arbitrary
splits:

- A CI linter or browser validator imports `@caplet/core` only — pure JS, no
  network, no git, no `Bun.*`.
- The caplet CLI imports `@caplet/sdk` (or core + adapters + installer
  directly) — needs everything.
- A direct consumer (Pi extension, OpenCode extension) imports `@caplet/sdk`
  for the convenience API (`getSkills`, `getFacets`, auto-fetch).

Turborepo convention: `apps/` for runnable end-user binaries, `packages/` for
libraries. `runtime-taxonomy/` is a stub placeholder; if the taxonomy
graduates to its own repo (likely), this package either re-exports it or is
removed.

This repo uses **OpenSpec** (`openspec/`) for change proposals and capability
specs instead of ADRs. Hard decisions live in OpenSpec change artifacts;
`IMPLEMENTATION.md` describes the reference implementation shape itself.

### apps/caplet

Reference CLI. Uses `@caplet/sdk` (or core + adapters + installer directly) to:

- validate capabilities and `capabilities.yml`,
- resolve and fetch remote capabilities,
- emit native artifacts,
- report diagnostics,
- run the full command surface from `SPEC.md` §21 (`init`/`add`/`remove`/
  `update`/`apply`/`list`/`show`/`check`/`doctor`/`status`/`completion`).

The CLI is an implementation, not part of the spec. Hot-path runtime helpers
(hook runner, instruction runtime) are deliberately out of scope here and
evaluated separately. Additional apps (docs site, web playground, MCP server
exposing caplet) are explicitly deferred until there is a concrete user.

Shipped source, `apps/caplet` included, uses `node:*` APIs only so the
published packages run on Node ≥ 20 without Bun. Tests may use `Bun.*`.

### packages/core

Owns:

- the canonical ACF data model (§3),
- YAML parsing and Markdown-frontmatter parsing,
- schema validation (Zod v4),
- the diagnostic data type (§11),
- the normalized capability representation produced by the reader (§5),
- **local-only resolver** (§7): scope discovery, autoload, shadowing,
  collisions, applicability cascade — but NOT fetching,
- caplet configuration parsing (§8) — caplet schema lives here so other
  tools can read caplet config when needed,
- the asset reference resolver (§9),
- the applicability cascade (§10),
- **per-target extension schemas** (§4.5) for `targets.<target>` validation,
- **canonical `EmitOptions`** type (§4.2),
- the shared shape guards (`isRecord`, `isStringArray`, `isStringMap`,
  `isSlug`, `isErrno`) and `stableJson`, which the other packages import
  rather than copy.

Core invariants:

- No `Bun.*` imports.
- No `node:child_process`, no `node:process.argv`, no CLI concerns.
- No logger; returns structured `Diagnostic[]` only.
- No network or git.
- `node:fs`, `node:path`, `node:crypto`, `node:url` allowed, kept thin.
- Pure JS; usable in any modern host including the browser (with the obvious
  caveat that disk reads require a host-provided FS port).

### packages/adapters

Owns:

- the `TargetAdapter` contract (§4.2),
- built-in target adapters (`claude`, `codex`, `cursor`, `opencode`, `pi`),
- per-target install paths for user and project scope,
- per-target hook event / instruction trigger / MCP location mapping tables,
- the shared loose writers and **shared file utilities** under `src/common/`
  (§4.2.1, §4.8) — used by adapters; not in core.

For v1 all built-in adapters live together. They MAY be split into
`@caplet/adapter-claude` etc. only when dependency boundaries justify it.

Adapters import `@caplet/core` for types, capability shape, and the per-target
extension schemas defined there. Adding a target requires:

1. an entry in `packages/core/src/targets/registry.ts` (id + extension
   schema), and
2. an adapter module `packages/adapters/src/<id>/index.ts` that calls
   `registerAdapter` and is listed in `packages/adapters/src/index.ts`.

`TargetId` is `string`, so a missing pair is not a type error;
`registerAdapter` throws for an id the registry lacks, and the adapter
contract test runs every entry of `adapters`.

### packages/installer

Owns:

- `capabilities.yml` source-by-source resolution (§7.4),
- the git client (`node:child_process` shelling to `git`),
- HTTPS source fetching (deferred — placeholder for archive support),
- lockfile writes coordinated with content hash (§7.5),
- materializing fetched capabilities into a scope's `capabilities/` directory.

Installer invariants:

- imports `@caplet/core` for types and schemas; never the inverse,
- uses `node:child_process` for `git`; never `Bun.spawn`,
- emits structured `Diagnostic[]`; no console output.

### packages/sdk

Owns the direct-consumer convenience API. Re-exports:

- everything from `@caplet/core`,
- adapter functions from `@caplet/adapters`,
- fetch helpers from `@caplet/installer`.

Adds:

- `getSkills`, `getAgents`, `getCommands`, `getInstructions`, `getHooks`,
  `getMcpServers`, `getFacets` (§13a),
- `fetch: 'auto' | 'never' | 'force'` opt for transparent install,
- diagnostic capture pattern.

This is what Pi extension, OpenCode extension, and similar direct consumers
import. Strict tools (CI linter, browser validator) import `@caplet/core` only.

### packages/runtime-taxonomy

Reserved. The runtime taxonomy / registry intentionally lives outside the
normative specification (`SPEC.md` §14.5, §24). The provisional operation set
(`SPEC.md` §24) is part of `acf: 1` and lives in `@caplet/core` as a frozen
constant, not in this package. When this package becomes real, it owns:

- canonical operation identifiers (full list, semantics, target mappings),
- canonical event identifiers,
- permission and message-surface vocabularies,
- per-target mappings beyond what the adapter registry needs.

Until then, ACF references operation/event/permission identifiers as opaque
slug strings validated only for shape against the `SPEC.md` §24 set; adapters
validate semantic mapping into their host.

## 2. Tooling assumptions

The stack is **locked** (no per-implementer choice). Empirical evidence from
the first round of parallel implementers showed that open stack questions
produced inconsistent and lower-quality results.

| Dimension | Choice |
|---|---|
| Runtime / PM | Bun ≥ 1.3 |
| Monorepo | Turborepo (`turbo.json` at root); workspaces in root `package.json` |
| Language | TypeScript 5+ strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Module resolution | `"Bundler"` for source and tests; `"NodeNext"` for the publish build |
| Typecheck | `tsgo --noEmit` (10× faster than tsc; production-ready) |
| Build (dev) | None: `tsconfig.base.json` `paths` map `@caplet/*` to source, and Bun honors them at runtime |
| Build (publish) | `tsc -p tsconfig.build.json` per package → ESM + `.d.ts` in `dist/`; `exports` point only at `dist/` |
| Schema validation | Zod v4 |
| CLI framework | `citty` |
| Test runner | `bun test` |
| Lint / format | Biome (single tool; no ESLint+Prettier) |
| YAML parser | `yaml` (eemeli/yaml) — best diagnostic positions |
| Markdown frontmatter | `gray-matter` |
| Hashing | `node:crypto` everywhere (also runs under Bun) |
| Globbing | `picomatch` |
| Semver | `semver` |
| Logger | `consola` in `apps/caplet` only; libraries return `Diagnostic[]` |
| Process spawn | `node:child_process` in `apps/caplet` and `@caplet/installer`; never in core/adapters/sdk |
| Git for fetch | shell out to `git` binary via `node:child_process`; no `isomorphic-git` |
| Engines | root: `"bun": ">=1.3.0"`; every published package `"node": ">=20"` |

Guiding principles:

- **Type safety first.** No `any`, no disabled strict flags. If a check is
  inconvenient, fix the code, not the config.
- **Simplicity through delegation.** Prefer well-scoped packages over
  hand-rolled cleverness. No hand-rolled argv parser, no hand-rolled YAML
  parser, no hand-rolled glob.
- **Shipped code runtime-agnostic.** No package source uses `Bun.*`; the
  publish build type-checks against Node types only, so a Bun global fails
  `bun run build`. Bun implements the Node API, so this loses nothing on Bun.

Reference implementations using this exact stack live in sibling repos
(`../sessionloom`, `../context-overflow`) and can be skimmed for working
`turbo.json`, `biome.json`, `tsconfig.json`, `.swcrc`, and `package.json`
script shapes. Domain code, names, and types MUST NOT be copied.

Canonical root `package.json` scripts:

```json
{
  "scripts": {
    "build": "turbo run build",
    "check-types": "turbo run check-types",
    "test": "turbo run test --force",
    "lint": "biome check .",
    "format": "biome format --write .",
    "ci": "bun run lint && tsc --noEmit -p scripts && turbo run check-types test build --force",
    "smoke:packages": "turbo run build && bun scripts/packages.ts pack .packs && bun scripts/packages.ts smoke .packs"
  }
}
```

Lint runs once at the repository root with Biome; Turbo runs the per-package
`check-types`, `test`, and `build` tasks.

Every package MUST declare a `test` script. Packages with no tests yet use a
non-failing placeholder (`echo 'no tests for @caplet/<pkg>'`) so
`turbo run test --force` succeeds. The `--force` flag is the canonical audit
form — cached evidence does not count.

No Rust component is planned for v1. If a future generic hook runner needs
process-level performance, evaluate a separate native runner instead of
re-implementing the parser/emitter.

## 3. Data model

### 3.1 Top-level capability type

```ts
export type AcfCapability = {
  root: string                         // absolute path to capability root
  synthesized?: true                   // bare skill wrapped by the installer
  scope: Scope                         // resolved scope ("user" | "project")
  origin: CapabilityOrigin             // how this capability was obtained
  manifest: Manifest
  manifestPath?: string                // acf.yml or acf.yaml read; absent without one
  capabilityMarkdown?: CapabilityMarkdown // ACF.md if present
  skills: SkillFacet[]
  agents: AgentFacet[]
  commands: CommandFacet[]
  instructions: InstructionFacet[]
  hooks: HookFile | undefined
  mcp: McpFile | undefined
  assets: AssetRef[]                   // referenced asset paths
  diagnostics: Diagnostic[]
  source?: CapabilitySource            // format reader provenance
  remainder?: NativeRemainderComponent[] // foreign components kept unprojected
  nativeFiles?: NativeFileExtra[]      // files under native/<target>/
}

export type FacetFamily =
  | "skill"
  | "agent"
  | "command"
  | "instruction"
  | "hook"
  | "mcp"

export type Scope = "user" | "project"

export type CapabilityOrigin =
  | { kind: "local"; directory: string }                  // hand-authored at scope/capabilities/<name>
  | { kind: "fetched"; sourceId: string; lockEntry: LockEntry } // resolved from capabilities.yml
```

`Scope` distinguishes `~/.agents/` (user) from `./.agents/` (project).
Adapters consult `scope` when picking install destinations; the reader only
records it.

`CapabilityOrigin` lets `caplet show` and diagnostics explain why a
capability exists and where it came from. `LockEntry` is defined in §7.

The interop types live in `packages/core/src/types/interop.ts`; changing one
is a cross-lane decision because readers, the support registry, writers, and
caplet's plan/apply all share it:

```ts
export type SourceFormat = "acf" | "agent-plugins" | "claude-plugin" | "skills"
export type Carrier = "plugin" | "loose"
export type SafetyClass = "restricting" | "granting" | "functional" | "descriptive"

export type CapabilitySource = {
  format: SourceFormat
  formatVersion?: string     // "1.0" for Agent Plugins
  path: string               // package root relative to the source root, "." for the root
  snapshotRoot: string       // immutable materialized snapshot of that root
  renamedFrom?: string       // manifest name when the entry's rename replaced it
  projected?: {              // foreign packages only, as read before rename,
    skills: string[]         // selection, and applicability (§4.9)
    servers: string[]
    remainder: NativeRemainderComponent[]
  }
}

export type NativeRemainderComponent = {
  format: "agent-plugins" | "claude-plugin"
  kind: NativeRemainderKind  // agent, command, hook, lsp-server, monitor, bin, mcp-server, ...
  name: string
  paths: string[]            // snapshot-relative files or directories
  manifestKeys?: string[]    // manifest keys the component occupies
  class: SafetyClass
  executable: boolean        // stdio server, hook, LSP, monitor, bin
}

export type NativeFileExtra = {
  target: TargetId
  path: string               // relative to native/<target>/ and to the generated package
  executable: boolean        // owner execute bit (0o100), as everywhere in core
}
```

A writer of the remainder's own format copies `paths` unchanged; other
targets omit or refuse each component by `class` (SPEC §14.3). Only a
plugin-carrier writer of `target` copies `nativeFiles`; every other writer
drops them with `acf.extras.dropped`.

### 3.2 Manifest

```ts
export type Manifest = {
  acf: 1
  name: Slug
  version: SemVer
  description?: string
  authors?: Array<string | PackageAuthor> // legacy strings kept verbatim
  license?: string
  homepage?: string
  repository?: string
  keywords?: string[]
  only?: TargetId[]
  except?: TargetId[]
  targets?: TargetExtensions
  // For forward compatibility:
  unknown?: Record<string, unknown>
}

export type PackageAuthor = { name: string; email?: string; url?: string }
export type Slug = string                   // matches ^[a-z0-9]+(-[a-z0-9]+)*$
export type SemVer = string
export type TargetExtensions = Partial<Record<TargetId, unknown>>
```

`unknown` is internal: validation captures unrecognized top-level keys here
and emits informational diagnostics for them. Production builds may drop it.

### 3.3 Markdown-backed facets

```ts
type Frontmatter<T> = T & {
  only?: TargetId[]
  except?: TargetId[]
  targets?: TargetExtensions
  assets?: string[]                     // explicit asset references (SPEC §16)
}

export type SkillFacet = {
  family: "skill"
  name: Slug
  dir: string                          // absolute path to skills/<name>/
  primaryFile: string                  // SKILL.md path
  frontmatter: Frontmatter<{
    name: Slug
    description: string
    invocation?: { user?: boolean; model?: boolean }
    license?: string
    compatibility?: string              // at most 500 characters
    metadata?: Record<string, string>
    "argument-hint"?: string
  }>
  body: string                          // Markdown body after frontmatter
}

export type AgentFacet = {
  family: "agent"
  name: Slug
  source: { kind: "file" | "directory"; path: string; primary: string }
  frontmatter: Frontmatter<{
    name: Slug
    description: string
    mode?: "primary" | "subagent" | "all"
    model?: "inherit"
  }>
  body: string
}

export type CommandFacet = {
  family: "command"
  name: Slug
  source: { kind: "file" | "directory"; path: string; primary: string }
  frontmatter: Frontmatter<{
    name: Slug
    description: string
    arguments?: Slug[]
    agent?: string
  }>
  body: string
}

export type InstructionFacet = {
  family: "instruction"
  name: Slug
  source: { kind: "file" | "directory"; path: string; primary: string }
  frontmatter: Frontmatter<{
    name: Slug
    description: string
    activation: InstructionActivation
  }>
  body: string
}

export type CapabilityMarkdown = {
  path: string
  frontmatter: {
    sections?: string[]
    targets?: Partial<Record<TargetId, unknown>>
  }
  body: string
}
```

### 3.4 Instruction activation

```ts
export type InstructionActivation =
  | "always"
  | { when: ActivationWhen }

export type ActivationWhen = Partial<{
  assistant_output: AssistantOutputTrigger
  operation_input: OperationInputTrigger
  operation_result: OperationResultTrigger
  file_context: FileContextTrigger
}>

type TriggerCommon = {
  scope?: ScopeEntry[]
  interrupt?: "never" | "always"
  repeat?: "once" | "always"
  debounce?: number               // positive integer, only with repeat: "always"
}

export type AssistantOutputTrigger = TriggerCommon & {
  conditions: string[]            // non-empty regex list, ORed
}

export type OperationInputTrigger = TriggerCommon & {
  conditions: string[]
}

export type OperationResultTrigger = TriggerCommon & {
  conditions: string[]
}

export type FileContextTrigger = TriggerCommon & {
  paths: string[]                 // non-empty glob list, ORed
}

export type ScopeEntry = {
  operation?: OperationId         // SPEC §24 provisional set or registry slug
  paths?: string[]                // glob list
}

export type OperationId = string  // validated against SPEC §24 set
```

Trigger interrupt defaults follow `SPEC.md` §12.10:

```ts
export const triggerInterruptDefaults = {
  assistant_output: "always",
  operation_input: "always",
  operation_result: "never",
  file_context: "never",
} as const
```

### 3.5 Provisional operation set (SPEC §24)

```ts
export const provisionalOperations = [
  "shell",
  "file_read",
  "file_write",
  "file_edit",
  "web_fetch",
  "web_search",
  "code_search",
  "doc_search",
  "agent_delegate",
  "task_management",
  "mcp",
  "context",
  "any",
] as const

export type ProvisionalOperationId = (typeof provisionalOperations)[number]

export function isProvisionalOperation(value: string): value is ProvisionalOperationId {
  return (provisionalOperations as readonly string[]).includes(value)
}
```

`scope.operation` and hook `match.operation` MUST validate against this
set in v1. Per SPEC §24, unknown values emit `acf.runtime.unknown-operation`
at severity `error`. The earlier `acf.taxonomy.operation.unmapped` (lossy)
code is retained as an internal alias for adapter-side diagnostics when an
adapter cannot map a known operation onto its host — it is not used for
unknown identifiers.

### 3.6 Hooks

```ts
export type HookFile = {
  path: string                    // absolute path to hooks/hooks.yml
  buckets: {
    session_start?: HookEntry[]
    user_prompt_submit?: HookEntry[]
    pre_tool?: HookEntry[]
    permission_request?: HookEntry[]
    post_tool?: HookEntry[]
    stop?: HookEntry[]
    pre_compact?: HookEntry[]
  }
  // Family-level targets.<target>.hooks by target, then native event name. Unknown targets
  // are left out; each entry's only is <target> intersected with its own only/except (SPEC §13.9).
  native?: Partial<Record<TargetId, Record<string, HookEntry[]>>>
}

export type HookEntry = {
  name: Slug
  description?: string
  only?: TargetId[]
  except?: TargetId[]
  match?: HookMatch
  run: HookRun
  effect: HookEffect
  timeout?: number                 // milliseconds; default 30000
  targets?: TargetExtensions
}

export type HookMatch = {
  operation?: OperationId | "any"
  paths?: string[]
  conditions?: string[]
}

export type HookRun =
  | { command: string; args?: string[]; shell?: undefined; env?: HookEnv }
  | { command: string; shell: "bash" | "powershell"; args?: undefined; env?: HookEnv }

export type HookEnv = Record<string, string>

export type HookEffect =
  | "observe"
  | "block"
  | "add_context"
  | "continue"
  | "block_result"
  | "decide"

export type HookTargetExtensions = Partial<Record<TargetId, {
  hooks?: Record<string, HookEntry[]>   // native event keys are strings
  // Other adapter-specific fields validated by hook extension schema.
}>>
```

Allowed effects per hook type are enforced by validation (§5.3):

```ts
export const hookEffectMatrix = {
  session_start:      ["observe", "add_context"],
  user_prompt_submit: ["observe", "block", "add_context"],
  pre_tool:           ["observe", "block"],
  permission_request: ["observe", "decide"],
  post_tool:          ["observe", "add_context", "block_result"],
  stop:               ["observe", "continue"],
  pre_compact:        ["observe", "add_context"],
} satisfies Record<CanonicalHookType, HookEffect[]>

export type CanonicalHookType = keyof typeof hookEffectMatrix
```

Hook types where `match` is required:

```ts
export const hookMatchRequired = new Set<CanonicalHookType>([
  "pre_tool",
  "post_tool",
  "permission_request",
])
```

Default hook timeout:

```ts
export const defaultHookTimeoutMs = 30_000
```

### 3.7 Default hook wire protocol (SPEC §13.6.6)

```ts
export type HookEvent = {
  type: CanonicalHookType
  operation?: OperationId
  paths?: string[]
  payload: Record<string, unknown>     // event-specific structured data
  meta: {
    capabilityName: string
    hookName: string
    target: TargetId
    sessionId?: string
  }
}

export type HookDecision =
  | { decision: "allow" }
  | { decision: "block"; reason?: string }
  | { decision: "add_context"; context: string }
  | { decision: "block_result"; replacement?: unknown }
  | { decision: "continue" }
  | { decision: "decide"; outcome: "approve" | "deny"; reason?: string }
```

The reference runner (when it exists) MUST:

- write a JSON-encoded `HookEvent` to the handler's stdin and close stdin,
- read stdout until close; if non-empty, parse as `HookDecision` and validate
  it against `effect` (`add_context` effect ⇒ `add_context` decision, etc.),
- treat stderr as diagnostic output,
- treat exit code 0 as continue (apply decision if present),
- treat exit code 2 as block (synonymous with `decision: "block"` when no
  stdout decision was emitted),
- treat any other non-zero exit code as non-blocking error and emit a
  diagnostic.

Adapters MAY override the protocol when emitting for hosts with a different
native handler shape; in that case the adapter is responsible for the bridge.

### 3.8 MCP

```ts
export type McpFile = {
  path: string
  // Canonical servers, then each family-level targets.<target>.servers entry
  // read as a server with only: [<target>] (SPEC §13a.5).
  servers: McpServer[]
}

export type McpServer = McpServerBase & McpTransport

type McpServerBase = {
  name: Slug
  description?: string
  only?: TargetId[]
  except?: TargetId[]
  targets?: TargetExtensions
}

type McpTransport =
  | {
      transport: "stdio"
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string   // starts with ${ACF_CAPABILITY_DIR}, ${ACF_DATA_DIR} or ./
    }
  | { transport: "http"; url: string; headers?: Record<string, string> }
  | { transport: "sse"; url: string; headers?: Record<string, string> }
```

### 3.9 Asset reference type

```ts
export type AssetRef = {
  path: string                          // capability-relative source path
  origin: "frontmatter" | "markdown" | "implicit"
  facet: { family: FacetFamily; name: string } | { family: "capability" }
}
```

### 3.10 Path placeholders (SPEC §13.6.3, §13a.4.1)

```ts
export const acfPathPlaceholders = [
  "${ACF_CAPABILITY_DIR}",    // alias for ACF_PACKAGE_DIR
  "${ACF_PACKAGE_DIR}",       // legacy synonym retained for ergonomics
  "${ACF_HOOK_DIR}",
] as const
```

Substitution is performed when the adapter materializes a hook `run.command`,
hook `run.args[i]`, hook `run.env[k]`, MCP `command`, MCP `args[i]`, MCP
`env[k]`, and MCP `cwd`; a path placeholder in MCP `url` or `headers[k]`
refuses the server on every target. No other interpolation is performed by
ACF, and validation rejects any other reference a writer target would expand
in those MCP values (`acf.mcp.placeholder.pending`): `${...}` (Claude,
Cursor, pi-mcp-adapter), `{env:...}` and `{file:...}` (OpenCode), and
`$env:NAME` (pi-mcp-adapter). Loose carriers substitute absolute paths. The
Claude plugin carrier writes `${CLAUDE_PLUGIN_ROOT}` for
`${ACF_CAPABILITY_DIR}` and `${ACF_PACKAGE_DIR}`, and
`${CLAUDE_PLUGIN_ROOT}/<dir>` for `${ACF_HOOK_DIR}`, where `<dir>` is the
directory of the MCP file inside the capability (hooks keep a capability
loose for Claude).

`acfDataDirPlaceholder` (`${ACF_DATA_DIR}`) is MCP-only: a persistent,
writable directory per capability and install scope that survives updates.
It is valid in stdio `command`, `args`, `env`, and `cwd`, and rejected in
`url` and `headers` (`acf.mcp.placeholder.unsupported`). Loose carriers
resolve it to `<install-root>/.acf/data/<capability>/`, which apply creates
with a `.keep` file; the Claude plugin carrier writes
`${CLAUDE_PLUGIN_DATA}`. A `./` MCP `cwd` resolves against the capability
root.

## 4. Target registry

The registry is the single source of truth for target identity, family and
field-level support, carriers, install paths, native mapping tables, and
per-target extension schemas. It uses the definition-first pattern.

### 4.1 Target definition contract

```ts
export type SupportLevel = "full" | "partial" | "none"

export type InstallPaths = {
  // Each value MUST be either an absolute path string (with `~` expanded by
  // the adapter consumer) or `null` if the target does not support that scope.
  user: string | null
  project: string | null
}

export type TargetMappings = {
  // Canonical hook type → native event name(s). Empty array = unsupported.
  hookEvents: Record<CanonicalHookType, string[]>
  // Instruction trigger support; same enum values as SupportLevel.
  instructionTriggers: Record<keyof ActivationWhen, SupportLevel>
  // Where MCP servers register, by scope. Null = unsupported in that scope.
  mcpInstallPath: InstallPaths
}

export type TargetDefinition<Id extends string> = {
  id: Id
  displayName: string

  // Family-level support for agents, commands, instructions and hooks only. Skills, MCP
  // servers and package metadata are declared per field and carrier in
  // targets/field-support.ts (fieldSupport, supportCell, targetCarriers), with native keys
  // classified in targets/native-keys.ts (nativeKeyInfo) and checked by
  // targets/self-check.ts (checkSupportRegistry).
  support: Partial<Record<Exclude<FacetFamily, "skill" | "mcp">, SupportLevel>>
  installPaths: InstallPaths
  // Native skill install paths, when the target has target-specific skill
  // directories. Omitted = no native skill root (Cursor).
  skillInstallPaths?: InstallPaths
  // The host discovers the shared .agents/skills root itself (Codex, Cursor,
  // OpenCode, Pi). Only these targets cause the shared copy to be written.
  discoversCanonicalSkills?: boolean
  mappings: TargetMappings

  extensions: {
    capability?: Schema
    skill?: Schema
    agent?: Schema
    command?: Schema
    instruction?: Schema
    hook?: Schema
    mcp?: Schema
  }

  adapter: TargetAdapter<Id>
}
```

`Schema` is whatever validator library is chosen (Zod / Valibot / TypeBox). The
registry treats it opaquely; the validation layer (§5.3) calls into it.

### 4.2 Adapter contract

Adapters do not write files directly. They return a list of `FileDiff`s
between current and desired content. Caplet (or any consumer) applies the
diffs and tracks ownership in a `.acf-managed.json` sidecar (§4.2.2).

This design is universal across file formats (JSON, YAML, Markdown, MDC,
TOML, anything text-based), makes `caplet apply --dry-run` trivial, and
keeps adapters declarative.

```ts
export type TargetAdapter<Id extends string> = {
  id: Id

  /**
   * Compute file diffs for emitting one capability into one scope.
   * Adapters MUST NOT mutate the input capability and MUST NOT write to
   * disk. They use the read-only `fs` port to inspect existing files.
   */
  emit(input: EmitInput, fs: ReadOnlyFs): Promise<EmitResult>

  /**
   * Optional pre-emit validation pass; runs after generic validation.
   */
  validate?(input: EmitInput): Promise<Diagnostic[]>
}

export type EmitInput = {
  capability: AcfCapability
  scope: Scope
  installRoot: string                  // resolved absolute install path for this target+scope
  options: EmitOptions
}

// Canonical EmitOptions lives in @caplet/core; identical for every target.
// Per-target divergence is expressed via degradation diagnostics, not new
// options. Per-target *extension data* on facets (e.g. `targets.claude.foo`)
// remains per-target and is validated by the per-target extension schemas
// in @caplet/core/targets/<target>.ts.
export type EmitOptions = {
  cleanBeforeEmit?: boolean
  dryRun?: boolean
  // caplet.yml targets.<id>.skills; absent = target default (§4.8)
  skills?: { native?: boolean; canonical?: boolean }
  // Selected targets in this scope that discover .agents/skills. The shared
  // copy must satisfy all of them; absent = this writer is the only reader.
  canonicalSkillReaders?: readonly TargetId[]
  // Readers the whole plan found blocked by a refusal for this capability,
  // including refusals of components this writer's target does not see.
  blockedSkillReaders?: readonly TargetId[]
  // Configured carrier; absent = the target default (carriersOf). Claude still
  // writes loose for a capability with legacy families (§4.9).
  carrier?: Carrier
}

export type EmitResult = {
  diffs: FileDiff[]
  diagnostics: Diagnostic[]
  /** Components whose outcome the writer knows positively (e.g. `translated`).
   *  Caplet derives every other component's outcome from `diagnostics` with
   *  `componentOutcomes`; support diagnostics come from the helpers in
   *  `targets/support-diagnostics.ts`, which read the registry cells. */
  outcomes?: ComponentOutcome[]
  /** Plugin packages the Claude plugin writer generated (§4.9); absent or empty
   *  for loose output. Every diff of a result with a plugin lies inside its `dir`. */
  plugins?: EmittedPlugin[]
}

export type ComponentOutcome = {
  capability: string
  target: TargetId
  family: FacetFamily | "package" | "remainder"
  component: string
  outcome: "native" | "translated" | "changed-behavior" | "omitted" | "blocked"
  source?: string        // core field id, native key, or component type
  consequence?: string   // what the user loses
  recovery?: string      // selection change that resolves it
  dropped?: string[]     // descriptive fields and extras lost without behavior change
}

/** Read-only filesystem port. Caplet implements it over real fs; tests use
 *  in-memory implementations. Adapters call this to read existing native
 *  artifacts before computing desired content. */
export type ReadOnlyFs = {
  exists(absPath: string): Promise<boolean>
  readText(absPath: string): Promise<string | null>  // null if missing
  readBytes(absPath: string): Promise<Uint8Array | null>
  readMode(absPath: string): Promise<number | null>   // POSIX mode bits
  listDir(absPath: string): Promise<string[]>         // [] if missing
}

/** A file-level diff. Adapters return one of these per file they want to
 *  produce, modify, or delete. Caplet applies them, captures them for
 *  `caplet apply --dry-run`, and updates `.acf-managed.json`. */
export type FileDiff = {
  path: string                           // absolute path on disk
  before: string | Uint8Array | null     // null = file did not exist
  after: string | Uint8Array | null      // null = delete file
  beforeMode?: number | null             // POSIX mode; byte-exact copies keep the exec bit
  afterMode?: number | null
  // The set of ACF-owned regions inside this file. For fully-owned files
  // (Cursor .mdc rules, ACF-generated YAML), `owns` is the single string
  // "file". For intertwined files (Codex config.toml, .mcp.json), `owns` lists the
  // JSON pointers or markers that ACF claims authorship of.
  owns: AcfOwnership[]
  facet?: { family: FacetFamily; name: string }
  artifactRoot?: string                  // top-level fully-owned directory
  managementNotice?: "root" | "artifact"
}

export type AcfOwnership =
  | { kind: "file" }                                  // adapter owns the whole file
  | { kind: "json-pointer"; pointer: string }         // "/mcpServers/foo"
  | { kind: "yaml-pointer"; pointer: string }
  | { kind: "toml-pointer"; pointer: string }
  | { kind: "marker"; name: string }                  // "<!-- acf:managed name=foo -->" block in text files
```

### 4.2.1 Shared file utilities

Adapters share read-modify-serialize utilities. They live in
`packages/adapters/src/common/` (not in core) and are imported by every
adapter that needs them:

- `mergeJson(text, pointer, value)` sets one JSON pointer and keeps the rest
  of the text byte for byte; `readJsonObject` and `jsonPointerEscape` go with
  it.
- `replaceMarkedBlock`, `removeMarkedBlock`, `extractMarkedBlock`, and
  `markerSyntaxOf` edit one `acf:begin`/`acf:end` region of a text file
  (HTML comment markers by default, `#` markers in TOML).
- `makeFileDiff(path, before, after, owns, modes?)` builds a `FileDiff`.

```ts
import { makeFileDiff, mcpServerPointer, mergeJson } from "@caplet/adapters/common"

// Illustrative: insert one MCP server entry into Cursor's mcp.json
const file = `${installRoot}/mcp.json`
const pointer = mcpServerPointer("cursor", "my-server")
const before = await fs.readText(file)
const after = mergeJson(before, pointer, { command: "x" })
const diff = makeFileDiff(file, before, after, [{ kind: "json-pointer", pointer }])
```

Codex TOML tables are rendered by `renderTomlTable` and checked for a
user-defined duplicate by `tomlDefinesTable` (`src/common/toml.ts`, internal).
Adapters MUST NOT reformat parts of the file outside their owned pointers/
markers.

### 4.2.2 Ownership sidecar (`.acf-managed.json`)

At each `installRoot`, caplet maintains an `.acf-managed.json` sidecar listing
every `(path, AcfOwnership)` tuple ACF currently owns at that root. On
subsequent emits and on `caplet remove`, the sidecar lets caplet:

- delete ACF-managed pointers/markers without nuking unrelated user content,
- detect drift where the user has manually edited an ACF-managed region,
- support a future clean re-apply (remove all ACF content, then re-apply);
  the current CLI has no `--clean` flag.

Shape:

```ts
export type AcfManagedSidecar = {
  acf: 1
  marketplace?: { name: string; scope: "user" | "local" } // Claude install root whose marketplace caplet keeps
  managed: Array<{
    path: string             // relative to the sidecar directory
    owns: AcfOwnership[]
    capability: string       // capability name that produced this entry
    facet?: { family: FacetFamily; name: string }
    target?: TargetId | "canonical" // root owner; filled in on the next write
    carrier?: Carrier        // "plugin" for a generated Claude plugin or its marketplace file, else "loose"
    mode?: number            // POSIX permission bits of a whole-file entry
    hash: string             // sha256 of the rendered content for drift detection
  }>
}
```

Apply compares every file with the plan-time `before` content (or the
plan-time hash of its owned regions) immediately before writing. A file that
changed in between is skipped with an `acf.apply.drift` warning and keeps its
sidecar entry. Entries whose path or region is no longer desired are swept on
the next apply, except one whose owned content no longer hashes to the
recorded `hash`: the user edited it, so the plan keeps the file and the
entry and reports `acf.apply.drift` until the content is deleted or
restored (retired loose Claude output is released instead, §4.9).
Canonical-root entries are kept while their capability and facet exist and
the facet was not planned into that root. Before writing,
each install root is checked against its output boundary (the root, a
target's native skills root, and its MCP file), and so are the root's sidecar
and `ACF-MANAGED.md`; an escape through a symlinked parent or a symlinked file
fails that root with `acf.apply.outside-root`. A link at a file caplet only
merges regions into (every sidecar entry for it owns regions, none the whole
file) is the user's and is written through (`containmentViolation` in
`apps/caplet/src/apply/containment.ts`). `caplet remove` checks
the same boundary for every root before changing anything.

Adapters do not write the sidecar. Caplet writes it after applying diffs.

### 4.2.3 Visible ownership notices (`ACF-MANAGED.md`)

The emission planner adds a deterministic `ACF-MANAGED.md` at each install
root after all adapter outputs have been combined. It inventories whole-file,
shared-region, and fully-owned-directory artifacts by capability. The root
notice is recorded in the sidecar under the reserved `acf-system` owner so
removing one capability can rebuild the aggregate inventory from remaining
sidecar entries.

Target-filtered applies merge their selected desired plan with retained
sidecar entries before rendering a shared-root inventory. This prevents, for
example, `--target claude` from dropping canonical artifacts that remain
managed through another target without requiring Caplet to execute every
unselected adapter.

The shared skills emitter also adds one local notice inside every emitted skill
directory. `FileDiff.artifactRoot`, `facet`, and `managementNotice` carry the
metadata needed for inventory construction, human diff grouping, and sidecar
reconstruction. Notices are emitted only at the final destination: source and
resolved snapshot trees remain byte-identical and capability hashes are
unaffected.

Both the adapter and applier reject collisions at reserved notice paths. The
planner checks the sidecar before proposing an overwrite, and the applier
repeats the ownership check immediately before writing to close the race. ACF
does not place notices directly in host discovery directories such as a native
`skills/` root; local notices live one level lower inside each skill directory.
Generated Claude plugin packages get no notice files: the package digest and
version must depend only on package content (SPEC §14.7). The install-root
inventory lists plugin directories and the marketplace instead.

### 4.3 Registry sketch

```ts
import { homedir } from "node:os"

const HOME = homedir()

export const targets = defineTargets([
  defineTarget({
    id: "claude",
    displayName: "Claude Code",

    support: {
      agent: "full",
      command: "full",
      instruction: "partial",
      hook: "full",
    },

    installPaths: {
      user:    `${HOME}/.claude`,
      project: `./.claude`,
    },

    skillInstallPaths: {
      user:    `${HOME}/.claude/skills`,
      project: `./.claude/skills`,
    },

    mappings: {
      hookEvents: {
        session_start:      ["SessionStart"],
        user_prompt_submit: ["UserPromptSubmit"],
        pre_tool:           ["PreToolUse"],
        permission_request: ["PreToolUse"],   // approximated via PreToolUse + decision
        post_tool:          ["PostToolUse"],
        stop:               ["Stop"],
        pre_compact:        ["PreCompact"],
      },
      instructionTriggers: {
        assistant_output: "none",
        operation_input:  "none",
        operation_result: "none",
        file_context:     "partial",          // via path-globbed CLAUDE.md
      },
      mcpInstallPath: {
        user:    `${HOME}/.claude/mcp.json`,
        project: `./.mcp.json`,
      },
    },

    extensions: commonTargetExtensionSchemas,

    adapter: claudeAdapter,
  }),

  defineTarget({
    id: "codex",
    displayName: "Codex",

    support: {
      agent: "full",
      command: "partial",
      instruction: "none",
      hook: "full",
    },

    installPaths: {
      user:    `${HOME}/.codex`,
      project: null,                         // Codex has no per-project scope today
    },

    skillInstallPaths: {
      user:    `${HOME}/.codex/skills`,
      project: `./.codex/skills`,
    },

    mappings: {
      hookEvents: {
        session_start:      ["SessionStart"],
        user_prompt_submit: ["UserPromptSubmit"],
        pre_tool:           ["PreToolUse"],
        permission_request: ["PermissionRequest"],
        post_tool:          ["PostToolUse"],
        stop:               ["Stop"],
        pre_compact:        [],              // unsupported
      },
      instructionTriggers: {
        assistant_output: "none",
        operation_input:  "none",
        operation_result: "none",
        file_context:     "none",
      },
      mcpInstallPath: {
        user:    `${HOME}/.codex/config.toml`,
        project: `./.codex/config.toml`,
      },
    },

    extensions: commonTargetExtensionSchemas,

    adapter: codexAdapter,
  }),

  defineTarget({
    id: "opencode",
    displayName: "OpenCode",
    support: {
      agent: "full",
      command: "partial",
      instruction: "partial",
      hook: "partial",
    },
    installPaths: {
      user:    `${HOME}/.config/opencode`,
      project: `./.opencode`,
    },
    skillInstallPaths: {
      user:    `${HOME}/.config/opencode/skills`,
      project: `./.opencode/skills`,
    },
    mappings: {
      hookEvents: {
        session_start:      ["session.start"],
        user_prompt_submit: ["message.user"],
        pre_tool:           ["tool.execute.before"],
        permission_request: ["permission.asked"],
        post_tool:          ["tool.execute.after"],
        stop:               ["session.stop"],
        pre_compact:        ["session.compact.before"],
      },
      instructionTriggers: {
        assistant_output: "none",
        operation_input:  "partial",          // via plugin event filters
        operation_result: "partial",
        file_context:     "partial",
      },
      mcpInstallPath: {
        user:    `${HOME}/.config/opencode/opencode.json`,
        project: `./opencode.json`,
      },
    },
    extensions: commonTargetExtensionSchemas,
    adapter: opencodeAdapter,
  }),

  defineTarget({
    id: "cursor",
    displayName: "Cursor",
    support: {
      agent: "partial",
      command: "partial",
      instruction: "partial",
      hook: "none",
    },
    installPaths: {
      user:    `${HOME}/.cursor`,
      project: `./.cursor`,
    },
    // No skillInstallPaths: Cursor receives skills via the shared root only.
    discoversCanonicalSkills: true,
    mappings: {
      hookEvents: {
        session_start:      [],
        user_prompt_submit: [],
        pre_tool:           [],
        permission_request: [],
        post_tool:          [],
        stop:               [],
        pre_compact:        [],
      },
      instructionTriggers: {
        assistant_output: "none",
        operation_input:  "none",
        operation_result: "none",
        file_context:     "partial",         // via .cursor/rules with globs
      },
      mcpInstallPath: {
        user:    `${HOME}/.cursor/mcp.json`,
        project: `./.cursor/mcp.json`,
      },
    },
    extensions: commonTargetExtensionSchemas,
    adapter: cursorAdapter,
  }),

  defineTarget({
    id: "pi",
    displayName: "Pi",
    support: {
      agent: "full",
      command: "full",
      instruction: "full",
      hook: "full",
    },
    installPaths: {
      user:    `${HOME}/.pi/agent`,
      project: `./.pi`,
    },
    skillInstallPaths: {
      user:    `${HOME}/.pi/agent/skills`,
      project: `./.pi/skills`,
    },
    mappings: {
      hookEvents: {
        session_start:      ["session_start"],
        user_prompt_submit: ["user_prompt_submit"],
        pre_tool:           ["pre_tool"],
        permission_request: ["permission_request"],
        post_tool:          ["post_tool"],
        stop:               ["stop"],
        pre_compact:        ["pre_compact"],
      },
      instructionTriggers: {
        assistant_output: "full",            // TTSR
        operation_input:  "full",
        operation_result: "full",
        file_context:     "full",
      },
      mcpInstallPath: {
        user:    `${HOME}/.pi/agent/mcp.json`,
        project: `./.pi/mcp.json`,
      },
    },
    extensions: commonTargetExtensionSchemas,
    adapter: piAdapter,
  }),
] as const)
```

### 4.4 Derived outputs

```ts
export type TargetId = string                   // types/model.ts; not narrowed to the built-ins

export const targetIds: readonly TargetId[] = targets.map((target) => target.id)

export const targetMap: Readonly<Record<TargetId, TargetDefinition<TargetId>>> =
  Object.fromEntries(targets.map((target) => [target.id, target]))

export function isTargetId(value: unknown): value is TargetId {
  return typeof value === "string" && targetIds.includes(value)
}
```

`defineTargets` validates the array at module load:

- duplicate ids are a fatal error,
- ids must match the slug regex,
- support entries reference known facet families,
- every `mappings.hookEvents` key MUST be a `CanonicalHookType`,
- every `mappings.instructionTriggers` key MUST be a known trigger,
- `installPaths.user` / `installPaths.project` are either absolute path or `null`.

### 4.5 Extension schemas

Every built-in target validates a family's `targets.<target>` block against the
same per-family schema, `commonTargetExtensionSchemas` in
`packages/core/src/targets/extensions.ts`. Each schema is strict, for example:

```ts
const hookExtension = z
  .object({
    hooks: z.record(z.string(), z.array(hookEntrySchema)).optional(),
    runInBackground: z.boolean().optional(),
  })
  .strict()
```

Unknown target ids or unknown keys under a known target id are diagnostics
(§11), not silent passes.

### 4.6 Field-level support registry

Skills, MCP servers, and package metadata are declared per field, target, and
carrier, not per family. The tables live in `packages/core/src/targets/`:

| Module | Exports | Role |
| --- | --- | --- |
| `field-support.ts` | `fieldSupport`, `findFieldSupport`, `supportCell(field, target, carrier)`, `targetCarriers`, `carriersOf` | One `FieldSupport` per core field or value condition (`skill.invocation.model=false`, `mcp.cwd=${ACF_DATA_DIR}`) with its safety class and one `SupportCell` per target and carrier. `supportCell` throws for an unknown field or a carrier the target lacks: both are writer bugs. Claude offers `plugin` (default) and `loose`; every other target `loose` only. |
| `native-keys.ts` | `nativeKeys`, `nativeKeyInfo`, `nativeKeyClass`, `nativeValueProblem`, `pendingCoreFields` | Known native keys per target and attachment point, with the native value schema of every key no core field generates (`acf.extras.native-value-invalid`), class, `valueClasses` for values with a distinct effect (Codex and OpenCode MCP `enabled: false`, Pi MCP `exposeResources: false` and Claude `defaultEnabled: false` restrict), `generatedFrom` (an extra with that key is `acf.extras.conflict`), and `pending` (`acf.core.pending`). Unknown keys are `unclassified`. |
| `self-check.ts` | `checkSupportRegistry` | Fails when a restricting or functional cell is degraded, a restricting refusal lacks a negative fixture, a skill or MCP field lacks a cell for a built-in target and carrier, or a native key is unclassified, duplicated, or points at a missing field, or a datum a foreign reader preserves has no native authoring form. |
| `support-diagnostics.ts` | `supportDiagnostic`, `translatedOutcome`, `componentOmitted`, `packageRefused`, `extraDropped`, `nativeTreeDropped`, `corePending`, `recoveryFor`, `exclusionRecovery` | The only way writers emit support diagnostics, so code, message, `data`, consequence, and recovery stay uniform. |
| `remainder-support.ts` | `remainderTargets`, `remainderSupport` | Which targets can carry each foreign remainder kind; a restricting remainder refuses the package elsewhere, others are omitted as lossy. |
| `package-values.ts` | `packageValueSchemas`, `packageValueProblem` | Validates `targets.<target>.package` values (`acf.extras.package-value-invalid`). |
| `plugin-layout.ts` | `generatedPluginPaths`, `generatedPathCollision` | Paths the plugin writer generates, so `native/<target>/` files that collide fail with `acf.native.collision`. |

Family-level `support` (§4.1) remains only for agents, commands,
instructions, and hooks.

`componentOutcomes` (`packages/core/src/emit/outcomes.ts`) turns a writer's
diagnostics and reported outcomes into the compatibility report.
`capabilityBlocked` is true when any `acf.support.refused` names the target;
caplet then marks the capability blocked for that target in `EmitPlan.blocked`
(`apps/caplet/src/internal/workflow.ts`) and writes, updates, and removes
nothing of it there. Other capabilities and targets apply, and the command
exits 2 (`blockingExitCode` in `apps/caplet/src/internal/output.ts`). Any
error other than a refusal, including a resolved capability's own validation
errors, stops apply, add, and update before writing. The plan carries every
diagnostic of each planned capability, so these commands also show its
warnings and lossy notes, each once.

### 4.7 Native extras

`packages/core/src/extras/index.ts` is the one reader of native extras:

- `nativeExtras(targets, dialect)` returns the `targets.<dialect>.native`
  map at package, skill, or MCP-server level; `withNativeExtras` writes one.
  Only format readers and the bare-skill import write the `agent-plugins`
  dialect; validation reports it in an authored capability as
  `acf.target.unknown-id`.
- `packageValues` and `withPackageValues` read and write
  `targets.<target>.package`, which is valid only in `acf.yml`.
- `extrasDialects` lists the dialects a `targets` map carries.
- `nativeFiles(capability, target)` and `nativeFileTargets` read the
  `native/<target>/` tree recorded on `AcfCapability.nativeFiles`.

Writers merge inline extras verbatim into the native object they generate
(skill frontmatter, MCP server entry, plugin manifest). A key the writer also
generates from a core field is an `acf.extras.conflict` error.

### 4.8 Writer emit contract

The loose writers live in `packages/adapters/src/common/`: `target.ts`
(`emitTarget`, which runs the others for one target and reports
package-level drops), `skills.ts`, `mcp.ts`, `emitter.ts` (agents, commands,
instructions), and `hooks.ts`. The Claude plugin writer is
`packages/adapters/src/claude/plugin.ts`, with source selection in
`plugin-source.ts` and manifest mapping in `manifest.ts`.

- **Skills.** The shared `.agents/skills` copy is written only when
  `canonicalSkillReaders` is non-empty (or `skills.canonical` forces it), and
  only when every reader applies the skill, none refuses it, none is in
  `blockedSkillReaders` or blocked by a refusal the writer sees, and their
  renderings merge without conflict. Caplet derives `blockedSkillReaders`
  from each reader's own emit, since a component limited to one reader is
  invisible to the others. Otherwise each discovering target falls
  back to its native skill root; Cursor, which has none, reports
  `acf.support.component-omitted`. A target that does not discover the
  shared root (Claude) writes its native root.
- **MCP files.** `mcpPathFor` in `packages/adapters/src/common/mcp.ts` is
  the one place that maps target and scope to the MCP config file (SPEC
  §22.5). Codex entries live between `# acf:begin <name>` and
  `# acf:end <name>` marker lines in `config.toml`.
- **Server-name conflicts.** `withholdConflictingMcpServers`
  (`apps/caplet/src/internal/mcp-conflicts.ts`) withholds a server name
  claimed by two capabilities, or already defined by the user without
  sidecar ownership, with `acf.mcp.config-conflict`. Recovery is
  `exclude: { mcp: [<name>] }`.
- **Data directory.** A loose writer that emits `${ACF_DATA_DIR}` also emits
  `<install-root>/.acf/data/<capability>/.keep`.
- **Executables.** `executableComponents` and `executableChanges`
  (`packages/core/src/emit/executables.ts`) list added, removed, or changed MCP stdio
  commands, hooks, LSP servers, monitors, executable files, and Claude
  `bin/` entries for the change report and `--json` `executables`. The
  plugin carrier's executable configuration from `native/claude/` files and
  `targets.claude.native` keys is classified and fingerprinted like the same
  component in a foreign Claude plugin, so both report alike; MCP servers from
  `native/claude/.mcp.json` (and files the key names) and
  `targets.claude.native.mcpServers` go through the Claude plugin reader, so each
  server is listed by name, and a native server replaces the capability's
  server of the same name. A configuration file a native key names resolves as
  the plugin package does: from `native/claude/` when it holds the path, else
  from the capability's own files. A stdio server's
  fingerprint covers the packaged files its command and arguments name through
  an ACF path placeholder or by a relative path under its `cwd` (exact files
  only, inside the snapshot). A plugin configuration component's fingerprint
  (a Claude hook, LSP server, monitor or pending server, foreign or from
  `native/claude/`) also covers the files its definition or files name
  through `${CLAUDE_PLUGIN_ROOT}/<path>`, resolved in the generated package:
  `native/claude/<path>` first, then the capability's own `<path>`.

### 4.9 Claude plugin carrier and host port

`capabilityCarrier(capability, target, configured?)`
(`packages/core/src/targets/capability-carrier.ts`) decides the carrier of a
capability already filtered by applicability for `target`: the configured
carrier, else the target default, except that Claude falls back to `loose`
when `claudeLegacyFamilies` finds agents, commands, hook entries (canonical
or Claude-native, `hookEntries`), or instructions. The Claude writer, the executable inventory
(`packages/core/src/emit/executables.ts`), and caplet's MCP conflict check
(`apps/caplet/src/internal/mcp-conflicts.ts`) all call it, so reports and
output agree. `targets.<id>.carrier` is validated against `carriersOf` when
`caplet.yml` loads, and caplet passes it as `EmitOptions.carrier` only when
set.

The Claude plugin writer (`packages/adapters/src/claude/plugin.ts`) builds
one package per capability at `pluginPackageDir(installRoot, name)`, which
is `<claude-install-root>/.acf/marketplace/plugins/<capability>/`, inside
`pluginMarketplaceDir(installRoot)` (both in
`packages/core/src/targets/plugin-layout.ts`). Plugin diffs set
`artifactRoot` to the package directory, so no `ACF-MANAGED.md` is written
inside it; the install-root inventory lists `.acf/marketplace/` in the
`acf-system` section and `.acf/marketplace/plugins/<capability>/` under each
capability. From any source not read as a Claude plugin the writer leaves out
the entries Claude discovers without a manifest (`CLAUDE_DISCOVERED`:
`.claude-plugin/`, `.mcp.json`, `.lsp.json`, `settings.json`, `agents/`,
`commands/`, `hooks/hooks.json`, `output-styles/`, `workflows/`) with
`acf.claude.plugin-file-ignored` (info) and copies every other file outside
format-owned paths. `EmitResult.plugins` reports each package:

```ts
export type EmittedPlugin = {
  target: TargetId
  scope: Scope
  name: string       // capability slug = plugin name
  version: string    // <base>+acf.<d>, or <base>.acf.<d> when <base> contains "+"
  dir: string        // absolute package directory
}
```

`d` is the first 12 hex characters of the acf-tree-2 digest of the generated
package with `plugin.json` written at the base version, so the suffix does
not feed back into the digest.

A foreign Claude plugin source carries `CapabilitySource.projected`
(`{skills, servers, remainder}`: projected skill and server names and the
native remainder, recorded by `foreignCapability` in
`packages/core/src/formats/package.ts` before `rename`, selection, and
applicability). `isUnchangedClaudePlugin`
(`packages/adapters/src/claude/plugin-source.ts`) compares it and `renamedFrom` with
the capability the writer receives: an unchanged package is copied
byte-identically except the `plugin.json` `version` value; a transformed one
gets a regenerated manifest, skills, and `.mcp.json`, and loses the files and
manifest keys that only removed remainder components used. `.mcp.json` cannot
hold an MCP bundle, so the manifest `mcpServers` keeps the selected `.mcpb` and
HTTPS bundle references and a local bundle file is copied.

Caplet plans, gates, and reports the carrier in `apps/caplet/src/internal/`:

| Module | Role |
| --- | --- |
| `claude-marketplace.ts` | `planClaudeMarketplaces` returns a `ClaudeRootPlan` per Claude install root that lists a plugin or whose sidecar shows an earlier marketplace or plugin (`leftover` names plugins the sidecar still owns but the plan dropped), plus the diff of `marketplaceFile(installRoot)`, `<claude-install-root>/.acf/marketplace/.claude-plugin/marketplace.json`, owned by `acf-system` with `carrier: plugin`. It lists `{name, source: "./plugins/<capability>"}` for every plugin of the plan and the installed plugin of a capability a refusal blocks. `recordClaudeMarketplaces` keeps the sidecar's `marketplace` record in line with ownership of that file. |
| `claude-gates.ts` | `claudeGate` marks a planned change that waits on the host: `registered` (retiring loose Claude files of a capability that is now a plugin), `uninstalled` (deleting a removed plugin's files), `retired` (deleting `marketplace.json`). `gateClaudeChanges` attaches those gates to a plan's changes and splits off the migration, for both apply and remove plans. `gateOpen` decides from the host report; `registered` opens on `registered` or `disabled by user`. `gatedChange` applies an open change, and in place of a closed `retired` deletion whose marketplace stays registered writes an empty catalog; `previewedDiffs` makes the same substitution for `status` and dry runs from the host preview. |
| `claude-host-flow.ts` | `reconcileClaude` and `previewClaude` call the host port and add each plugin's file state (`current`, `drifted`, `missing`) from its `carrier: plugin` sidecar entries; `claudeLines` renders the host block. |
| `claude-migration.ts` | `planClaudeMigration` turns gated retirements of drifted loose artifacts into releases (reported by `driftedWarning` as `acf.migration.drifted`) and each retired skill into a `/<skill> -> /<capability>:<skill>` rename. Renames are not recorded: retirement happens once, so the apply that performs it is the only one that announces them. |

`applyEmitPlan` (`apply-plan.ts`) runs in this order: write every change without a
gate (plugin files, `marketplace.json`, loose files); reconcile each Claude
install root with the host; apply each gated change whose gate opened and
hold back the rest with their sidecar entries; drop the stale sidecar entries
that were not held back and regenerate the inventory of roots with held-back
changes; finally `recordClaudeMarketplaces`.

After the plan, human output prints one block per scope:
`Claude plugins <scope> scope · <marketplace>`, a row per plugin with its
host state, `files <state>` and, after apply, `installed`, `updated` or
`uninstalled` when that command succeeded, the note
`registered for this checkout only, at Claude local scope (.claude/settings.local.json)`
for a project, `would run` and the planned commands on a dry run or
`status` (leaving out the `marketplace add` of a marketplace Claude already
lists: apply still runs it, because `marketplace list` does not say at which
scope it is registered, but it is then a no-op), then
`Claude skills are now invoked through their plugins` with one
`/<skill> -> /<capability>:<skill>` line per rename. The `--json` envelopes
of `apply` (also with `--dry-run`), `status`, and applying `add` and
`update` carry `claude: ClaudeScopeStatus[]` when the plan has a Claude
install root (`scope`, `claudeScope`, `marketplace`, `marketplaceDir`,
`plugins[]` with `name`, `id`, `action`, `state`, `version`,
`desiredVersion`, `message`, `files`, `commands[]` with `op`, `command`,
`plugin`, `status`, `message`, `otherScopeInstalls`, `marketplaceKnown`,
`local`, `stateRead`), and
`renames: [{scope, capability, from, to}]` when a rename applies. `caplet
status` and dry runs read host state and run no command.

The host port in `apps/caplet/src/hosts/claude/` registers packages:

| Module | Role |
| --- | --- |
| `scope.ts` | `claudeScopeFor` maps ACF `user` to Claude `user` and ACF `project` to Claude `local`; `claudeMarketplaceName` gives `acf-user` or `acf-project-<h>` (first 8 hex of the SHA-256 of the project root's real path, because Claude keeps one marketplace record per name for the whole user); `resolveClaudeScopeTarget` resolves that real path. |
| `cli.ts` | `execClaudeCli` runs `claude` with an argv array and an explicit `cwd`, never a shell. A missing binary is `unavailable` with Node's spawn message, `spawn claude ENOENT`. A command still running after two minutes gets SIGTERM, then SIGKILL five seconds later, and is `terminated` once it exits. |
| `host.ts` | `ClaudeHost` port and `createClaudeHost`; tests inject a fake CLI. `classifyClaudeFailure` recognizes the policy-block messages of the 2.1.97 binary. |
| `commands.ts`, `state.ts` | `ClaudeCommand`, its argv, and the shell line recovery hints print; parsing of `claude plugin list --json` and `claude plugin marketplace list --json`. |
| `plan.ts` | `planClaudeScope` diffs `claude plugin list --json` against desired plugins into marketplace add, install, update, and uninstall steps, always with `--scope`. `partitionInstalls` keys caplet's own installs by Claude scope and, for `local`, project path, because the list also shows other directories' project and local installs; those are ignored, and installs at another Claude scope of this directory are reported. An installed plugin is never re-`install`ed, because that re-enables a plugin the user disabled. The marketplace is removed only when no install outside caplet's registration uses it and no settings file the command edits, other than caplet's own, declares it or is unreadable (`ObservedClaudeState.settings`, read by `ClaudeHost.readSettings` from `CLAUDE_CONFIG_DIR` or `~/.claude` and the working directory), because `marketplace remove` uninstalls its plugins everywhere and drops those declarations; otherwise `keptBy` says why. |
| `reconcile.ts` | `reconcileClaudeHost` runs the plan; a failed step skips only the steps that depend on it, and a command that cannot start leaves it and every later command `not run`. It reports a `ClaudeHostState` per plugin (`registered`, `disabled by user`, `not installed`, `registration required`, `blocked by host policy`, `unknown`; SPEC §22.8.4) and, built by `diagnostics.ts`, `acf.claude.cli-unavailable`, `.state-unreadable`, `.policy-blocked`, `.version-mismatch`, `.marketplace-kept` (warnings), `.command-failed` (error, apply exits 2), and `.other-scope` (info). Without the CLI the warning reads ``Claude plugin registration was not updated: spawn claude ENOENT. Install Claude Code and re-run `caplet apply`, or run:`` followed by each command, indented two spaces. `previewClaudeHost` reports the same states without running a command or warning about a missing CLI. When the state cannot be read, both still report `.marketplace-kept` for a marketplace the settings files keep. |

## 5. Reader and validation pipeline

### 5.1 Pipeline for one capability

```ts
export async function readCapability(
  root: string,
  scope: Scope,
  origin: CapabilityOrigin,
): Promise<AcfCapability> {
  const diagnostics: Diagnostic[] = []
  // A bare skill import writes `.acf-import.json`; its skills keep every
  // frontmatter key and their whole directory as assets.
  const imported = await exists(path.join(root, ".acf-import.json"))

  await validateSingularFolders(root, diagnostics)
  const manifest = (await readManifest(root, diagnostics)) ?? fallbackManifest(root)
  const capabilityMarkdown = await readAcfMd(root, diagnostics)

  const [skills, agents, commands, instructions, hooks, mcp, nativeFiles] = await Promise.all([
    readSkills(root, diagnostics, imported),
    readAgents(root, diagnostics),
    readCommands(root, diagnostics),
    readInstructions(root, diagnostics),
    readHooks(root, diagnostics),
    readMcp(root, diagnostics),
    readNativeFiles(root, diagnostics), // native/<target>/
  ])

  const capability: AcfCapability = {
    root, scope, origin, manifest, capabilityMarkdown,
    skills, agents, commands, instructions, hooks, mcp, nativeFiles,
    assets: [],
    diagnostics,
  }
  if (imported) capability.synthesized = true
  capability.assets = await collectReferencedAssets(capability)
  if (imported) capability.assets = mergeByPath(capability.assets, await collectImportedSkillAssets(skills))

  validateCapability(capability)
  sortDiagnostics(capability.diagnostics)
  return capability
}
```

Each `read*` function:

1. lists the canonical folder,
2. discovers entries by family-specific rules (§6),
3. parses each entry,
4. validates the parsed value with the canonical schema,
5. records diagnostics inline.

### 5.2 Canonical schemas (selected)

```ts
import { z } from "zod"

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

const onlyExceptSchema = z.object({
  only: z.array(slugSchema).optional(),
  except: z.array(slugSchema).optional(),
}).superRefine((v, ctx) => {
  if (v.only && v.except) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "only and except are mutually exclusive",
      path: [],
    })
  }
})

export const manifestSchema = z
  .object({
    acf: z.literal(1),
    name: slugSchema,
    version: z.string(),
    description: z.string().optional(),
    // A structured { name, email?, url? } author, or a legacy string kept verbatim.
    authors: z.array(z.union([z.string(), authorObjectSchema])).optional(),
    license: z.string().optional(),
    homepage: z.string().url().optional(),
    repository: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    only: z.array(slugSchema).optional(),
    except: z.array(slugSchema).optional(),
    targets: z.record(z.string(), z.unknown()).optional(),
  })
  .and(onlyExceptSchema)

export const skillFrontmatterSchema = z
  .object({
    name: slugSchema,
    description: z.string().min(1),
    invocation: z
      .object({
        user: z.boolean().optional(),
        model: z.boolean().optional(),
      })
      .optional(),
    license: z.string().optional(),
    compatibility: z.string().max(500).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    "argument-hint": z.string().optional(),
    assets: z.array(z.string()).optional(),
    only: z.array(slugSchema).optional(),
    except: z.array(slugSchema).optional(),
    targets: z.record(z.string(), z.unknown()).optional(),
  })
  .and(onlyExceptSchema)

export const agentFrontmatterSchema = z
  .object({
    name: slugSchema,
    description: z.string().min(1),
    mode: z.enum(["primary", "subagent", "all"]).optional(),
    model: z.literal("inherit").optional(),
    assets: z.array(z.string()).optional(),
    only: z.array(slugSchema).optional(),
    except: z.array(slugSchema).optional(),
    targets: z.record(z.string(), z.unknown()).optional(),
  })
  .and(onlyExceptSchema)

export const commandFrontmatterSchema = z
  .object({
    name: slugSchema,
    description: z.string().min(1),
    arguments: z.array(slugSchema).optional(),
    agent: z.string().optional(),
    assets: z.array(z.string()).optional(),
    only: z.array(slugSchema).optional(),
    except: z.array(slugSchema).optional(),
    targets: z.record(z.string(), z.unknown()).optional(),
  })
  .and(onlyExceptSchema)

const triggerCommonSchema = z.object({
  scope: z
    .array(
      z.object({
        operation: z.string().optional(),
        paths: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  interrupt: z.enum(["never", "always"]).optional(),
  repeat: z.enum(["once", "always"]).optional(),
  debounce: z.number().int().positive().optional(),
})

const regexTriggerSchema = triggerCommonSchema.extend({
  conditions: z.array(z.string()).min(1),
})

const fileContextTriggerSchema = triggerCommonSchema.extend({
  paths: z.array(z.string()).min(1),
})

export const instructionFrontmatterSchema = z
  .object({
    name: slugSchema,
    description: z.string().min(1),
    activation: z.union([
      z.literal("always"),
      z.object({
        when: z
          .object({
            assistant_output: regexTriggerSchema.optional(),
            operation_input: regexTriggerSchema.optional(),
            operation_result: regexTriggerSchema.optional(),
            file_context: fileContextTriggerSchema.optional(),
          })
          .refine((w) => Object.keys(w).length > 0, {
            message: "activation.when must declare at least one trigger",
          }),
      }),
    ]),
    assets: z.array(z.string()).optional(),
    only: z.array(slugSchema).optional(),
    except: z.array(slugSchema).optional(),
    targets: z.record(z.string(), z.unknown()).optional(),
  })
  .and(onlyExceptSchema)

const hookRunSchema = z.union([
  z.object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    command: z.string().min(1),
    shell: z.enum(["bash", "powershell"]),
    env: z.record(z.string(), z.string()).optional(),
  }),
])

const hookMatchSchema = z.object({
  operation: z.string().optional(),
  paths: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
})

export const hookEntrySchema = z
  .object({
    name: slugSchema,
    description: z.string().optional(),
    only: z.array(slugSchema).optional(),
    except: z.array(slugSchema).optional(),
    match: hookMatchSchema.optional(),
    run: hookRunSchema,
    effect: z.enum([
      "observe",
      "block",
      "add_context",
      "continue",
      "block_result",
      "decide",
    ]),
    timeout: z.number().int().positive().optional(),
    targets: z.record(z.string(), z.unknown()).optional(),
  })
  .and(onlyExceptSchema)

export const hookFileSchema = z.object({
  session_start: z.array(hookEntrySchema).optional(),
  user_prompt_submit: z.array(hookEntrySchema).optional(),
  pre_tool: z.array(hookEntrySchema).optional(),
  permission_request: z.array(hookEntrySchema).optional(),
  post_tool: z.array(hookEntrySchema).optional(),
  stop: z.array(hookEntrySchema).optional(),
  pre_compact: z.array(hookEntrySchema).optional(),
  targets: z
    .record(z.string(), z.strictObject({ hooks: z.record(z.string(), z.array(hookEntrySchema)).optional() }))
    .optional(),
})

const mcpServerBaseSchema = z.object({
  name: slugSchema,
  description: z.string().optional(),
  only: z.array(slugSchema).optional(),
  except: z.array(slugSchema).optional(),
  targets: z.record(z.string(), z.unknown()).optional(),
})

const mcpStdioSchema = mcpServerBaseSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().min(1).optional(),
})

const mcpHttpSchema = mcpServerBaseSchema.extend({
  transport: z.enum(["http", "sse"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
})

export const mcpServerSchema = z.union([mcpStdioSchema, mcpHttpSchema])

export const mcpFileSchema = z.object({
  servers: z.array(mcpServerSchema),
  targets: z
    .record(z.string(), z.strictObject({ servers: z.array(mcpServerSchema).optional() }))
    .optional(),
})
```

### 5.3 Cross-field validation

After per-schema parsing, the reader performs cross-field checks on each
capability:

```ts
function validateCapability(cap: AcfCapability): void {
  validateUniqueFacetNames(cap)
  validateHookFile(cap)
  validateMcpServers(cap) // values, cwd, credentials in URLs
  validateOnlyExceptTargets(cap)
  validateTargetExtensions(cap)
  validateInlineExtras(cap) // targets.<t>.native / .package
  validateNativeFileCollisions(cap) // acf.native.collision
  validateActivationConstraints(cap)
  validateApplicability(cap)
}
```

Hook-specific validation (native events, SPEC §13.9, get every check except
the effect matrix and required `match`):

```ts
function validateHookFile(cap: AcfCapability): void {
  const hooks = cap.hooks
  if (!hooks) return

  // Canonical buckets and native events; `type` is undefined for a native event,
  // which gets only the entry-shape checks (match syntax, args and shell exclusive).
  for (const { type, entry } of hookEntries(hooks)) {
    if (type !== undefined && !hookEffectMatrix[type].includes(entry.effect)) {
      cap.diagnostics.push({
        severity: "error",
        code: "acf.hook.effect.not-allowed",
        message: `effect ${entry.effect} is not allowed for ${type}`,
        path: hooks.path,
        family: "hook",
      })
    }
    if (type !== undefined && hookMatchRequired.has(type) && isEmptyMatch(entry.match)) {
      cap.diagnostics.push({
        severity: "error",
        code: "acf.hook.match.required",
        message: `${type} entries require a non-empty match`,
        path: hooks.path,
        family: "hook",
      })
    }
    validateMatch(entry.match, hooks.path, cap.diagnostics)
    // args together with shell: acf.hook.run.args-and-shell
  }
}
```

Activation validation:

```ts
function validateActivationConstraints(cap: AcfCapability): void {
  for (const inst of cap.instructions) {
    const act = inst.frontmatter.activation
    if (act === "always") continue
    for (const [name, trig] of Object.entries(act.when)) {
      if (!trig) continue
      if ("debounce" in trig && trig.debounce !== undefined) {
        if (trig.repeat !== "always") {
          cap.diagnostics.push({
            severity: "error",
            code: "acf.instruction.debounce.requires-repeat-always",
            message: `debounce is only allowed when repeat is "always" (trigger "${name}")`,
            path: inst.source.primary,
          })
        }
      }
      if (trig.scope) {
        for (const entry of trig.scope) {
          if (entry.operation && !isProvisionalOperation(entry.operation)) {
            cap.diagnostics.push({
              severity: "error",
              code: "acf.runtime.unknown-operation",
              message: `operation "${entry.operation}" is not in the provisional set`,
              path: inst.source.primary,
            })
          }
          if (entry.paths) {
            for (const p of entry.paths) {
              if (p.startsWith("/")) {
                cap.diagnostics.push({
                  severity: "error",
                  code: "acf.path.absolute",
                  message: `absolute path glob is invalid: ${p}`,
                  path: inst.source.primary,
                })
              }
            }
          }
        }
      }
    }
  }
}
```

### 5.4 Manifest-vs-disk consistency

Markdown-backed facets MUST have `frontmatter.name` equal to the discovered
file/directory basename:

```ts
function discoveredId(source: { kind: "file" | "directory"; path: string }): string {
  return source.kind === "file"
    ? path.basename(source.path, path.extname(source.path))
    : path.basename(source.path)
}

function validateFacetIdMatch(
  facet: { family: FacetFamily; name: string; source: { kind: "file" | "directory"; path: string } },
  diagnostics: Diagnostic[],
): void {
  const id = discoveredId(facet.source)
  if (id !== facet.name) {
    diagnostics.push({
      severity: "error",
      code: "acf.facet.name-mismatch",
      message: `frontmatter name "${facet.name}" must match discovered id "${id}"`,
      family: facet.family,
      path: facet.source.path,
    })
  }
}
```

## 6. Facet discovery

Each family has explicit discovery rules.

### 6.1 Skills

```ts
// `imported`: a bare skill import keeps every frontmatter key (core, a target's
// extra, or an agent-plugins extra) instead of reporting unknown keys.
async function readSkills(
  root: string,
  diagnostics: Diagnostic[],
  imported = false,
): Promise<SkillFacet[]> {
  const dir = path.join(root, "skills")
  if (!(await exists(dir))) return []

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const skills: SkillFacet[] = []

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    if (!entry.isDirectory()) {
      diagnostics.push({
        severity: "error",
        code: "acf.skill.shape.not-directory",
        message: `skills/${entry.name} must be a directory containing SKILL.md`,
        path: path.join(dir, entry.name),
      })
      continue
    }
    const skill = await readSkill(path.join(dir, entry.name), entry.name, imported, diagnostics)
    if (skill) skills.push(skill)
  }

  return skills.sort(byName)
}
```

### 6.2 Agents / Commands / Instructions

Two shapes per family:

```ts
async function readProseFamily<Family extends "agent" | "command" | "instruction">(
  root: string,
  folder: string,
  primaryFilename: string,
  diagnostics: Diagnostic[],
) {
  const dir = path.join(root, folder)
  if (!(await exists(dir))) return []

  const out: Array<{
    name: string
    source: { kind: "file" | "directory"; path: string; primary: string }
    rawFrontmatter: unknown
    body: string
  }> = []

  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const parsed = await parseMd(full)
      out.push({
        name: path.basename(entry.name, ".md"),
        source: { kind: "file", path: full, primary: full },
        rawFrontmatter: parsed.data,
        body: parsed.content,
      })
    } else if (entry.isDirectory()) {
      const primary = path.join(full, primaryFilename)
      if (!(await exists(primary))) {
        diagnostics.push({
          severity: "error",
          code: "acf.facet.primary-missing",
          message: `${folder}/${entry.name}/ must contain ${primaryFilename}`,
          path: full,
        })
        continue
      }
      const parsed = await parseMd(primary)
      out.push({
        name: entry.name,
        source: { kind: "directory", path: full, primary },
        rawFrontmatter: parsed.data,
        body: parsed.content,
      })
    }
  }

  // Reject facet appearing in both forms:
  const byName = new Map<string, number>()
  for (const facet of out) byName.set(facet.name, (byName.get(facet.name) ?? 0) + 1)
  for (const [name, count] of byName) {
    if (count > 1) {
      diagnostics.push({
        severity: "error",
        code: "acf.facet.duplicate",
        message: `${folder}/${name} appears in both file and directory form`,
      })
    }
  }

  return out
}
```

### 6.3 Hooks

```ts
async function readHooks(root: string, diagnostics: Diagnostic[]): Promise<HookFile | undefined> {
  // hooks.yml or hooks.yaml; both present is acf.hooks.duplicate-file
  const file = await pickFamilyYaml(
    path.join(root, "hooks"), "hooks", "acf.hooks.duplicate-file", diagnostics,
  )
  if (file === undefined) return undefined
  const parsed = hookFileSchema.safeParse(await parseYamlFile(file, diagnostics))
  if (!parsed.success) {
    pushZodIssues(diagnostics, parsed.error, file, {
      baseCode: "acf.hooks.invalid-field",
      family: "hook",
      unknownKeyCode: "acf.target.extension.unknown-field",
    })
    return undefined
  }

  const hookFile: HookFile = { path: file, buckets: pickBuckets(parsed.data) }
  // family-level targets.<target>.hooks; an unknown target id is acf.target.unknown-id
  const native = nativeHooks(parsed.data.targets, file, diagnostics)
  if (native !== undefined) hookFile.native = native
  return hookFile
}
```

### 6.4 MCP

`readMcp` reads `mcp/mcp.yml` or `mcp/mcp.yaml` like `readHooks`, then merges
the family-level `targets.<target>.servers` into the canonical list as servers
that apply to that target only. A target server whose name repeats a canonical
server or another entry of the same target, and a block with an unknown target
id, are reported and left out.

## 7. Resolver (capabilities.yml, sources, lockfile)

The resolver translates a scope (`user` / `project`) into a list of
`AcfCapability` instances on disk. It is the only component that talks to
the network.

### 7.1 Two-scope discovery

```ts
export type ScopeRoot = {
  scope: Scope
  agentsDir: string                    // ~/.agents or ./.agents
  capabilitiesDir: string              // <agentsDir>/capabilities
  manifestPath: string                 // <agentsDir>/capabilities.yml
  lockPath: string                     // <agentsDir>/capabilities.lock
}

export async function discoverScopes(cwd: string): Promise<ScopeRoot[]> {
  const userDir = path.join(homedir(), ".agents")
  const projectDir = await findProjectAgentsDir(cwd)   // searches upward for ./.agents

  const scopes: ScopeRoot[] = []
  if (await exists(userDir)) scopes.push(scopeRoot("user", userDir))
  if (projectDir && projectDir !== userDir) scopes.push(scopeRoot("project", projectDir))
  return scopes
}
```

For each `ScopeRoot`, the resolver:

1. parses `capabilities.yml` if present (§7.2),
2. parses `capabilities.lock` if present (§7.5),
3. enumerates directories under `capabilitiesDir/` (autoloaded capabilities),
4. for each entry in `capabilities.yml`, fetches the selected source root if
   missing, out of date, or its `ref`, `capabilities` selectors, `rename`, or
   `format` changed (a selection change never refetches),
5. detects each package's format (§7.7), discovers capability roots, applies
   collection selectors, and materializes selected capabilities into
   `capabilitiesDir/` as unfiltered snapshots,
6. reconciles snapshots no longer selected only after the complete resolution
   succeeds, then applies cross-capability uniqueness checks (§7.6).

### 7.2 `capabilities.yml` schema

```ts
export type CapabilitiesYml = {
  acf: 1                                // spec version of this file (SPEC §17.4)
  capabilities: CapabilityEntry[]       // MAY be empty; key MUST be present
  defaults?: {
    fetch?: { shallow?: boolean; blobless?: boolean }
  }
}

export type CapabilityEntry = {
  source: SourceSpec
  ref?: string                          // tag, branch, or commit; default = default branch HEAD
  path?: string                         // subpath establishing the selected source root
  format?: SourceFormat                 // overrides detection (§7.7)
  capabilities?: string[]               // normalized exact/glob paths under <source>/acf/
  include?: FacetSelector
  exclude?: FacetSelector
  rename?: Slug | Record<string, Slug>  // new name for the one capability, or per discovered name
  only?: TargetId[]                     // mutually exclusive with except
  except?: TargetId[]
}

export type SourceSpec =
  | { kind: "github"; repo: string }   // "owner/repo"
  | { kind: "git"; url: string }
  | { kind: "path"; location: string } // absolute, ~/..., or relative to capabilities.yml

// Plural keys: skills, agents, commands, instructions, hooks, mcp.
export type FacetSelector = Partial<Record<SelectorKey, string[]>>
```

Selection (`include`, `exclude`, `only`, `except`) is applied when a
capability is read, not when it is fetched: `applyEntrySelection`
(`packages/core/src/resolver/selection.ts`) applies `only`/`except`, then
`include`, then `exclude`, to the snapshot using the selection the lock
entry mirrors. Hook and MCP selectors match entry and server names,
including `targets.<target>` entries; a foreign package's native agents,
commands, hooks, and MCP servers are selected by name, and its other
remainder kinds follow the package. A selector that matches nothing is
`acf.selection.unmatched` (warn). When `include` or `exclude` removes a
component from a package that keeps native remainder, or `rename` replaced
its name (`CapabilitySource.renamedFrom`), the remainder may still reference
the removed component or the old name, which is
`acf.selection.remainder-references` (lossy).

YAML form (canonical):

```yaml
capabilities:
  - source: github:vercel-labs/agent-skills
    ref: v1.5.6
    include:
      skills: ["react-best-practices", "next-app-router"]
  - source: github:myorg/private-pack
    ref: main
    capabilities: [team-defaults, hardware/*]
  - source: github:acme/review-plugin   # a Claude plugin
    format: claude-plugin
    exclude:
      hooks: [format-on-save]
  - source: path:../my-private
```

`source` accepts shorthand strings parsed into `SourceSpec`:

```ts
export function parseSourceSpec(raw: string): SourceSpec | { error: string } {
  if (raw.startsWith("github:")) return { kind: "github", repo: raw.slice("github:".length) }
  if (raw.startsWith("git:"))    return { kind: "git",    url:  raw.slice("git:".length) }
  if (raw.startsWith("path:"))   return { kind: "path",   location: raw.slice("path:".length) }
  return { error: `unsupported source scheme: ${raw.split(":")[0]}` }
}
```

### 7.3 Source identity

```ts
export function entrySourceId(entry: CapabilityEntry, baseDir = process.cwd()): string {
  const source = sourceString(entry.source, baseDir) // path: locations made absolute
  if (entry.path === undefined) return source
  const normalizedPath = path.posix.normalize(entry.path.replaceAll("\\", "/"))
  return `${source}#path=${encodeURIComponent(normalizedPath)}`
}
```

`entrySourceId` (`packages/installer/src/lockfile.ts`) is the stable key in
the lockfile and in `CapabilityOrigin`. `ref` is not part of it: changing
the ref updates the same lock entry.

### 7.4 Fetch strategy

`fetchCapability(entry, opts)` (`packages/installer/src/fetch.ts`) returns the
entry's `path:` within the source as `root`, the checked-out `commit` (null
for `path:` sources) and the entry's `sourceId`. A `path:` source is read in
place. A git source is cloned afresh into
`<agentsDir>/.cache/acf-installer/<cacheKeyFor(sourceString(source), ref)>`
through the `git` CLI (`packages/installer/src/git.ts`):

- `--depth 1 --branch <ref>` (shallow) and `--filter=blob:none` (blobless) by
  default; `defaults.fetch.shallow` and `defaults.fetch.blobless` in
  `capabilities.yml` turn either off,
- a full clone followed by a detached checkout of `ref` when shallow is off
  or `ref` is a 40-character SHA, which a shallow clone cannot name,
- no sparse checkout: the whole repository is fetched and `path:` selects
  within it.

For private `github:` sources, `GITHUB_TOKEN` supplies an HTTP Basic authorization
header scoped to the source URL. Git receives it through process-local
`GIT_CONFIG_*` environment variables (Git 2.31 or later), not URL userinfo,
command-line arguments, or persisted repository configuration. The same ephemeral
authentication is retained during checkout because blobless clones can fetch
missing objects at that point. Git errors redact credentials, including raw and
percent-encoded token text. Without a token, normal Git authentication applies; SSH sources
retain their existing behavior. Source URLs never carry credentials: a `git:` URL with
userinfo (other than an SSH user name) or a credential-looking query or fragment parameter
is rejected with `acf.source.credential-in-url` when added and when resolved, and the
message masks the credential (`packages/core/src/credentials/`).

After fetch, the shared source inventory discovers valid capability candidates
and assigns each a selector: a POSIX path relative to `<fetched-root>/acf/` for
manifested collections, or the discovered name (before `rename`) for direct
manifested capabilities, synthesized skills, and foreign packages. `rename`
is applied once, when the resolver names the staged snapshot. When `entry.capabilities` is present the
resolver matches every exact/glob selector against those values, requires every
selector to match, and deduplicates overlaps. It stages each selected capability outside the live
snapshot tree. Only after every source entry validates does it replace
`scope/capabilities/<final-name>/`; a selector or source-entry failure discards
all staging and preserves the prior lock and snapshots. After complete
successful resolution, snapshots formerly owned by the source but absent from
the next lock are removed.

If neither a root `acf.yml` nor an `acf/` collection exists, source inventory
falls back to bare-skill discovery using SPEC §20.3 precedence. Each discovered
skill is staged as an independent generated capability; generation never writes
into the fetched root. A private import marker enables missing-description
warnings and recursive portable-asset collection while leaving the upstream
`SKILL.md` byte-identical. Inventory is shared with `caplet add` preflight so
interactive choices and resolver selectors cannot disagree.

The snapshot copies every regular file of the package root except `.git/`,
including hidden files, and keeps the executable bit. Core counts a file as
executable by the owner execute bit (`0o100`, `isExecutableMode` in
`hash/tree.ts`) everywhere: the payload digest (SPEC.md §19.6), `native/<target>/`
files, remainder classification and the executable report. Symlinks, special
files, and paths that collide after NFC normalization or case folding reject
the source with `acf.source.snapshot-rejected`. Both digests are computed
over this unfiltered snapshot (§7.5).

### 7.5 Lockfile

```ts
export type CapabilitiesLock = {
  acf: number // as read; caplet writes 1, drift reports any other version
  entries: LockEntry[]
}

export type LockEntry = {
  sourceId: string                    // entrySourceId (§7.3)
  source: string
  ref?: string
  resolvedSha?: string                // never for path: sources
  resolvedAt?: string                 // ISO 8601
  capabilityNames: string[]           // final slugs, after rename
  capabilityHash: string              // v1 hash of the first capability by name
  resolvedCapabilities?: LockedCapability[] // one per name; absent in old lockfiles
  capabilities?: string[]             // copied from the entry
  selectorsByCapability?: Record<string, string>
  rename?: Slug | Record<string, Slug>
  format?: SourceFormat               // the entry's format:, absent when detected
  include?: FacetSelector             // selection copied from the entry
  exclude?: FacetSelector
  only?: TargetId[]
  except?: TargetId[]
  synthesized?: true                  // source was imported from bare skills
}

export type LockedCapability = {
  name: string                        // after rename
  format: SourceFormat
  formatVersion?: string
  path: string                        // package root in the source, "." for the root
  payloadDigest: string               // acf-tree-2:sha256:<hex> (SPEC §19.6)
  capabilityHash: string              // sha256-<hex> (SPEC §19.5)
}
```

The lockfile is JSON written canonically by `packages/core/src/lock/`:
entries sorted by `sourceId`, keys in a fixed order, selector values sorted,
all by UTF-16 code unit (`compareCodeUnits`), never by locale.
Parsing is strict for names and digests and lenient for optional
bookkeeping, so older lockfiles keep reading.

The resolver recomputes each snapshot's payload digest when it reads the
capability and fails with `acf.lock.digest-mismatch` before anything is
emitted from a snapshot that no longer matches its record. Restoring a missing
snapshot refetches `resolvedSha` and must reproduce exactly the locked
capability names and digests; a capability the lock does not name fails the
restore like a changed digest, so no snapshot is installed without a record.

`capabilityHash` uses the v1 algorithm of SPEC §19.5 over the whole
snapshot, before selection, so a selection change never invalidates a hash
or forces a refetch:

```ts
export async function computeContentHash(root: string): Promise<string> {
  const hash = crypto.createHash("sha256")
  // listTreeFiles (hash/tree.ts): no symlinks or special files; NFC relative paths
  // sorted by their UTF-8 bytes
  for (const entry of await listTreeFiles(root)) {
    hash.update(Buffer.from(entry.rel, "utf8"))
    hash.update(Buffer.from([0]))
    hash.update(await fs.readFile(entry.absPath))
    hash.update(Buffer.from([0]))
  }
  return `sha256-${hash.digest("hex")}`
}
```

MUST match SPEC §19.5 byte-for-byte. No mode/timestamp/owner data; no
line-ending normalization; NFC-normalized relative paths.

Drift handling:

- `detectLockDrift` (`packages/installer/src/drift.ts`) reports a
  `capabilities.yml` entry without a lock entry as `acf.lock.missing-entry`
  and a changed ref, capabilities selector, `rename`, requested `format`, or
  selection, or a lock entry `capabilities.yml` no longer declares, as
  `acf.lock.drift`. Only `--mode never` (`--offline`) keeps it
  as an error; other modes resolve it in the same run (a changed ref,
  selector, rename or format refetches through `sameResolution`, a changed
  selection rewrites the lock, a removed source leaves it). `caplet apply --frozen` resolves with
  `frozen`: any drift is an error found before anything is fetched or
  written, and only missing snapshots are restored from their lock entries.
  Every fetch a frozen resolution makes, including one `--mode force` asks
  for, is such a restore at the locked `resolvedSha`.
  `caplet check --frozen` exits 3 on any non-info lock diagnostic.
- An edited snapshot fails its payload digest (above).
- Overwrite protection for drifted capabilities (`--force`) and an explicit
  `--prune` flag are not part of the current CLI. `caplet update` and
  `caplet apply` remove snapshots and lock entries that are no longer
  selected after a fully successful resolution (SPEC §20.5).

### 7.6 Cross-capability uniqueness

After all capabilities for all scopes are read:

```ts
export function deduplicateCapabilities(
  user: AcfCapability[],
  project: AcfCapability[],
): { effective: AcfCapability[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const byName = new Map<string, AcfCapability>()

  // Project shadows user.
  for (const cap of user) byName.set(cap.manifest.name, cap)
  for (const cap of project) {
    const existing = byName.get(cap.manifest.name)
    if (existing) {
      diagnostics.push({
        severity: "info",
        code: "acf.capability.shadowed",
        message: `project capability "${cap.manifest.name}" shadows user capability`,
      })
    }
    byName.set(cap.manifest.name, cap)
  }

  // Within a scope, two capabilities sharing a name is fatal unless rename in capabilities.yml.
  // (That check runs earlier, inside per-scope resolution.)

  return { effective: [...byName.values()], diagnostics }
}
```

### 7.7 Repository layouts

`SPEC.md` §20:

- **Single-capability repo**: `acf.yml` at root.
- **Multi-capability repo**: `acf/<sub-path>/acf.yml`, arbitrary nesting under
  `acf/`. Source-entry `capabilities` exact/glob selectors match `<sub-path>`;
  omission selects all. `path` first establishes a different source root.
- **Agent Plugins 1.0 package**: root `plugin.json` with the 1.0 `$schema`.
- **Claude plugin**: `.claude-plugin/plugin.json`.
- **Legacy bare `skills/` at root**: synthesizes a minimal manifest at fetch
  time when `acf.yml` is absent and `skills/` is present.

Detection takes the first match in that order (SPEC §20.6) and reports the
choice as `acf.source.format-selected` (info) when several manifests are
recognized. `format:` overrides it; a requested format the source lacks fails
with `acf.source.format-not-found`. Formats are never merged. A recognized but invalid manifest fails
the source rather than falling back to a lower format, and a
marketplace-only source fails with `acf.source.marketplace-unsupported`,
suggesting `path:`. Readers live in `packages/core/src/formats/`
(`recognizedFormats`, `selectSourceFormat`, `isForeignFormat`,
`readForeignPackage`); the installer calls them through
`inspectSource(root, { format, rename, revision })`. A manifest name that
is not a slug fails with `acf.manifest.invalid-name`, whose
`data.suggestedRename` gives a valid `rename`.

`discoverRepository` in `packages/core/src/resolver/` finds the capabilities of
an ACF repository: the root itself when it has `acf.yml` or `acf.yaml`;
otherwise every outermost directory with one under `acf/`, skipping dot
entries, sorted. Finding neither yields no roots and an
`acf.resolve.no-capabilities` info diagnostic. Bare `skills/` synthesis
happens earlier, in the installer's `inspectSource`.

## 8. Caplet configuration (`caplet.yml`)

Caplet behavior is configured separately from portable capabilities. The two
files have different scopes of concern:

| File              | Defined by      | What it controls                              |
| ----------------- | --------------- | --------------------------------------------- |
| `capabilities.yml`| `SPEC.md` §17.3 | What packages to fetch, filter, rename        |
| `caplet.yml`     | `IMPLEMENTATION.md` (here) | Caplet behavior: cache, auth, defaults |

### 8.1 Locations and merging

```ts
export const capletConfigLocations = [
  path.join(homedir(), ".agents", "caplet.yml"),
  path.join(".",        ".agents", "caplet.yml"),
] as const
```

Project deep-merges over user. Arrays replace, scalars override, objects
merge.

### 8.2 Schema

```ts
export type CapletConfig = {
  emit?: {
    scope?: "all" | "user" | "project"   // default: "all"
    defaultTargets?: TargetId[]          // default: all detected
    cleanBeforeEmit?: boolean            // default: false
    dryRun?: boolean                     // default: false
  }
  targets?: Partial<Record<TargetId, {
    out?: { user?: string; project?: string }   // override adapter defaults; absolute paths
    disabled?: boolean
    carrier?: "plugin" | "loose"        // default: the target's default carrier
    skills?: {
      native?: boolean                   // default: target lacks discovery, or shared copy fell back
      canonical?: boolean                // default: target discovers .agents/skills
    }
  }>>
  auth?: {
    github?: { kind: "gh" | "token" | "ssh"; token?: string }
  }
  resolver?: {
    cacheDir?: string                    // default: ~/.cache/caplet
    retries?: number                     // default: 2
    shallow?: boolean                    // default: true
    blobless?: boolean                   // default: true
  }
  diagnostics?: {
    showInfo?: boolean                   // default: false
    showLossy?: boolean                  // default: true
    failOnLossy?: boolean                // default: false
  }
}

const skillsEmitOptionsSchema = z.object({
  native: z.boolean().optional(),
  canonical: z.boolean().optional(),
})

export const capletConfigSchema = z.object({
  emit: z.object({
    scope: z.enum(["all", "user", "project"]).optional(),
    defaultTargets: z.array(z.string()).optional(),
    cleanBeforeEmit: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
  targets: z.record(z.string(), z.object({
    out: z.object({
      user: z.string().optional(),
      project: z.string().optional(),
    }).optional(),
    disabled: z.boolean().optional(),
    carrier: z.enum(["plugin", "loose"]).optional(), // checked against carriersOf(id)
    skills: skillsEmitOptionsSchema.optional(),
  })).optional(),
  auth: z.object({
    github: z.object({
      kind: z.enum(["gh", "token", "ssh"]),
      token: z.string().optional(),
    }).optional(),
  }).optional(),
  resolver: z.object({
    cacheDir: z.string().optional(),
    retries: z.number().int().nonnegative().optional(),
    shallow: z.boolean().optional(),
    blobless: z.boolean().optional(),
  }).optional(),
  diagnostics: z.object({
    showInfo: z.boolean().optional(),
    showLossy: z.boolean().optional(),
    failOnLossy: z.boolean().optional(),
  }).optional(),
})
```

The config never restates what an adapter already knows (`installPaths` live
in the target registry). `targets.<id>.out` is purely an override.
`targets.<id>.skills.canonical` and `targets.<id>.skills.native` toggle the
two skill emission destinations. `canonical` defaults to whether the target
discovers `.agents/skills` (Codex, Cursor, OpenCode, Pi), so a scope gets a
shared copy only when a selected target reads it. `native` defaults to
`false` for those targets unless the shared copy falls back (§4.8); Claude
Code defaults to its native skills directory. Explicit values override both
defaults. They place loose skill files only: a capability Claude receives as a
plugin carries its skills inside the package, so `canonical: true` or
`native: false` under `targets.claude` has no effect on it and raises
`acf.claude.skills-option-ignored` (warn).

`targets.<id>.carrier` picks the carrier (SPEC §22.8). Only `claude` offers
`plugin` (its default) and `loose`; naming `plugin` for any other target is a
configuration error naming that target. Switching Claude to `loose`
uninstalls caplet's Claude plugins on the next apply.

### 8.3 Scope handling

`caplet apply`, `caplet update`, and the inspection commands default to
`scope: all`; `--scope` / `-s` limits them to one scope, and mutations infer
the scope when it is unambiguous.
Behavior table:

| Setting     | Action                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| `all`       | Process user (`~/.agents/`) and project (`./.agents/`) when both exist. |
| `user`      | Only `~/.agents/`.                                                      |
| `project`   | Only `./.agents/`.                                                      |

Outside any project directory (no `./.agents/` found upward), `all` and
`project` fall back to user-only with an `acf.scope.project-not-found` info
diagnostic.

CLI flag `--scope <user|project|all>` overrides config. If an adapter
declares `installPaths[scope] === null` for a requested scope, the adapter
emits `acf.adapter.scope-unsupported` (lossy) and skips that target/scope
combination.

## 9. Asset reference resolver

`SPEC.md` §16: assets are referenced either via Markdown body links or via
explicit `frontmatter.assets: [string]`. The resolver normalizes both into
`AssetRef`.

```ts
export function collectReferencedAssets(input: {
  root: string
  capabilityMarkdown?: CapabilityMarkdown
  skills: SkillFacet[]
  agents: AgentFacet[]
  commands: CommandFacet[]
  instructions: InstructionFacet[]
  hooks: HookFile | undefined
  mcp: McpFile | undefined
  diagnostics: Diagnostic[]
}): AssetRef[] {
  const refs: AssetRef[] = []

  if (input.capabilityMarkdown) {
    pushBodyAssets(input.capabilityMarkdown.body, { family: "capability" }, refs)
  }

  for (const facet of [
    ...input.skills,
    ...input.agents,
    ...input.commands,
    ...input.instructions,
  ]) {
    pushFrontmatterAssets(facet.frontmatter.assets, facet, refs)
    pushBodyAssets(facet.body, { family: facet.family, name: facet.name }, refs)
  }

  return validateAndNormalize(input.root, refs, input.diagnostics)
}
```

`validateAndNormalize`:

- rejects absolute paths (`acf.path.absolute`),
- rejects `..` path traversal that exits the capability root (`acf.path.traversal`),
- passes URLs through (assets that are remote-referenced are not emitted as
  files; adapters decide whether to inline them),
- de-duplicates by `(path, origin, facet)` tuple.

Hooks and MCP entries do not declare asset references; they reference files
via `run.command` paths and `${ACF_*}` placeholders, validated separately at
emit time.

## 10. Applicability cascade

`SPEC.md` §6: capability `only`/`except` is the default. Facet `only`/
`except`, when declared, intersects with the capability set. A facet inherits
the capability set if it declares neither.

```ts
export function applicableTargets(
  cap: AcfCapability,
  facet: { only?: TargetId[]; except?: TargetId[] },
): TargetId[] {
  const capSet = computeSet(cap.manifest, targetIds)
  if (facet.only === undefined && facet.except === undefined) return capSet
  const facetSet = computeSet(facet, targetIds)
  return capSet.filter((id) => facetSet.includes(id))
}

function computeSet(
  decl: { only?: TargetId[]; except?: TargetId[] },
  all: readonly TargetId[],
): TargetId[] {
  if (decl.only)   return all.filter((id) => decl.only!.includes(id))
  if (decl.except) return all.filter((id) => !decl.except!.includes(id))
  return [...all]
}
```

When `applicableTargets(...)` returns an empty list and the facet was
declared (not inherited), the reader emits `acf.applicability.empty` (info).
The facet is skipped during emission.

## 11. Diagnostics

### 11.1 Type

```ts
export type Diagnostic = {
  severity: "error" | "warn" | "info" | "lossy"
  code: string                          // namespaced acf.*
  message: string
  path?: string
  location?: { line: number; column: number; offset?: number }
  targetId?: TargetId
  family?: FacetFamily
  data?: Record<string, unknown>        // optional structured payload
}
```

### 11.2 Code namespace

Diagnostic codes follow `acf.<area>.<topic>[.<subtopic>]`. The set below is
the normative starting set for `acf: 1`; conformance matrix in `SPEC.md`
§14 lists severity/phase/trigger/source.path/recovery for each. Readers
MUST emit at least the listed code with the listed severity when its
trigger holds, MAY emit additional more-specific codes, and MUST NOT
collapse listed codes into more generic ones.

```txt
# Schema
acf.schema.invalid-yaml                      # malformed YAML or frontmatter, or a `__proto__` key; the file is skipped (error)

# Manifest
acf.manifest.invalid-name
acf.manifest.invalid-field                   # any other manifest field fails its schema (version, authors, ...), or the root is not a mapping
acf.manifest.acf-version-unknown
acf.manifest.only-and-except
acf.manifest.duplicate-file                  # acf.yml AND acf.yaml both present

# Capability
acf.capability.shadowed                      # project shadows user (info)
acf.capability.name-collision                # same-scope same-name (error)

# Facet
acf.facet.name-mismatch
acf.facet.primary-missing
acf.facet.duplicate

# Layout
acf.layout.singular-facet-folder             # root `skill/`, `agent/`, etc. (error)

# Family-specific
acf.skill.shape.not-directory
acf.import.skill-description-missing        # bare skill without description; a fallback is used (warn)
acf.import.skill-frontmatter-invalid         # bare skill frontmatter is malformed or fails its schema; skipped (error)
acf.instruction.debounce.requires-repeat-always
acf.instruction.invalid-regex                # `paths` or `conditions` regex doesn't compile (error)
acf.applicability.empty                      # facet+capability applicability intersection is empty

acf.markdown.unknown-frontmatter-field       # ACF.md or facet frontmatter has unknown key (info)
acf.markdown.invalid-frontmatter-field       # ACF.md or facet frontmatter value fails its schema (error)

# Hooks
acf.hook.match.required                      # match required for pre_tool/post_tool/permission_request
acf.hook.effect.not-allowed                  # effect not in hook type's matrix
acf.hook.run.args-and-shell                  # `args` and `shell` are mutually exclusive
acf.hook.target-native-event.unknown-schema  # `targets.<target>.hooks.<event>` shape unknown
acf.hooks.invalid-field                      # any other hooks file value fails its schema (error)
acf.hooks.duplicate-file                     # hooks.yml AND hooks.yaml both present (error)

# MCP
acf.mcp.transport.missing-url                # http/sse without `url`
acf.mcp.transport.missing-command            # stdio without `command`
acf.mcp.invalid-field                        # any other MCP file value fails its schema (error)
acf.mcp.duplicate-file                       # mcp.yml AND mcp.yaml both present (error)

# Asset references
acf.path.absolute
acf.path.traversal
acf.assets.missing                          # referenced asset file does not exist (error)
acf.assets.unsupported                      # asset cannot be emitted by the selected target/facet channel (lossy)

# Target dispatch
acf.target.unknown-id
acf.target.extension.unknown-field

# Adapter degradation (all `lossy`)
acf.adapter.scope-unsupported                # target has no installPath for requested scope
acf.adapter.effect-degraded                  # canonical effect maps to weaker native effect
acf.adapter.hook-event-unsupported           # canonical hook event has no native equivalent
acf.adapter.trigger-unsupported              # instruction trigger unsupported by target
acf.adapter.facet-unsupported                # entire facet family unsupported by target
acf.adapter.not-registered                   # target id has no adapter (impl error)
acf.adapter.superseded                       # emit target has a direct-consumer extension available (info)

# Scope discovery
acf.scope.project-not-found                  # caplet asked for project scope outside a project (info)

# Runtime/taxonomy
acf.runtime.unknown-operation                # operation not in SPEC §24 provisional set
acf.runtime.case-folding                     # path matching outcome may differ on case-insensitive FS
acf.runtime.turn-granularity                 # host cannot distinguish turn boundaries
acf.runtime.family-unsupported               # direct consumer doesn't handle a facet family (lossy)
acf.runtime.trigger-unsupported              # direct consumer trigger fired but not handled (lossy)
acf.taxonomy.operation.unmapped              # internal alias used in adapter-side mapping diagnostics

# capabilities.yml + lockfile
acf.capabilities-yml.source.unknown-scheme
acf.capabilities-yml.duplicate-entry
acf.capabilities-yml.unknown-key             # key capabilities.yml does not define (error)
acf.capabilities-yml.invalid                 # any other capabilities.yml value fails its schema (error)
acf.caplet-yml.invalid                       # caplet.yml value fails its schema (error)
acf.resolve.no-capabilities                  # source has no capability (info when resolving a scope; error when installing)
acf.resolve.capability-selector-unmatched    # capabilities selector matches no source capability (error)
acf.resolve.ref-required                     # github or git source without ref (error)
acf.prune.failed                             # removing unreferenced snapshots failed (error)
acf.lock.drift
acf.lock.missing-entry
acf.lock.unsupported-version

# Apply
acf.emit.drift                               # managed region changed on disk since the last apply; reported by plan (info)
acf.apply.drift                              # owned content changed since planning, or a stale removal the user edited; skipped (warn)
acf.apply.outside-root                       # write would escape the output root (error)
acf.emit.managed-notice-reserved-path        # capability ships a file at the reserved notice name (error)
acf.emit.managed-notice-destination-collision # reserved notice path holds a file caplet does not own (error)

# Source formats and snapshots
acf.source.format-selected                   # format chosen by detection or format: (info)
acf.source.marketplace-unsupported           # marketplace-only source; use path: (error)
acf.source.format-version-unsupported        # Agent Plugins schema other than 1.0 (error)
acf.source.format-not-found                  # format: names a format the source lacks (error)
acf.source.manifest-invalid                  # recognized native manifest is invalid (error)
acf.source.manifest-key-unknown              # unknown native manifest key, preserved (warn)
acf.source.component-invalid                 # invalid foreign skill or server (incl. a native value its host rejects), excluded (warn)
acf.source.snapshot-rejected                 # symlink, special file, or path collision (error)
acf.source.credential-in-url                 # source URL carries credentials (error)
acf.lock.digest-mismatch                     # snapshot no longer matches its payloadDigest (error)

# Selection
acf.selection.unmatched                      # selector matches nothing (warn)
acf.selection.remainder-references           # removed component or old name may be referenced by remainder (lossy)

# Support registry and extras
acf.support.refused                          # field or component refused; blocks the capability on the target (error)
acf.support.degraded                         # descriptive or granting field degraded (lossy)
acf.support.component-omitted                # component the target cannot carry (lossy)
acf.extras.dropped                           # native extra not carried by this target or carrier (lossy)
acf.extras.conflict                          # extra sets a key the writer generates, or a bundled agents/openai.yaml contradicts the generated Codex metadata (error)
acf.extras.unclassified                      # native key unknown to the registry (info)
acf.extras.package-value-invalid             # invalid targets.<target>.package value (error)
acf.extras.native-value-invalid              # known targets.<target>.native key with a value outside its native domain (error)
acf.core.pending                             # extra for a pending core meaning (info)
acf.native.unknown-target                    # native/<dir> is not a target id (error)
acf.native.unsupported-entry                 # symlink or special file under native/ (error)
acf.native.collision                         # native/<target> file collides with generated output (error)
acf.skill.paths-not-core                     # top-level skill paths (error)
acf.skill.native-key-not-core                # native key at skill top level (error; descriptive: warn)
acf.skill.placeholder-unexpanded             # Claude body placeholder in a skill emitted to another target (lossy)

# MCP
acf.mcp.cwd.invalid                          # cwd base or traversal (error)
acf.mcp.url.insecure                         # non-https URL off localhost (error)
acf.mcp.url.credential-in-url                # userinfo in url (error)
acf.mcp.placeholder.unsupported              # ${ACF_DATA_DIR} in url or headers (error)
acf.mcp.placeholder.pending                  # host reference (${...}, {env:...}, $env:...) in an MCP value (error)
acf.mcp.config-conflict                      # server name claimed twice or user-defined (error)

# Claude carrier and host
acf.claude.legacy-carrier                    # capability stays loose for Claude (info)
acf.claude.plugin-file-ignored               # Claude config in a non-Claude source left out of its plugin (info)
acf.claude.skills-option-ignored             # targets.claude.skills cannot place a plugin's skills (warn)
acf.claude.cli-unavailable                   # no claude CLI; registration required (warn)
acf.claude.state-unreadable                  # plugin list unreadable (warn)
acf.claude.command-failed                    # claude plugin command failed (error)
acf.claude.policy-blocked                    # host policy blocks the plugin (warn)
acf.claude.version-mismatch                  # installed version differs after update (warn)
acf.claude.other-scope                       # plugin installed at another Claude scope (info)
acf.claude.marketplace-kept                  # removing the marketplace would touch others' registrations (warn)
acf.migration.drifted                        # edited loose artifact left in place (warn)

# CLI
acf.cli.partial-implementation               # implementer flagged a gap; non-silent failure
acf.cli.usage                                # bad command input: flag value, name, missing argument (error, exit 2)
acf.cli.internal                             # unexpected failure no command handles (error, exit 1)
acf.caplet.not-found                         # `caplet show` names no installed capability (error)
acf.doctor.git-missing                       # git is not on PATH (error)
acf.doctor.agents-unreadable                 # .agents directory missing (warn) or unreadable (error)
acf.doctor.target-unregistered               # configured target has no adapter (error)
acf.doctor.lockfile-invalid                  # capabilities.lock does not parse (error)
```

Codes SHOULD be stable across versions. New codes are additive.

### 11.3 Severity behavior

Behavior is defined in `SPEC.md` §14.2. Implementation convention:

- Validation failures from canonical schemas produce `error`.
- Target-extension schema failures produce `error` for unknown fields,
  `lossy` for portably valid fields the target cannot represent.
- Unknown target ids in `only` / `except` produce `error`.
- Loss of ordering, surface, or effect mapping produces `lossy`.
- Unknown manifest top-level fields produce `info`.
- The caplet `--strict` flag (hidden deprecated alias `--fail-on-lossy`)
  makes `lossy` diagnostics fail the command (§14.4). The caplet config
  field `diagnostics.failOnLossy` is parsed but not currently consulted by
  caplet's exit-code logic.

## 12. Emission pipeline

The emission pipeline is **scope × target**, with per-capability
applicability filtering and per-capability adapter calls. Adapters return
`FileDiff[]`. Caplet collects, optionally shows (`apply --dry-run`), and
applies them via a writer that updates `.acf-managed.json`.

Caplet owns the orchestration (`buildEmitPlan` in
`apps/caplet/src/internal/emit-plan.ts`); core exports the pieces, not an
orchestrator. For each scope root it:

1. resolves the scope's capabilities (`resolveScopeCapabilities`) and adds
   every capability's own `error` diagnostics to the plan, so a capability
   that fails validation blocks apply (SPEC.md §14.2);
2. for each target, reports `acf.adapter.scope-unsupported` when the target
   has no install root for the scope, otherwise filters each capability with
   `applyApplicability` and withholds conflicting MCP server names;
3. calls the target adapter's `validate` and `emit` per capability; a
   capability whose diagnostics block it on that target
   (`capabilityBlocked`) contributes diagnostics but no diffs, and its
   previous output is kept.

`applyApplicability(cap, targetId)`:

1. checks capability `only`/`except` against `targetId`; returns `null` if excluded,
2. drops each facet not applicable to `targetId` via the SPEC.md §6.4 cascade,
3. emits `lossy` diagnostics for unsupported facet families based on the
   support matrix,
4. returns the filtered capability.

The reader, not this step, validates `targets.<target>` payloads against the
target's extension schema.

### 12.1 Diff application

Caplet applies `FileDiff[]` after the entire emit pipeline completes
(diagnostics surface first; nothing is written if there are `error`
diagnostics).

```ts
export async function applyDiffs(
  diffs: FileDiff[],
  opts: { installRoot: string; capabilityName: string; sidecarPath: string; owner?: SidecarOwner },
): Promise<ApplyResult> {
  // 1. Read the sidecar at `sidecarPath` (`${installRoot}/.acf-managed.json`) if any.
  // 2. For each diff, skip it with an `acf.apply.drift` warning when the content it
  //    owns changed since planning (§4.2.2); otherwise:
  //    - if `after === null` and a prior sidecar entry exists: delete the
  //      owned regions (not the entire file unless `owns: [{ kind: "file" }]`).
  //    - else: write `after` to `path`.
  // 3. Rewrite the sidecar with the new (path, owns, hash) tuples of `capabilityName`.
}
```

`apply --dry-run` plans and prints the diff list without calling it.

### 12.2 Determinism

Diff ordering matters for snapshot tests. Within one `(scope, target)` pair,
emit MUST iterate capabilities in lexicographic order by capability name and
facets in lexicographic order by `(family, name)`. Diagnostics are sorted
lexicographically by `(source.path, source.line, code)`.

## 13. Adapter authoring guide

Adapters MUST:

- never mutate the input capability,
- never write to disk directly; return `FileDiff[]` only,
- use the provided `ReadOnlyFs` port for any reads of existing native files,
- diagnose every unrepresentable canonical field as `lossy` with a
  registry-listed code (`acf.adapter.effect-degraded`,
  `acf.adapter.hook-event-unsupported`, `acf.adapter.trigger-unsupported`,
  `acf.adapter.facet-unsupported`),
- preserve hook order where the host allows it,
- map canonical instruction triggers to native equivalents where supported,
  else emit `lossy`,
- treat `targets.<target>` as the only sanctioned place for native-only knobs,
- substitute `${ACF_CAPABILITY_DIR}`, `${ACF_PACKAGE_DIR}`, and
  `${ACF_HOOK_DIR}` placeholders at emit time, in the slots listed in §3.10,
- declare `AcfOwnership` for every `FileDiff` so caplet can track ACF-owned
  regions.

A loose-only target delegates to the shared writers through `emitTarget`,
passing only its `AdapterOptions` variations (as in
`packages/adapters/src/codex/index.ts`):

```ts
import { registerAdapter, type TargetAdapter, targetMap } from "@caplet/core"
import { emitTarget } from "../common/target.js"

const target = targetMap.codex
if (target === undefined) throw new Error("missing target definition for codex")

export const codexAdapter: TargetAdapter<"codex"> = {
  id: "codex",
  emit: (input, fs) => emitTarget(input, fs, target, { lossyPartialFamilies: ["command"] }),
}

registerAdapter("codex", codexAdapter)
```

A target with its own carrier chooses it in `emit`, as the Claude adapter
does between `emitClaudePlugin` and `emitTarget` (§4.9).

Adapters should consult `targetMap[targetId].mappings` for canonical-to-native
event/trigger translation; they SHOULD NOT hardcode the table locally.

### 13.0 Adapter staging

Implementers MUST ship adapters serially — one target at a time, fully
completed before starting the next. No "skeleton across N targets"
submissions: the first audit caught implementers spreading thin and leaving
every adapter half-baked.

| Milestone | Target | Notes |
|---|---|---|
| M1 | `claude` | Richest surface; flushes design issues early |
| M2 | `codex` | `project: null` lossy; native event names |
| M3 | `pi` | 1:1 native names; validates pipeline; clean win |
| M4 | `opencode` | Hook event remapping (`tool.execute.before`, etc.) |
| M5 | `cursor` | Mostly lossy by design; rules-only host |

Gating rule: an adapter milestone is **complete** only when

1. emit produces correct native artifacts for all 6 facet families on a real
   capability tree,
2. adapter-level fixture tests pass
   (`packages/adapters/tests/fixtures/<target>/` with input + expected
   output),
3. caplet-level smoke test passes
   (`apps/caplet/tests/fixtures/commands/<target>-emit/` produces expected
   files),
4. every degraded effect/event/trigger emits the listed lossy diagnostic
   code,
5. gaps are documented in `RESULTS.md` and map to listed diagnostic codes
   (no silent omission).

Implementers MAY skip ahead with documented reason but the skip itself is
recorded in `RESULTS.md`.

### 13.1 Direct ACF consumers (deferred extensions)

Pi and OpenCode are emit targets in v1, but the long-term plan is
**direct-consumer extensions**: Pi extension and OpenCode plugin would
import `@caplet/sdk`, read facets from the resolved capability tree natively,
and bypass the emit pipeline entirely. Until those extensions ship, the emit
adapter pipeline serves them.

See SPEC §22b for the normative direct-consumer contract. See §13a for the
consumer-facing convenience API.

## 13a. SDK convenience API (`@caplet/sdk`)

Direct consumers (Pi extension, OpenCode extension, future webapp,
third-party tooling) import `@caplet/sdk` for a high-level facet-fetching API
that hides the resolve/applicability/fetch pipeline.

Power users that need finer control still drop down to `@caplet/core`,
`@caplet/adapters`, and `@caplet/installer` directly. The SDK re-exports those.

### 13a.1 Helper functions

```ts
// per-family
export function getSkills(opts: FacetQueryOptions): Promise<ResolvedFacet<"skill">[]>
export function getAgents(opts: FacetQueryOptions): Promise<ResolvedFacet<"agent">[]>
export function getCommands(opts: FacetQueryOptions): Promise<ResolvedFacet<"command">[]>
export function getInstructions(opts: FacetQueryOptions): Promise<ResolvedFacet<"instruction">[]>
export function getHooks(opts: FacetQueryOptions): Promise<ResolvedFacet<"hook">[]>
export function getMcpServers(opts: FacetQueryOptions): Promise<ResolvedFacet<"mcp">[]>

// all families at once
export function getFacets(opts: FacetQueryOptions): Promise<{
  skills:       ResolvedFacet<"skill">[]
  agents:       ResolvedFacet<"agent">[]
  commands:     ResolvedFacet<"command">[]
  instructions: ResolvedFacet<"instruction">[]
  hooks:        ResolvedFacet<"hook">[]
  mcpServers:   ResolvedFacet<"mcp">[]
}>

export type FacetQueryOptions = {
  /** Adapter id. REQUIRED: direct consumers know their own target and pass
   *  it explicitly. CLI/CI may use ACF_TARGET env var. No magic inference. */
  target: TargetId

  /** Which scope to read. Defaults to `"all"`. */
  scope?: "all" | "user" | "project"

  /** Working directory used for project-scope discovery. Defaults to
   *  process.cwd(). */
  cwd?: string

  /** Fetch policy for declared sources that are not materialized yet.
   *  - `"auto"`  (default): fetch transparently via `@caplet/installer`.
   *  - `"never"`: return what's already on disk plus diagnostics.
   *  - `"force"`: re-fetch everything, ignore lockfile.
   */
  fetch?: "auto" | "never" | "force"

  /** Include the full diagnostic list in the return value. Default false:
   *  helpers return facets only. */
  includeDiagnostics?: boolean
}

export type ResolvedFacet<F extends FacetFamily> = {
  family: F
  name: string
  capability: { name: string; scope: "user" | "project"; root: string }
  frontmatter: FrontmatterFor<F>
  body?: string                          // for markdown-backed facets
  assets: AssetRef[]
  // family-specific extras:
  //   instruction → activation
  //   hook → match, run, effect
  //   mcp → transport
}
```

### 13a.2 Diagnostic capture

The SDK never throws on `lossy`/`warn`/`info` diagnostics. By default it
logs nothing and returns only facets, so a Pi extension that calls
`getSkills` gets clean output.

Two opt-in patterns for diagnostics:

```ts
// return-with-options
const { facets, diagnostics } = await getSkills({
  target: "pi",
  includeDiagnostics: true,
})

// global subscription (per-process)
import { onDiagnostic } from "@caplet/sdk"
const unsub = onDiagnostic((d) => log.warn(d.code, d.message))
```

`error` diagnostics still cause the helper to reject with an `AcfError`
carrying `diagnostics`.

### 13a.3 Statelessness

The SDK is stateless. Every call re-reads disk. There is no cache in v1.
Consumers that call helpers in a hot loop are responsible for their own
memoization — hold the result in a variable and re-call on a known trigger
(file watcher, button press, periodic refresh).

If perf becomes a real bottleneck, an opt-in `cache: true` may be added
later; it is intentionally not in v1.

### 13a.4 Example: Pi extension consuming skills

```ts
import { getSkills } from "@caplet/sdk"

const skills = await getSkills({
  target: "pi",        // Pi extension hardcodes its target
  scope: "all",        // user + project
  fetch: "auto",       // auto-fetch missing sources
})

for (const skill of skills) {
  registerWithPiSkillRouter({
    name: skill.name,
    invocation: skill.frontmatter.invocation,
    body: skill.body,
    assets: skill.assets,
  })
}
```

No subprocess to caplet. No two-step install. One import.

## 14. CLI surface (`caplet`)

Per `SPEC.md` §21. The canonical surface is 11 commands: `init`, `add`,
`remove`, `update`, `apply`, `list`, `show`, `check`, `doctor`, `status`,
and `completion`. Root help, per-command help, argument parsing, and shell
completions are generated from `COMMAND_SPECS` in
`apps/caplet/src/internal/spec.ts`; `caplet --help` is the authoritative
flag reference. Running `caplet` with no command runs `status`.

Global flags: `-s/--scope`, `-C/--cwd`, `-q/--quiet`, `-v/--verbose`,
`-y/--yes`, `--json`, `--strict`, `-V/--version`, `-h/--help`. Commands that
accept `-t/--target` select exactly the targets it names; it may repeat and
takes comma-separated ids, and an unknown id exits 2. Unknown commands and flags exit 2 with a
did-you-mean hint when one is close, and so does a missing required argument. Under `--json`
every such usage error prints the command's envelope on stdout with `ok: false` and one
`acf.cli.usage` error diagnostic (`reportCommandFailure` in
`apps/caplet/src/internal/command.ts`). An error no command handles exits 1 with its stack on
stderr; under `--json` stdout still gets the envelope, with one `acf.cli.internal` error
(`internalFailure` in `apps/caplet/src/bin.ts`).

Stubs that exit 0 without doing anything are forbidden — the first audit
caught this and it lets agents fake-pass. A command that cannot do its job
MUST emit a structured `error` diagnostic and exit non-zero; never silent
exit 0.

Aliases are rewritten before parsing (`rewriteAlias` in
`apps/caplet/src/cli.ts`); they are not separate implementation paths:

| Alias     | Rewrites to                | Notice on stderr |
| --------- | -------------------------- | ---------------- |
| `ls`      | `list`                     | none (supported) |
| `inspect` | `show`                     | deprecated       |
| `diff`    | `apply --dry-run`          | deprecated       |
| `emit`    | `apply --offline` (keeps `--dry-run`) | deprecated |
| `fetch`   | `update --no-apply` (drops `--mode`)  | deprecated |

### 14.1 Mutating commands

- `caplet add <source> [--pin <ref>] [--path <subdir>] [--scope user|project] [--no-apply]`
  inventories the source and reports selected capabilities before mutation,
  mutates `capabilities.yml`, resolves, and
  applies by default. `github:owner/repo@name` is an add-only exact capability
  selector; the persisted source omits the suffix. An unqualified interactive
  multi-capability source uses a numbered picker, while non-TTY and `--yes`
  select all.
- `caplet remove <name>... [--scope …] [--target …]` updates `capabilities.yml`
  and removes the sidecar-owned output of the named capabilities; an unknown
  name exits 2 before anything changes. It cleans only roots whose sidecar
  exists and applies like an apply that deselected those capabilities
  (`apps/caplet/src/internal/removal.ts`): an output the user edited stays and
  is reported as drift, other capabilities' pending changes stay pending, and
  the Claude host step uninstalls their plugins and updates or retires the
  marketplace before the plugin files go. Without the `claude` CLI the plugin
  files stay and `acf.claude.cli-unavailable` lists the commands; the next
  apply retries. For an entry selecting several capabilities, it retains
  sibling selectors and removes the source entry only when none remain. A legacy
  lock without exact selector mappings must be refreshed with
  `caplet update --no-apply` before ambiguous collection narrowing.
- `caplet update [name] [--scope …] [--no-apply]` re-resolves matching sources
  and applies by default.
- When `add` and `update` apply, they report the plan as `apply` does: the
  compatibility report, the file plan and the executable changes, and
  `outcomes` in `--json`.

### 14.2 Reconcile commands

- `caplet apply [--scope …] [--target …] [--dry-run] [--offline] [--frozen]`
  resolves declared sources and reconciles native artifacts. Dry-run refreshes
  lock state in memory without writing it.
- The plan opens with a compatibility report: per target, one line per
  component that is translated, changed in behavior, omitted or blocked
  (`review / pi - blocked: … Recovery: …`), a count of native components,
  and one line of dropped descriptive fields. A refusal blocks the rest of
  its capability for that target, reported on one grouped line; apply
  leaves that capability's output for the target untouched, applies
  everything else and exits 2. `--json` carries the same records as `outcomes`.
- `-n/--dry-run` prints the change plan without writing files or the
  lockfile. `--offline` never fetches and uses the lockfile as-is. `--frozen`
  exits 3 without fetching or writing when the lockfile is stale. A plan
  that deletes files asks for confirmation on a TTY unless `--yes` or
  `--json` is set. Removing a capability's regions from a shared file (a
  JSON key, a marker block) is an update; only removing a whole owned file
  is a delete.

### 14.3 Inspection commands

- `caplet status` — summarize scopes, sources, targets, capabilities, and
  pending changes.
- `caplet list` (alias `ls`) — list installed capabilities per scope.
- `caplet show <name>` — show one capability's facets, scope root, and
  target support; `--json` gives machine output. Support per target comes
  from the compatibility outcomes a plan for every target reports: `no` when
  the target installs none of the capability (not applicable, blocked, or
  every component omitted), `partial` when a component is omitted or changes
  behavior, else `yes`.
- `caplet check [--target …] [--frozen]` — validate without writing. Exits
  1 when emitted outputs are stale, 2 on validation errors or an `error`
  the plan reports (such as a component apply refuses), and 3 with
  `--frozen` when the lockfile is stale.
- `caplet doctor` — checks git availability, `.agents/` readability, the
  target registry, and lockfiles; each check reports pass/warn/fail.
- `caplet completion <bash|zsh|fish>` — print shell completions.

For a preview of what `apply` would change on disk, use
`caplet apply --dry-run` (the old `diff` alias).

### 14.4 Exit codes

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | Success, no `error` diagnostics.                                              |
| 1    | `check` found stale emitted outputs, or the user declined a confirmation.     |
| 2    | `error` diagnostics (validation, IO, fetch) or bad CLI input.                 |
| 3    | `--frozen` and the lockfile is stale (`apply`, `check`).                      |
| 4    | `lossy` diagnostics with `--strict` (`check` reports this as 2).              |
| 130  | Interactive `add` picker was cancelled.                                       |

`warn`, `lossy`, and `info` diagnostics are printed (subject to caplet
config toggles) but do not affect exit code unless `--strict` is set.

`caplet --help` and `<command> --help` MUST exit 0 with non-empty help text.
Every command MUST emit a structured diagnostic on failure, not a free-form
error string.

## 15. Migration and forward compatibility

- `acf: 1` is the only accepted spec version in v1, and per the
  "final-ish" stance is intended to be long-lived. Additive evolution only
  within `acf: 1`; behavioral changes require `acf: 2`.
- Unknown top-level manifest fields are recorded but do not fail validation
  (info diagnostic). Unknown fields inside canonical facet frontmatter are
  validated strictly to avoid silent typos.
- Unknown `source` schemes in `capabilities.yml` produce
  `acf.capabilities-yml.source.unknown-scheme` (error) and skip the entry.
- Lockfile entries with `acf: <n>` greater than the implementation's version
  are refused (`acf.lock.unsupported-version`).

## 16. Open questions

- Whether instruction trigger support needs more named triggers beyond the
  initial four (`assistant_output`, `operation_input`, `operation_result`,
  `file_context`). Likely candidates: `user_message`, `assistant_thinking`.
  Deferred until at least one target needs them.
- Exact shape, versioning, and ownership of the runtime taxonomy/registry for
  operation, event, permission, and message-surface identifiers; likely
  extractable into a sibling spec/package shared with systems such as
  SessionLoom.
- Whether a future generic hook runner / instruction runtime is published
  alongside ACF or as a sibling specification.
- Watch-mode behavior for `path:` sources during local development
  (`caplet dev <capability>` proposal vs. `apply` reading sources directly).
- Whether a future generic auth provider abstraction (beyond `gh|token|ssh`
  for GitHub) is needed once non-GitHub `git:` sources become common.
