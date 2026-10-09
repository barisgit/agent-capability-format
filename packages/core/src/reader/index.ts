import path from "node:path";
import type { ZodIssue } from "zod";
import { collectImportedSkillAssets, collectReferencedAssets } from "../assets/index.js";
import { type AcfDiagnosticCode, pushZodIssues } from "../diagnostics/index.js";
import { capabilityMarkdownFrontmatterSchema, manifestSchema } from "../schemas/index.js";
import type {
  AcfCapability,
  CapabilityMarkdown,
  CapabilityOrigin,
  Diagnostic,
  Manifest,
  Scope,
} from "../types/index.js";
import { exists } from "../utils/fs.js";
import { isRecord } from "../utils/guards.js";
import {
  collectUnknown,
  fallbackManifest,
  parseMarkdownFile,
  parseYamlFile,
  pickFamilyYaml,
  pushUnknownFields,
  sortDiagnostics,
  validateSingularFolders,
} from "./helpers.js";
import { readHooks } from "./hooks.js";
import { readMcp } from "./mcp.js";
import { readNativeFiles } from "./native-files.js";
import { readAgents, readCommands, readInstructions } from "./prose.js";
import { readSkills } from "./skills.js";
import { validateCapability } from "./validation.js";

export { parseMarkdown } from "./helpers.js";
export { readHooks } from "./hooks.js";
export { readMcp } from "./mcp.js";
export { readAgents, readCommands, readInstructions } from "./prose.js";
export { readSkills } from "./skills.js";
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

/**
 * Reads the native ACF capability at `root`: manifest, `ACF.md`, every facet family, native
 * file extras and referenced assets, then runs cross-field validation. Problems are recorded on
 * `capability.diagnostics`, sorted by path then code; only I/O failures throw. A tree carrying
 * `.acf-import.json` is read as synthesized (see `readSkills`), and its skill directories'
 * files become implicit assets.
 */
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

/**
 * Reads `acf.yml` (or `acf.yaml`). `undefined` when neither exists or the manifest fails its
 * schema, with the problems pushed to `diagnostics`. Top-level keys outside the schema are
 * reported and kept on `manifest.unknown`.
 */
export async function readManifest(
  root: string,
  diagnostics: Diagnostic[],
): Promise<Manifest | undefined> {
  const file = await pickFamilyYaml(root, "acf", "acf.manifest.duplicate-file", diagnostics);
  if (file === undefined) return undefined;
  const raw = await parseYamlFile(file, diagnostics);
  if (!isRecord(raw)) return undefined;
  pushUnknownFields(raw, manifestKeys, diagnostics, file);
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    pushZodIssues(diagnostics, parsed.error, file, {
      baseCode: "acf.manifest.invalid-field",
      codeFor: manifestIssueCode,
    });
    return undefined;
  }
  const unknown = collectUnknown(raw, manifestKeys);
  const manifest = parsed.data as Manifest;
  if (Object.keys(unknown).length > 0) manifest.unknown = unknown;
  return manifest;
}

/**
 * The code of a manifest schema issue, by the top-level field it is in: `name` and `acf` have
 * their own codes, any other field `acf.manifest.invalid-field` (so `authors[].name` is not the
 * capability name). A whole-manifest issue such as `only` with `except` takes the generic code.
 */
function manifestIssueCode(issue: ZodIssue): AcfDiagnosticCode | undefined {
  const [field] = issue.path;
  if (field === undefined) return undefined;
  if (field === "name") return "acf.manifest.invalid-name";
  if (field === "acf") return "acf.manifest.acf-version-unknown";
  return "acf.manifest.invalid-field";
}

/**
 * Reads the optional `ACF.md`. Frontmatter that fails its schema is reported and read as
 * empty; the body is kept.
 */
export async function readAcfMd(
  root: string,
  diagnostics: Diagnostic[],
): Promise<CapabilityMarkdown | undefined> {
  const file = path.join(root, "ACF.md");
  if (!(await exists(file))) return undefined;
  const parsed = await parseMarkdownFile(file, diagnostics);
  if (parsed === undefined) return undefined;
  pushUnknownFields(parsed.frontmatter, markdownKeys, diagnostics, file);
  const result = capabilityMarkdownFrontmatterSchema.safeParse(parsed.frontmatter);
  if (!result.success) {
    pushZodIssues(diagnostics, result.error, file, {
      baseCode: "acf.markdown.invalid-frontmatter-field",
    });
  }
  return { path: file, frontmatter: result.success ? result.data : {}, body: parsed.body };
}
