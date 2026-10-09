import path from "node:path";
import { pushZodIssues } from "../diagnostics/index.js";
import { mcpFileSchema } from "../schemas/index.js";
import { isTargetId } from "../targets/registry.js";
import type { Diagnostic, McpFile, McpServer, TargetId } from "../types/index.js";
import { narrowToTarget, parseYamlFile, pickFamilyYaml } from "./helpers.js";

/**
 * Reads `mcp/mcp.yml` (or `.yaml`) as one server list (see `serverList`). `undefined` when the
 * file is absent or fails its schema; the problems are pushed to `diagnostics`.
 */
export async function readMcp(
  root: string,
  diagnostics: Diagnostic[],
): Promise<McpFile | undefined> {
  const file = await pickFamilyYaml(
    path.join(root, "mcp"),
    "mcp",
    "acf.mcp.duplicate-file",
    diagnostics,
  );
  if (file === undefined) return undefined;
  const parsed = mcpFileSchema.safeParse(await parseYamlFile(file, diagnostics));
  if (!parsed.success) {
    // Only the family-level target blocks reject unknown keys.
    pushZodIssues(diagnostics, parsed.error, file, {
      baseCode: "acf.mcp.invalid-field",
      family: "mcp",
      unknownKeyCode: "acf.target.extension.unknown-field",
    });
    return undefined;
  }
  const targets = parsed.data.targets as Record<string, { servers?: McpServer[] }> | undefined;
  return {
    path: file,
    servers: serverList(parsed.data.servers as McpServer[], targets, file, diagnostics),
  };
}

/**
 * The canonical servers, then the family-level `targets.<target>.servers` (SPEC.md §13a.5) as
 * servers that apply to `<target>` only, so selection, every writer, the support registry,
 * conflict checks and executable fingerprints see one list (see {@link narrowToTarget}). A
 * server whose name repeats a canonical server, or another entry of the same target, is
 * reported and left out, since a target would otherwise receive two servers under one name;
 * so is an unknown block target id.
 */
function serverList(
  canonical: McpServer[],
  targets: Record<string, { servers?: McpServer[] }> | undefined,
  file: string,
  diagnostics: Diagnostic[],
): McpServer[] {
  const report = (code: string, message: string): void => {
    diagnostics.push({ severity: "error", code, message, path: file, family: "mcp" });
  };
  const duplicate = (name: string, of: string): void =>
    report("acf.facet.duplicate", `duplicate mcp server: ${name} repeats the name of ${of}`);
  const out: McpServer[] = [];
  const canonicalNames = new Set<string>();
  for (const server of canonical) {
    if (canonicalNames.has(server.name)) duplicate(server.name, "another canonical server");
    else out.push(server);
    canonicalNames.add(server.name);
  }
  for (const [target, block] of Object.entries(targets ?? {})) {
    if (!isTargetId(target)) {
      report("acf.target.unknown-id", `unknown target id: ${target}`);
      continue;
    }
    out.push(...targetServers(target, block.servers ?? [], canonicalNames, report, duplicate));
  }
  return out;
}

/** The `targets.<target>.servers` entries narrowed to `target`, without repeated names. */
function targetServers(
  target: TargetId,
  entries: readonly McpServer[],
  canonicalNames: ReadonlySet<string>,
  report: (code: string, message: string) => void,
  duplicate: (name: string, of: string) => void,
): McpServer[] {
  const out: McpServer[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const server = narrowToTarget(entry, target, (id) =>
      report("acf.target.unknown-id", `unknown target id: ${id}`),
    );
    if (canonicalNames.has(server.name)) duplicate(server.name, "a canonical server");
    else if (seen.has(server.name))
      duplicate(server.name, `another targets.${target}.servers entry`);
    else out.push(server as McpServer);
    seen.add(server.name);
  }
  return out;
}
