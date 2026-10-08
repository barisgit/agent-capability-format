import { readdir } from "node:fs/promises";
import path from "node:path";
import { collectImportedSkillAssets, collectReferencedAssets } from "../assets/index.js";
import { pushZodIssues } from "../diagnostics/index.js";
import { withNativeExtras } from "../extras/index.js";
import { mapBareSkill } from "../formats/skills.js";
import {
  agentFrontmatterSchema,
  capabilityMarkdownFrontmatterSchema,
  commandFrontmatterSchema,
  hookFileSchema,
  instructionFrontmatterSchema,
  manifestSchema,
  mcpFileSchema,
  skillFrontmatterSchema,
} from "../schemas/index.js";
import type {
  AcfCapability,
  AgentFacet,
  CapabilityMarkdown,
  CapabilityOrigin,
  CommandFacet,
  Diagnostic,
  HookEntry,
  HookFile,
  InstructionFacet,
  Manifest,
  McpFile,
  Scope,
  SkillFacet,
} from "../types/index.js";
import { exists } from "../utils/fs.js";
import {
  byName,
  collectUnknown,
  counts,
  fallbackManifest,
  isRecord,
  parseMarkdown,
  parseYamlFile,
  pickFamilyYaml,
  pushUnknownFields,
  sortDiagnostics,
  validateNameMatch,
  validateSingularFolders,
} from "./helpers.js";
import { readNativeFiles } from "./native-files.js";
import { validateCapability } from "./validation.js";

export { parseMarkdown } from "./helpers.js";
export { validateCapability } from "./validation.js";

const manifestKeys = new Set([
  "acf",
  "name",
  "version",
  "description",
  "authors",
  "license",
  "homepage",
  "repository",
  "keywords",
  "only",
  "except",
  "targets",
]);
const markdownKeys = new Set(["sections", "targets"]);
/** Skill frontmatter keys that are core ACF fields. */
const coreSkillKeys: ReadonlySet<string> = new Set([
  "name",
  "description",
  "invocation",
  "assets",
  "only",
  "except",
  "targets",
  "license",
  "compatibility",
  "metadata",
  "argument-hint",
]);
const frontmatterKeys = {
  skill: new Set([
    ...coreSkillKeys,
    // Common agent-skills ecosystem fields (accepted without a diagnostic)
    "version",
    "allowed-tools",
    "disable-model-invocation",
  ]),
  agent: new Set(["name", "description", "mode", "model", "assets", "only", "except", "targets"]),
  command: new Set([
    "name",
    "description",
    "arguments",
    "agent",
    "assets",
    "only",
    "except",
    "targets",
  ]),
  instruction: new Set([
    "name",
    "description",
    "activation",
    "assets",
    "only",
    "except",
    "targets",
  ]),
} as const;

export async function readCapability(
  root: string,
  scope: Scope,
  origin: CapabilityOrigin,
): Promise<AcfCapability> {
  const absRoot = path.resolve(root);
  const diagnostics: Diagnostic[] = [];
  const imported = await exists(path.join(absRoot, ".acf-import.json"));
  await validateSingularFolders(absRoot, diagnostics);
  const manifest = (await readManifest(absRoot, diagnostics)) ?? fallbackManifest(absRoot);
  const capabilityMarkdown = await readAcfMd(absRoot, diagnostics);
  const [skills, agents, commands, instructions, hooks, mcp, nativeFiles] = await Promise.all([
    readSkills(absRoot, diagnostics, imported),
    readAgents(absRoot, diagnostics),
    readCommands(absRoot, diagnostics),
    readInstructions(absRoot, diagnostics),
    readHooks(absRoot, diagnostics),
    readMcp(absRoot, diagnostics),
    readNativeFiles(absRoot, diagnostics),
  ]);
  const capability: AcfCapability = {
    root: absRoot,
    scope,
    origin,
    manifest,
    skills,
    agents,
    commands,
    instructions,
    hooks,
    mcp,
    assets: [],
    diagnostics,
  };
  if (imported) capability.synthesized = true;
  if (capabilityMarkdown !== undefined) capability.capabilityMarkdown = capabilityMarkdown;
  if (nativeFiles.length > 0) capability.nativeFiles = nativeFiles;
  capability.assets = await collectReferencedAssets(capability);
  if (imported) {
    const implicit = await collectImportedSkillAssets(capability.skills);
    const byPath = new Map(capability.assets.map((asset) => [asset.path, asset]));
    for (const asset of implicit) byPath.set(asset.path, asset);
    capability.assets = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
  validateCapability(capability);
  sortDiagnostics(capability.diagnostics);
  return capability;
}

export async function readManifest(
  root: string,
  diagnostics: Diagnostic[],
): Promise<Manifest | undefined> {
  const yml = path.join(root, "acf.yml");
  const yaml = path.join(root, "acf.yaml");
  const hasYml = await exists(yml);
  const hasYaml = await exists(yaml);
  if (hasYml && hasYaml) {
    diagnostics.push({
      severity: "error",
      code: "acf.manifest.duplicate-file",
      message: "acf.yml and acf.yaml both exist",
      path: root,
    });
  }
  const file = hasYml ? yml : hasYaml ? yaml : undefined;
  if (file === undefined) return undefined;
  const raw = await parseYamlFile(file, diagnostics);
  if (!isRecord(raw)) return undefined;
  pushUnknownFields(raw, manifestKeys, diagnostics, file);
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    pushZodIssues(diagnostics, parsed.error, file, { baseCode: "acf.manifest.invalid-name" });
    return undefined;
  }
  const unknown = collectUnknown(raw, manifestKeys);
  const manifest = parsed.data as Manifest;
  if (Object.keys(unknown).length > 0) manifest.unknown = unknown;
  return manifest;
}

export async function readAcfMd(
  root: string,
  diagnostics: Diagnostic[],
): Promise<CapabilityMarkdown | undefined> {
  const file = path.join(root, "ACF.md");
  if (!(await exists(file))) return undefined;
  const parsed = await parseMarkdown(file);
  pushUnknownFields(parsed.frontmatter, markdownKeys, diagnostics, file);
  const result = capabilityMarkdownFrontmatterSchema.safeParse(parsed.frontmatter);
  if (!result.success) pushZodIssues(diagnostics, result.error, file);
  return { path: file, frontmatter: result.success ? result.data : {}, body: parsed.body };
}

export async function readSkills(
  root: string,
  diagnostics: Diagnostic[],
  imported = false,
): Promise<SkillFacet[]> {
  const dir = path.join(root, "skills");
  if (!(await exists(dir))) return [];
  const facets: SkillFacet[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) {
      diagnostics.push({
        severity: "error",
        code: "acf.skill.shape.not-directory",
        message: `skills/${entry.name} must be a directory`,
        path: full,
      });
      continue;
    }
    const primary = path.join(full, "SKILL.md");
    if (!(await exists(primary))) {
      diagnostics.push({
        severity: "error",
        code: "acf.facet.primary-missing",
        message: `skills/${entry.name}/ must contain SKILL.md`,
        path: full,
        family: "skill",
      });
      continue;
    }
    const parsed = await parseMarkdown(primary);
    // A bare imported skill keeps every key as core, a target's extra or an agent-plugins
    // extra; an authored skill reports unknown keys.
    const mapped = imported ? mapBareSkill(parsed.frontmatter, coreSkillKeys) : undefined;
    if (mapped === undefined) {
      const pathsRejected = rejectCorePaths(parsed.frontmatter, primary, diagnostics);
      pushUnknownFields(
        parsed.frontmatter,
        pathsRejected ? skillKeysWithPaths : frontmatterKeys.skill,
        diagnostics,
        primary,
      );
    }
    const candidate = mapped?.core ?? parsed.frontmatter;
    const missingDescription =
      imported && (typeof candidate.description !== "string" || candidate.description.length === 0);
    const frontmatter = missingDescription
      ? { ...candidate, description: "Imported skill" }
      : candidate;
    if (missingDescription) {
      diagnostics.push({
        severity: "warn",
        code: "acf.import.skill-description-missing",
        message: "imported skill has no description; using an in-memory fallback",
        path: primary,
        family: "skill",
      });
    }
    const result = skillFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      pushZodIssues(diagnostics, result.error, primary, { family: "skill" });
      continue;
    }
    const facet: SkillFacet = {
      family: "skill",
      name: result.data.name,
      dir: full,
      primaryFile: primary,
      frontmatter: result.data,
      body: parsed.body,
    };
    for (const [dialect, extras] of mapped?.extras ?? []) {
      facet.frontmatter.targets = withNativeExtras(facet.frontmatter.targets, dialect, extras);
    }
    validateNameMatch(facet.family, facet.name, entry.name, primary, diagnostics);
    facets.push(facet);
  }
  return facets.sort(byName);
}

const skillKeysWithPaths = new Set([...frontmatterKeys.skill, "paths"]);

/**
 * Path-scoped activation is not a core skill field (canonical-skills, Path-scoped activation
 * stays per target): a native ACF skill authors it per target. Returns true when it pushed the
 * error.
 */
function rejectCorePaths(
  frontmatter: Record<string, unknown>,
  file: string,
  diagnostics: Diagnostic[],
): boolean {
  if (!("paths" in frontmatter)) return false;
  diagnostics.push({
    severity: "error",
    code: "acf.skill.paths-not-core",
    message:
      "paths is not a core skill field: glob dialects and activation scope differ between tools. " +
      "Declare it per target as targets.claude.native.paths or targets.cursor.native.paths",
    path: file,
    family: "skill",
  });
  return true;
}

export async function readAgents(root: string, diagnostics: Diagnostic[]): Promise<AgentFacet[]> {
  return await readProseFamily(root, "agents", "AGENT.md", "agent", diagnostics);
}

export async function readCommands(
  root: string,
  diagnostics: Diagnostic[],
): Promise<CommandFacet[]> {
  return await readProseFamily(root, "commands", "COMMAND.md", "command", diagnostics);
}

export async function readInstructions(
  root: string,
  diagnostics: Diagnostic[],
): Promise<InstructionFacet[]> {
  return await readProseFamily(root, "instructions", "INSTRUCTION.md", "instruction", diagnostics);
}

export async function readHooks(
  root: string,
  diagnostics: Diagnostic[],
): Promise<HookFile | undefined> {
  const file = await pickFamilyYaml(
    path.join(root, "hooks"),
    "hooks",
    "acf.hooks.duplicate-file",
    diagnostics,
  );
  if (file === undefined) return undefined;
  const parsed = hookFileSchema.safeParse(await parseYamlFile(file, diagnostics));
  if (!parsed.success) {
    pushZodIssues(diagnostics, parsed.error, file, { family: "hook" });
    return undefined;
  }
  const data = parsed.data;
  const buckets: HookFile["buckets"] = {};
  if (data.session_start !== undefined) buckets.session_start = data.session_start as HookEntry[];
  if (data.user_prompt_submit !== undefined)
    buckets.user_prompt_submit = data.user_prompt_submit as HookEntry[];
  if (data.pre_tool !== undefined) buckets.pre_tool = data.pre_tool as HookEntry[];
  if (data.permission_request !== undefined)
    buckets.permission_request = data.permission_request as HookEntry[];
  if (data.post_tool !== undefined) buckets.post_tool = data.post_tool as HookEntry[];
  if (data.stop !== undefined) buckets.stop = data.stop as HookEntry[];
  if (data.pre_compact !== undefined) buckets.pre_compact = data.pre_compact as HookEntry[];
  const hookFile: HookFile = { path: file, buckets };
  if (data.targets !== undefined) hookFile.targets = data.targets as HookFile["targets"];
  return hookFile;
}

export async function readMcp(
  root: string,
  diagnostics: Diagnostic[],
): Promise<McpFile | undefined> {
  const file = await pickFamilyYaml(
    path.join(root, "mcp"),
    "mcp",
    "acf.mcp.duplicate-file",
    diagnostics,
  );
  if (file === undefined) return undefined;
  const parsed = mcpFileSchema.safeParse(await parseYamlFile(file, diagnostics));
  if (!parsed.success) {
    pushZodIssues(diagnostics, parsed.error, file, { family: "mcp" });
    return undefined;
  }
  const mcpFile: McpFile = { path: file, servers: parsed.data.servers as McpFile["servers"] };
  if (parsed.data.targets !== undefined)
    mcpFile.targets = parsed.data.targets as McpFile["targets"];
  return mcpFile;
}

async function readProseFamily<Family extends "agent" | "command" | "instruction">(
  root: string,
  folder: string,
  primaryName: string,
  family: Family,
  diagnostics: Diagnostic[],
): Promise<
  Array<
    Family extends "agent" ? AgentFacet : Family extends "command" ? CommandFacet : InstructionFacet
  >
> {
  const dir = path.join(root, folder);
  if (!(await exists(dir))) return [];
  const discovered = await discoverProse(dir, primaryName, family, diagnostics);
  for (const [name, count] of counts(discovered.map((facet) => facet.name))) {
    if (count > 1) {
      diagnostics.push({
        severity: "error",
        code: "acf.facet.duplicate",
        message: `${folder}/${name} appears in both file and directory form`,
        path: dir,
        family,
      });
    }
  }
  const out: Array<AgentFacet | CommandFacet | InstructionFacet> = [];
  const schema =
    family === "agent"
      ? agentFrontmatterSchema
      : family === "command"
        ? commandFrontmatterSchema
        : instructionFrontmatterSchema;
  const allowed = frontmatterKeys[family];
  for (const item of discovered) {
    pushUnknownFields(item.frontmatter, allowed, diagnostics, item.source.primary);
    const result = schema.safeParse(item.frontmatter);
    if (!result.success) {
      pushZodIssues(diagnostics, result.error, item.source.primary, { family });
      continue;
    }
    validateNameMatch(family, result.data.name, item.name, item.source.primary, diagnostics);
    out.push({
      family,
      name: result.data.name,
      source: item.source,
      frontmatter: result.data,
      body: item.body,
    } as AgentFacet | CommandFacet | InstructionFacet);
  }
  return out.sort(byName) as Array<
    Family extends "agent" ? AgentFacet : Family extends "command" ? CommandFacet : InstructionFacet
  >;
}

type DiscoveredProse = {
  name: string;
  source: { kind: "file" | "directory"; path: string; primary: string };
  frontmatter: Record<string, unknown>;
  body: string;
};

async function discoverProse(
  dir: string,
  primaryName: string,
  family: "agent" | "command" | "instruction",
  diagnostics: Diagnostic[],
): Promise<DiscoveredProse[]> {
  const discovered: DiscoveredProse[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const parsed = await parseMarkdown(full);
      discovered.push({
        name: path.basename(entry.name, ".md"),
        source: { kind: "file", path: full, primary: full },
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      });
      continue;
    }
    if (!entry.isDirectory()) continue;
    const primary = path.join(full, primaryName);
    if (!(await exists(primary))) {
      diagnostics.push({
        severity: "error",
        code: "acf.facet.primary-missing",
        message: `${path.basename(dir)}/${entry.name}/ must contain ${primaryName}`,
        path: full,
        family,
      });
      continue;
    }
    const parsed = await parseMarkdown(primary);
    discovered.push({
      name: entry.name,
      source: { kind: "directory", path: full, primary },
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    });
  }
  return discovered;
}
