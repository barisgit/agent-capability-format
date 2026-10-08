import {
  type CanonicalHookType,
  type CanonicalTriggerName,
  canonicalHookTypes,
  canonicalTriggerNames,
  type ProvisionalOperationId,
  provisionalOperations,
} from "@caplet/runtime-taxonomy";
import type { LockEntry } from "../lock/index.js";
import type { CapabilitySource, NativeRemainderComponent, SourceFormat } from "./interop.js";

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

export type Manifest = {
  acf: 1;
  name: Slug;
  version: SemVer;
  description?: string | undefined;
  authors?: string[] | undefined;
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
  targets?: HookTargetExtensions | undefined;
};

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
export type HookTargetExtensions = Partial<
  Record<TargetId, { hooks?: Record<string, HookEntry[]> | undefined } & Record<string, unknown>>
>;

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
  servers: McpServer[];
  targets?: Partial<Record<TargetId, { servers?: McpServer[] | undefined }>> | undefined;
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

const PLACEHOLDER_OPEN = "$";
const ACF_CAPABILITY_DIR_PLACEHOLDER = `${PLACEHOLDER_OPEN}{ACF_CAPABILITY_DIR}`;
const ACF_PACKAGE_DIR_PLACEHOLDER = `${PLACEHOLDER_OPEN}{ACF_PACKAGE_DIR}`;
const ACF_HOOK_DIR_PLACEHOLDER = `${PLACEHOLDER_OPEN}{ACF_HOOK_DIR}`;
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
export const acfDataDirPlaceholder = `${PLACEHOLDER_OPEN}{ACF_DATA_DIR}`;

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
};

export type SourceSpec =
  | { kind: "github"; repo: string }
  | { kind: "git"; url: string }
  | { kind: "path"; location: string };
export type FacetSelector = Partial<Record<FacetFamily, string[]>>;
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
