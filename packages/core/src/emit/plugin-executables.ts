/**
 * Executable-inventory collectors for the configuration a plugin carrier writes from a native ACF
 * capability's `native/<target>/` files and package-level `targets.<target>.native` keys,
 * classified like the same component of a foreign plugin read by the target's plugin reader.
 */
import path from "node:path";
import { nativeExtras, nativeFiles } from "../extras/index.js";
import { readClaudeMcp } from "../formats/claude-mcp.js";
import { componentPaths } from "../formats/shared.js";
import {
  CLAUDE_PLUGIN_BIN_DIR,
  CLAUDE_PLUGIN_MANIFEST,
  claudePluginComponents,
  isPerFileComponent,
  type MergedComponentSpec,
  type PerFileComponentSpec,
  type PluginComponentSpec,
  perFileComponentName,
} from "../targets/index.js";
import type {
  AcfCapability,
  NativeRemainderComponent,
  NativeRemainderKind,
  TargetId,
} from "../types/index.js";
import { leavesBase } from "../utils/paths.js";
import {
  type ClaimingComponents,
  commandLine,
  type Inventory,
  nativePackageFingerprint,
  packageLayers,
  runningFingerprint,
} from "./executable-inventory.js";
import {
  filesUnder,
  layeredPath,
  packageRootReferences,
  type Snapshot,
  underAny,
} from "./snapshot.js";

/**
 * Package components that execute code, per plugin carrier target, recorded the way that target's
 * plugin reader records the same component as foreign remainder (formats/claude-plugin.ts): a
 * merged component's default file merges with the paths and value of the manifest key, and `holds`
 * limits a key to values that hold executable entries; a per-file component is one component per
 * file it discovers. Every file under the bin directory is one `bin` component.
 * MCP servers come from the target's plugin reader of the package's server files and `mcp.key`.
 */
const pluginExecutables: Partial<
  Record<
    TargetId,
    {
      components: readonly PluginComponentSpec[];
      binDir: string;
      mcp: { key: string; read: typeof readClaudeMcp };
    }
  >
> = {
  claude: {
    components: claudePluginComponents.filter((spec) => spec.executes),
    binDir: CLAUDE_PLUGIN_BIN_DIR,
    mcp: { key: "mcpServers", read: readClaudeMcp },
  },
};

/** The executing configuration a plugin carrier writes (see {@link pluginConfigComponents}). */
export async function pluginConfigExecutables({
  capability,
  target,
  snapshot,
  base,
}: Inventory): Promise<ClaimingComponents> {
  const result: ClaimingComponents = { components: [], claimed: [] };
  const layers = packageLayers(target);
  for (const component of pluginConfigComponents(capability, target, snapshot)) {
    result.claimed.push(...component.prefixes);
    result.components.push({
      ...base,
      kind: component.kind,
      name: component.name,
      detail: component.detail,
      fingerprint: await runningFingerprint(
        snapshot,
        layers,
        component.definition,
        filesUnder(snapshot, component.prefixes),
        layers[0],
      ),
    });
  }
  return result;
}

/** {@link ClaimingComponents} plus the name of every server the package declares, executable or not. */
export type NativeServers = ClaimingComponents & { names: ReadonlySet<string> };

/**
 * MCP servers a plugin carrier for `target` writes from its server files (the default
 * `native/<target>/.mcp.json` and the package files the key names) and the package-level
 * `targets.<target>.native` server key, read by the target's plugin reader so each server is classified and fingerprinted
 * as the same server of a foreign package: a projected stdio server by its command and the
 * package files it names, and a server the reader keeps whole by its declaration, when it
 * launches a local process. Remote servers start no code and are left out.
 */
export async function nativeServerExecutables({
  capability,
  target,
  snapshot,
  base,
}: Inventory): Promise<NativeServers> {
  const result: ClaimingComponents = { components: [], claimed: [] };
  const plugin = pluginExecutables[target];
  if (plugin === undefined) return { ...result, names: new Set() };
  const layers = packageLayers(target);
  const locate = (relative: string): string => layeredPath(snapshot, layers, relative);
  const key = plugin.mcp.key;
  const value = nativeExtras(capability.manifest.targets, target)[key];
  const manifest = value === undefined ? {} : { [key]: value };
  const remainder: NativeRemainderComponent[] = [];
  // Diagnostics belong to validation; the inventory only lists what would run.
  const mcp = await plugin.mcp.read(
    path.join(snapshot.root, layers[0]),
    manifest,
    [],
    remainder,
    (relative) => path.join(snapshot.root, locate(relative)),
  );
  for (const server of mcp?.servers ?? []) {
    if (server.transport !== "stdio") continue;
    const { command, args, env, cwd } = server;
    result.components.push({
      ...base,
      kind: "mcp-server",
      name: server.name,
      detail: commandLine(command, args),
      // As a projected foreign server is fingerprinted: the reader maps the plugin root to
      // ${ACF_CAPABILITY_DIR} and keeps no cwd.
      fingerprint: await nativePackageFingerprint(
        layers[0],
        { command, args, env, cwd },
        packageRootReferences(snapshot, layers, ["ACF_CAPABILITY_DIR"], {
          argv: [command, ...(args ?? [])],
        }),
      ),
    });
  }
  for (const component of remainder) {
    // A server declared inline under the key lives in the generated manifest, not a package file.
    const prefixes = component.paths.filter((item) => item !== CLAUDE_PLUGIN_MANIFEST).map(locate);
    result.claimed.push(...prefixes);
    if (!component.executable) continue;
    const fromKey = (component.manifestKeys ?? []).length > 0;
    result.components.push({
      ...base,
      kind: component.kind,
      name: component.name,
      detail: [...prefixes, ...(fromKey ? [`targets.${target}.native.${key}`] : [])].join(", "),
      fingerprint: await runningFingerprint(
        snapshot,
        layers,
        fromKey ? { [key]: value } : null,
        filesUnder(snapshot, prefixes),
        layers[0],
      ),
    });
  }
  const names = [...(mcp?.servers ?? []), ...remainder].map((item) => item.name);
  return { ...result, names: new Set(names) };
}

type PluginConfigComponent = {
  kind: NativeRemainderKind;
  name: string;
  detail: string;
  /** Snapshot-relative paths of the component's files and directories. */
  prefixes: string[];
  definition: unknown;
};

/**
 * Executing components a plugin carrier for `target` writes into its package from the
 * capability's `native/<target>/` files, package-level `targets.<target>.native` keys and the
 * package files those keys name.
 */
function pluginConfigComponents(
  capability: AcfCapability,
  target: TargetId,
  snapshot: Snapshot,
): PluginConfigComponent[] {
  const plugin = pluginExecutables[target];
  if (plugin === undefined) return [];
  const layers = packageLayers(target);
  const locate = (relative: string): string => layeredPath(snapshot, layers, relative);
  const files = nativeFiles(capability, target).map((file) => file.path);
  const extras = nativeExtras(capability.manifest.targets, target);
  const components: PluginConfigComponent[] = [];
  for (const spec of plugin.components) {
    if (isPerFileComponent(spec)) {
      components.push(
        ...perFileComponents(spec, extras[spec.key], files, snapshot, locate, target),
      );
      continue;
    }
    const component = configComponent(spec, extras[spec.key], files, locate, target);
    if (component !== undefined) components.push(component);
  }
  for (const file of files.filter((item) => item.startsWith(`${plugin.binDir}/`))) {
    const prefix = `${layers[0]}/${file}`;
    components.push({
      kind: "bin",
      name: path.posix.basename(file),
      detail: prefix,
      prefixes: [prefix],
      definition: null,
    });
  }
  return components;
}

/**
 * The component `spec` describes when the package has its default file in `native/<target>/`
 * (`files`) or a `targets.<target>.native` value `value` that holds it; undefined otherwise.
 * `locate` maps a package path to the snapshot path the package takes it from.
 */
function configComponent(
  spec: MergedComponentSpec,
  value: unknown,
  files: readonly string[],
  locate: (relative: string) => string,
  target: TargetId,
): PluginConfigComponent | undefined {
  if (value !== undefined && spec.holds !== undefined && !spec.holds(value)) return undefined;
  const paths = configPaths(spec, value, files);
  if (paths.length === 0 && value === undefined) return undefined;
  const prefixes = paths.map(locate);
  return {
    kind: spec.kind,
    name: spec.name,
    detail: [
      ...prefixes,
      ...(value === undefined ? [] : [`targets.${target}.native.${spec.key}`]),
    ].join(", "),
    prefixes,
    definition: value === undefined ? null : { [spec.key]: value },
  };
}

/**
 * One component per file `spec` discovers in the package: its default directory's files in
 * `native/<target>/` (`files`), or, when the `targets.<target>.native` value `value` sets its key,
 * the files at or under the package paths it names instead, as Claude replaces default discovery.
 * `locate` maps a package path to the snapshot path the package takes it from.
 */
function perFileComponents(
  spec: PerFileComponentSpec,
  value: unknown,
  files: readonly string[],
  snapshot: Snapshot,
  locate: (relative: string) => string,
  target: TargetId,
): PluginConfigComponent[] {
  const found =
    value === undefined
      ? files.filter((file) => underAny(file, [spec.dir])).map(locate)
      : packagePaths(value).flatMap((relative) =>
          filesUnder(snapshot, [locate(relative)]).map((file) => file.rel),
        );
  return [...new Set(found)].map((rel) => ({
    kind: spec.kind,
    name: perFileComponentName(rel),
    detail: [rel, ...(value === undefined ? [] : [`targets.${target}.native.${spec.key}`])].join(
      ", ",
    ),
    prefixes: [rel],
    definition: value === undefined ? null : { [spec.key]: value },
  }));
}

/** The spec's default file when present, then each package-relative path `value` names. */
function configPaths(
  spec: MergedComponentSpec,
  value: unknown,
  files: readonly string[],
): string[] {
  const paths = spec.file !== undefined && files.includes(spec.file) ? [spec.file] : [];
  for (const relative of value === undefined ? [] : packagePaths(value)) {
    if (!paths.includes(relative)) paths.push(relative);
  }
  return paths;
}

/** The normalized package-relative paths a manifest value names, without those leaving the package. */
function packagePaths(value: unknown): string[] {
  return componentPaths(value)
    .map((relative) => path.posix.normalize(relative))
    .filter((relative) => !leavesBase(relative));
}
