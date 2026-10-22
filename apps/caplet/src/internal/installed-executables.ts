import path from "node:path";
import { mcpServerPointer } from "@caplet/adapters/common";
import {
  type AcfCapability,
  CLAUDE_PLUGIN_MANIFEST,
  type ExecutableComponent,
  readForeignPackage,
  type TargetId,
} from "@caplet/core";
import type { ManagedEntry } from "../apply/sidecar.js";

/**
 * Narrows a snapshot's MCP executable inventory to installed evidence, not merely another
 * facet's presence. Loose servers own pointers/markers; plugin names come from the same reader
 * that understands their source declarations, including inline maps, config files and bundles.
 * Fingerprints still come from the approved snapshot, so target path translation is not a change.
 */
export async function installedMcpExecutables(
  components: readonly ExecutableComponent[],
  entries: readonly ManagedEntry[],
  target: TargetId,
  installRoot: string,
  capability: AcfCapability,
): Promise<ExecutableComponent[]> {
  if (!components.some((component) => component.kind === "mcp-server")) return [...components];
  const names = new Set<string>();
  const manifest = entries.find(
    (entry) =>
      entry.path.endsWith(CLAUDE_PLUGIN_MANIFEST) && entry.owns.some((own) => own.kind === "file"),
  );
  if (manifest !== undefined) {
    const root = path.dirname(path.dirname(path.resolve(installRoot, manifest.path)));
    const installed = await readForeignPackage("claude-plugin", root, {
      scope: capability.scope,
      origin: { kind: "local", directory: root },
      revision: null,
    });
    for (const server of installed.capability?.mcp?.servers ?? []) names.add(server.name);
    for (const component of installed.capability?.remainder ?? []) {
      if (component.kind === "mcp-server") names.add(component.name);
    }
  }
  const owns = entries.flatMap((entry) => entry.owns);
  return components.filter(
    (component) =>
      component.kind !== "mcp-server" ||
      names.has(component.name) ||
      owns.some(
        (own) =>
          (own.kind === "marker" && own.name === `mcp_servers.${component.name}`) ||
          (own.kind === "json-pointer" && own.pointer === mcpServerPointer(target, component.name)),
      ),
  );
}
