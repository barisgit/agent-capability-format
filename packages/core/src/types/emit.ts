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
export type TargetDefinition<Id extends string = string> = {
  id: Id;
  displayName: string;
  support: Partial<Record<FacetFamily, SupportLevel>>;
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
export type EmitResult = { diffs: FileDiff[]; diagnostics: Diagnostic[] };
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
 */
export type AcfManagedSidecar = {
  acf: 1;
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
