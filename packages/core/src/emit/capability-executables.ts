/**
 * Executable-inventory collectors for a capability's own components: its stdio MCP servers, its
 * hooks, and its files with the executable bit that no other component claims.
 */
import path from "node:path";
import { remainderTargets, targetMap } from "../targets/index.js";
import {
  type AcfCapability,
  hookEntries,
  type NativeRemainderComponent,
  type SourceFormat,
} from "../types/index.js";
import { commandLine, type ExecutableComponent, type Inventory } from "./executable-inventory.js";
import {
  fingerprint,
  referencedFiles,
  relativeEntrypoints,
  relativeTo,
  underAny,
  union,
} from "./snapshot.js";

const foreignFormats: ReadonlySet<SourceFormat> = new Set(["claude-plugin", "agent-plugins"]);

/**
 * The capability's stdio MCP servers, by command line, fingerprinted with the packaged files
 * their command and arguments name. Remote servers start no code and are left out.
 */
export async function stdioServerExecutables({
  capability,
  snapshot,
  base,
}: Inventory): Promise<ExecutableComponent[]> {
  const components: ExecutableComponent[] = [];
  const mcpDir = capability.mcp === undefined ? capability.root : path.dirname(capability.mcp.path);
  for (const server of capability.mcp?.servers ?? []) {
    if (server.transport !== "stdio") continue;
    components.push({
      ...base,
      kind: "mcp-server",
      name: server.name,
      detail: commandLine(server.command, server.args),
      fingerprint: await fingerprint(
        { command: server.command, args: server.args, env: server.env, cwd: server.cwd },
        union(
          snapshot,
          referencedFiles(snapshot, mcpDir, [server.command, ...(server.args ?? [])]),
          relativeEntrypoints(snapshot, server.cwd, server.command, server.args ?? []),
        ),
      ),
    });
  }
  return components;
}

/** The capability's hook entries, on targets that run hooks, by event and hook name. */
export async function hookExecutables({
  capability,
  target,
  snapshot,
  base,
}: Inventory): Promise<ExecutableComponent[]> {
  if (targetMap[target]?.support.hook === "none") return [];
  const components: ExecutableComponent[] = [];
  const hookDir =
    capability.hooks === undefined ? capability.root : path.dirname(capability.hooks.path);
  for (const { event, entry } of hookEntries(capability.hooks)) {
    const { description: _description, ...executing } = entry;
    components.push({
      ...base,
      kind: "hook",
      name: `${event}/${entry.name}`,
      detail: commandLine(entry.run.command, entry.run.args),
      fingerprint: await fingerprint(
        { event, ...executing },
        referencedFiles(snapshot, hookDir, [entry.run.command, ...(entry.run.args ?? [])]),
      ),
    });
  }
  return components;
}

/**
 * Files with the executable bit that no other component claims and that reach `target`. A file
 * under a skill follows that skill's applicability, so `allSkills` are the skills before it was
 * applied; a file under `native/<t>/` reaches only `t` through its plugin carrier; and a file of
 * a foreign package reaches only the target of its format or a plugin carrier.
 */
export async function executableFiles(
  inventory: Inventory,
  allSkills: AcfCapability["skills"],
  claimed: readonly string[],
): Promise<ExecutableComponent[]> {
  const reaches = reachesTarget(inventory, allSkills);
  const components: ExecutableComponent[] = [];
  for (const file of inventory.snapshot.files) {
    if (!file.executable || underAny(file.rel, claimed) || !reaches(file.rel)) continue;
    components.push({
      ...inventory.base,
      kind: "file",
      name: file.rel,
      detail: file.rel,
      fingerprint: await fingerprint({ executable: true }, [file]),
    });
  }
  return components;
}

/**
 * Whether a snapshot-relative file reaches the inventory's target, by the rules of
 * {@link executableFiles}.
 */
function reachesTarget(
  { capability, target, pluginCarried, snapshot }: Inventory,
  allSkills: AcfCapability["skills"],
): (rel: string) => boolean {
  const source = capability.source;
  const foreign = source !== undefined && foreignFormats.has(source.format);
  const foreignTargets =
    source === undefined || !foreign
      ? []
      : remainderTargets[source.format as NativeRemainderComponent["format"]];
  const skillDirs = new Map(
    allSkills.map((skill) => [relativeTo(snapshot.root, skill.dir), skill.name]),
  );
  const keptSkills = new Set(capability.skills.map((skill) => skill.name));
  return (rel) => {
    const skill = [...skillDirs].find(([dir]) => underAny(rel, [dir]));
    if (skill !== undefined && !keptSkills.has(skill[1])) return false;
    const nativeTarget = /^native\/([^/]+)\//.exec(rel)?.[1];
    if (nativeTarget !== undefined && (nativeTarget !== target || !pluginCarried)) return false;
    return !foreign || skill !== undefined || foreignTargets.includes(target) || pluginCarried;
  };
}
