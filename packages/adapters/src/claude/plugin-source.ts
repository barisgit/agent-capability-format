/**
 * What of a source package reaches its Claude plugin after rename, selection and applicability.
 * A Claude plugin source records what its reader projected (`CapabilitySource.projected`); the
 * remainder components selection removed take the files and manifest entries only they used
 * with them. MCP bundle references stay manifest entries, since `.mcp.json` cannot hold one.
 */
import path from "node:path";
import type { AcfCapability, NativeRemainderComponent, ReadOnlyFs } from "@caplet/core";
import { isRecord } from "../common/records.js";
import { CLAUDE_MANIFEST_PATH, MAPPED_MANIFEST_KEYS } from "./manifest.js";

/** Manifest keys the plugin writer generates from core fields or projected components. */
const PROJECTED_MANIFEST_KEYS = new Set<string>([...MAPPED_MANIFEST_KEYS, "skills", "mcpServers"]);

/**
 * True for a Claude plugin source that reaches Claude as its reader projected it: no rename and
 * no skill, server or remainder component removed by selection or applicability.
 */
export function isUnchangedClaudePlugin(capability: AcfCapability): boolean {
  const projected =
    capability.source?.format === "claude-plugin" ? capability.source.projected : undefined;
  if (projected === undefined) return false;
  const skills = capability.skills.map((skill) => skill.name).sort();
  const servers = (capability.mcp?.servers ?? []).map((server) => server.name).sort();
  return (
    capability.source?.renamedFrom === undefined &&
    sameList(projected.skills, skills) &&
    sameList(projected.servers, servers) &&
    removedRemainder(capability).length === 0
  );
}

/** The remainder components of a Claude plugin source that selection or applicability removed. */
function removedRemainder(capability: AcfCapability): NativeRemainderComponent[] {
  const kept = capability.remainder ?? [];
  return (capability.source?.projected?.remainder ?? []).filter(
    (component) =>
      !kept.some((item) => item.kind === component.kind && item.name === component.name),
  );
}

/**
 * The files and manifest keys only removed remainder components used, so they do not reach the
 * plugin. A file or key a kept component shares stays.
 */
export function unselectedPathsAndKeys(capability: AcfCapability): {
  paths: Set<string>;
  keys: Set<string>;
} {
  const kept = capability.remainder ?? [];
  const keptPaths = new Set(kept.flatMap((component) => component.paths));
  const keptKeys = new Set(kept.flatMap((component) => component.manifestKeys ?? []));
  const removed = removedRemainder(capability);
  return {
    paths: new Set(removed.flatMap((c) => c.paths).filter((p) => !keptPaths.has(p))),
    keys: new Set(removed.flatMap((c) => c.manifestKeys ?? []).filter((key) => !keptKeys.has(key))),
  };
}

/**
 * The source manifest's unprojected entries for the plugin, without the keys and entries of
 * remainder components selection removed: a key only removed components used is dropped, a
 * shared component key (such as `agents`) loses the paths of removed files, and a shared
 * component map (such as a `commands` map) loses the entries of removed components.
 */
export function selectedManifestEntries(
  capability: AcfCapability,
  rawManifest: Record<string, unknown>,
): Array<[string, unknown]> {
  const { paths, keys } = unselectedPathsAndKeys(capability);
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(rawManifest)) {
    if (PROJECTED_MANIFEST_KEYS.has(key) || keys.has(key)) continue;
    const kept = isRecord(value)
      ? withoutNames(value, removedNames(capability, key))
      : withoutPaths(value, paths);
    if (kept !== undefined) entries.push([key, kept]);
  }
  return entries;
}

/** Names of the removed remainder components declared under manifest key `key`. */
function removedNames(capability: AcfCapability, key: string): Set<string> {
  return new Set(
    removedRemainder(capability)
      .filter((component) => component.manifestKeys?.includes(key) === true)
      .map((component) => component.name),
  );
}

/** `map` without the entries `names` lists. */
function withoutNames(
  map: Record<string, unknown>,
  names: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(map).filter(([name]) => !names.has(name)));
}

/** `value` without string entries naming one of `paths`; undefined when nothing is left. */
function withoutPaths(value: unknown, paths: ReadonlySet<string>): unknown {
  const removed = (item: unknown) =>
    typeof item === "string" && paths.has(path.posix.normalize(item));
  if (Array.isArray(value)) {
    const kept = value.filter((item) => !removed(item));
    return kept.length === 0 && value.length > 0 ? undefined : kept;
  }
  return removed(value) ? undefined : value;
}

/** The source's own entry for a remainder server, read from the file that declared it. */
export async function rawServerEntry(
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
 * Package-relative JSON config files named by a Claude manifest `mcpServers` value. Their servers
 * are regenerated into `.mcp.json`, so the files themselves are not copied.
 */
export function jsonConfigPaths(value: unknown): string[] {
  return references(value)
    .filter((item) => !isBundleReference(item))
    .map((item) => path.posix.normalize(item))
    .filter((item) => !item.startsWith("../"));
}

/**
 * The manifest `mcpServers` value for the bundle references whose servers selection kept, in
 * the source's shape (one string or a list); undefined when none is kept. `.mcp.json` cannot
 * hold a bundle, so these stay manifest references, and a local bundle file is copied as a
 * support file.
 */
export function selectedBundles(capability: AcfCapability, value: unknown): unknown {
  const kept = bundleReferences(value).filter((reference) =>
    (capability.remainder ?? []).some(
      (component) => component.kind === "mcp-server" && component.name === reference,
    ),
  );
  if (kept.length === 0) return undefined;
  return typeof value === "string" ? kept[0] : kept;
}

/** The `.mcpb` and HTTPS bundle references of a manifest `mcpServers` value, as authored. */
export function bundleReferences(value: unknown): string[] {
  return references(value).filter(isBundleReference);
}

/** The string entries of a manifest component value: one string or a list mixing forms. */
function references(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string",
  );
}

/** True for an MCP bundle reference, which the Claude plugin reader keeps as remainder. */
function isBundleReference(reference: string): boolean {
  return reference.startsWith("https://") || reference.endsWith(".mcpb");
}

/** The JSON object `text` holds; undefined when it is absent, malformed or not an object. */
export function parseJsonObject(text: string | null): Record<string, unknown> | undefined {
  if (text === null) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
