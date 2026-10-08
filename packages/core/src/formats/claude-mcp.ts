/**
 * MCP servers of a Claude plugin: the default `.mcp.json` merged with manifest
 * `mcpServers` (an inline map, a relative config path, an HTTPS or `.mcpb` bundle, or a
 * list of these), later names overriding earlier ones as Claude does.
 */
import path from "node:path";
import type { Diagnostic, McpFile, NativeRemainderComponent } from "../types/index.js";
import { projectClaudeServer } from "./mcp.js";
import {
  CLAUDE_MANIFEST,
  componentPaths,
  contained,
  isFile,
  isRecord,
  outsidePackage,
  readJson,
  remainderComponent,
} from "./shared.js";

type Declared = { raw: unknown; file: string; manifestKey: boolean };

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
  const declared = new Map<string, Declared>();
  const merge = (servers: Record<string, unknown>, file: string, manifestKey: boolean): void => {
    for (const [name, raw] of Object.entries(servers))
      declared.set(name, { raw, file, manifestKey });
  };
  const readFile = async (relative: string, manifestKey: boolean): Promise<void> => {
    const file = path.join(root, relative);
    const read = await readJson(file, "acf.source.component-invalid", "warn");
    if (!read.ok) {
      diagnostics.push({ ...read.diagnostic, family: "mcp" });
      return;
    }
    const servers = serverMap(read.value);
    if (servers === undefined) {
      diagnostics.push(invalidConfig(file));
      return;
    }
    merge(servers, relative, manifestKey);
  };

  const sources: string[] = [];
  if (await isFile(path.join(root, ".mcp.json"))) {
    sources.push(".mcp.json");
    await readFile(".mcp.json", false);
  }
  const value = manifest.mcpServers;
  const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
  for (const entry of entries) {
    if (isRecord(entry)) {
      merge(serverMap(entry) ?? {}, CLAUDE_MANIFEST, true);
      continue;
    }
    for (const relative of componentPaths(entry)) {
      if (/^https:\/\//.test(relative) || relative.endsWith(".mcpb")) {
        remainder.push(
          await remainderComponent(root, {
            format: "claude-plugin",
            kind: "mcp-server",
            name: relative,
            paths: relative.startsWith("https:") ? [] : [path.posix.normalize(relative)],
            manifestKeys: ["mcpServers"],
            class: "functional",
            executable: true,
          }),
        );
        continue;
      }
      if (contained(root, relative) === undefined) {
        diagnostics.push(outsidePackage(root, "mcpServers", relative));
        continue;
      }
      const normalized = path.posix.normalize(relative);
      sources.push(normalized);
      await readFile(normalized, true);
    }
  }
  if (declared.size === 0 && sources.length === 0 && value === undefined) return undefined;

  const servers: McpFile["servers"] = [];
  for (const [name, entry] of [...declared].sort(([a], [b]) => a.localeCompare(b))) {
    const projection = projectClaudeServer(name, entry.raw);
    if (projection.kind === "server") {
      servers.push(projection.server);
    } else if (projection.kind === "remainder") {
      remainder.push(
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
      diagnostics.push({
        severity: "warn",
        code: "acf.source.component-invalid",
        message: `MCP server ${name} is not loaded: ${projection.reason}`,
        path: path.join(root, entry.file),
        family: "mcp",
      });
    }
  }
  return { path: path.join(root, sources[0] ?? CLAUDE_MANIFEST), servers };
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
