import type { ZodType } from "zod";
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
  // Native per-target skills directory. SPEC §22.2: skills always emit to the
  // canonical ~/.agents/skills (project ./.agents/skills) root; when a target
  // also reads skills from its own native location, declare it here so caplet
  // can dual-emit. `null` for both scopes means canonical-only (e.g. cursor).
  skillInstallPaths?: InstallPaths | undefined;
  // The target discovers the ecosystem-shared .agents/skills root itself, so
  // native skill copies are opt-in rather than the default.
  discoversCanonicalSkills?: boolean | undefined;
  mappings: TargetMappings;
  extensions: TargetExtensionSchemas;
  adapter?: TargetAdapter<Id> | undefined;
};

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

/** Component families of the compatibility report; `package` covers manifest-level data. */
export type OutcomeFamily = FacetFamily | "package";

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
export type AcfManagedSidecar = {
  acf: 1;
  managed: Array<{
    path: string;
    owns: AcfOwnership[];
    capability: string;
    facet?: { family: FacetFamily; name: string } | undefined;
    hash: string;
  }>;
};

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
