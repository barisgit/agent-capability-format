import path from "node:path";
import {
  mcpConfigConflict,
  mcpPathFor,
  mcpServerPointer,
  readJsonObject,
} from "@caplet/adapters/common";
import type { AcfCapability, Diagnostic, ReadOnlyFs, Scope, TargetId } from "@caplet/core";
import { hasJsonPointer } from "../apply/json-pointer.js";
import { readSidecar, relativeSidecarPath } from "../apply/sidecar.js";

export type McpConflictContext = {
  target: TargetId;
  scope: Scope;
  installRoot: string;
  fs: ReadOnlyFs;
};

/**
 * Withholds the MCP servers caplet must not write for one scope and target, each reported as
 * `acf.mcp.config-conflict` (error).
 *
 * A server name two or more capabilities declare for the target is withheld from all of them:
 * one MCP file holds one server per name and ACF picks no winner (SPEC.md 17.6). On JSON-config
 * targets a server the MCP file already defines without a sidecar entry owning it is the user's
 * and is withheld too; the Codex adapter detects that case itself from its markers.
 * `capabilities` are already narrowed to `target`.
 */
export async function withholdConflictingMcpServers(
  capabilities: readonly AcfCapability[],
  context: McpConflictContext,
): Promise<{ capabilities: AcfCapability[]; diagnostics: Diagnostic[] }> {
  const { target } = context;
  const declaredBy = new Map<string, string[]>();
  for (const capability of capabilities) {
    for (const server of capability.mcp?.servers ?? []) {
      const owners = declaredBy.get(server.name) ?? [];
      owners.push(capability.manifest.name);
      declaredBy.set(server.name, owners);
    }
  }
  if (declaredBy.size === 0) return { capabilities: [...capabilities], diagnostics: [] };
  const file = mcpPathFor(target, context.installRoot, context.scope);
  const userDefined = target === "codex" ? () => false : await userDefinedServers(file, context);
  const diagnostics: Diagnostic[] = [];
  const kept = capabilities.map((capability) => {
    const mcp = capability.mcp;
    if (mcp === undefined) return capability;
    const servers = mcp.servers.filter((server) => {
      const others = (declaredBy.get(server.name) ?? []).filter(
        (owner) => owner !== capability.manifest.name,
      );
      const owners = others.length > 0 ? others : userDefined(server.name) ? "user-defined" : null;
      if (owners === null) return true;
      diagnostics.push(
        mcpConfigConflict({ file, server: server.name, target, capability, owners }),
      );
      return false;
    });
    return servers.length === mcp.servers.length
      ? capability
      : { ...capability, mcp: { ...mcp, servers } };
  });
  return { capabilities: kept, diagnostics };
}

/**
 * Whether the JSON MCP file defines a server no sidecar entry of the install root owns. A file
 * that does not parse defines nothing here; the adapter reports it when it merges.
 */
async function userDefinedServers(
  file: string,
  context: McpConflictContext,
): Promise<(name: string) => boolean> {
  let config: Record<string, unknown>;
  try {
    config = readJsonObject(await context.fs.readText(file));
  } catch {
    return () => false;
  }
  const relative = relativeSidecarPath(context.installRoot, file);
  const owns = (await readSidecar(path.join(context.installRoot, ".acf-managed.json"))).managed
    .filter((entry) => entry.path === relative)
    .flatMap((entry) => entry.owns);
  if (owns.some((own) => own.kind === "file")) return () => false;
  const owned = new Set(owns.flatMap((own) => (own.kind === "json-pointer" ? [own.pointer] : [])));
  return (name) => {
    const pointer = mcpServerPointer(context.target, name);
    return hasJsonPointer(config, pointer) && !owned.has(pointer);
  };
}
