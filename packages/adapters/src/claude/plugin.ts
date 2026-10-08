/**
 * The Claude plugin carrier (claude-plugin-output): one capability becomes one Claude plugin
 * package at `pluginPackageDir(installRoot, name)`.
 *
 * An unchanged Claude plugin source is copied byte for byte with only its `version` rewritten.
 * Every other capability (native ACF, a transformed Claude plugin, a translated Agent Plugins
 * package) gets generated carriers — the manifest, `skills/<name>/` and `.mcp.json` — over its
 * `native/claude/` files, over the package's remaining files copied unchanged.
 */
import path from "node:path";
import {
  type AcfCapability,
  componentOmitted,
  type Diagnostic,
  type EmitInput,
  type EmitResult,
  extraDropped,
  extrasDialects,
  type FileContent,
  type FileDiff,
  MANAGEMENT_NOTICE_FILENAME,
  NATIVE_FILES_DIR,
  type NativeRemainderComponent,
  nativeExtras,
  nativeFiles,
  nativeFileTargets,
  nativeTreeDropped,
  packageRefused,
  payloadDigestOfEntries,
  pluginPackageDir,
  type ReadOnlyFs,
  type SupportSubject,
} from "@caplet/core";
import { makeFileDiff } from "../common/diff.js";
import { mergeJson } from "../common/json-merge.js";
import { type McpPlaceholderValues, renderNativeMcpServer } from "../common/mcp.js";
import { renderNativeSkill } from "../common/skill-serializer.js";
import { readSkillAssets } from "../common/skills.js";
import type { EmitReport } from "../common/support-report.js";
import { renderMarkdownFile } from "../common/text.js";
import { listTree, type TreeFile } from "../common/tree.js";
import { CLAUDE_MANIFEST_PATH, pluginManifest, pluginVersion } from "./manifest.js";

// Built from parts so the source holds no placeholder string literal (biome noTemplateCurlyInString).
const PLACEHOLDER_OPEN = "$";
const PLUGIN_ROOT = `${PLACEHOLDER_OPEN}{CLAUDE_PLUGIN_ROOT}`;
const PLUGIN_DATA = `${PLACEHOLDER_OPEN}{CLAUDE_PLUGIN_DATA}`;

/** The package's MCP config, which Claude reads from the plugin root. */
const MCP_PATH = ".mcp.json";

/** Manifest keys the plugin writer generates from core fields or projected components. */
const PROJECTED_MANIFEST_KEYS = new Set([
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "skills",
  "mcpServers",
]);

/** Paths of a native ACF capability that its reader owns; none is copied into the plugin. */
const ACF_OWNED = new Set([
  "acf.yml",
  "acf.yaml",
  "ACF.md",
  "skills",
  "agents",
  "commands",
  "instructions",
  "hooks",
  NATIVE_FILES_DIR,
  "mcp/mcp.yml",
  "mcp/mcp.yaml",
]);

/**
 * Root paths Claude reads from a plugin. In a native ACF capability they are not Claude
 * configuration, so they are left out of the plugin with a hint toward `native/claude/`.
 */
const CLAUDE_DISCOVERED = new Set([
  ".claude-plugin",
  MCP_PATH,
  ".lsp.json",
  "settings.json",
  "output-styles",
]);

/** One file of the plugin package, relative to its root. */
type PackageFile = { content: FileContent; mode: number };

/**
 * Writes `input.capability` as a Claude plugin. Returns no diffs and no plugin when any
 * component is refused, since a refusal blocks the whole capability for Claude.
 */
export async function emitClaudePlugin(input: EmitInput, fs: ReadOnlyFs): Promise<EmitResult> {
  const capability = input.capability;
  const report: EmitReport = { diagnostics: [], outcomes: [] };
  const dir = pluginPackageDir(input.installRoot, capability.manifest.name);
  const built = isUnchangedClaudePlugin(capability)
    ? await copiedPackage(capability, fs)
    : await generatedPackage(capability, fs, report);
  if (report.diagnostics.some((diagnostic) => diagnostic.code === "acf.support.refused"))
    return { diffs: [], diagnostics: report.diagnostics, outcomes: report.outcomes };

  const atBase = built.files.with(CLAUDE_MANIFEST_PATH, built.manifest(built.baseVersion));
  const digest = payloadDigestOfEntries(
    [...atBase].map(([relativePath, file]) => ({
      path: relativePath,
      content: file.content,
      executable: (file.mode & 0o111) !== 0,
    })),
  );
  const version = pluginVersion(built.baseVersion, digest);
  const files = built.files.with(CLAUDE_MANIFEST_PATH, built.manifest(version));

  const diffs: FileDiff[] = [];
  for (const [relativePath, file] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const outPath = path.join(dir, ...relativePath.split("/"));
    const [before, beforeMode] = await Promise.all([fs.readBytes(outPath), fs.readMode(outPath)]);
    const diff = makeFileDiff(outPath, before, file.content, [{ kind: "file" }], {
      before: beforeMode,
      after: file.mode,
    });
    diff.artifactRoot = dir;
    diffs.push(diff);
  }
  return {
    diffs,
    diagnostics: report.diagnostics,
    outcomes: report.outcomes,
    plugins: [
      { target: "claude", scope: input.scope, name: capability.manifest.name, version, dir },
    ],
  };
}

/** The package's files without its manifest, which `manifest` renders for a version. */
type BuiltPackage = {
  files: PackageFiles;
  baseVersion: string;
  manifest(version: string): PackageFile;
};

/** Package files keyed by relative path, where a later layer replaces an earlier one. */
class PackageFiles implements Iterable<[string, PackageFile]> {
  readonly #files = new Map<string, PackageFile>();

  set(relativePath: string, file: PackageFile): void {
    this.#files.set(relativePath, file);
  }

  /** A copy with `relativePath` set to `file`. */
  with(relativePath: string, file: PackageFile): PackageFiles {
    const copy = new PackageFiles();
    for (const [key, value] of this.#files) copy.set(key, value);
    copy.set(relativePath, file);
    return copy;
  }

  [Symbol.iterator](): Iterator<[string, PackageFile]> {
    return this.#files[Symbol.iterator]();
  }
}

/**
 * True for a Claude plugin source that reaches Claude as its reader projected it: no rename and
 * no skill or server removed by selection or applicability.
 */
function isUnchangedClaudePlugin(capability: AcfCapability): boolean {
  const projected =
    capability.source?.format === "claude-plugin" ? capability.source.projected : undefined;
  if (projected === undefined) return false;
  const skills = capability.skills.map((skill) => skill.name).sort();
  const servers = (capability.mcp?.servers ?? []).map((server) => server.name).sort();
  return (
    projected.name === capability.manifest.name &&
    sameList(projected.skills, skills) &&
    sameList(projected.servers, servers)
  );
}

/** The source package byte for byte; its manifest differs only in the `version` value. */
async function copiedPackage(capability: AcfCapability, fs: ReadOnlyFs): Promise<BuiltPackage> {
  const files = new PackageFiles();
  let manifestText = "{}\n";
  for (const file of await listTree(fs, capability.root, { skip: (p) => p === ".git" })) {
    if (file.path === CLAUDE_MANIFEST_PATH) manifestText = new TextDecoder().decode(file.bytes);
    else files.set(file.path, { content: file.bytes, mode: file.mode });
  }
  const raw = parseJsonObject(manifestText);
  const own = typeof raw?.version === "string" ? raw.version : undefined;
  return {
    files,
    baseVersion: own ?? capability.manifest.version,
    manifest: (version) => ({ content: mergeJson(manifestText, "/version", version), mode: 0o644 }),
  };
}

/**
 * The generated package: the package's other files, then its `native/claude/` files, then the
 * generated manifest, skills and MCP config, each layer replacing paths of the one before.
 */
async function generatedPackage(
  capability: AcfCapability,
  fs: ReadOnlyFs,
  report: EmitReport,
): Promise<BuiltPackage> {
  const name = capability.manifest.name;
  const subject: SupportSubject = {
    capability: name,
    target: "claude",
    carrier: "plugin",
    family: "package",
    component: name,
  };
  const files = new PackageFiles();
  const format = capability.source?.format ?? "acf";
  const rawManifest =
    format === "claude-plugin"
      ? (parseJsonObject(await fs.readText(path.join(capability.root, CLAUDE_MANIFEST_PATH))) ?? {})
      : {};

  for (const file of await supportFiles(capability, fs, rawManifest, report.diagnostics))
    files.set(file.path, { content: file.bytes, mode: file.mode });
  for (const extra of nativeFiles(capability, "claude")) {
    const source = path.join(capability.root, NATIVE_FILES_DIR, "claude", ...extra.path.split("/"));
    const bytes = await fs.readBytes(source);
    if (bytes !== null)
      files.set(extra.path, { content: bytes, mode: (await fs.readMode(source)) ?? 0o644 });
  }
  for (const owner of nativeFileTargets(capability))
    if (owner !== "claude")
      report.diagnostics.push(nativeTreeDropped({ capability: name, target: "claude" }, owner));
  for (const dialect of extrasDialects(capability.manifest.targets)) {
    if (dialect === "claude") continue;
    for (const key of Object.keys(nativeExtras(capability.manifest.targets, dialect)))
      report.diagnostics.push(
        extraDropped({ ...subject, family: "package" }, { owner: dialect, key }),
      );
  }

  await addSkills(capability, fs, files, report);
  const mcp = await mcpConfig(capability, fs, rawManifest, report);
  if (mcp !== undefined) files.set(MCP_PATH, { content: mcp, mode: 0o644 });
  reportRemainder(capability, report);

  const extras: Array<[string, unknown]> =
    format === "claude-plugin"
      ? Object.entries(rawManifest).filter(([key]) => !PROJECTED_MANIFEST_KEYS.has(key))
      : [];
  for (const entry of Object.entries(nativeExtras(capability.manifest.targets, "claude")))
    if (!extras.some(([key]) => key === entry[0])) extras.push(entry);
  const manifest = pluginManifest(capability, extras, report);
  return {
    files,
    baseVersion: manifest.baseVersion,
    manifest: (version) => ({ content: manifest.render(version), mode: 0o644 }),
  };
}

/** Writes every skill Claude accepts at `skills/<name>/` with its assets. */
async function addSkills(
  capability: AcfCapability,
  fs: ReadOnlyFs,
  files: PackageFiles,
  report: EmitReport,
): Promise<void> {
  for (const skill of capability.skills) {
    const rendering = renderNativeSkill(capability, skill, "claude", "plugin");
    report.diagnostics.push(...rendering.diagnostics);
    report.outcomes.push(...rendering.outcomes);
    if (rendering.refused) continue;
    const root = `skills/${skill.name}/`;
    for (const asset of await readSkillAssets(capability, skill, fs))
      files.set(root + asset.relativePath, { content: asset.bytes, mode: asset.mode });
    for (const [relativePath, content] of Object.entries(rendering.files))
      files.set(root + relativePath, { content, mode: 0o644 });
    files.set(`${root}SKILL.md`, {
      content: renderMarkdownFile(rendering.frontmatter, skill.body),
      mode: 0o644,
    });
  }
}

/**
 * The plugin's `.mcp.json`: every canonical server Claude accepts, plus the raw entries of a
 * Claude plugin source's servers its reader kept as remainder. Undefined without servers.
 */
async function mcpConfig(
  capability: AcfCapability,
  fs: ReadOnlyFs,
  rawManifest: Record<string, unknown>,
  report: EmitReport,
): Promise<string | undefined> {
  const servers: Record<string, unknown> = {};
  const mcp = capability.mcp;
  if (mcp !== undefined) {
    const hookDir = path
      .relative(capability.root, path.dirname(mcp.path))
      .split(path.sep)
      .join("/");
    const values: McpPlaceholderValues = {
      capabilityDir: PLUGIN_ROOT,
      hookDir: hookDir === "" ? PLUGIN_ROOT : `${PLUGIN_ROOT}/${hookDir}`,
      dataDir: PLUGIN_DATA,
    };
    for (const server of [...mcp.servers].sort((a, b) => a.name.localeCompare(b.name))) {
      const rendered = renderNativeMcpServer(capability, server, "claude", values, "plugin");
      report.diagnostics.push(...rendered.diagnostics);
      report.outcomes.push(...rendered.outcomes);
      if (rendered.entry !== null) servers[server.name] = rendered.entry;
    }
  }
  if (capability.source?.format === "claude-plugin") {
    for (const component of capability.remainder ?? []) {
      if (component.kind !== "mcp-server") continue;
      const entry = await rawServerEntry(capability, fs, rawManifest, component);
      if (entry !== undefined) servers[component.name] = entry;
      else
        report.diagnostics.push(
          componentOmitted(
            {
              capability: capability.manifest.name,
              target: "claude",
              carrier: "plugin",
              family: "mcp",
              component: component.name,
            },
            "a transformed plugin regenerates .mcp.json, which cannot reference a remote or .mcpb server",
          ),
        );
    }
  }
  if (Object.keys(servers).length === 0) return undefined;
  return `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
}

/** The source's own entry for a remainder server, read from the file that declared it. */
async function rawServerEntry(
  capability: AcfCapability,
  fs: ReadOnlyFs,
  rawManifest: Record<string, unknown>,
  component: NativeRemainderComponent,
): Promise<Record<string, unknown> | undefined> {
  const file = component.paths[0];
  if (file === undefined) return undefined;
  const declared =
    file === CLAUDE_MANIFEST_PATH
      ? rawManifest.mcpServers
      : parseJsonObject(await fs.readText(path.join(capability.root, ...file.split("/"))));
  if (!isRecord(declared)) return undefined;
  const map = isRecord(declared.mcpServers) ? declared.mcpServers : declared;
  const entry = map[component.name];
  return isRecord(entry) ? entry : undefined;
}

/**
 * Reports remainder Claude cannot carry. A Claude plugin's remainder is Claude's own and goes
 * into the plugin unchanged, with a warning when rename or selection changed the package around
 * it. Agent Plugins remainder has no Claude form.
 */
function reportRemainder(capability: AcfCapability, report: EmitReport): void {
  const remainder = capability.remainder ?? [];
  const name = capability.manifest.name;
  if (capability.source?.format === "claude-plugin") {
    if (remainder.length === 0) return;
    report.diagnostics.push({
      severity: "lossy",
      code: "acf.emit.transformed-remainder",
      message:
        "renamed or selected Claude plugin " +
        name +
        " keeps its preserved components (" +
        remainder.map((c) => c.name).join(", ") +
        "), which may still reference renamed or excluded items",
      targetId: "claude",
      capability: { name },
      data: { components: remainder.map((c) => ({ kind: c.kind, name: c.name })) },
    });
    return;
  }
  for (const component of remainder) {
    const subject = { capability: name, target: "claude" as const, carrier: "plugin" as const };
    if (component.kind === "mcp-server")
      report.diagnostics.push(
        componentOmitted(
          { ...subject, family: "mcp", component: component.name },
          `Claude cannot run this ${component.format} server`,
        ),
      );
    else if (component.class === "restricting")
      report.diagnostics.push(
        packageRefused(
          { ...subject, family: "package", component: name },
          "its " +
            component.format +
            " " +
            component.kind +
            " " +
            component.name +
            " restricts the package and has no Claude form",
        ),
      );
  }
}

/**
 * The package's files outside every generated carrier and format-owned path, copied unchanged.
 * Claude configuration in a native ACF root is left out with a hint.
 */
async function supportFiles(
  capability: AcfCapability,
  fs: ReadOnlyFs,
  rawManifest: Record<string, unknown>,
  diagnostics: Diagnostic[],
): Promise<TreeFile[]> {
  const format = capability.source?.format ?? "acf";
  const owned = new Set<string>([".git"]);
  if (format === "acf") for (const p of ACF_OWNED) owned.add(p);
  if (format === "claude-plugin") {
    owned.add(CLAUDE_MANIFEST_PATH);
    owned.add(MCP_PATH);
    for (const p of jsonConfigPaths(rawManifest.mcpServers)) owned.add(p);
  }
  if (format === "agent-plugins") {
    owned.add("plugin.json");
    owned.add("mcp.json");
    for (const component of capability.remainder ?? [])
      for (const p of component.paths) owned.add(p);
  }
  return await listTree(fs, capability.root, {
    skip: (relativePath) => {
      if (
        owned.has(relativePath) ||
        path.posix.basename(relativePath) === MANAGEMENT_NOTICE_FILENAME
      )
        return true;
      if (format !== "acf" || !CLAUDE_DISCOVERED.has(relativePath)) return false;
      diagnostics.push({
        severity: "info",
        code: "acf.claude.plugin-file-ignored",
        message:
          relativePath +
          " in ACF capability " +
          capability.manifest.name +
          " is not Claude configuration; files for the Claude plugin belong under native/claude/",
        path: path.join(capability.root, relativePath),
        targetId: "claude",
        capability: { name: capability.manifest.name },
      });
      return true;
    },
    // Skill directories are regenerated, and an excluded skill's files never reach the plugin.
    skipDir: (entries) => entries.includes("SKILL.md"),
  });
}

/** Package-relative JSON config files named by a Claude manifest `mcpServers` value. */
function jsonConfigPaths(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string" && !item.includes("://"))
    .map((item) => path.posix.normalize(item))
    .filter((item) => !item.startsWith("../"));
}

function parseJsonObject(text: string | null): Record<string, unknown> | undefined {
  if (text === null) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
