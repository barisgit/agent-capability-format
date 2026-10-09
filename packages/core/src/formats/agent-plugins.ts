/**
 * Agent Plugins 1.0 reader (source-format-readers, Agent Plugins 1.0 reader). Projects the
 * root `plugin.json`, immediate `skills/<dir>/SKILL.md` and root `mcp.json`; preserves
 * unknown root keys and `extensions` as `agent-plugins` dialect extras and every extension
 * namespace as native remainder. Loading follows the standard: a bad skill or server is
 * skipped with a warning, a bad `mcp.json` top level disables only MCP, and a bad manifest
 * fails the package.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { AGENT_PLUGINS_DIALECT, withNativeExtras, withPackageValues } from "../extras/index.js";
import type {
  Diagnostic,
  Manifest,
  McpFile,
  NativeRemainderComponent,
  PackageAuthor,
  SkillFacet,
} from "../types/index.js";
import { isRecord } from "../utils/guards.js";
import { projectAgentPluginsServer } from "./mcp.js";
import {
  type ForeignReadOptions,
  type ForeignReadResult,
  foreignCapability,
  invalidManifest,
} from "./package.js";
import {
  isDirectory,
  isFile,
  packageAuthor,
  packageIdentity,
  readJson,
  remainderComponent,
} from "./shared.js";
import { readForeignSkill, skillAssets, skillDirectories } from "./skills.js";

const SCHEMA_BASE = "https://agent-plugins.org/schemas/";
export const AGENT_PLUGINS_MCP_SCHEMA = `${SCHEMA_BASE}1.0.0/mcp.schema.json`;

/**
 * The Agent Plugins schema version a root `plugin.json` declares (`1.0.0`, `1.1.0`, ...),
 * or undefined when its `$schema` is not an Agent Plugins plugin schema. Detection uses
 * it to recognize the format before the version is checked.
 */
export function agentPluginsSchemaVersion(manifest: unknown): string | undefined {
  if (!isRecord(manifest) || typeof manifest.$schema !== "string") return undefined;
  const match = /^https:\/\/agent-plugins\.org\/schemas\/([^/]+)\/plugin\.schema\.json$/.exec(
    manifest.$schema,
  );
  return match?.[1];
}

const KNOWN_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);
const STRING_KEYS = ["version", "description", "homepage", "repository", "license"] as const;
const NAME = /^(?!.*--)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;
const NAMESPACE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/** Reads the Agent Plugins 1.0 package at `root` as one capability. */
export async function readAgentPluginsPackage(
  root: string,
  options: ForeignReadOptions,
): Promise<ForeignReadResult> {
  const manifestPath = path.join(root, "plugin.json");
  const read = await readJson(manifestPath, "acf.source.manifest-invalid", "error");
  if (!read.ok) return { capability: undefined, diagnostics: [read.diagnostic] };
  const raw = read.value;
  const version = agentPluginsSchemaVersion(raw);
  if (!isRecord(raw) || version === undefined)
    return invalidManifest(manifestPath, "$schema is not an Agent Plugins plugin schema");
  if (version !== "1.0.0") {
    return {
      capability: undefined,
      diagnostics: [
        {
          severity: "error",
          code: "acf.source.format-version-unsupported",
          message: `Agent Plugins ${version} is not supported; this caplet reads Agent Plugins 1.0.0`,
          path: manifestPath,
          data: { format: "agent-plugins", version, supported: ["1.0.0"] },
        },
      ],
    };
  }
  const problem = manifestProblem(raw);
  if (problem !== undefined) return invalidManifest(manifestPath, problem);

  const diagnostics: Diagnostic[] = [];
  const named = packageIdentity({
    manifestName: raw.name as string,
    version: raw.version,
    rename: options.rename,
    revision: options.revision,
    manifestPath,
  });
  if ("diagnostic" in named) return { capability: undefined, diagnostics: [named.diagnostic] };
  const manifest = projectManifest(raw, named.identity, manifestPath, diagnostics);

  const skills: SkillFacet[] = [];
  for (const dir of await skillDirectories(path.join(root, "skills"))) {
    const skill = await readForeignSkill(dir, "agent-plugins", diagnostics);
    if (skill !== undefined) skills.push(skill);
  }
  const remainder: NativeRemainderComponent[] = [];
  const mcp = await readMcp(root, diagnostics, remainder);
  remainder.push(...(await extensionNamespaces(root, raw.extensions)));

  const capability = foreignCapability({
    root,
    options,
    manifest,
    skills,
    mcp,
    assets: await skillAssets(root, skills),
    diagnostics,
    source: {
      format: "agent-plugins",
      formatVersion: "1.0",
      renamedFrom: named.identity.renamedFrom,
    },
    remainder,
  });
  return { capability, diagnostics };
}

/** The first fatal manifest violation, or undefined when the manifest loads. */
function manifestProblem(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.name !== "string" || !NAME.test(raw.name))
    return "name must be 1-64 characters of a-z, 0-9, . and -, starting and ending alphanumeric";
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
    const unknown = Object.keys(raw.author).find((key) => !["name", "email", "url"].includes(key));
    if (unknown !== undefined) return `author has unknown key ${unknown}`;
    for (const key of ["email", "url"]) {
      if (raw.author[key] !== undefined && typeof raw.author[key] !== "string")
        return `author.${key} must be a string`;
    }
  }
  return undefined;
}

function projectManifest(
  raw: Record<string, unknown>,
  identity: { name: string; version: string; foreignVersion?: string | undefined },
  manifestPath: string,
  diagnostics: Diagnostic[],
): Manifest {
  const manifest: Manifest = { acf: 1, name: identity.name, version: identity.version };
  if (typeof raw.description === "string") manifest.description = raw.description;
  if (typeof raw.license === "string") manifest.license = raw.license;
  if (typeof raw.homepage === "string") manifest.homepage = raw.homepage;
  if (typeof raw.repository === "string") manifest.repository = raw.repository;
  if (Array.isArray(raw.keywords)) manifest.keywords = raw.keywords as string[];

  const packageValues: Record<string, unknown> = {};
  if (identity.foreignVersion !== undefined) packageValues.version = identity.foreignVersion;
  if (raw.author !== undefined) manifest.authors = [packageAuthor(raw.author as PackageAuthor)];

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN_KEYS.has(key)) continue;
    extras[key] = value;
    diagnostics.push({
      severity: "warn",
      code: "acf.source.manifest-key-unknown",
      message: `plugin.json key ${key} is not part of Agent Plugins 1.0; it is kept but not used`,
      path: manifestPath,
      data: { key },
    });
  }
  if (raw.extensions !== undefined && !isRecord(raw.extensions)) {
    diagnostics.push({
      severity: "warn",
      code: "acf.source.component-invalid",
      message: "plugin.json extensions is not an object and is ignored",
      path: manifestPath,
    });
  } else if (raw.extensions !== undefined) {
    extras.extensions = raw.extensions;
  }

  const targets = withPackageValues(
    withNativeExtras(undefined, AGENT_PLUGINS_DIALECT, extras),
    AGENT_PLUGINS_DIALECT,
    packageValues,
  );
  if (Object.keys(targets).length > 0) manifest.targets = targets;
  return manifest;
}

async function readMcp(
  root: string,
  diagnostics: Diagnostic[],
  remainder: NativeRemainderComponent[],
): Promise<McpFile | undefined> {
  const file = path.join(root, "mcp.json");
  if (!(await isFile(file))) return undefined;
  const disabled = (reason: string): undefined => {
    diagnostics.push({
      severity: "warn",
      code: "acf.source.component-invalid",
      message: `mcp.json is not loaded: ${reason}; the package loads without MCP servers`,
      path: file,
      family: "mcp",
    });
    return undefined;
  };
  const read = await readJson(file, "acf.source.component-invalid", "warn");
  if (!read.ok) return disabled(read.diagnostic.message);
  const raw = read.value;
  if (!isRecord(raw) || raw.$schema !== AGENT_PLUGINS_MCP_SCHEMA)
    return disabled(`$schema must be ${AGENT_PLUGINS_MCP_SCHEMA}`);
  if (!isRecord(raw.mcpServers)) return disabled("mcpServers must be an object");

  const servers: McpFile["servers"] = [];
  for (const [name, value] of Object.entries(raw.mcpServers)) {
    const projection = projectAgentPluginsServer(name, value);
    if (projection.kind === "server") {
      servers.push(projection.server);
    } else if (projection.kind === "remainder") {
      remainder.push(
        await remainderComponent(root, {
          format: "agent-plugins",
          kind: "mcp-server",
          name,
          paths: ["mcp.json"],
          class: "functional",
          executable: projection.executable,
        }),
      );
    } else {
      diagnostics.push({
        severity: "warn",
        code: "acf.source.component-invalid",
        message: `MCP server ${name} is not loaded: ${projection.reason}`,
        path: file,
        family: "mcp",
      });
    }
  }
  return { path: file, servers };
}

/** One remainder component per extension namespace in the manifest or as a directory. */
async function extensionNamespaces(
  root: string,
  extensions: unknown,
): Promise<NativeRemainderComponent[]> {
  const inManifest = new Set(isRecord(extensions) ? Object.keys(extensions) : []);
  const directories = new Set<string>();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && NAMESPACE.test(entry.name)) directories.add(entry.name);
  }
  const names = [...new Set([...inManifest, ...directories])].sort();
  const components: NativeRemainderComponent[] = [];
  for (const name of names) {
    const paths = (await isDirectory(path.join(root, name))) ? [name] : [];
    components.push(
      await remainderComponent(root, {
        format: "agent-plugins",
        kind: "extension-namespace",
        name,
        paths,
        manifestKeys: inManifest.has(name) ? [`extensions.${name}`] : [],
        class: "functional",
      }),
    );
  }
  return components;
}
