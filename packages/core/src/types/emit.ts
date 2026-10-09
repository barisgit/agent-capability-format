import type { ZodType } from "zod";
import type { Carrier } from "./interop.js";
import type {
  AcfCapability,
  CanonicalHookType,
  CanonicalTriggerName,
  Diagnostic,
  FacetFamily,
  Scope,
  SupportLevel,
  TargetId,
} from "./model.js";

export type InstallPaths = { user: string | null; project: string | null };
export type TargetMappings = {
  hookEvents: Record<CanonicalHookType, string[]>;
  instructionTriggers: Record<CanonicalTriggerName, SupportLevel>;
  mcpInstallPath: InstallPaths;
};
export type TargetExtensionSchemas = Partial<Record<FacetFamily | "capability", ZodType<unknown>>>;
/**
 * Facet families gated by family-level `support`. Skills and MCP servers are gated per field
 * and carrier by the support registry (`fieldSupport`, `supportCell` in core targets).
 */
export type FamilySupportFamily = Exclude<FacetFamily, "skill" | "mcp">;
export type TargetDefinition<Id extends string = string> = {
  id: Id;
  displayName: string;
  support: Partial<Record<FamilySupportFamily, SupportLevel>>;
  installPaths: InstallPaths;
  // Native per-target skills directory (SPEC §22.2). Omitted when the target has
  // none (Cursor), so a skill it cannot share through .agents/skills is omitted.
  skillInstallPaths?: InstallPaths | undefined;
  // The target discovers the ecosystem-shared .agents/skills root itself, so
  // native skill copies are opt-in rather than the default.
  discoversCanonicalSkills?: boolean | undefined;
  mappings: TargetMappings;
  extensions: TargetExtensionSchemas;
  adapter?: TargetAdapter<Id> | undefined;
};

/**
 * Read access writers get to sources and existing output. Reading a missing path or a directory
 * yields null; listing a missing path or a file yields no entries, so a writer can walk a tree by
 * trying both.
 */
export type ReadOnlyFs = {
  exists(absPath: string): Promise<boolean>;
  readText(absPath: string): Promise<string | null>;
  readBytes(absPath: string): Promise<Uint8Array | null>;
  readMode(absPath: string): Promise<number | null>;
  listDir(absPath: string): Promise<string[]>;
};

export type TargetAdapter<Id extends string = string> = {
  id: Id;
  emit(input: EmitInput, fs: ReadOnlyFs): Promise<EmitResult>;
  validate?(input: EmitInput): Promise<Diagnostic[]>;
};
export type EmitInput = {
  capability: AcfCapability;
  scope: Scope;
  installRoot: string;
  options: EmitOptions;
};
export type SkillsEmitOptions = { native?: boolean | undefined; canonical?: boolean | undefined };
export type EmitOptions = {
  cleanBeforeEmit?: boolean | undefined;
  dryRun?: boolean | undefined;
  skills?: SkillsEmitOptions | undefined;
  /**
   * Selected targets, for the emitted scope, that discover the shared `.agents/skills` root.
   * Skill writers render the shared copy so it satisfies every one of them and skip it when one
   * refuses the skill (capability-model-layers, Shared discovery roots). When absent, the
   * writer assumes it is the only reader (or none, for a target that does not discover it).
   */
  canonicalSkillReaders?: readonly TargetId[] | undefined;
  /**
   * The carrier configured for the target. Absent means the target's default (`carriersOf`).
   * A writer may still use another carrier the target offers when the capability is not
   * eligible for this one (Claude keeps capabilities with agents, commands, hooks or
   * instructions loose); `EmitResult.plugins` tells which carrier it used.
   */
  carrier?: Carrier | undefined;
};
/**
 * What a writer produced for one capability and target. `outcomes` lists components whose
 * outcome a writer knows positively (for example `translated`); the plan derives every other
 * component's outcome from `diagnostics` (see `componentOutcomes`). Writers that predate the
 * field-level registry leave it absent.
 */
export type EmitResult = {
  diffs: FileDiff[];
  diagnostics: Diagnostic[];
  outcomes?: ComponentOutcome[] | undefined;
  /**
   * Plugin packages the writer generated with the plugin carrier; absent or empty when it wrote
   * loose files. Every diff of a result with a plugin lies inside that plugin's `dir`.
   */
  plugins?: EmittedPlugin[] | undefined;
};

/**
 * One plugin package a plugin-carrier writer generated, as the marketplace and host registration
 * steps need it (claude-plugin-output). `dir` is `pluginPackageDir(installRoot, name)`, listed in
 * the scope's marketplace at `pluginMarketplaceDir(installRoot)` by the relative source
 * `./plugins/<name>`.
 */
export type EmittedPlugin = {
  target: TargetId;
  scope: Scope;
  /** Plugin name: the capability slug. */
  name: string;
  /** Generated version, `<base>+acf.<12 hex>` (or `<base>.acf.<12 hex>` when `<base>` has `+`). */
  version: string;
  /** Absolute package directory. */
  dir: string;
};

/**
 * How one component reaches one target, from best to worst (capability-model-layers,
 * Behavior-first compatibility report).
 */
export type ComponentOutcomeKind =
  | "native"
  | "translated"
  | "changed-behavior"
  | "omitted"
  | "blocked";

/**
 * Component families of the compatibility report; `package` covers manifest-level data and
 * `remainder` a foreign package's native components outside the ACF families (output styles,
 * LSP servers, settings, ...), which selection cannot name.
 */
export type OutcomeFamily = FacetFamily | "package" | "remainder";

/**
 * The compatibility-report record for one component of one capability on one target.
 * A non-native outcome names its `source` (core field id, native key or component type),
 * the `consequence` for the user and, except for faithful translations, a `recovery`.
 * `dropped` lists descriptive fields and extras the target loses without changing behavior.
 */
export type ComponentOutcome = {
  capability: string;
  target: TargetId;
  family: OutcomeFamily;
  component: string;
  outcome: ComponentOutcomeKind;
  source?: string | undefined;
  consequence?: string | undefined;
  recovery?: string | undefined;
  dropped?: string[] | undefined;
};
export type FileContent = string | Uint8Array;
export type FileDiff = {
  path: string;
  before: FileContent | null;
  after: FileContent | null;
  beforeMode?: number | null | undefined;
  afterMode?: number | null | undefined;
  owns: AcfOwnership[];
  facet?: { family: FacetFamily; name: string } | undefined;
  artifactRoot?: string | undefined;
  managementNotice?: "root" | "artifact" | undefined;
};
export type AcfOwnership =
  | { kind: "file" }
  | { kind: "json-pointer"; pointer: string }
  | { kind: "yaml-pointer"; pointer: string }
  | { kind: "toml-pointer"; pointer: string }
  | { kind: "marker"; name: string };
/**
 * Owner of a sidecar entry: the target whose output root holds it, or `canonical` for the
 * shared `.agents/skills` root that several targets discover.
 */
export type SidecarTarget = TargetId | "canonical";

/**
 * `.acf-managed.json`: what caplet owns under one output root (IMPLEMENTATION.md §4.2.2).
 * `target`, `carrier` and `mode` are absent only in sidecars written before
 * plugin-interop-foundation; caplet fills them in on its next write of the sidecar.
 * `marketplace` is present only in a Claude install root whose local marketplace caplet
 * maintains, so a later apply reconciles that registration even after the last plugin is gone.
 */
export type AcfManagedSidecar = {
  acf: 1;
  marketplace?: ClaudeMarketplaceRecord | undefined;
  managed: Array<{
    path: string;
    owns: AcfOwnership[];
    capability: string;
    facet?: { family: FacetFamily; name: string } | undefined;
    target?: SidecarTarget | undefined;
    carrier?: Carrier | undefined;
    /** POSIX permission bits of a whole-file entry after apply; absent for owned regions. */
    mode?: number | undefined;
    hash: string;
  }>;
};

/**
 * Caplet's Claude marketplace of one install root: its name (`acf-user`, `acf-project-<h>`) and
 * the Claude scope caplet registers it at (claude-plugin-output, Scope mapping).
 */
export type ClaudeMarketplaceRecord = { name: string; scope: "user" | "local" };

export type ScopeRoot = {
  scope: Scope;
  agentsDir: string;
  capabilitiesDir: string;
  manifestPath: string;
  lockPath: string;
};
export type EmitRequest = { scopes: ScopeRoot[]; targets: TargetId[]; options: EmitOptions };
export type EmitReport = { perScopeTarget: Record<string, EmitResult> };

export type CapletConfig = {
  emit?:
    | {
        scope?: "all" | "user" | "project" | undefined;
        defaultTargets?: TargetId[] | undefined;
        cleanBeforeEmit?: boolean | undefined;
        dryRun?: boolean | undefined;
      }
    | undefined;
  targets?:
    | Partial<
        Record<
          TargetId,
          {
            out?: { user?: string | undefined; project?: string | undefined } | undefined;
            disabled?: boolean | undefined;
            skills?: SkillsEmitOptions | undefined;
            /** Carrier for this target; validated against `carriersOf` when the config loads. */
            carrier?: Carrier | undefined;
          }
        >
      >
    | undefined;
  auth?:
    | { github?: { kind: "gh" | "token" | "ssh"; token?: string | undefined } | undefined }
    | undefined;
  resolver?:
    | {
        cacheDir?: string | undefined;
        retries?: number | undefined;
        shallow?: boolean | undefined;
        blobless?: boolean | undefined;
      }
    | undefined;
  diagnostics?:
    | {
        showInfo?: boolean | undefined;
        showLossy?: boolean | undefined;
        failOnLossy?: boolean | undefined;
      }
    | undefined;
};
