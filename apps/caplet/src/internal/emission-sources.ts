/** Keeps preview storage paths out of emitted configuration while writers read preview bytes. */
import path from "node:path";
import { type AcfCapability, leavesBase, type ProseSource, type ReadOnlyFs } from "@caplet/core";

/**
 * Presents disposable snapshots at their final logical locations to an adapter. Only source
 * location fields are relocated, never authored content or relative package paths. Filesystem
 * reads under the logical snapshot tree are redirected to storage; output reads stay on disk.
 * Executable inventories still use the original physical capability before this emission seam.
 */
export function emissionSources(
  capability: AcfCapability,
  fs: ReadOnlyFs,
  storage: string | undefined,
  installed: string,
): { capability: AcfCapability; fs: ReadOnlyFs } {
  if (storage === undefined) return { capability, fs };
  const logical = (file: string) => relocate(file, storage, installed);
  const physical = (file: string) => relocate(file, installed, storage);
  const prose = (source: ProseSource): ProseSource => ({
    ...source,
    path: logical(source.path),
    primary: logical(source.primary),
  });
  return {
    capability: {
      ...capability,
      root: logical(capability.root),
      manifestPath:
        capability.manifestPath === undefined ? undefined : logical(capability.manifestPath),
      origin:
        capability.origin.kind === "local"
          ? { ...capability.origin, directory: logical(capability.origin.directory) }
          : capability.origin,
      capabilityMarkdown:
        capability.capabilityMarkdown === undefined
          ? undefined
          : { ...capability.capabilityMarkdown, path: logical(capability.capabilityMarkdown.path) },
      skills: capability.skills.map((skill) => ({
        ...skill,
        dir: logical(skill.dir),
        primaryFile: logical(skill.primaryFile),
      })),
      agents: capability.agents.map((facet) => ({ ...facet, source: prose(facet.source) })),
      commands: capability.commands.map((facet) => ({ ...facet, source: prose(facet.source) })),
      instructions: capability.instructions.map((facet) => ({
        ...facet,
        source: prose(facet.source),
      })),
      hooks:
        capability.hooks === undefined
          ? undefined
          : { ...capability.hooks, path: logical(capability.hooks.path) },
      mcp:
        capability.mcp === undefined
          ? undefined
          : { ...capability.mcp, path: logical(capability.mcp.path) },
      source:
        capability.source === undefined
          ? undefined
          : { ...capability.source, snapshotRoot: logical(capability.source.snapshotRoot) },
      diagnostics: capability.diagnostics.map((item) => ({
        ...item,
        path: item.path === undefined ? undefined : logical(item.path),
      })),
    },
    fs: {
      exists: (file) => fs.exists(physical(file)),
      readText: (file) => fs.readText(physical(file)),
      readBytes: (file) => fs.readBytes(physical(file)),
      readMode: (file) => fs.readMode(physical(file)),
      listDir: (file) => fs.listDir(physical(file)),
    },
  };
}

/** Relocates only contained paths, so similarly named siblings and output files stay unchanged. */
function relocate(file: string, from: string, to: string): string {
  const relative = path.relative(from, file);
  return leavesBase(relative) ? file : path.join(to, relative);
}
