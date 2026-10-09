import type { Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilityEntry,
  type Diagnostic,
  type ForeignFormat,
  isErrno,
  isForeignFormat,
  marketplaceDiagnostic,
  parseMarkdown,
  readForeignPackage,
  readRepositoryCapabilities,
  type SourceFormat,
  selectSourceFormat,
  skillFrontmatterSchema,
} from "@caplet/core";

/** One package a source provides, as `capabilities:` selectors and the resolver see it. */
export type SourceCapabilityCandidate = {
  /**
   * Discovered capability name, before `rename`: the manifest or skill name. The resolver
   * applies `rename` exactly once, when it names the snapshot.
   */
  name: string;
  /** What `capabilities:` selectors match (SPEC.md §20.5): a collection path or the name. */
  selector: string;
  /** Absolute package root the snapshot is copied from. */
  root: string;
  /** `root` relative to the inspected source root, POSIX separators, `.` for the root. */
  sourcePath: string;
  /** A bare skill the resolver wraps in a generated `acf.yml`. */
  synthesized: boolean;
  format: SourceFormat;
  formatVersion?: string | undefined;
};

/** What {@link inspectSource} found; any error diagnostic means the source is unusable. */
export type SourceInventory = {
  candidates: SourceCapabilityCandidate[];
  diagnostics: Diagnostic[];
  /** The source was read as bare skills; the lock entry records it as `synthesized`. */
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
  const inventory = isForeignFormat(selection.format)
    ? await foreignInventory(selection.format, root, options)
    : selection.format === "acf"
      ? await acfInventory(root)
      : await bareSkillInventory(root);
  return { ...inventory, diagnostics: [...selection.diagnostics, ...inventory.diagnostics] };
}

/** An Agent Plugins or Claude plugin package: one candidate named as the package declares. */
async function foreignInventory(
  format: ForeignFormat,
  root: string,
  options: InspectSourceOptions,
): Promise<SourceInventory> {
  const { capability, diagnostics } = await readForeignPackage(format, root, {
    // Inspection keeps only the identity and diagnostics; the resolver reads the snapshot
    // again with its real scope and origin.
    scope: "project",
    origin: { kind: "local", directory: root },
    rename: options.rename,
    revision: options.revision ?? null,
  });
  if (capability === undefined) return { candidates: [], diagnostics, synthesized: false };
  // The reader validates the package name under `rename`; candidates keep the name it
  // replaced, because selectors match it and the resolver applies `rename` itself.
  const name = capability.source?.renamedFrom ?? capability.manifest.name;
  const candidate: SourceCapabilityCandidate = {
    name,
    selector: name,
    root,
    sourcePath: ".",
    synthesized: false,
    format,
    formatVersion: capability.source?.formatVersion,
  };
  return { candidates: [candidate], diagnostics, synthesized: false };
}

/** An ACF source: its root capability or `acf/` collection, selected by collection path. */
async function acfInventory(root: string): Promise<SourceInventory> {
  const repository = await readRepositoryCapabilities(root);
  const collectionRoot = path.join(root, "acf");
  const candidates = repository.capabilities.map((capability): SourceCapabilityCandidate => {
    const relative = path.relative(collectionRoot, capability.root).replaceAll(path.sep, "/");
    const inCollection = relative.length > 0 && relative !== ".." && !relative.startsWith("../");
    return {
      name: capability.manifest.name,
      selector: inCollection ? relative : capability.manifest.name,
      root: capability.root,
      sourcePath: posixRelative(root, capability.root),
      synthesized: false,
      format: "acf",
    };
  });
  return { candidates, diagnostics: repository.diagnostics, synthesized: false };
}

/**
 * Bare skills (SPEC.md §20.3): one synthesized candidate per discovered skill, sorted by
 * name. Duplicate names are errors; finding no skill at all is too, reported as a
 * marketplace when the source is one.
 */
async function bareSkillInventory(root: string): Promise<SourceInventory> {
  const skillRoots = await discoverBareSkillRoots(root);
  if (skillRoots.length === 0) {
    const marketplace = await marketplaceDiagnostic(root);
    if (marketplace !== undefined)
      return { candidates: [], diagnostics: [marketplace], synthesized: false };
    return {
      candidates: [],
      diagnostics: [
        {
          severity: "error",
          code: "acf.resolve.no-capabilities",
          message: "no ACF capabilities or recognized shallow SKILL.md layout discovered",
          path: root,
        },
      ],
      synthesized: true,
    };
  }

  const diagnostics: Diagnostic[] = [];
  const candidates: SourceCapabilityCandidate[] = [];
  for (const skillRoot of skillRoots) {
    const candidate = await readBareSkill(root, skillRoot, diagnostics);
    if (candidate !== undefined) candidates.push(candidate);
  }
  const byName = new Map<string, SourceCapabilityCandidate>();
  for (const candidate of candidates) {
    const existing = byName.get(candidate.name);
    if (existing === undefined) {
      byName.set(candidate.name, candidate);
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "acf.capability.name-collision",
      message: `duplicate imported skill name: ${candidate.name}`,
      path: candidate.root,
      data: { existing: existing.root, duplicate: candidate.root },
    });
  }
  return {
    candidates: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics,
    synthesized: true,
  };
}

/**
 * The candidate for the bare skill at `skillRoot`, or undefined when its frontmatter is
 * invalid. A missing description is only a warning: the reader supplies a fallback.
 */
async function readBareSkill(
  root: string,
  skillRoot: string,
  diagnostics: Diagnostic[],
): Promise<SourceCapabilityCandidate | undefined> {
  const skillFile = path.join(skillRoot, "SKILL.md");
  let parsed: Awaited<ReturnType<typeof parseMarkdown>>;
  try {
    parsed = await parseMarkdown(skillFile);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    diagnostics.push(invalidFrontmatter(skillFile, reason));
    return undefined;
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
    return undefined;
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
  return {
    name: result.data.name,
    selector: result.data.name,
    root: skillRoot,
    sourcePath: posixRelative(root, skillRoot),
    synthesized: true,
    format: "skills",
  };
}

async function discoverBareSkillRoots(root: string): Promise<string[]> {
  if ((await lstatIfExists(path.join(root, "SKILL.md")))?.isFile() === true) return [root];
  const skillsRoot = path.join(root, "skills");
  const nested = await immediateSkillDirectories(skillsRoot);
  if (nested.length > 0) return nested;
  return await immediateSkillDirectories(root, new Set(["acf", "node_modules", "skills"]));
}

async function immediateSkillDirectories(
  root: string,
  excluded = new Set(["node_modules"]),
): Promise<string[]> {
  if ((await lstatIfExists(root))?.isDirectory() !== true) return [];
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || excluded.has(entry.name) || !entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if ((await lstatIfExists(path.join(candidate, "SKILL.md")))?.isFile() === true)
      out.push(candidate);
  }
  return out.sort();
}

async function lstatIfExists(candidate: string): Promise<Stats | undefined> {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }
}

/** `target` relative to `root` with POSIX separators; `.` for the root itself. */
function posixRelative(root: string, target: string): string {
  return path.relative(root, target).replaceAll(path.sep, "/") || ".";
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
