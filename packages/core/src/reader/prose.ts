import { readdir } from "node:fs/promises";
import path from "node:path";
import { pushZodIssues } from "../diagnostics/index.js";
import {
  agentFrontmatterSchema,
  commandFrontmatterSchema,
  instructionFrontmatterSchema,
} from "../schemas/index.js";
import type { AgentFacet, CommandFacet, Diagnostic, InstructionFacet } from "../types/index.js";
import { exists } from "../utils/fs.js";
import {
  byName,
  counts,
  parseMarkdownFile,
  pushUnknownFields,
  validateNameMatch,
} from "./helpers.js";

const frontmatterKeys = {
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

/** Agent facets from `agents/<name>.md` or `agents/<name>/AGENT.md`, sorted by name. */
export async function readAgents(root: string, diagnostics: Diagnostic[]): Promise<AgentFacet[]> {
  return await readProseFamily(root, "agents", "AGENT.md", "agent", diagnostics);
}

/** Command facets from `commands/<name>.md` or `commands/<name>/COMMAND.md`, sorted by name. */
export async function readCommands(
  root: string,
  diagnostics: Diagnostic[],
): Promise<CommandFacet[]> {
  return await readProseFamily(root, "commands", "COMMAND.md", "command", diagnostics);
}

/**
 * Instruction facets from `instructions/<name>.md` or `instructions/<name>/INSTRUCTION.md`,
 * sorted by name.
 */
export async function readInstructions(
  root: string,
  diagnostics: Diagnostic[],
): Promise<InstructionFacet[]> {
  return await readProseFamily(root, "instructions", "INSTRUCTION.md", "instruction", diagnostics);
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
      pushZodIssues(diagnostics, result.error, item.source.primary, {
        baseCode: "acf.markdown.invalid-frontmatter-field",
        family,
      });
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
      const parsed = await parseMarkdownFile(full, diagnostics);
      if (parsed === undefined) continue;
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
    const parsed = await parseMarkdownFile(primary, diagnostics);
    if (parsed === undefined) continue;
    discovered.push({
      name: entry.name,
      source: { kind: "directory", path: full, primary },
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    });
  }
  return discovered;
}
