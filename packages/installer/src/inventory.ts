import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilityEntry,
  type Diagnostic,
  isForeignFormat,
  marketplaceDiagnostic,
  parseMarkdown,
  readForeignPackage,
  readRepositoryCapabilities,
  type SourceFormat,
  selectSourceFormat,
  skillFrontmatterSchema,
} from "@caplet/core";
import { isErrno } from "./errno.js";

export type SourceCapabilityCandidate = {
  /**
   * Discovered capability name, before `rename`: the manifest or skill name. The resolver
   * applies `rename` exactly once, when it names the snapshot.
   */
  name: string;
  /** What `capabilities:` selectors match (SPEC.md §20.5): a collection path or the name. */
  selector: string;
  root: string;
  sourcePath: string;
  synthesized: boolean;
  format: SourceFormat;
  formatVersion?: string | undefined;
};

export type SourceInventory = {
  candidates: SourceCapabilityCandidate[];
  diagnostics: Diagnostic[];
  synthesized: boolean;
};

/** The `capabilities.yml` entry fields and source revision that shape inspection. */
export type InspectSourceOptions = {
  format?: SourceFormat | undefined;
  rename?: CapabilityEntry["rename"];
  /** Resolved commit for unversioned foreign packages; null or absent for local sources. */
  revision?: string | null | undefined;
};

/**
 * Lists the capabilities the source at `sourceRoot` provides. The source format is
 * detected (or taken from `options.format`); an ACF source yields its capabilities, an
 * Agent Plugins or Claude plugin package exactly one, and bare skills one synthesized
 * capability per skill. A source that is only a plugin marketplace fails with
 * `acf.source.marketplace-unsupported`.
 */
export async function inspectSource(
  sourceRoot: string,
  options: InspectSourceOptions = {},
): Promise<SourceInventory> {
  const root = path.resolve(sourceRoot);
  const selection = await selectSourceFormat(root, options.format);
  if (selection.format === undefined)
    return { candidates: [], diagnostics: selection.diagnostics, synthesized: false };
  if (isForeignFormat(selection.format)) {
    const { capability, diagnostics } = await readForeignPackage(selection.format, root, {
      // Inspection keeps only the identity and diagnostics; the resolver reads the snapshot
      // again with its real scope and origin.
      scope: "project",
      origin: { kind: "local", directory: root },
      rename: options.rename,
      revision: options.revision ?? null,
    });
    // The reader validates the package name under `rename`; candidates keep the name it
    // replaced, because selectors match it and the resolver applies `rename` itself.
    const candidates: SourceCapabilityCandidate[] =
      capability === undefined
        ? []
        : [
            {
              name: capability.source?.renamedFrom ?? capability.manifest.name,
              selector: capability.source?.renamedFrom ?? capability.manifest.name,
              root,
              sourcePath: ".",
              synthesized: false,
              format: selection.format,
              formatVersion: capability.source?.formatVersion,
            },
          ];
    return {
      candidates,
      diagnostics: [...selection.diagnostics, ...diagnostics],
      synthesized: false,
    };
  }
  if (selection.format === "acf") {
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
          format: "acf" as const,
        };
      }),
      diagnostics: [...selection.diagnostics, ...repository.diagnostics],
      synthesized: false,
    };
  }

  const skillRoots = await discoverBareSkillRoots(root);
  const diagnostics: Diagnostic[] = [];
  const candidates: SourceCapabilityCandidate[] = [];
  for (const skillRoot of skillRoots) {
    const skillFile = path.join(skillRoot, "SKILL.md");
    let parsed: Awaited<ReturnType<typeof parseMarkdown>>;
    try {
      parsed = await parseMarkdown(skillFile);
    } catch (error) {
      diagnostics.push(
        invalidFrontmatter(skillFile, error instanceof Error ? error.message : String(error)),
      );
      continue;
    }
    const missingDescription =
      typeof parsed.frontmatter.description !== "string" ||
      parsed.frontmatter.description.length === 0;
    const result = skillFrontmatterSchema.safeParse({
      ...parsed.frontmatter,
      description: missingDescription ? "Imported skill" : parsed.frontmatter.description,
    });
    if (!result.success) {
      const reasons = result.error.issues.map((issue) => issue.message).join(", ");
      diagnostics.push(invalidFrontmatter(skillFile, reasons));
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
      format: "skills",
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
    const marketplace = await marketplaceDiagnostic(root);
    if (marketplace !== undefined)
      return { candidates: [], diagnostics: [marketplace], synthesized: false };
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

/** The error for a bare skill whose frontmatter is malformed YAML or fails its schema. */
function invalidFrontmatter(skillFile: string, reason: string): Diagnostic {
  return {
    severity: "error",
    code: "acf.import.skill-frontmatter-invalid",
    message: `invalid imported skill frontmatter: ${reason}`,
    path: skillFile,
    family: "skill",
  };
}
