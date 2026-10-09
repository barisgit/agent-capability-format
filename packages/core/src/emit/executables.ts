import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NATIVE_FILES_DIR, nativeExtras, nativeFiles } from "../extras/index.js";
import { componentPaths, isRecord } from "../formats/shared.js";
import { listTreeFiles, type TreeFile } from "../hash/tree.js";
import { capabilityCarrier, remainderTargets, targetMap } from "../targets/index.js";
import type {
  AcfCapability,
  Carrier,
  NativeRemainderComponent,
  NativeRemainderKind,
  Scope,
  SourceFormat,
  TargetId,
} from "../types/index.js";
import { acfCapabilityDirPlaceholder, hookEntries } from "../types/index.js";
import { applyApplicability } from "./index.js";

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
  "claude-plugin": ".claude-plugin/plugin.json",
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
 * default file merges with the paths and value of the manifest key, and `when` limits a key to
 * values that hold executable entries. Every file under `bin/` is one `bin` component.
 */
const pluginExecutables: Partial<
  Record<
    TargetId,
    readonly {
      kind: NativeRemainderKind;
      name: string;
      key: string;
      file?: string;
      when?: (value: unknown) => boolean;
    }[]
  >
> = {
  claude: [
    { kind: "hook", name: "hooks", key: "hooks", file: "hooks/hooks.json" },
    { kind: "lsp-server", name: "lsp-servers", key: "lspServers", file: ".lsp.json" },
    { kind: "monitor", name: "monitors", key: "monitors" },
    {
      kind: "monitor",
      name: "experimental",
      key: "experimental",
      when: (value) => isRecord(value) && value.monitors !== undefined,
    },
    { kind: "mcp-server", name: "mcpServers", key: "mcpServers" },
  ],
};

const PLACEHOLDER_PATH = /\$\{(ACF_CAPABILITY_DIR|ACF_PACKAGE_DIR|ACF_HOOK_DIR)\}(\/[^\s"'=:,;]+)/g;

type Snapshot = {
  root: string;
  files: readonly TreeFile[];
  digests: Map<string, string>;
};

/**
 * Lists the components of `capability` that execute code on `target`, after the capability's
 * applicability (`only`/`except`) for that target: stdio MCP servers, hooks on targets that run
 * hooks, executable native remainder of a format `target` writes, the executable configuration a
 * plugin carrier writes from `native/<target>/` files and `targets.<target>.native` keys
 * (classified like the same package's foreign remainder), and files with the executable bit. A
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
  const pluginCarried = capabilityCarrier(filtered, target, carrier) === "plugin";
  const snapshot = await readSnapshot(filtered.root);
  const base = { scope: filtered.scope, capability: filtered.manifest.name, target };
  const components: ExecutableComponent[] = [];

  const mcpDir = filtered.mcp === undefined ? filtered.root : path.dirname(filtered.mcp.path);
  for (const server of filtered.mcp?.servers ?? []) {
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

  if (targetMap[target]?.support.hook !== "none") {
    const hookDir =
      filtered.hooks === undefined ? filtered.root : path.dirname(filtered.hooks.path);
    for (const { event, entry } of hookEntries(filtered.hooks)) {
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
  }

  const packageRoot = filtered.source?.snapshotRoot ?? filtered.root;
  const claimed: string[] = [];
  for (const component of filtered.remainder ?? []) {
    const prefixes = component.paths.map((item) =>
      relativeTo(snapshot.root, path.resolve(packageRoot, item)),
    );
    claimed.push(...prefixes);
    if (!component.executable || !remainderTargets[component.format].includes(target)) continue;
    components.push({
      ...base,
      kind: component.kind,
      name: component.name,
      detail: [
        ...component.paths,
        ...(component.manifestKeys ?? []).map((key) => `${manifestPaths[component.format]}#${key}`),
      ].join(", "),
      fingerprint: await fingerprint(
        await manifestValues(packageRoot, component),
        filesUnder(snapshot, prefixes),
      ),
    });
  }

  if (pluginCarried) {
    for (const component of pluginConfigComponents(filtered, target)) {
      claimed.push(...component.prefixes);
      components.push({
        ...base,
        kind: component.kind,
        name: component.name,
        detail: component.detail,
        fingerprint: await fingerprint(
          component.definition,
          filesUnder(snapshot, component.prefixes).map((file) => ({
            ...file,
            // Package-relative, as the same file in a foreign package is fingerprinted.
            rel: file.rel.slice(component.dir.length + 1),
          })),
        ),
      });
    }
  }

  const foreign = filtered.source !== undefined && foreignFormats.has(filtered.source.format);
  const foreignTargets =
    filtered.source === undefined || !foreign
      ? []
      : remainderTargets[filtered.source.format as NativeRemainderComponent["format"]];
  const skillDirs = new Map(
    capability.skills.map((skill) => [relativeTo(snapshot.root, skill.dir), skill.name]),
  );
  const keptSkills = new Set(filtered.skills.map((skill) => skill.name));
  for (const file of snapshot.files) {
    if (!file.executable || underAny(file.rel, claimed)) continue;
    const skill = [...skillDirs].find(([dir]) => underAny(file.rel, [dir]));
    if (skill !== undefined && !keptSkills.has(skill[1])) continue;
    const nativeTarget = /^native\/([^/]+)\//.exec(file.rel)?.[1];
    if (nativeTarget !== undefined && (nativeTarget !== target || !pluginCarried)) continue;
    if (foreign && skill === undefined && !foreignTargets.includes(target) && !pluginCarried) {
      continue;
    }
    components.push({
      ...base,
      kind: "file",
      name: file.rel,
      detail: file.rel,
      fingerprint: await fingerprint({ executable: true }, [file]),
    });
  }

  return components.sort(byKindThenName);
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

async function readSnapshot(root: string): Promise<Snapshot> {
  return { root: path.resolve(root), files: await listTreeFiles(root), digests: new Map() };
}

/** Files of the snapshot that `values` name through an ACF path placeholder. */
function referencedFiles(
  snapshot: Snapshot,
  placeholderDir: string,
  values: readonly string[],
): TreeFile[] {
  const prefixes: string[] = [];
  for (const value of values) {
    for (const match of value.matchAll(PLACEHOLDER_PATH)) {
      const base = match[1] === "ACF_HOOK_DIR" ? placeholderDir : snapshot.root;
      prefixes.push(relativeTo(snapshot.root, path.join(base, match[2] ?? "")));
    }
  }
  return filesUnder(snapshot, prefixes);
}

type PluginConfigComponent = {
  kind: NativeRemainderKind;
  name: string;
  detail: string;
  /** Snapshot-relative `native/<target>` directory the package files come from. */
  dir: string;
  /** Snapshot-relative paths of the component's files and directories. */
  prefixes: string[];
  definition: unknown;
};

/**
 * Executing components a plugin carrier for `target` writes into its package from the
 * capability's `native/<target>/` files and package-level `targets.<target>.native` keys.
 */
function pluginConfigComponents(
  capability: AcfCapability,
  target: TargetId,
): PluginConfigComponent[] {
  const dir = `${NATIVE_FILES_DIR}/${target}`;
  const files = nativeFiles(capability, target).map((file) => file.path);
  const extras = nativeExtras(capability.manifest.targets, target);
  const components: PluginConfigComponent[] = [];
  for (const spec of pluginExecutables[target] ?? []) {
    const value = extras[spec.key];
    if (value !== undefined && spec.when !== undefined && !spec.when(value)) continue;
    const paths = spec.file !== undefined && files.includes(spec.file) ? [spec.file] : [];
    for (const relative of value === undefined ? [] : componentPaths(value)) {
      const normalized = path.posix.normalize(relative);
      if (normalized.startsWith("../") || path.posix.isAbsolute(normalized)) continue;
      if (!paths.includes(normalized)) paths.push(normalized);
    }
    if (paths.length === 0 && value === undefined) continue;
    const prefixes = paths.map((item) => `${dir}/${item}`);
    components.push({
      kind: spec.kind,
      name: spec.name,
      detail: [
        ...prefixes,
        ...(value === undefined ? [] : [`targets.${target}.native.${spec.key}`]),
      ].join(", "),
      dir,
      prefixes,
      definition: value === undefined ? null : { [spec.key]: value },
    });
  }
  if (pluginExecutables[target] !== undefined) {
    for (const file of files.filter((item) => item.startsWith("bin/"))) {
      const prefix = `${dir}/${file}`;
      components.push({
        kind: "bin",
        name: path.posix.basename(file),
        detail: prefix,
        dir,
        prefixes: [prefix],
        definition: null,
      });
    }
  }
  return components;
}

/**
 * Snapshot files a stdio server's `command` or `args` name by a relative path, resolved under a
 * working directory inside the capability (`${ACF_CAPABILITY_DIR}[/dir]` or `./dir`). Only exact
 * files count, so a directory argument does not pull in a tree; `--option=value` contributes its
 * value. A command without `/` runs from PATH, not the working directory, and an omitted or
 * data-directory `cwd` resolves nothing because the server then assumes no packaged directory.
 */
function relativeEntrypoints(
  snapshot: Snapshot,
  cwd: string | undefined,
  command: string,
  args: readonly string[],
): TreeFile[] {
  const dir =
    cwd === undefined
      ? undefined
      : cwd === acfCapabilityDirPlaceholder || cwd.startsWith(`${acfCapabilityDirPlaceholder}/`)
        ? `.${cwd.slice(acfCapabilityDirPlaceholder.length)}`
        : cwd === "." || cwd.startsWith("./")
          ? cwd
          : undefined;
  if (dir === undefined) return [];
  const values = [
    ...(command.includes("/") ? [command] : []),
    ...args.map((arg) =>
      arg.startsWith("-") && arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : arg,
    ),
  ];
  const named = new Set(
    values
      .filter((value) => value !== "" && !value.includes("${") && !path.isAbsolute(value))
      .map((value) => relativeTo(snapshot.root, path.resolve(snapshot.root, dir, value))),
  );
  return snapshot.files.filter((file) => named.has(file.rel));
}

/** Files in any of `lists`, once each, in snapshot order. */
function union(snapshot: Snapshot, ...lists: readonly (readonly TreeFile[])[]): TreeFile[] {
  const chosen = new Set(lists.flat());
  return snapshot.files.filter((file) => chosen.has(file));
}

function filesUnder(snapshot: Snapshot, prefixes: readonly string[]): TreeFile[] {
  return snapshot.files.filter((file) => underAny(file.rel, prefixes));
}

function underAny(rel: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      prefix === "" ||
      rel === prefix ||
      rel.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}

function relativeTo(root: string, absolute: string): string {
  const relative = path.relative(root, absolute).split(path.sep).join("/").normalize("NFC");
  // A path outside the snapshot can match no snapshot file.
  return relative.startsWith("..") ? "\u0000outside" : relative === "." ? "" : relative;
}

async function fingerprint(definition: unknown, files: readonly TreeFile[]): Promise<string> {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(definition ?? null));
  for (const file of files) {
    hash.update(`\u0000${file.rel}\u0000${file.executable ? "x" : "-"}\u0000`);
    hash.update(
      createHash("sha256")
        .update(await readFile(file.absPath))
        .digest("hex"),
    );
  }
  return `sha256:${hash.digest("hex")}`;
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
