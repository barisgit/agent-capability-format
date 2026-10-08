import path from "node:path";
import type {
  AcfCapability,
  CapabilitySource,
  Diagnostic,
  EmitOptions,
  EmitResult,
  McpServer,
  SkillFacet,
  TargetAdapter,
} from "@caplet/core";
import { makeInMemoryFs } from "./in-memory-fs";

/** Absolute root of the in-memory capabilities that tests build without the reader. */
export const CAP_ROOT = "/caps/demo";
/** Absolute project directory that install roots in these tests live under. */
export const PROJECT = "/project";

/**
 * A skill facet built directly from a frontmatter object, bypassing reader validation so
 * writer tests do not depend on which canonical fields the schema accepts yet.
 */
export function skillFacet(
  frontmatter: SkillFacet["frontmatter"],
  body = "Use this skill.\n",
): SkillFacet {
  const dir = path.join(CAP_ROOT, "skills", frontmatter.name);
  return {
    family: "skill",
    name: frontmatter.name,
    dir,
    primaryFile: path.join(dir, "SKILL.md"),
    frontmatter,
    body,
  };
}

/** An in-memory capability named `demo` with the given skills and MCP servers. */
export function capabilityModel(parts: {
  skills?: SkillFacet[];
  servers?: McpServer[];
  source?: CapabilitySource;
}): AcfCapability {
  const capability: AcfCapability = {
    root: CAP_ROOT,
    scope: "project",
    origin: { kind: "local", directory: CAP_ROOT },
    manifest: { acf: 1, name: "demo", version: "1.0.0" },
    skills: parts.skills ?? [],
    agents: [],
    commands: [],
    instructions: [],
    hooks: undefined,
    mcp:
      parts.servers === undefined
        ? undefined
        : { path: path.join(CAP_ROOT, "mcp", "mcp.yml"), servers: parts.servers },
    assets: [],
    diagnostics: [],
  };
  if (parts.source !== undefined) capability.source = parts.source;
  return capability;
}

/** Emits `capability` for project scope with `installRoot` and an empty file system. */
export async function emitModel(
  adapter: TargetAdapter,
  capability: AcfCapability,
  installRoot: string,
  options: EmitOptions = {},
  files: Record<string, string> = {},
): Promise<EmitResult> {
  return await adapter.emit(
    { capability, scope: "project", installRoot, options },
    makeInMemoryFs(files),
  );
}

/** Text of the diff whose path ends with `suffix`, or undefined when no such file is written. */
export function fileText(result: EmitResult, suffix: string): string | undefined {
  const diff = result.diffs.find((item) => item.path.endsWith(suffix) && item.after !== null);
  if (diff === undefined) return undefined;
  if (typeof diff.after !== "string") throw new Error(`${suffix} is binary`);
  return diff.after;
}

/** Diagnostics with `code`. */
export function withCode(result: { diagnostics: Diagnostic[] }, code: string): Diagnostic[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.code === code);
}
