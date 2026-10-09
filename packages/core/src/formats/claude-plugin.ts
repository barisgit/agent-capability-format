/**
 * Claude plugin reader (source-format-readers, Claude plugin reader). Projects
 * `.claude-plugin/plugin.json` metadata, skills from `skills/` and manifest `skills` paths,
 * and MCP servers from `.mcp.json` and manifest `mcpServers`. Every other component is
 * recorded as Claude native remainder with its safety class; the files themselves stay in
 * the preserved snapshot.
 */
import path from "node:path";
import { withPackageValues } from "../extras/index.js";
import { nativeKeyClass, nativeKeyInfo, strictestClass } from "../targets/native-keys.js";
import {
  CLAUDE_PLUGIN_BIN_DIR,
  CLAUDE_PLUGIN_MANIFEST,
  claudePluginComponents,
  isPerFileComponent,
  type MergedComponentSpec,
  perFileComponentName,
} from "../targets/plugin-layout.js";
import type { PreservedForeignData } from "../targets/self-check.js";
import type {
  Diagnostic,
  Manifest,
  McpFile,
  NativeRemainderComponent,
  SafetyClass,
  SkillFacet,
} from "../types/index.js";
import { isRecord } from "../utils/guards.js";
import { readClaudeMcp } from "./claude-mcp.js";
import {
  type ForeignReadOptions,
  type ForeignReadResult,
  foreignCapability,
  invalidManifest,
} from "./package.js";
import {
  AUTHOR_KEYS,
  componentPaths,
  contained,
  coreManifest,
  filesUnder,
  isDirectory,
  isFile,
  metadataProblem,
  outsidePackage,
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

/** Reads the Claude plugin at `root` as one capability. */
export async function readClaudePluginPackage(
  root: string,
  options: ForeignReadOptions,
): Promise<ForeignReadResult> {
  const manifestPath = path.join(root, CLAUDE_PLUGIN_MANIFEST);
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
  return metadataProblem(raw, false);
}

/** Core metadata; values core cannot hold exactly become `targets.claude.package` values. */
function projectManifest(
  raw: Record<string, unknown>,
  identity: { name: string; version: string; foreignVersion?: string | undefined },
): Manifest {
  const manifest = coreManifest(raw, identity);
  const values: Record<string, unknown> = {};
  if (identity.foreignVersion !== undefined) values.version = identity.foreignVersion;
  if (isRecord(raw.author)) {
    // Claude allows author keys PackageAuthor has no field for; keep the whole author then.
    if (Object.keys(raw.author).some((key) => !AUTHOR_KEYS.has(key))) values.author = raw.author;
  }
  const targets = withPackageValues(undefined, "claude", values);
  if (Object.keys(targets).length > 0) manifest.targets = targets;
  return manifest;
}

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
  const skills: SkillFacet[] = [];
  for (const dir of await skillDirs(skillRoots(root, declared, diagnostics))) {
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

/** `skills/` and each contained manifest `skills` path; an outside path is diagnosed and skipped. */
function skillRoots(root: string, declared: unknown, diagnostics: Diagnostic[]): string[] {
  const roots = [path.join(root, "skills")];
  for (const relative of componentPaths(declared)) {
    const resolved = contained(root, relative);
    if (resolved === undefined) diagnostics.push(outsidePackage(root, "skills", relative));
    else roots.push(resolved);
  }
  return roots;
}

/** Skill directories under `roots` in order, without repeats. */
async function skillDirs(roots: readonly string[]): Promise<string[]> {
  const dirs: string[] = [];
  for (const skillsRoot of roots) {
    const own = (await isFile(path.join(skillsRoot, "SKILL.md")))
      ? [skillsRoot]
      : await skillDirectories(skillsRoot);
    for (const dir of own) if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

/**
 * The strictest registry class of manifest keys `keys` under their values in `raw`; unknown
 * keys are functional.
 */
function keyClass(raw: Record<string, unknown>, keys: readonly string[]): SafetyClass {
  return strictestClass(
    keys
      .map((key) => nativeKeyClass(nativeKeyInfo("claude", "package", key), raw[key]))
      .map((found) => (found === "unclassified" ? "functional" : found)),
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
const FILE_COMPONENTS = claudePluginComponents.filter(isPerFileComponent);

/** Components whose default file merges with manifest declarations into one component. */
const MERGED_COMPONENTS = claudePluginComponents.filter(
  (spec): spec is MergedComponentSpec & { file: string } =>
    !isPerFileComponent(spec) && spec.file !== undefined,
);
/** Keys that hold monitors; any other value of them is an `other` component. */
const MONITOR_COMPONENTS = claudePluginComponents.filter(
  (spec): spec is MergedComponentSpec => !isPerFileComponent(spec) && spec.kind === "monitor",
);

const KEY_COMPONENTS = [
  { key: "userConfig", kind: "user-config" },
  { key: "channels", kind: "channel" },
  { key: "dependencies", kind: "dependencies" },
] as const;

/** A component before its files' modes are read; `executable` marks a kind that runs code. */
type RemainderInput = Omit<NativeRemainderComponent, "format" | "executable"> & {
  executable?: boolean;
};

/** Manifest keys some reader step owns; every other key becomes a monitor or `other` component. */
const HANDLED_KEYS: ReadonlySet<string> = new Set([
  ...METADATA_KEYS,
  ...LISTING_KEYS,
  ...FILE_COMPONENTS.map((spec) => spec.key),
  ...MERGED_COMPONENTS.map((spec) => spec.key),
  ...KEY_COMPONENTS.map((spec) => spec.key),
]);

/** Every component the reader does not project, as Claude native remainder. */
async function remainderComponents(
  root: string,
  raw: Record<string, unknown>,
): Promise<NativeRemainderComponent[]> {
  const inputs = [
    ...(await fileComponents(root, raw)),
    ...(await mergedComponents(root, raw)),
    ...(await binComponents(root)),
    ...keyComponents(raw),
    ...(await listingComponents(root, raw)),
    ...unhandledComponents(root, raw),
  ];
  const out: NativeRemainderComponent[] = [];
  for (const input of inputs) {
    out.push(await remainderComponent(root, { format: "claude-plugin", ...input }));
  }
  return out;
}

/** One component per file of each {@link FILE_COMPONENTS} kind, or per `commands` map entry. */
async function fileComponents(
  root: string,
  raw: Record<string, unknown>,
): Promise<RemainderInput[]> {
  const inputs: RemainderInput[] = [];
  for (const spec of FILE_COMPONENTS) {
    const value = raw[spec.key];
    const componentClass = keyClass(raw, [spec.key]);
    if (spec.key === "commands" && isRecord(value)) {
      for (const [name, definition] of Object.entries(value)) {
        const paths = await commandSource(root, definition);
        inputs.push({
          kind: spec.kind,
          name,
          paths,
          manifestKeys: [spec.key],
          class: componentClass,
          executable: spec.executes,
        });
      }
      continue;
    }
    const sources = value === undefined ? [spec.dir] : componentPaths(value);
    for (const file of await sourceFiles(root, sources)) {
      inputs.push({
        kind: spec.kind,
        name: perFileComponentName(spec, file),
        paths: [file],
        manifestKeys: value === undefined ? [] : [spec.key],
        class: componentClass,
        executable: spec.executes,
      });
    }
  }
  return inputs;
}

/**
 * Package-relative files of each contained source, a directory's files or the file itself, each
 * once though several sources name it.
 */
async function sourceFiles(root: string, sources: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const relative of sources) {
    const resolved = contained(root, relative);
    if (resolved === undefined) continue;
    if (await isDirectory(resolved)) files.push(...(await filesUnder(root, resolved)));
    else if (await isFile(resolved))
      files.push(path.relative(root, resolved).split(path.sep).join("/"));
  }
  return [...new Set(files)];
}

/** One component per {@link MERGED_COMPONENTS} kind the package has a file or manifest key for. */
async function mergedComponents(
  root: string,
  raw: Record<string, unknown>,
): Promise<RemainderInput[]> {
  const inputs: RemainderInput[] = [];
  for (const spec of MERGED_COMPONENTS) {
    const paths: string[] = (await isFile(path.join(root, spec.file))) ? [spec.file] : [];
    for (const relative of componentPaths(raw[spec.key])) {
      const normalized = path.posix.normalize(relative);
      if (contained(root, relative) !== undefined && !paths.includes(normalized))
        paths.push(normalized);
    }
    const manifestKeys = raw[spec.key] === undefined ? [] : [spec.key];
    if (paths.length === 0 && manifestKeys.length === 0) continue;
    inputs.push({
      kind: spec.kind,
      name: spec.name,
      paths,
      manifestKeys,
      class: keyClass(raw, [spec.key]),
      executable: spec.executes,
    });
  }
  return inputs;
}

/** One functional component per file under the plugin's `bin/`. */
async function binComponents(root: string): Promise<RemainderInput[]> {
  const files = await filesUnder(root, path.join(root, CLAUDE_PLUGIN_BIN_DIR));
  return files.map((file) => ({
    kind: "bin",
    name: path.posix.basename(file),
    paths: [file],
    class: "functional",
    executable: true,
  }));
}

/** One file-less component per {@link KEY_COMPONENTS} key the manifest sets. */
function keyComponents(raw: Record<string, unknown>): RemainderInput[] {
  return KEY_COMPONENTS.filter((spec) => raw[spec.key] !== undefined).map((spec) => ({
    kind: spec.kind,
    name: spec.key,
    paths: [],
    manifestKeys: [spec.key],
    class: keyClass(raw, [spec.key]),
  }));
}

/** The marketplace listing keys as one component, with the icon file when it is in the package. */
async function listingComponents(
  root: string,
  raw: Record<string, unknown>,
): Promise<RemainderInput[]> {
  const listing = LISTING_KEYS.filter((key) => raw[key] !== undefined);
  if (listing.length === 0) return [];
  const icon = typeof raw.icon === "string" ? contained(root, raw.icon) : undefined;
  return [
    {
      kind: "listing-metadata",
      name: "listing",
      paths:
        icon !== undefined && (await isFile(icon))
          ? [path.posix.normalize(raw.icon as string)]
          : [],
      manifestKeys: listing,
      class: keyClass(raw, listing),
    },
  ];
}

/** Every other manifest key, by name: a monitor when its value holds monitors, else `other`. */
function unhandledComponents(root: string, raw: Record<string, unknown>): RemainderInput[] {
  return Object.keys(raw)
    .sort()
    .filter((key) => !HANDLED_KEYS.has(key))
    .map((key) => {
      const monitor = MONITOR_COMPONENTS.find(
        (spec) => spec.key === key && (spec.holds?.(raw[key]) ?? true),
      );
      return {
        kind: monitor?.kind ?? "other",
        name: key,
        paths: componentPaths(raw[key]).filter(
          (relative) => contained(root, relative) !== undefined,
        ),
        manifestKeys: [key],
        class: keyClass(raw, [key]),
        executable: monitor?.executes ?? false,
      };
    });
}

/** The package file a command-map definition's `source` names, when it is one. */
async function commandSource(root: string, definition: unknown): Promise<string[]> {
  if (!isRecord(definition) || typeof definition.source !== "string") return [];
  const resolved = contained(root, definition.source);
  return resolved !== undefined && (await isFile(resolved))
    ? [path.posix.normalize(definition.source)]
    : [];
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
    ...MONITOR_COMPONENTS.map((spec) => spec.key),
    "mcpServers",
  ],
  files: [
    ...FILE_COMPONENTS.map((spec) => `${spec.dir}/`),
    ...MERGED_COMPONENTS.map((spec) => spec.file),
    `${CLAUDE_PLUGIN_BIN_DIR}/`,
  ],
  packageValues: ["version", "author"],
};
