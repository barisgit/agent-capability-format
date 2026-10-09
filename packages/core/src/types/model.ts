import {
  type CanonicalHookType,
  type CanonicalTriggerName,
  canonicalHookTypes,
  canonicalTriggerNames,
  type ProvisionalOperationId,
  provisionalOperations,
} from "@caplet/runtime-taxonomy";
import type { LockEntry } from "../lock/index.js";
import { placeholder } from "../utils/placeholder.js";
import type {
  CapabilitySource,
  NativeFileExtra,
  NativeRemainderComponent,
  SourceFormat,
} from "./interop.js";

export {
  canonicalHookTypes,
  canonicalTriggerNames,
  provisionalOperations,
  type CanonicalHookType,
  type CanonicalTriggerName,
  type ProvisionalOperationId,
};

export type Slug = string;
export type SemVer = string;
export type TargetId = string;
export type OperationId = string;
export type Scope = "user" | "project";
export type FacetFamily = "skill" | "agent" | "command" | "instruction" | "hook" | "mcp";
export type SupportLevel = "full" | "partial" | "none";

export type CapabilityOrigin =
  | { kind: "local"; directory: string }
  | { kind: "fetched"; sourceId: string; lockEntry: LockEntry };

export type TargetExtensions = Partial<Record<TargetId, unknown>>;

/** A structured package author (canonical-package-metadata, Canonical package metadata fields). */
export type PackageAuthor = { name: string; email?: string | undefined; url?: string | undefined };

export type Manifest = {
  acf: 1;
  name: Slug;
  version: SemVer;
  description?: string | undefined;
  /** Structured authors, or legacy free-form strings kept verbatim (never decoded here). */
  authors?: Array<string | PackageAuthor> | undefined;
  license?: string | undefined;
  homepage?: string | undefined;
  repository?: string | undefined;
  keywords?: string[] | undefined;
  only?: TargetId[] | undefined;
  except?: TargetId[] | undefined;
  targets?: TargetExtensions | undefined;
  unknown?: Record<string, unknown> | undefined;
};

export type Frontmatter<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  only?: TargetId[] | undefined;
  except?: TargetId[] | undefined;
  targets?: TargetExtensions | undefined;
  assets?: string[] | undefined;
};

export type CapabilityMarkdown = {
  path: string;
  frontmatter: {
    sections?: string[] | undefined;
    targets?: TargetExtensions | undefined;
  };
  body: string;
};

export type SkillFacet = {
  family: "skill";
  name: Slug;
  dir: string;
  primaryFile: string;
  frontmatter: Frontmatter<{
    name: Slug;
    description: string;
    invocation?: { user?: boolean | undefined; model?: boolean | undefined } | undefined;
    license?: string | undefined;
    compatibility?: string | undefined;
    metadata?: Record<string, string> | undefined;
    "argument-hint"?: string | undefined;
  }>;
  body: string;
};

export type ProseSource = { kind: "file" | "directory"; path: string; primary: string };

export type AgentFacet = {
  family: "agent";
  name: Slug;
  source: ProseSource;
  frontmatter: Frontmatter<{
    name: Slug;
    description: string;
    mode?: "primary" | "subagent" | "all" | undefined;
    model?: "inherit" | undefined;
  }>;
  body: string;
};

export type CommandFacet = {
  family: "command";
  name: Slug;
  source: ProseSource;
  frontmatter: Frontmatter<{
    name: Slug;
    description: string;
    arguments?: Slug[] | undefined;
    agent?: string | undefined;
  }>;
  body: string;
};

export type InstructionFacet = {
  family: "instruction";
  name: Slug;
  source: ProseSource;
  frontmatter: Frontmatter<{
    name: Slug;
    description: string;
    activation: InstructionActivation;
  }>;
  body: string;
};

export type InstructionActivation = "always" | { when: ActivationWhen };
export type ActivationWhen = Partial<Record<CanonicalTriggerName, TriggerBlock>>;

export type TriggerCommon = {
  scope?: ScopeEntry[] | undefined;
  interrupt?: "never" | "always" | undefined;
  repeat?: "once" | "always" | undefined;
  debounce?: number | undefined;
};
export type AssistantOutputTrigger = TriggerCommon & { conditions: string[] };
export type OperationInputTrigger = TriggerCommon & { conditions: string[] };
export type OperationResultTrigger = TriggerCommon & { conditions: string[] };
export type FileContextTrigger = TriggerCommon & { paths: string[] };
export type TriggerBlock =
  | AssistantOutputTrigger
  | OperationInputTrigger
  | OperationResultTrigger
  | FileContextTrigger;
export type ScopeEntry = { operation?: OperationId | undefined; paths?: string[] | undefined };

export const triggerInterruptDefaults = {
  assistant_output: "always",
  operation_input: "always",
  operation_result: "never",
  file_context: "never",
} as const satisfies Record<CanonicalTriggerName, "never" | "always">;

export type HookFile = {
  path: string;
  buckets: Partial<Record<CanonicalHookType, HookEntry[]>>;
  /**
   * The family-level `targets.<target>.hooks` (SPEC.md §13.9) by target, then native event name.
   * The reader leaves out unknown targets and sets each entry's `only` to `<target>` intersected
   * with its own `only`/`except`, so applicability treats it like a canonical entry.
   */
  native?: NativeHooks | undefined;
};

/** Target-native hook entries by target, then by the target's own event name. */
export type NativeHooks = Partial<Record<TargetId, Record<string, HookEntry[]>>>;

export type HookEntry = {
  name: Slug;
  description?: string | undefined;
  only?: TargetId[] | undefined;
  except?: TargetId[] | undefined;
  match?: HookMatch | undefined;
  run: HookRun;
  effect: HookEffect;
  timeout?: number | undefined;
  targets?: TargetExtensions | undefined;
};

export type HookMatch = {
  operation?: OperationId | undefined;
  paths?: string[] | undefined;
  conditions?: string[] | undefined;
};
export type HookRun = {
  command: string;
  args?: string[] | undefined;
  shell?: "bash" | "powershell" | undefined;
  env?: HookEnv | undefined;
};
export type HookEnv = Record<string, string>;
export type HookEffect =
  | "observe"
  | "block"
  | "add_context"
  | "continue"
  | "block_result"
  | "decide";
/**
 * One hook entry with the event it runs on: a canonical hook type, or, with `target` set, a
 * native event of that target (SPEC.md §13.9).
 */
export type HookEventEntry =
  | { type: CanonicalHookType; event: CanonicalHookType; entry: HookEntry; target?: undefined }
  | { type?: undefined; event: string; entry: HookEntry; target: TargetId };

/**
 * Every entry of `hooks`: the canonical buckets in file order, then the native events of each
 * target. Readers of the whole hook family use this, so native entries are never left out.
 */
export function hookEntries(hooks: HookFile | undefined): HookEventEntry[] {
  if (hooks === undefined) return [];
  const out: HookEventEntry[] = [];
  for (const [type, entries] of Object.entries(hooks.buckets) as Array<
    [CanonicalHookType, HookEntry[] | undefined]
  >)
    for (const entry of entries ?? []) out.push({ type, event: type, entry });
  for (const [target, events] of Object.entries(hooks.native ?? {}) as Array<
    [TargetId, Record<string, HookEntry[]> | undefined]
  >)
    for (const [event, entries] of Object.entries(events ?? {}))
      for (const entry of entries) out.push({ event, entry, target });
  return out;
}

export const hookEffectMatrix: Record<CanonicalHookType, readonly HookEffect[]> = {
  session_start: ["observe", "add_context"],
  user_prompt_submit: ["observe", "block", "add_context"],
  pre_tool: ["observe", "block"],
  permission_request: ["observe", "decide"],
  post_tool: ["observe", "add_context", "block_result"],
  stop: ["observe", "continue"],
  pre_compact: ["observe", "add_context"],
};

export const hookMatchRequired = new Set<CanonicalHookType>([
  "pre_tool",
  "post_tool",
  "permission_request",
]);
export const defaultHookTimeoutMs = 30_000;

export type McpFile = {
  path: string;
  /** Canonical servers, then family-level `targets.<target>.servers` read as `only: [<target>]`. */
  servers: McpServer[];
};
export type McpServer = McpServerBase & McpTransport;
export type McpServerBase = {
  name: Slug;
  description?: string | undefined;
  only?: TargetId[] | undefined;
  except?: TargetId[] | undefined;
  targets?: TargetExtensions | undefined;
};
export type McpTransport =
  | {
      transport: "stdio";
      command: string;
      args?: string[] | undefined;
      env?: Record<string, string> | undefined;
      /** Working directory; starts with ${ACF_CAPABILITY_DIR}, ${ACF_DATA_DIR} or ./ . Omitted means no assumption. */
      cwd?: string | undefined;
    }
  | { transport: "http"; url: string; headers?: Record<string, string> | undefined }
  | { transport: "sse"; url: string; headers?: Record<string, string> | undefined };

export type AssetRef = {
  path: string;
  origin: "frontmatter" | "markdown" | "implicit";
  facet: { family: FacetFamily; name: string } | { family: "capability" };
};

const ACF_CAPABILITY_DIR_PLACEHOLDER = placeholder("ACF_CAPABILITY_DIR");
const ACF_PACKAGE_DIR_PLACEHOLDER = placeholder("ACF_PACKAGE_DIR");
const ACF_HOOK_DIR_PLACEHOLDER = placeholder("ACF_HOOK_DIR");
export const acfPathPlaceholders = [
  ACF_CAPABILITY_DIR_PLACEHOLDER,
  ACF_PACKAGE_DIR_PLACEHOLDER,
  ACF_HOOK_DIR_PLACEHOLDER,
] as const;
/** The capability root; also `acfPathPlaceholders[0]`. */
export const acfCapabilityDirPlaceholder = ACF_CAPABILITY_DIR_PLACEHOLDER;
/**
 * Persistent, writable directory per capability and install scope that survives updates
 * (canonical-mcp, Data directory placeholder). Valid in stdio MCP `command`, `args`, `env` and
 * `cwd`; writers map it to `${CLAUDE_PLUGIN_DATA}` in Claude plugins and to
 * `<install-root>/.acf/data/<capability>/` for loose carriers.
 */
export const acfDataDirPlaceholder = placeholder("ACF_DATA_DIR");

export type Diagnostic = {
  severity: "error" | "warn" | "info" | "lossy";
  code: string;
  message: string;
  path?: string | undefined;
  location?: { line: number; column: number; offset?: number | undefined } | undefined;
  targetId?: TargetId | undefined;
  family?: FacetFamily | undefined;
  capability?: { name: string; version?: string | undefined } | undefined;
  data?: Record<string, unknown> | undefined;
};

export type AcfCapability = {
  root: string;
  synthesized?: true | undefined;
  scope: Scope;
  origin: CapabilityOrigin;
  manifest: Manifest;
  /** The `acf.yml` or `acf.yaml` the manifest was read from; absent without one or for a foreign format. */
  manifestPath?: string | undefined;
  capabilityMarkdown?: CapabilityMarkdown | undefined;
  skills: SkillFacet[];
  agents: AgentFacet[];
  commands: CommandFacet[];
  instructions: InstructionFacet[];
  hooks: HookFile | undefined;
  mcp: McpFile | undefined;
  assets: AssetRef[];
  diagnostics: Diagnostic[];
  /** Where the capability was read from; absent for capabilities built before format readers existed. */
  source?: CapabilitySource | undefined;
  /** Foreign components the reader preserved but did not project (empty or absent for native ACF). */
  remainder?: NativeRemainderComponent[] | undefined;
  /** Files under `native/<target>/`, sorted by target then path; absent when there are none. */
  nativeFiles?: NativeFileExtra[] | undefined;
};

export type SourceSpec =
  | { kind: "github"; repo: string }
  | { kind: "git"; url: string }
  | { kind: "path"; location: string };
/**
 * The `capabilities.yml` `include`/`exclude` key of each facet family (SPEC.md §17.5): the
 * plural directory name, except `mcp`.
 */
export const selectorKeys = {
  skill: "skills",
  agent: "agents",
  command: "commands",
  instruction: "instructions",
  hook: "hooks",
  mcp: "mcp",
} as const satisfies Record<FacetFamily, string>;
export type SelectorKey = (typeof selectorKeys)[FacetFamily];
/** Family-keyed facet names; `*` and `?` glob within a name. */
export type FacetSelector = Partial<Record<SelectorKey, string[]>>;
export type CapabilityEntry = {
  source: SourceSpec;
  ref?: string | undefined;
  path?: string | undefined;
  capabilities?: string[] | undefined;
  include?: FacetSelector | undefined;
  exclude?: FacetSelector | undefined;
  rename?: string | Record<string, string> | undefined;
  /** Overrides format detection (source-format-readers, Deterministic format detection). */
  format?: SourceFormat | undefined;
  only?: TargetId[] | undefined;
  except?: TargetId[] | undefined;
};
export type CapabilitiesYml = {
  acf: 1;
  capabilities: CapabilityEntry[];
  defaults?:
    | { fetch?: { shallow?: boolean | undefined; blobless?: boolean | undefined } | undefined }
    | undefined;
};
