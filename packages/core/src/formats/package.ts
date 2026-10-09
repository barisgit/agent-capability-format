/**
 * Inputs, results and capability assembly shared by the foreign format readers.
 */
import type {
  AcfCapability,
  AssetRef,
  CapabilityEntry,
  CapabilityOrigin,
  CapabilitySource,
  Diagnostic,
  Manifest,
  McpFile,
  NativeRemainderComponent,
  Scope,
  SkillFacet,
} from "../types/index.js";

/** What a format reader needs beyond the package root. */
export type ForeignReadOptions = {
  scope: Scope;
  origin: CapabilityOrigin;
  /** The `capabilities.yml` entry's `rename`; at resolve time, the locked capability name. */
  rename?: CapabilityEntry["rename"];
  /** Resolved source revision for the unversioned fallback; null for local sources. */
  revision: string | null;
  /** Package root relative to the source root, POSIX; defaults to ".". */
  sourcePath?: string | undefined;
};

/**
 * A format reader's result. `capability` is undefined when the package cannot be read at
 * all (a fatal manifest violation); `diagnostics` then explains why. Otherwise the same
 * diagnostics are also on `capability.diagnostics`.
 */
export type ForeignReadResult = {
  capability: AcfCapability | undefined;
  diagnostics: Diagnostic[];
};

/** The `acf.source.manifest-invalid` failure for `manifestPath`. */
export function invalidManifest(manifestPath: string, reason: string): ForeignReadResult {
  return {
    capability: undefined,
    diagnostics: [
      {
        severity: "error",
        code: "acf.source.manifest-invalid",
        message: `invalid package manifest: ${reason}`,
        path: manifestPath,
      },
    ],
  };
}

/** Assembles the canonical capability of a foreign package rooted at `root`. */
export function foreignCapability(input: {
  root: string;
  options: ForeignReadOptions;
  manifest: Manifest;
  skills: SkillFacet[];
  mcp: McpFile | undefined;
  assets: AssetRef[];
  diagnostics: Diagnostic[];
  source: Pick<CapabilitySource, "format" | "formatVersion" | "renamedFrom">;
  remainder: NativeRemainderComponent[];
}): AcfCapability {
  const source: CapabilitySource = {
    format: input.source.format,
    path: input.options.sourcePath ?? ".",
    snapshotRoot: input.root,
  };
  if (input.source.formatVersion !== undefined) source.formatVersion = input.source.formatVersion;
  if (input.source.renamedFrom !== undefined) source.renamedFrom = input.source.renamedFrom;
  return {
    root: input.root,
    scope: input.options.scope,
    origin: input.options.origin,
    manifest: input.manifest,
    skills: input.skills,
    agents: [],
    commands: [],
    instructions: [],
    hooks: undefined,
    mcp: input.mcp,
    assets: input.assets,
    diagnostics: input.diagnostics,
    source,
    remainder: input.remainder,
  };
}
