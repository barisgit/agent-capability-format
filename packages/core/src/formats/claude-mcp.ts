/**
 * MCP servers of a Claude plugin: the default `.mcp.json` merged with manifest
 * `mcpServers` (an inline map, a relative config path, an HTTPS or `.mcpb` bundle, or a
 * list of these), later names overriding earlier ones as Claude does.
 */
import path from "node:path";
import { CLAUDE_PLUGIN_MANIFEST } from "../targets/plugin-layout.js";
import type { Diagnostic, McpFile, NativeRemainderComponent } from "../types/index.js";
import { isRecord } from "../utils/guards.js";
import { projectClaudeServer } from "./mcp.js";
import {
  componentPaths,
  contained,
  isFile,
  outsidePackage,
  readJson,
  remainderComponent,
} from "./shared.js";

type Declared = { raw: unknown; file: string; manifestKey: boolean };

/** Servers by name, later declarations replacing earlier ones, and the config files read. */
type Collected = { declared: Map<string, Declared>; sources: string[] };

/** Where readers report what they skip and what they keep as native remainder. */
type Sink = { diagnostics: Diagnostic[]; remainder: NativeRemainderComponent[] };

const DEFAULT_CONFIG = ".mcp.json";

/**
 * Projects the plugin's MCP servers into `McpFile`, pushing pending servers and bundles to
 * `remainder` and skipped servers to `diagnostics`; undefined when the plugin declares none.
 */
export async function readClaudeMcp(
  root: string,
  manifest: Record<string, unknown>,
  diagnostics: Diagnostic[],
  remainder: NativeRemainderComponent[],
): Promise<McpFile | undefined> {
  const sink: Sink = { diagnostics, remainder };
  const found: Collected = { declared: new Map(), sources: [] };
  if (await isFile(path.join(root, DEFAULT_CONFIG))) {
    await readConfig(root, DEFAULT_CONFIG, false, found, sink);
  }
  const value = manifest.mcpServers;
  const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
  for (const entry of entries) await readManifestEntry(root, entry, found, sink);
  if (found.declared.size === 0 && found.sources.length === 0 && value === undefined)
    return undefined;

  const servers: McpFile["servers"] = [];
  for (const [name, entry] of [...found.declared].sort(([a], [b]) => a.localeCompare(b))) {
    const server = await projectDeclared(root, name, entry, sink);
    if (server !== undefined) servers.push(server);
  }
  return { path: path.join(root, found.sources[0] ?? CLAUDE_PLUGIN_MANIFEST), servers };
}

function merge(
  found: Collected,
  servers: Record<string, unknown>,
  file: string,
  manifestKey: boolean,
): void {
  for (const [name, raw] of Object.entries(servers))
    found.declared.set(name, { raw, file, manifestKey });
}

/** Records `relative` as a source and merges its servers; an unreadable or invalid file warns. */
async function readConfig(
  root: string,
  relative: string,
  manifestKey: boolean,
  found: Collected,
  sink: Sink,
): Promise<void> {
  found.sources.push(relative);
  const file = path.join(root, relative);
  const read = await readJson(file, "acf.source.component-invalid", "warn");
  if (!read.ok) {
    sink.diagnostics.push({ ...read.diagnostic, family: "mcp" });
    return;
  }
  const servers = serverMap(read.value);
  if (servers === undefined) {
    sink.diagnostics.push(invalidConfig(file));
    return;
  }
  merge(found, servers, relative, manifestKey);
}

/** One `mcpServers` entry: an inline map, or paths to config files and bundles. */
async function readManifestEntry(
  root: string,
  entry: unknown,
  found: Collected,
  sink: Sink,
): Promise<void> {
  if (isRecord(entry)) {
    merge(found, serverMap(entry) ?? {}, CLAUDE_PLUGIN_MANIFEST, true);
    return;
  }
  for (const relative of componentPaths(entry)) {
    if (/^https:\/\//.test(relative) || relative.endsWith(".mcpb")) {
      sink.remainder.push(await bundleComponent(root, relative));
    } else if (contained(root, relative) === undefined) {
      sink.diagnostics.push(outsidePackage(root, "mcpServers", relative));
    } else {
      await readConfig(root, path.posix.normalize(relative), true, found, sink);
    }
  }
}

/** An HTTPS or `.mcpb` bundle reference, kept as one executable remainder component. */
function bundleComponent(root: string, relative: string): Promise<NativeRemainderComponent> {
  return remainderComponent(root, {
    format: "claude-plugin",
    kind: "mcp-server",
    name: relative,
    paths: relative.startsWith("https:") ? [] : [path.posix.normalize(relative)],
    manifestKeys: ["mcpServers"],
    class: "functional",
    executable: true,
  });
}

/** The core server `entry` projects to; a pending server becomes remainder, others warn. */
async function projectDeclared(
  root: string,
  name: string,
  entry: Declared,
  sink: Sink,
): Promise<McpFile["servers"][number] | undefined> {
  const projection = projectClaudeServer(name, entry.raw);
  if (projection.kind === "server") return projection.server;
  if (projection.kind === "remainder") {
    sink.remainder.push(
      await remainderComponent(root, {
        format: "claude-plugin",
        kind: "mcp-server",
        name,
        paths: [entry.file],
        manifestKeys: entry.manifestKey ? ["mcpServers"] : [],
        class: "functional",
        executable: projection.executable,
      }),
    );
  } else {
    sink.diagnostics.push({
      severity: "warn",
      code: "acf.source.component-invalid",
      message: `MCP server ${name} is not loaded: ${projection.reason}`,
      path: path.join(root, entry.file),
      family: "mcp",
    });
  }
  return undefined;
}

/** The server map of an MCP config: its `mcpServers` object, or the object itself. */
function serverMap(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (value.mcpServers !== undefined)
    return isRecord(value.mcpServers) ? value.mcpServers : undefined;
  return value;
}

function invalidConfig(file: string): Diagnostic {
  return {
    severity: "warn",
    code: "acf.source.component-invalid",
    message: `${path.basename(file)} is not an MCP server map and is ignored`,
    path: file,
    family: "mcp",
  };
}
