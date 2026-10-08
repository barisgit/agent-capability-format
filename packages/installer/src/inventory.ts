import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  type Diagnostic,
  parseMarkdown,
  readRepositoryCapabilities,
  skillFrontmatterSchema,
} from "@caplet/core";

export type SourceCapabilityCandidate = {
  name: string;
  selector: string;
  root: string;
  sourcePath: string;
  synthesized: boolean;
};

export type SourceInventory = {
  candidates: SourceCapabilityCandidate[];
  diagnostics: Diagnostic[];
  synthesized: boolean;
};

export async function inspectSource(sourceRoot: string): Promise<SourceInventory> {
  const root = path.resolve(sourceRoot);
  if (
    (await isRegularFile(path.join(root, "acf.yml"))) ||
    (await isRegularFile(path.join(root, "acf.yaml"))) ||
    (await isDirectory(path.join(root, "acf")))
  ) {
    const repository = await readRepositoryCapabilities(root);
    const collectionRoot = path.join(root, "acf");
    return {
      candidates: repository.capabilities.map((capability) => {
        const relative = path.relative(collectionRoot, capability.root).replaceAll(path.sep, "/");
        const inCollection =
          relative.length > 0 && relative !== ".." && !relative.startsWith("../");
        return {
          name: capability.manifest.name,
          selector: inCollection ? relative : capability.manifest.name,
          root: capability.root,
          sourcePath: path.relative(root, capability.root).replaceAll(path.sep, "/") || ".",
          synthesized: false,
        };
      }),
      diagnostics: repository.diagnostics,
      synthesized: false,
    };
  }

  const skillRoots = await discoverBareSkillRoots(root);
  const diagnostics: Diagnostic[] = [];
  const candidates: SourceCapabilityCandidate[] = [];
  for (const skillRoot of skillRoots) {
    const skillFile = path.join(skillRoot, "SKILL.md");
    const parsed = await parseMarkdown(skillFile);
    const missingDescription =
      typeof parsed.frontmatter.description !== "string" ||
      parsed.frontmatter.description.length === 0;
    const result = skillFrontmatterSchema.safeParse({
      ...parsed.frontmatter,
      description: missingDescription ? "Imported skill" : parsed.frontmatter.description,
    });
    if (!result.success) {
      diagnostics.push({
        severity: "error",
        code: "acf.import.skill-frontmatter-invalid",
        message: `invalid imported skill frontmatter: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
        path: skillFile,
        family: "skill",
      });
      continue;
    }
    if (missingDescription) {
      diagnostics.push({
        severity: "warn",
        code: "acf.import.skill-description-missing",
        message: "imported skill has no description; using an in-memory fallback",
        path: skillFile,
        family: "skill",
      });
    }
    candidates.push({
      name: result.data.name,
      selector: result.data.name,
      root: skillRoot,
      sourcePath: path.relative(root, skillRoot).replaceAll(path.sep, "/") || ".",
      synthesized: true,
    });
  }

  const byName = new Map<string, SourceCapabilityCandidate>();
  for (const candidate of candidates) {
    const existing = byName.get(candidate.name);
    if (existing !== undefined) {
      diagnostics.push({
        severity: "error",
        code: "acf.capability.name-collision",
        message: `duplicate imported skill name: ${candidate.name}`,
        path: candidate.root,
        data: { existing: existing.root, duplicate: candidate.root },
      });
    } else {
      byName.set(candidate.name, candidate);
    }
  }
  if (skillRoots.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "acf.resolve.no-capabilities",
      message: "no ACF capabilities or recognized shallow SKILL.md layout discovered",
      path: root,
    });
  }
  return {
    candidates: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics,
    synthesized: true,
  };
}

async function discoverBareSkillRoots(root: string): Promise<string[]> {
  if (await isRegularFile(path.join(root, "SKILL.md"))) return [root];
  const skillsRoot = path.join(root, "skills");
  const nested = await immediateSkillDirectories(skillsRoot);
  if (nested.length > 0) return nested;
  return await immediateSkillDirectories(root, new Set(["acf", "node_modules", "skills"]));
}

async function immediateSkillDirectories(
  root: string,
  excluded = new Set(["node_modules"]),
): Promise<string[]> {
  if (!(await isDirectory(root))) return [];
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || excluded.has(entry.name) || !entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (await isRegularFile(path.join(candidate, "SKILL.md"))) out.push(candidate);
  }
  return out.sort();
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await lstat(candidate)).isDirectory();
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

async function isRegularFile(candidate: string): Promise<boolean> {
  try {
    return (await lstat(candidate)).isFile();
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
