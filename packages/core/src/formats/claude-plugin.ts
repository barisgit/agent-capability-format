/**
 * Claude plugin reader (source-format-readers, Claude plugin reader). Projects
 * `.claude-plugin/plugin.json` metadata, skills from `skills/` and manifest `skills` paths,
 * and MCP servers from `.mcp.json` and manifest `mcpServers`. Every other component is
 * recorded as Claude native remainder with its safety class; the files themselves stay in
 * the preserved snapshot.
 */
import path from "node:path";
import { withPackageValues } from "../extras/index.js";
import { nativeKeyClass, nativeKeyInfo } from "../targets/native-keys.js";
import type { PreservedForeignData } from "../targets/self-check.js";
import type {
  Diagnostic,
  Manifest,
  McpFile,
  NativeRemainderComponent,
  PackageAuthor,
  SafetyClass,
  SkillFacet,
} from "../types/index.js";
import { readClaudeMcp } from "./claude-mcp.js";
import {
  type ForeignReadOptions,
  type ForeignReadResult,
  foreignCapability,
  invalidManifest,
} from "./package.js";
import {
  CLAUDE_MANIFEST,
  componentPaths,
  contained,
  filesUnder,
  isDirectory,
  isFile,
  isRecord,
  outsidePackage,
  packageAuthor,
  packageIdentity,
  readJson,
  remainderComponent,
} from "./shared.js";
import { readForeignSkill, skillAssets, skillDirectories } from "./skills.js";

/** Manifest keys projected into core package fields, with the field each becomes. */
const PROJECTED_PACKAGE_KEYS: Readonly<Record<string, string>> = {
  name: "package.name",
  version: "package.version",
  description: "package.description",
  author: "package.authors",
  homepage: "package.homepage",
  repository: "package.repository",
  license: "package.license",
  keywords: "package.keywords",
};
const METADATA_KEYS = new Set([...Object.keys(PROJECTED_PACKAGE_KEYS), "skills", "mcpServers"]);
const STRING_KEYS = ["version", "description", "homepage", "repository", "license"] as const;

/** Reads the Claude plugin at `root` as one capability. */
export async function readClaudePluginPackage(
  root: string,
  options: ForeignReadOptions,
): Promise<ForeignReadResult> {
  const manifestPath = path.join(root, CLAUDE_MANIFEST);
  const read = await readJson(manifestPath, "acf.source.manifest-invalid", "error");
  if (!read.ok) return { capability: undefined, diagnostics: [read.diagnostic] };
  const raw = read.value;
  if (!isRecord(raw)) return invalidManifest(manifestPath, "plugin.json must be an object");
  const problem = manifestProblem(raw);
  if (problem !== undefined) return invalidManifest(manifestPath, problem);

  const named = packageIdentity({
    manifestName: raw.name as string,
    version: raw.version,
    rename: options.rename,
    revision: options.revision,
    manifestPath,
  });
  if ("diagnostic" in named) return { capability: undefined, diagnostics: [named.diagnostic] };

  const diagnostics: Diagnostic[] = [];
  const remainder: NativeRemainderComponent[] = [];
  const skills = await readSkills(root, raw.skills, diagnostics);
  const mcp: McpFile | undefined = await readClaudeMcp(root, raw, diagnostics, remainder);
  remainder.push(...(await remainderComponents(root, raw)));

  const capability = foreignCapability({
    root,
    options,
    manifest: projectManifest(raw, named.identity),
    skills,
    mcp,
    assets: await skillAssets(root, skills),
    diagnostics,
    source: { format: "claude-plugin", renamedFrom: named.identity.renamedFrom },
    remainder,
  });
  return { capability, diagnostics };
}

function manifestProblem(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.name !== "string" || raw.name.length === 0) return "name is required";
  for (const key of STRING_KEYS) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") return `${key} must be a string`;
  }
  if (
    raw.keywords !== undefined &&
    !(Array.isArray(raw.keywords) && raw.keywords.every((item) => typeof item === "string"))
  )
    return "keywords must be a list of strings";
  if (raw.author !== undefined) {
    if (!isRecord(raw.author) || typeof raw.author.name !== "string")
      return "author must be an object with a name";
    for (const key of ["email", "url"]) {
      if (raw.author[key] !== undefined && typeof raw.author[key] !== "string")
        return `author.${key} must be a string`;
    }
  }
  return undefined;
}

/** Core metadata; values core cannot hold exactly become `targets.claude.package` values. */
function projectManifest(
  raw: Record<string, unknown>,
  identity: { name: string; version: string; foreignVersion?: string | undefined },
): Manifest {
  const manifest: Manifest = { acf: 1, name: identity.name, version: identity.version };
  if (typeof raw.description === "string") manifest.description = raw.description;
  if (typeof raw.license === "string") manifest.license = raw.license;
  if (typeof raw.homepage === "string") manifest.homepage = raw.homepage;
  if (typeof raw.repository === "string") manifest.repository = raw.repository;
  if (Array.isArray(raw.keywords)) manifest.keywords = raw.keywords as string[];
  const values: Record<string, unknown> = {};
  if (identity.foreignVersion !== undefined) values.version = identity.foreignVersion;
  if (isRecord(raw.author)) {
    manifest.authors = [packageAuthor(raw.author as PackageAuthor)];
    // Claude allows author keys PackageAuthor has no field for; keep the whole author then.
    if (Object.keys(raw.author).some((key) => !AUTHOR_KEYS.has(key))) values.author = raw.author;
  }
  const targets = withPackageValues(undefined, "claude", values);
  if (Object.keys(targets).length > 0) manifest.targets = targets;
  return manifest;
}

const AUTHOR_KEYS = new Set(["name", "email", "url"]);

/**
 * Skills from `skills/` plus manifest `skills` paths. A path holding `SKILL.md` is one
 * skill; otherwise its immediate `<name>/SKILL.md` directories are. Later duplicates of a
 * skill name are skipped with a warning.
 */
async function readSkills(
  root: string,
  declared: unknown,
  diagnostics: Diagnostic[],
): Promise<SkillFacet[]> {
  const roots = [path.join(root, "skills")];
  for (const relative of componentPaths(declared)) {
    const resolved = contained(root, relative);
    if (resolved === undefined) {
      diagnostics.push(outsidePackage(root, "skills", relative));
      continue;
    }
    roots.push(resolved);
  }
  const dirs: string[] = [];
  for (const skillsRoot of roots) {
    const own = (await isFile(path.join(skillsRoot, "SKILL.md")))
      ? [skillsRoot]
      : await skillDirectories(skillsRoot);
    for (const dir of own) if (!dirs.includes(dir)) dirs.push(dir);
  }
  const skills: SkillFacet[] = [];
  for (const dir of dirs) {
    const skill = await readForeignSkill(dir, "claude", diagnostics);
    if (skill === undefined) continue;
    if (skills.some((existing) => existing.name === skill.name)) {
      diagnostics.push({
        severity: "warn",
        code: "acf.source.component-invalid",
        message: `skill ${skill.name} is declared twice; the copy in ${path.relative(root, dir)} is not loaded`,
        path: skill.primaryFile,
        family: "skill",
      });
      continue;
    }
    skills.push(skill);
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

const CLASS_RANK: Record<SafetyClass, number> = {
  descriptive: 0,
  granting: 1,
  functional: 2,
  restricting: 3,
};

/**
 * The strictest registry class of manifest keys `keys` under their values in `raw`; unknown
 * keys are functional.
 */
function keyClass(raw: Record<string, unknown>, keys: readonly string[]): SafetyClass {
  return keys
    .map((key) => nativeKeyClass(nativeKeyInfo("claude", "package", key), raw[key]))
    .map((found) => (found === "unclassified" ? "functional" : found))
    .reduce<SafetyClass>(
      (strictest, next) => (CLASS_RANK[next] > CLASS_RANK[strictest] ? next : strictest),
      "descriptive",
    );
}

const LISTING_KEYS = [
  "$schema",
  "displayName",
  "icon",
  "metadata",
  "documentationUrl",
  "supportUrl",
  "privacyPolicyUrl",
  "termsOfServiceUrl",
  "defaultEnabled",
  "types",
];

/**
 * Directory components whose files each become one component; manifest paths replace the
 * default. A manifest `commands` map instead makes each named definition one component.
 */
const FILE_COMPONENTS = [
  { key: "agents", kind: "agent", dir: "agents" },
  { key: "commands", kind: "command", dir: "commands" },
  { key: "outputStyles", kind: "output-style", dir: "output-styles" },
] as const;

/** Components whose default file merges with manifest declarations into one component. */
const MERGED_COMPONENTS = [
  { key: "hooks", kind: "hook", name: "hooks", file: "hooks/hooks.json" },
  { key: "lspServers", kind: "lsp-server", name: "lsp-servers", file: ".lsp.json" },
  { key: "settings", kind: "settings", name: "settings", file: "settings.json" },
] as const;

const KEY_COMPONENTS = [
  { key: "userConfig", kind: "user-config" },
  { key: "channels", kind: "channel" },
  { key: "dependencies", kind: "dependencies" },
] as const;

/** Every component the reader does not project, as Claude native remainder. */
async function remainderComponents(
  root: string,
  raw: Record<string, unknown>,
): Promise<NativeRemainderComponent[]> {
  const out: NativeRemainderComponent[] = [];
  const add = async (
    input: Omit<NativeRemainderComponent, "format" | "executable"> & { executable?: boolean },
  ): Promise<void> => {
    out.push(await remainderComponent(root, { format: "claude-plugin", ...input }));
  };
  const handled = new Set([...METADATA_KEYS, ...LISTING_KEYS]);

  for (const spec of FILE_COMPONENTS) {
    handled.add(spec.key);
    if (spec.key === "commands" && isRecord(raw.commands)) {
      for (const [name, definition] of Object.entries(raw.commands))
        await add({
          kind: spec.kind,
          name,
          paths: await commandSource(root, definition),
          manifestKeys: [spec.key],
          class: keyClass(raw, [spec.key]),
        });
      continue;
    }
    const declared = componentPaths(raw[spec.key]);
    const sources = raw[spec.key] === undefined ? [spec.dir] : declared;
    for (const relative of sources) {
      const resolved = contained(root, relative);
      if (resolved === undefined) continue;
      const files = (await isDirectory(resolved))
        ? await filesUnder(root, resolved)
        : (await isFile(resolved))
          ? [path.relative(root, resolved).split(path.sep).join("/")]
          : [];
      for (const file of files) {
        await add({
          kind: spec.kind,
          name: path.posix.basename(file).replace(/\.[^.]*$/, ""),
          paths: [file],
          manifestKeys: raw[spec.key] === undefined ? [] : [spec.key],
          class: keyClass(raw, [spec.key]),
        });
      }
    }
  }

  for (const spec of MERGED_COMPONENTS) {
    handled.add(spec.key);
    const paths: string[] = (await isFile(path.join(root, spec.file))) ? [spec.file] : [];
    for (const relative of componentPaths(raw[spec.key])) {
      const normalized = path.posix.normalize(relative);
      if (contained(root, relative) !== undefined && !paths.includes(normalized))
        paths.push(normalized);
    }
    const manifestKeys = raw[spec.key] === undefined ? [] : [spec.key];
    if (paths.length === 0 && manifestKeys.length === 0) continue;
    await add({
      kind: spec.kind,
      name: spec.name,
      paths,
      manifestKeys,
      class: keyClass(raw, [spec.key]),
    });
  }

  for (const file of await filesUnder(root, path.join(root, "bin"))) {
    await add({
      kind: "bin",
      name: path.posix.basename(file),
      paths: [file],
      class: "functional",
    });
  }

  for (const spec of KEY_COMPONENTS) {
    handled.add(spec.key);
    if (raw[spec.key] === undefined) continue;
    await add({
      kind: spec.kind,
      name: spec.key,
      paths: [],
      manifestKeys: [spec.key],
      class: keyClass(raw, [spec.key]),
    });
  }

  const monitorKeys = ["monitors", ...(isRecord(raw.experimental) ? ["experimental"] : [])];
  const listing = LISTING_KEYS.filter((key) => raw[key] !== undefined);
  if (listing.length > 0) {
    const icon = typeof raw.icon === "string" ? contained(root, raw.icon) : undefined;
    await add({
      kind: "listing-metadata",
      name: "listing",
      paths:
        icon !== undefined && (await isFile(icon))
          ? [path.posix.normalize(raw.icon as string)]
          : [],
      manifestKeys: listing,
      class: keyClass(raw, listing),
    });
  }
  for (const key of Object.keys(raw).sort()) {
    if (handled.has(key)) continue;
    const monitor = monitorKeys.includes(key) && hasMonitors(raw, key);
    await add({
      kind: monitor ? "monitor" : "other",
      name: key,
      paths: componentPaths(raw[key]).filter((relative) => contained(root, relative) !== undefined),
      manifestKeys: [key],
      class: keyClass(raw, [key]),
    });
  }
  return out;
}

/** The package file a command-map definition's `source` names, when it is one. */
async function commandSource(root: string, definition: unknown): Promise<string[]> {
  if (!isRecord(definition) || typeof definition.source !== "string") return [];
  const resolved = contained(root, definition.source);
  return resolved !== undefined && (await isFile(resolved))
    ? [path.posix.normalize(definition.source)]
    : [];
}

function hasMonitors(raw: Record<string, unknown>, key: string): boolean {
  return (
    key === "monitors" || (isRecord(raw.experimental) && raw.experimental.monitors !== undefined)
  );
}

/**
 * What this reader keeps beyond core fields, derived from the tables it reads with. The registry
 * self-check proves native ACF can author each datum. `mcpServers` stays for bundle and URL
 * references; `version` and `author` package values are set in `projectManifest`.
 */
export const claudePluginPreserved: PreservedForeignData = {
  target: "claude",
  projectedKeys: PROJECTED_PACKAGE_KEYS,
  manifestKeys: [
    ...LISTING_KEYS,
    ...FILE_COMPONENTS.map((spec) => spec.key),
    ...MERGED_COMPONENTS.map((spec) => spec.key),
    ...KEY_COMPONENTS.map((spec) => spec.key),
    "monitors",
    "experimental",
    "mcpServers",
  ],
  files: [
    ...FILE_COMPONENTS.map((spec) => `${spec.dir}/`),
    ...MERGED_COMPONENTS.map((spec) => spec.file),
    "bin/",
  ],
  packageValues: ["version", "author"],
};
