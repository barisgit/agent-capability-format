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
    core/                 # data model, parsing, validation, diagnostics, resolver
    adapters/             # adapter contract + built-in target adapters
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

Turborepo convention: `apps/` for runnable end-user binaries, `packages/` for
libraries. `runtime-taxonomy/` is a stub placeholder; if the taxonomy
graduates to its own repo (likely), this package either re-exports it or is
removed.

This repo uses **OpenSpec** (`openspec/`) for change proposals and capability
specs instead of ADRs. Hard decisions live in OpenSpec change artifacts;
`IMPLEMENTATION.md` describes the reference implementation shape itself.

### apps/caplet

Reference CLI. Uses `@acf/core` + `@acf/adapters` to:

- validate capabilities and `capabilities.yml`,
- resolve and fetch remote capabilities,
- emit native artifacts,
- report diagnostics,
- run the full command surface from `SPEC.md` §21 (`add`/`remove`/`update`/
  `fetch`/`emit`/`apply`/`check`/`inspect`/`ls`/`diff`/`doctor`).

The CLI is an implementation, not part of the spec. Hot-path runtime helpers
(hook runner, instruction runtime) are deliberately out of scope here and
evaluated separately. Additional apps (docs site, web playground, MCP server
exposing caplet) are explicitly deferred until there is a concrete user.

### packages/core

Owns:

- the canonical ACF data model (§3),
- YAML parsing and Markdown-frontmatter parsing,
- schema validation (Zod or equivalent),
- the diagnostic data type (§11),
- the normalized capability representation produced by the reader (§5),
- the resolver (§7) including `capabilities.yml` parsing, lockfile management,
  and source fetchers,
- caplet configuration parsing (§8),
- the asset reference resolver (§9),
- the applicability cascade (§10).

### packages/adapters

Owns:

- the `TargetAdapter` contract (§4),
- the target registry (§4),
- built-in target adapters (`claude`, `codex`, `cursor`, `opencode`, `pi`),
- per-target facet support metadata,
- per-target install paths for user and project scope,
- per-target hook event / instruction trigger / MCP location mapping tables,
- per-target, per-family extension schemas.

For v1 all built-in adapters live together. They MAY be split into
`@acf/adapter-claude` etc. only when dependency boundaries justify it.

### packages/runtime-taxonomy

Reserved. The runtime taxonomy / registry intentionally lives outside the
normative specification (`SPEC.md` §14.5, §24). The provisional operation set
(`SPEC.md` §24) is part of `acf: 1` and lives in `@acf/core` as a frozen
constant, not in this package. When this package becomes real, it owns:

- canonical operation identifiers (full list, semantics, target mappings),
- canonical event identifiers,
- permission and message-surface vocabularies,
- per-target mappings beyond what the adapter registry needs.

Until then, ACF references operation/event/permission identifiers as opaque
slug strings validated only for shape against the `SPEC.md` §24 set; adapters
validate semantic mapping into their host.

## 2. Tooling assumptions

- TypeScript 5+, strict mode.
- pnpm workspaces in a Turborepo.
- Zod (or equivalent) for runtime schema validation; emit canonical diagnostics
  from validation errors.
- `yaml` package for YAML parsing with line/column information.
- `gray-matter` (or equivalent) for Markdown frontmatter extraction.
- `isomorphic-git` or shelling out to `git` for source fetching; the resolver
  module hides the choice behind a `GitClient` interface.
- `ESM`, Node ≥ 20 for the CLI.

No Rust component is planned for v1. If a future generic hook runner needs
process-level performance, evaluate a separate native runner instead of
re-implementing the parser/emitter.

## 3. Data model

### 3.1 Top-level capability type

```ts
export type AcfCapability = {
  root: string                         // absolute path to capability root
  scope: Scope                         // resolved scope ("user" | "project")
  origin: CapabilityOrigin             // how this capability was obtained
  manifest: Manifest
  capabilityMarkdown?: CapabilityMarkdown // ACF.md if present
  skills: SkillFacet[]
  agents: AgentFacet[]
  commands: CommandFacet[]
  instructions: InstructionFacet[]
  hooks: HookFile | undefined
  mcp: McpFile | undefined
  assets: AssetRef[]                   // referenced asset paths
  diagnostics: Diagnostic[]
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

`CapabilityOrigin` lets `caplet inspect` and diagnostics explain why a
capability exists and where it came from. `LockEntry` is defined in §7.

### 3.2 Manifest

```ts
export type Manifest = {
  acf: 1
  name: Slug
  version: SemVer
  description?: string
  authors?: string[]
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
  targets?: HookTargetExtensions
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
  servers: McpServer[]
  targets?: Partial<Record<TargetId, { servers?: McpServer[] }>>
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
  | { transport: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { transport: "http"; url: string; headers?: Record<string, string> }
  | { transport: "sse"; url: string; headers?: Record<string, string> }
```

### 3.9 Asset reference type

```ts
export type AssetRef = {
  path: string                          // capability-relative source path
  origin: "frontmatter" | "markdown"
  facet: { family: FacetFamily; name: string } | { family: "capability" }
}
```

### 3.10 Path placeholders (SPEC §13.6.5)

```ts
export const acfPathPlaceholders = [
  "${ACF_CAPABILITY_DIR}",    // alias for ACF_PACKAGE_DIR
  "${ACF_PACKAGE_DIR}",       // legacy synonym retained for ergonomics
  "${ACF_HOOK_DIR}",
] as const
```

Substitution is performed when the adapter materializes a hook `run.command`,
hook `run.args[i]`, hook `run.env[k]`, MCP `command`, MCP `args[i]`, MCP
`env[k]`, and MCP `headers[k]`. No other interpolation is performed by ACF.

## 4. Target registry

The registry is the single source of truth for target identity, facet
support, install paths, native mapping tables, and per-target extension
schemas. It uses the definition-first pattern.

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

  support: Partial<Record<FacetFamily, SupportLevel>>
  installPaths: InstallPaths
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

```ts
export type TargetAdapter<Id extends string> = {
  id: Id

  /**
   * Emit native artifacts for one capability into one scope.
   * Adapters MUST NOT mutate the input capability.
   */
  emit(input: EmitInput): Promise<EmitResult>

  /**
   * Optional pre-emit validation pass; runs after generic validation.
   */
  validate?(input: EmitInput): Promise<Diagnostic[]>
}

export type EmitInput = {
  capability: AcfCapability
  scope: Scope
  installRoot: string                  // resolved absolute install path for this target+scope
  options?: EmitOptions
}

export type EmitOptions = {
  cleanBeforeEmit?: boolean
  dryRun?: boolean
}

export type EmitResult = {
  files: EmittedFile[]
  diagnostics: Diagnostic[]
}

export type EmittedFile = {
  path: string                         // absolute path
  contents: Buffer | string
  mode?: number                        // POSIX mode bits where relevant
}
```

### 4.3 Registry sketch

```ts
import { homedir } from "node:os"

const HOME = homedir()

export const targets = defineTargets([
  defineTarget({
    id: "claude",
    displayName: "Claude Code",

    support: {
      skill: "full",
      agent: "full",
      command: "full",
      instruction: "partial",
      hook: "full",
      mcp: "full",
    },

    installPaths: {
      user:    `${HOME}/.claude`,
      project: `./.claude`,
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

    extensions: {
      capability:  claudeCapabilityExtensionSchema,
      skill:       claudeSkillExtensionSchema,
      agent:       claudeAgentExtensionSchema,
      command:     claudeCommandExtensionSchema,
      instruction: claudeInstructionExtensionSchema,
      hook:        claudeHookExtensionSchema,
      mcp:         claudeMcpExtensionSchema,
    },

    adapter: claudeAdapter,
  }),

  defineTarget({
    id: "codex",
    displayName: "Codex",

    support: {
      skill: "full",
      agent: "full",
      command: "partial",
      instruction: "none",
      hook: "full",
      mcp: "full",
    },

    installPaths: {
      user:    `${HOME}/.codex`,
      project: null,                         // Codex has no per-project scope today
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
        user:    `${HOME}/.codex/mcp.json`,
        project: null,
      },
    },

    extensions: {
      capability:  codexCapabilityExtensionSchema,
      skill:       codexSkillExtensionSchema,
      agent:       codexAgentExtensionSchema,
      command:     codexCommandExtensionSchema,
      instruction: codexInstructionExtensionSchema,
      hook:        codexHookExtensionSchema,
      mcp:         codexMcpExtensionSchema,
    },

    adapter: codexAdapter,
  }),

  defineTarget({
    id: "opencode",
    displayName: "OpenCode",
    support: {
      skill: "full",
      agent: "full",
      command: "partial",
      instruction: "partial",
      hook: "partial",
      mcp: "full",
    },
    installPaths: {
      user:    `${HOME}/.config/opencode`,
      project: `./.opencode`,
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
        user:    `${HOME}/.config/opencode/mcp.json`,
        project: `./.opencode/mcp.json`,
      },
    },
    extensions: {
      capability:  opencodeCapabilityExtensionSchema,
      skill:       opencodeSkillExtensionSchema,
      agent:       opencodeAgentExtensionSchema,
      command:     opencodeCommandExtensionSchema,
      instruction: opencodeInstructionExtensionSchema,
      hook:        opencodeHookExtensionSchema,
      mcp:         opencodeMcpExtensionSchema,
    },
    adapter: opencodeAdapter,
  }),

  defineTarget({
    id: "cursor",
    displayName: "Cursor",
    support: {
      skill: "partial",
      agent: "partial",
      command: "partial",
      instruction: "partial",
      hook: "none",
      mcp: "full",
    },
    installPaths: {
      user:    `${HOME}/.cursor`,
      project: `./.cursor`,
    },
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
    extensions: {
      capability:  cursorCapabilityExtensionSchema,
      skill:       cursorSkillExtensionSchema,
      agent:       cursorAgentExtensionSchema,
      command:     cursorCommandExtensionSchema,
      instruction: cursorInstructionExtensionSchema,
      mcp:         cursorMcpExtensionSchema,
    },
    adapter: cursorAdapter,
  }),

  defineTarget({
    id: "pi",
    displayName: "Pi",
    support: {
      skill: "full",
      agent: "full",
      command: "full",
      instruction: "full",
      hook: "full",
      mcp: "full",
    },
    installPaths: {
      user:    `${HOME}/.pi`,
      project: `./.pi`,
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
        user:    `${HOME}/.pi/mcp.json`,
        project: `./.pi/mcp.json`,
      },
    },
    extensions: {
      capability:  piCapabilityExtensionSchema,
      skill:       piSkillExtensionSchema,
      agent:       piAgentExtensionSchema,
      command:     piCommandExtensionSchema,
      instruction: piInstructionExtensionSchema,
      hook:        piHookExtensionSchema,
      mcp:         piMcpExtensionSchema,
    },
    adapter: piAdapter,
  }),
] as const)
```

### 4.4 Derived outputs

```ts
export type TargetId = (typeof targets)[number]["id"]

export const targetIds: readonly TargetId[] =
  targets.map((t) => t.id) as TargetId[]

export const targetMap: Readonly<Record<TargetId, TargetDefinition<TargetId>>> =
  deriveTargetMap(targets)

export const targetExtensionSchemas = deriveExtensionSchemas(targets)
export const targetSupportMatrix    = deriveSupportMatrix(targets)
export const targetHookEventMap     = deriveHookEventMap(targets)
export const targetTriggerSupport   = deriveTriggerSupport(targets)

export function isTargetId(value: unknown): value is TargetId {
  return typeof value === "string" && (targetIds as string[]).includes(value)
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

Per-target, per-family extension schemas are declared next to the adapter:

```ts
import { z } from "zod"

export const claudeHookExtensionSchema = z.object({
  hooks: z
    .record(
      z.string(),                    // native event name; not slug-restricted
      z.array(
        canonicalHookEntrySchema.extend({
          runInBackground: z.boolean().optional(),
        }),
      ),
    )
    .optional(),
})
```

Unknown target ids or unknown keys under a known target id are diagnostics
(§11), not silent passes.

## 5. Reader and validation pipeline

### 5.1 Pipeline for one capability

```ts
export async function readCapability(
  root: string,
  scope: Scope,
  origin: CapabilityOrigin,
): Promise<AcfCapability> {
  const diagnostics: Diagnostic[] = []

  const manifest = await readManifest(root, diagnostics)
  if (!manifest) return failed(root, scope, origin, diagnostics)

  const capabilityMarkdown = await readAcfMd(root, diagnostics)

  const [skills, agents, commands, instructions, hooks, mcp] = await Promise.all([
    readSkills(root, diagnostics),
    readAgents(root, diagnostics),
    readCommands(root, diagnostics),
    readInstructions(root, diagnostics),
    readHooks(root, diagnostics),
    readMcp(root, diagnostics),
  ])

  const capability: AcfCapability = {
    root,
    scope,
    origin,
    manifest,
    capabilityMarkdown,
    skills,
    agents,
    commands,
    instructions,
    hooks,
    mcp,
    assets: collectReferencedAssets({
      root,
      capabilityMarkdown,
      skills,
      agents,
      commands,
      instructions,
      hooks,
      mcp,
      diagnostics,
    }),
    diagnostics,
  }

  validateCapability(capability)
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
    authors: z.array(z.string()).optional(),
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
    .record(z.string(), z.object({ hooks: z.record(z.string(), z.array(hookEntrySchema)).optional() }))
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
    .record(z.string(), z.object({ servers: z.array(mcpServerSchema).optional() }))
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
  validateOnlyExceptTargets(cap)
  validateTargetExtensions(cap)
  validateActivationConstraints(cap)
  validateAgentReferences(cap)
  validateAssetReferences(cap)
}
```

Hook-specific validation:

```ts
function validateHookFile(cap: AcfCapability): void {
  const hooks = cap.hooks
  if (!hooks) return

  for (const [bucket, entries] of Object.entries(hooks.buckets)) {
    if (!entries) continue
    const type = bucket as CanonicalHookType

    for (const entry of entries) {
      if (!hookEffectMatrix[type].includes(entry.effect)) {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.hook.effect.not-allowed",
          message: `effect "${entry.effect}" is not allowed for hook type "${type}"`,
          path: hooks.path,
        })
      }

      if (hookMatchRequired.has(type)) {
        if (!entry.match || isEmptyMatch(entry.match)) {
          cap.diagnostics.push({
            severity: "error",
            code: "acf.hook.match.required",
            message: `${type} entries require a non-empty match`,
            path: hooks.path,
          })
        }
      }
    }
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
async function readSkills(root: string, diagnostics: Diagnostic[]): Promise<SkillFacet[]> {
  const dir = path.join(root, "skills")
  if (!(await exists(dir))) return []

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const skills: SkillFacet[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      diagnostics.push({
        severity: "error",
        code: "acf.skill.shape.not-directory",
        message: `skills/${entry.name} must be a directory containing SKILL.md`,
        path: path.join(dir, entry.name),
      })
      continue
    }
    const skill = await readSkillDir(path.join(dir, entry.name), diagnostics)
    if (skill) skills.push(skill)
  }

  return skills
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
  const dir = path.join(root, "hooks")
  const candidates = ["hooks.yml", "hooks.yaml"].map((n) => path.join(dir, n))
  const present = (await Promise.all(candidates.map(exists)))
    .map((ok, i) => (ok ? candidates[i] : null))
    .filter((p): p is string => !!p)

  if (present.length === 0) return undefined
  if (present.length > 1) {
    diagnostics.push({
      severity: "error",
      code: "acf.hooks.duplicate-file",
      message: `hooks/hooks.yml and hooks/hooks.yaml both exist`,
    })
    return undefined
  }

  const file = present[0]
  const raw = await readYaml(file)
  const parsed = hookFileSchema.safeParse(raw)
  if (!parsed.success) {
    pushZodIssues(diagnostics, parsed.error, file)
    return undefined
  }

  return { path: file, buckets: pickBuckets(parsed.data), targets: parsed.data.targets }
}
```

### 6.4 MCP

`readMcp` mirrors `readHooks` against `mcp/mcp.yml` and `mcp/mcp.yaml`.

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
4. for each entry in `capabilities.yml`, fetches into `capabilitiesDir/` if
   missing or out of date,
5. reads each capability via `readCapability` (§5.1),
6. applies cross-capability uniqueness checks (§7.6).

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
  path?: string                         // subpath for multi-capability repos
  include?: FacetSelector
  exclude?: FacetSelector
  rename?: string                       // override capability slug for collision resolution
}

export type SourceSpec =
  | { kind: "github"; repo: string }   // "owner/repo"
  | { kind: "git"; url: string }
  | { kind: "path"; location: string } // absolute, ~/..., or relative to capabilities.yml

export type FacetSelector = Partial<Record<FacetFamily, string[]>>
```

YAML form (canonical):

```yaml
capabilities:
  - source: github:vercel-labs/agent-skills
    ref: v1.5.6
    include:
      skill: ["react-best-practices", "next-app-router"]
  - source: github:myorg/private-pack
    ref: main
    path: acf/team-defaults
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
export function sourceId(spec: SourceSpec, entry: CapabilityEntry): string {
  const base =
    spec.kind === "github" ? `github:${spec.repo}`     :
    spec.kind === "git"    ? `git:${spec.url}`         :
                             `path:${spec.location}`
  const refPart  = entry.ref  ? `@${entry.ref}` : ""
  const pathPart = entry.path ? `#${entry.path}` : ""
  return `${base}${refPart}${pathPart}`
}
```

`sourceId` is used as the stable key in the lockfile and in
`CapabilityOrigin`.

### 7.4 Fetch strategy

```ts
export type GitClient = {
  clone(opts: CloneOpts): Promise<CloneResult>
  resolveRef(opts: { repo: string; ref: string }): Promise<string>   // returns commit SHA
}

export type CloneOpts = {
  url: string
  destination: string
  ref?: string
  shallow?: boolean
  blobless?: boolean
  sparsePaths?: string[]
}
```

Default fetch (`SPEC.md` §18):

- `--depth 1` (shallow) AND `--filter=blob:none` (blobless),
- `--sparse-checkout` set to `entry.path` if declared,
- fall back to full clone if `ref` looks like a 40-char SHA (shallow + arbitrary SHA needs `--shallow-since` or refspec gymnastics).

```ts
export async function fetchCapability(
  spec: SourceSpec,
  entry: CapabilityEntry,
  cacheDir: string,
  client: GitClient,
): Promise<{ root: string; commit: string }> {
  switch (spec.kind) {
    case "path": {
      const resolved = resolveLocalPath(spec.location)
      return { root: subPath(resolved, entry.path), commit: "local" }
    }
    case "github":
    case "git": {
      const url = spec.kind === "github" ? `https://github.com/${spec.repo}.git` : spec.url
      const dest = path.join(cacheDir, hashSourceId(sourceId(spec, entry)))
      const result = await client.clone({
        url,
        destination: dest,
        ref: entry.ref,
        shallow: !looksLikeSha(entry.ref),
        blobless: true,
        sparsePaths: entry.path ? [entry.path] : undefined,
      })
      return { root: subPath(dest, entry.path), commit: result.commit }
    }
  }
}
```

After fetch, the resolver copies (not symlinks) the resolved subtree into
`scope/capabilities/<final-name>/`.

### 7.5 Lockfile

```ts
export type CapabilitiesLock = {
  acf: 1
  entries: LockEntry[]
}

export type LockEntry = {
  sourceId: string                    // SourceSpec + ref + path serialized
  commit: string                      // resolved SHA (or "local" for path: sources)
  contentHash: string                 // sha256 over the final installed tree
  installedAt: string                 // ISO 8601
  capabilityName: string              // final installed slug (post-rename)
}
```

`contentHash` (lockfile field `capabilityHash` per SPEC §19.5) is computed
over the installed capability subtree using the normative algorithm in
SPEC §19.5:

```ts
export async function computeContentHash(root: string): Promise<string> {
  const files = await listRegularFilesRecursive(root)        // no symlinks, no specials
  const rels = files
    .map((f) => path.relative(root, f).split(path.sep).join("/").normalize("NFC"))
    .sort()                                                   // byte-lexicographic
  const hash = crypto.createHash("sha256")
  for (const rel of rels) {
    hash.update(Buffer.from(rel, "utf8"))
    hash.update(Buffer.from([0]))
    hash.update(await fs.readFile(path.join(root, ...rel.split("/"))))
    hash.update(Buffer.from([0]))
  }
  return `sha256-${hash.digest("hex")}`
}
```

MUST match SPEC §19.5 byte-for-byte. No mode/timestamp/owner data; no
line-ending normalization; NFC-normalized relative paths.

Drift handling:

- `caplet check` warns if `contentHash` differs from on-disk state (user
  edited an installed capability).
- `caplet fetch` refuses to overwrite a drifted capability without `--force`.
- `caplet fetch --prune` removes lock entries (and on-disk capabilities) not
  present in `capabilities.yml`.

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
  `acf/`.
- **Legacy bare `skills/` at root**: synthesizes a minimal manifest at fetch
  time when `acf.yml` is absent and `skills/` is present.

```ts
export async function discoverCapabilityRoots(repoRoot: string): Promise<string[]> {
  if (await exists(path.join(repoRoot, "acf.yml"))) return [repoRoot]
  if (await exists(path.join(repoRoot, "acf.yaml"))) return [repoRoot]

  const acfDir = path.join(repoRoot, "acf")
  if (await exists(acfDir)) return findAllAcfManifests(acfDir)

  if (await exists(path.join(repoRoot, "skills"))) return [synthesizeLegacyManifest(repoRoot)]

  return []
}
```

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

### 8.3 Scope handling

`caplet apply`, `caplet emit`, `caplet fetch` default to `scope: all`.
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

Diagnostic codes follow `acf.<area>.<topic>[.<subtopic>]`:

```txt
acf.manifest.invalid-name
acf.manifest.acf-version-unknown
acf.manifest.only-and-except

acf.capability.shadowed
acf.capability.name-collision

acf.facet.name-mismatch
acf.facet.primary-missing
acf.facet.duplicate

acf.skill.shape.not-directory
acf.instruction.debounce.requires-repeat-always
acf.applicability.empty

acf.hook.match.required
acf.hook.effect.not-allowed
acf.hook.run.args-and-shell
acf.hook.target-native-event.unknown-schema

acf.mcp.transport.missing-url

acf.path.absolute
acf.path.traversal

acf.target.unknown-id
acf.target.extension.unknown-field

acf.adapter.scope-unsupported

acf.scope.project-not-found

acf.runtime.unknown-operation
acf.runtime.case-folding
acf.runtime.turn-granularity

acf.taxonomy.operation.unmapped

acf.capabilities-yml.source.unknown-scheme
acf.capabilities-yml.duplicate-entry

acf.lock.drift
acf.lock.missing-entry
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
- Caplet config `diagnostics.failOnLossy: true` upgrades `lossy` to `error`
  for exit-code purposes only.

## 12. Emission pipeline

```ts
export type EmitRequest = {
  scopes: ScopeRoot[]                  // from resolver §7.1, filtered by --scope
  targets: TargetId[]                  // from caplet config or --target
  options: EmitOptions
}

export type EmitReport = {
  perScopeTarget: Record<string, EmitResult>   // key = `${scope}:${target}`
}

export async function emit(req: EmitRequest): Promise<EmitReport> {
  const report: EmitReport = { perScopeTarget: {} }

  for (const scopeRoot of req.scopes) {
    const capabilities = await resolveScopeCapabilities(scopeRoot)

    for (const targetId of req.targets) {
      const target = targetMap[targetId]
      const installRoot = resolveInstallRoot(target, scopeRoot.scope)
      if (installRoot === null) {
        report.perScopeTarget[`${scopeRoot.scope}:${targetId}`] = {
          files: [],
          diagnostics: [{
            severity: "lossy",
            code: "acf.adapter.scope-unsupported",
            message: `${targetId} does not support scope=${scopeRoot.scope}`,
          }],
        }
        continue
      }

      const allFiles: EmittedFile[] = []
      const allDiags: Diagnostic[] = []

      for (const cap of capabilities) {
        const filtered = applyApplicability(cap, targetId)
        if (filtered === null) continue   // capability fully excluded
        const result = await target.adapter.emit({
          capability: filtered,
          scope: scopeRoot.scope,
          installRoot,
          options: req.options,
        })
        allFiles.push(...result.files)
        allDiags.push(...result.diagnostics)
      }

      report.perScopeTarget[`${scopeRoot.scope}:${targetId}`] = {
        files: allFiles,
        diagnostics: allDiags,
      }
    }
  }

  return report
}

function resolveInstallRoot(target: TargetDefinition<TargetId>, scope: Scope): string | null {
  // caplet.yml override beats adapter default.
  const override = getCapletOverride(target.id, scope)
  if (override) return override
  return target.installPaths[scope]
}
```

`applyApplicability(cap, targetId)`:

1. checks capability `only`/`except` against `targetId`; returns `null` if excluded,
2. drops each facet not applicable to `targetId` via §10 cascade,
3. validates each remaining facet's `targets.<target>` payload against the
   target's extension schema,
4. emits `lossy` diagnostics for unsupported facet families based on the
   support matrix,
5. returns the filtered capability.

## 13. Adapter authoring guide

Adapters MUST:

- never mutate the input capability,
- never read native artifacts as if they were ACF source,
- diagnose every unrepresentable canonical field as `lossy`,
- preserve hook order where the host allows it,
- map canonical instruction triggers to native equivalents where supported,
  else emit `lossy`,
- treat `targets.<target>` as the only sanctioned place for native-only knobs,
- substitute `${ACF_CAPABILITY_DIR}`, `${ACF_PACKAGE_DIR}`, and
  `${ACF_HOOK_DIR}` placeholders at emit time, in the slots listed in §3.10.

Recommended adapter file shape:

```ts
import type { TargetAdapter } from "@acf/adapters"

export const claudeAdapter: TargetAdapter<"claude"> = {
  id: "claude",
  async emit({ capability, scope, installRoot }) {
    const files: EmittedFile[] = []
    const diagnostics: Diagnostic[] = []

    files.push(...emitClaudeSkills(capability, installRoot, diagnostics))
    files.push(...emitClaudeAgents(capability, installRoot, diagnostics))
    files.push(...emitClaudeCommands(capability, installRoot, diagnostics))
    files.push(...emitClaudeInstructions(capability, installRoot, diagnostics))
    files.push(...emitClaudeHooks(capability, installRoot, scope, diagnostics))
    files.push(...emitClaudeMcp(capability, installRoot, scope, diagnostics))

    return { files, diagnostics }
  },
}
```

Adapters should consult `targetMap[targetId].mappings` for canonical-to-native
event/trigger translation; they SHOULD NOT hardcode the table locally.

## 14. CLI surface (`caplet`)

Per `SPEC.md` §21:

### 14.1 Mutating commands

- `caplet add <source>[@<ref>][:<path>] [--scope user|project] [--include …] [--exclude …]`
  Mutates `capabilities.yml`. Does not fetch unless `--fetch` is passed.
- `caplet remove <name> [--scope …]` — removes an entry by capability name or
  source id.
- `caplet update [<name>…] [--scope …]` — bumps `ref` (interactive picker if
  omitted).

### 14.2 Reconcile commands

- `caplet fetch [--scope …] [--prune] [--force]` — reads `capabilities.yml`,
  fetches missing/changed entries, updates the lockfile. `--prune` removes
  entries no longer listed.
- `caplet emit [--target <id>…] [--scope …] [--out <dir>] [--dry-run]` —
  emits native artifacts.
- `caplet apply [--scope …] [--target …]` — `fetch` followed by `emit`.

### 14.3 Inspection commands

- `caplet check [path]` — read + validate without emitting; print diagnostics.
- `caplet inspect [path|--scope …]` — print resolved capability tree
  (capabilities, facets, hooks, MCP servers, assets, applicable targets) as
  JSON.
- `caplet ls [--scope …] [--family …]` — list resolved capabilities and
  facets. Human-readable.
- `caplet diff [--scope …] [--target …]` — show what `emit` would change on
  disk (file-level diff between current installRoot and would-be output).
- `caplet doctor` — environment checks (yaml parser, git availability, target
  registry health, scope discovery, lockfile drift).

### 14.4 Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | Success, no `error` diagnostics.                          |
| 1    | Validation errors present (or `lossy` with `failOnLossy`). |
| 2    | Usage error.                                              |
| 3    | I/O error.                                                |
| 4    | Network error during fetch.                               |

`warn`, `lossy`, and `info` diagnostics are printed (subject to caplet config
toggles) but do not affect exit code unless `failOnLossy` is set.

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
  (`caplet dev <capability>` proposal vs. `emit` reading sources directly).
- Whether `caplet diff` should diff at the source-tree level or the
  emitted-artifact level by default.
- Whether a future generic auth provider abstraction (beyond `gh|token|ssh`
  for GitHub) is needed once non-GitHub `git:` sources become common.
