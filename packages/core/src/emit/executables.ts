import { readFile } from "node:fs/promises";
import path from "node:path";
import { NATIVE_FILES_DIR, nativeExtras, nativeFiles } from "../extras/index.js";
import { readClaudeMcp } from "../formats/claude-mcp.js";
import { componentPaths } from "../formats/shared.js";
import type { TreeFile } from "../hash/tree.js";
import {
  CLAUDE_PLUGIN_BIN_DIR,
  CLAUDE_PLUGIN_MANIFEST,
  capabilityCarrier,
  claudePluginComponents,
  type PluginComponentSpec,
  remainderTargets,
  targetMap,
} from "../targets/index.js";
import type {
  AcfCapability,
  Carrier,
  NativeRemainderComponent,
  NativeRemainderKind,
  Scope,
  SourceFormat,
  TargetId,
} from "../types/index.js";
import { hookEntries } from "../types/index.js";
import { leavesBase } from "../utils/paths.js";
import { applyApplicability } from "./index.js";
import {
  byRel,
  componentStrings,
  filesUnder,
  fingerprint,
  layeredPath,
  packageRootReferences,
  readSnapshot,
  referencedFiles,
  relativeEntrypoints,
  relativeTo,
  type Snapshot,
  underAny,
  union,
} from "./snapshot.js";

/** What kind of executing code a component is: a remainder kind, or a file with the executable bit. */
export type ExecutableKind = NativeRemainderKind | "file";

/**
 * One component of a capability that executes code on one target (install-integrity,
 * Executable change report): a stdio MCP server, a hook, a file with the executable bit, or an
 * executable native remainder component. `fingerprint` changes whenever the code that runs or
 * how it is started changes, including files the command references inside the capability
 * through an ACF path placeholder or, for a stdio server, a relative path under its `cwd`.
 */
export type ExecutableComponent = {
  scope: Scope;
  capability: string;
  target: TargetId;
  kind: ExecutableKind;
  /** Unique per capability, target and kind: server name, `<event>/<hook>`, file path or remainder name. */
  name: string;
  /** What a reader checks: the command line, or the component's paths and manifest keys. */
  detail: string;
  fingerprint: string;
};

/** An executable component added, changed or removed between two inventories. */
export type ExecutableChange = Omit<ExecutableComponent, "fingerprint"> & {
  change: "added" | "changed" | "removed";
  /** The earlier `detail` of a changed component when it differs from the current one. */
  previous?: string | undefined;
};

/** Package manifest holding a format's manifest keys, relative to the package root. */
const manifestPaths: Readonly<Record<NativeRemainderComponent["format"], string>> = {
  "claude-plugin": CLAUDE_PLUGIN_MANIFEST,
  "agent-plugins": "plugin.json",
};

const foreignFormats: ReadonlySet<SourceFormat> = new Set(["claude-plugin", "agent-plugins"]);

const kindOrder: readonly ExecutableKind[] = [
  "mcp-server",
  "hook",
  "lsp-server",
  "monitor",
  "bin",
  "file",
];

/**
 * Package components that execute code, per plugin carrier target, recorded the way that target's
 * plugin reader records the same component as foreign remainder (formats/claude-plugin.ts): the
 * default file merges with the paths and value of the manifest key, and `holds` limits a key to
 * values that hold executable entries. Every file under the bin directory is one `bin` component.
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

/**
 * Lists the components of `capability` that execute code on `target`, after the capability's
 * applicability (`only`/`except`) for that target: stdio MCP servers, hooks on targets that run
 * hooks, executable native remainder of a format `target` writes, the executable configuration a
 * plugin carrier writes from `native/<target>/` files and `targets.<target>.native` keys
 * (classified like the same component of a foreign package, one MCP server at a time, a native
 * server replacing the capability's server of its name), and files with the executable bit. A
 * file under a skill follows that skill's applicability, a file under `native/<t>/` reaches only
 * `t` through its plugin carrier (loose writers drop the tree), and files of a foreign package
 * reach only the target of its format or a plugin carrier, which copies the package's support
 * files. Files belonging to a remainder or native configuration component count toward that
 * component, not as separate files. `carrier` is the configured
 * `targets.<t>.carrier`; absent means the target default ({@link capabilityCarrier}).
 *
 * Reads the capability's snapshot to fingerprint referenced and executable files, so call it
 * while the snapshot still exists. Results are sorted by kind, then name.
 */
export async function executableComponents(
  capability: AcfCapability,
  target: TargetId,
  carrier?: Carrier,
): Promise<ExecutableComponent[]> {
  const filtered = applyApplicability(capability, target);
  if (filtered === null) return [];
  const inventory: Inventory = {
    capability: filtered,
    target,
    pluginCarried: capabilityCarrier(filtered, target, carrier) === "plugin",
    snapshot: await readSnapshot(filtered.root),
    base: { scope: filtered.scope, capability: filtered.manifest.name, target },
  };
  const hooks = await hookExecutables(inventory);
  const remainder = await remainderExecutables(inventory);
  const none: NativeServers = { components: [], claimed: [], names: new Set() };
  const pluginConfig = inventory.pluginCarried ? await pluginConfigExecutables(inventory) : none;
  const nativeServers = inventory.pluginCarried ? await nativeServerExecutables(inventory) : none;
  // A native server replaces the capability's server of the same name, as the host merges them.
  const servers = (await stdioServerExecutables(inventory)).filter(
    (server) => !nativeServers.names.has(server.name),
  );
  const components = [
    ...servers,
    ...hooks,
    ...remainder.components,
    ...pluginConfig.components,
    ...nativeServers.components,
    ...(await executableFiles(inventory, capability.skills, [
      ...remainder.claimed,
      ...pluginConfig.claimed,
      ...nativeServers.claimed,
    ])),
  ];
  return components.sort(byKindThenName);
}

/** What every collector of {@link executableComponents} reads: the capability after applicability. */
type Inventory = {
  capability: AcfCapability;
  target: TargetId;
  pluginCarried: boolean;
  snapshot: Snapshot;
  base: Pick<ExecutableComponent, "scope" | "capability" | "target">;
};

/** Components plus the snapshot-relative paths they own, which no longer count as loose files. */
type ClaimingComponents = { components: ExecutableComponent[]; claimed: string[] };

async function stdioServerExecutables({
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

async function hookExecutables({
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
 * Executable native remainder of a format `target` writes. Every remainder component claims its
 * paths, executable or not, so its files are not reported again as loose files.
 */
async function remainderExecutables({
  capability,
  target,
  snapshot,
  base,
}: Inventory): Promise<ClaimingComponents> {
  const packageRoot = capability.source?.snapshotRoot ?? capability.root;
  const result: ClaimingComponents = { components: [], claimed: [] };
  for (const component of capability.remainder ?? []) {
    const prefixes = component.paths.map((item) =>
      relativeTo(snapshot.root, path.resolve(packageRoot, item)),
    );
    result.claimed.push(...prefixes);
    if (!component.executable || !remainderTargets[component.format].includes(target)) continue;
    result.components.push({
      ...base,
      kind: component.kind,
      name: component.name,
      detail: [
        ...component.paths,
        ...(component.manifestKeys ?? []).map((key) => `${manifestPaths[component.format]}#${key}`),
      ].join(", "),
      fingerprint: await runningFingerprint(
        snapshot,
        [relativeTo(snapshot.root, packageRoot)],
        await manifestValues(packageRoot, component),
        filesUnder(snapshot, prefixes),
      ),
    });
  }
  return result;
}

/** The executing configuration a plugin carrier writes (see {@link pluginConfigComponents}). */
async function pluginConfigExecutables({
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
type NativeServers = ClaimingComponents & { names: ReadonlySet<string> };

/**
 * MCP servers a plugin carrier for `target` writes from its server files (the default
 * `native/<target>/.mcp.json` and the package files the key names) and the package-level
 * `targets.<target>.native` server key, read by the target's plugin reader so each server is classified and fingerprinted
 * as the same server of a foreign package: a projected stdio server by its command and the
 * package files it names, and a server the reader keeps whole by its declaration, when it
 * launches a local process. Remote servers start no code and are left out.
 */
async function nativeServerExecutables({
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

/**
 * Snapshot directories a plugin carrier for `target` builds its package from, highest precedence
 * first: `native/<target>/` over the capability's own files (SPEC.md §22.8.2). The carrier
 * leaves the default configuration files at the capability root out, so a default file only
 * counts from `native/<target>/`; a path a manifest key or a configuration names resolves in
 * these layers ({@link layeredPath}).
 */
function packageLayers(target: TargetId): readonly [string, string] {
  return [`${NATIVE_FILES_DIR}/${target}`, ""];
}

/** Placeholders that name a plugin package's root in each remainder format. */
const packageRootPlaceholders: readonly string[] = ["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT"];

/**
 * Fingerprint of a plugin configuration component: its definition, its own files, and the files
 * its definition or files run through a package-root placeholder (`${CLAUDE_PLUGIN_ROOT}/...`),
 * resolved in `bases` ({@link packageRootReferences}). With `packageDir`, the package is built
 * from a native ACF capability's `native/<target>/` directory ({@link nativePackageFingerprint}).
 */
async function runningFingerprint(
  snapshot: Snapshot,
  bases: readonly string[],
  definition: unknown,
  files: readonly TreeFile[],
  packageDir?: string,
): Promise<string> {
  const text = await componentStrings(definition, files);
  const referenced = packageRootReferences(snapshot, bases, packageRootPlaceholders, { text });
  const all = union(snapshot, files, referenced);
  return packageDir === undefined
    ? await fingerprint(definition, all)
    : await nativePackageFingerprint(packageDir, definition, all);
}

/**
 * Fingerprint of `definition` and `files` of the package a plugin carrier builds from the
 * capability's `native/<target>/` directory `packageDir` over its own files: files are hashed
 * package-relative and in byte order, as the same files of a foreign package are, and files in
 * the other targets' `native/` directories, which the package does not copy, are left out.
 */
async function nativePackageFingerprint(
  packageDir: string,
  definition: unknown,
  files: readonly TreeFile[],
): Promise<string> {
  const prefix = `${packageDir}/`;
  const packageFiles = files
    .filter((file) => !underAny(file.rel, [NATIVE_FILES_DIR]) || file.rel.startsWith(prefix))
    .map((file) =>
      file.rel.startsWith(prefix) ? { ...file, rel: file.rel.slice(prefix.length) } : file,
    );
  return await fingerprint(definition, byRel(packageFiles));
}

/**
 * Files with the executable bit that no other component claims and that reach `target`. A file
 * under a skill follows that skill's applicability, so `allSkills` are the skills before it was
 * applied; a file under `native/<t>/` reaches only `t` through its plugin carrier; and a file of
 * a foreign package reaches only the target of its format or a plugin carrier.
 */
async function executableFiles(
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

/**
 * Compares two inventories from {@link executableComponents} by scope, capability, target, kind
 * and name. A component only in `after` is added, only in `before` removed, and in both with a
 * different fingerprint changed. Unchanged components produce nothing, so an empty result means
 * no executable component changed. Results are sorted by scope, capability, target, kind, name.
 */
export function executableChanges(
  before: readonly ExecutableComponent[],
  after: readonly ExecutableComponent[],
): ExecutableChange[] {
  const previous = new Map(before.map((item) => [identity(item), item]));
  const changes: ExecutableChange[] = [];
  for (const item of after) {
    const old = previous.get(identity(item));
    previous.delete(identity(item));
    const { fingerprint: current, ...rest } = item;
    if (old === undefined) changes.push({ ...rest, change: "added" });
    else if (old.fingerprint !== current) {
      changes.push({
        ...rest,
        change: "changed",
        ...(old.detail === item.detail ? {} : { previous: old.detail }),
      });
    }
  }
  for (const old of previous.values()) {
    const { fingerprint: _fingerprint, ...rest } = old;
    changes.push({ ...rest, change: "removed" });
  }
  return changes.sort(
    (a, b) =>
      a.scope.localeCompare(b.scope) ||
      a.capability.localeCompare(b.capability) ||
      a.target.localeCompare(b.target) ||
      byKindThenName(a, b),
  );
}

function identity(item: ExecutableComponent): string {
  return [item.scope, item.capability, item.target, item.kind, item.name].join("\u0000");
}

function byKindThenName(
  a: Pick<ExecutableComponent, "kind" | "name">,
  b: Pick<ExecutableComponent, "kind" | "name">,
): number {
  return kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name);
}

function kindRank(kind: ExecutableKind): number {
  const index = kindOrder.indexOf(kind);
  return index === -1 ? kindOrder.length : index;
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
  spec: PluginComponentSpec,
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

/** The spec's default file when present, then each package-relative path `value` names. */
function configPaths(
  spec: PluginComponentSpec,
  value: unknown,
  files: readonly string[],
): string[] {
  const paths = spec.file !== undefined && files.includes(spec.file) ? [spec.file] : [];
  for (const relative of value === undefined ? [] : componentPaths(value)) {
    const normalized = path.posix.normalize(relative);
    if (leavesBase(normalized)) continue;
    if (!paths.includes(normalized)) paths.push(normalized);
  }
  return paths;
}

/** Values of the component's manifest keys; a manifest that is not JSON counts as a whole. */
async function manifestValues(
  packageRoot: string,
  component: NativeRemainderComponent,
): Promise<unknown> {
  const keys = component.manifestKeys ?? [];
  if (keys.length === 0) return null;
  let text: string;
  try {
    text = await readFile(path.join(packageRoot, manifestPaths[component.format]), "utf8");
  } catch {
    return null;
  }
  try {
    const manifest = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(keys.map((key) => [key, manifest[key] ?? null]));
  } catch {
    return text;
  }
}

function commandLine(command: string, args: readonly string[] | undefined): string {
  return [command, ...(args ?? [])].map(shellWord).join(" ");
}

function shellWord(value: string): string {
  return /^[\w@%+=:,./${}-]+$/.test(value) ? value : JSON.stringify(value);
}
