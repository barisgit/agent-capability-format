import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listTreeFiles, type TreeFile } from "../hash/tree.js";
import { capabilityCarrier, remainderTargets, targetMap } from "../targets/index.js";
import type {
  AcfCapability,
  Carrier,
  HookEntry,
  NativeRemainderComponent,
  NativeRemainderKind,
  Scope,
  SourceFormat,
  TargetId,
} from "../types/index.js";
import { applyApplicability } from "./index.js";

/** What kind of executing code a component is: a remainder kind, or a file with the executable bit. */
export type ExecutableKind = NativeRemainderKind | "file";

/**
 * One component of a capability that executes code on one target (install-integrity,
 * Executable change report): a stdio MCP server, a hook, a file with the executable bit, or an
 * executable native remainder component. `fingerprint` changes whenever the code that runs or
 * how it is started changes, including files the command references inside the capability.
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

const PLACEHOLDER_PATH = /\$\{(ACF_CAPABILITY_DIR|ACF_PACKAGE_DIR|ACF_HOOK_DIR)\}(\/[^\s"'=:,;]+)/g;

type Snapshot = {
  root: string;
  files: readonly TreeFile[];
  digests: Map<string, string>;
};

/**
 * Lists the components of `capability` that execute code on `target`, after the capability's
 * applicability (`only`/`except`) for that target: stdio MCP servers, hooks on targets that run
 * hooks, executable native remainder of a format `target` writes, and files with the executable
 * bit. A file under a skill follows that skill's applicability, a file under `native/<t>/`
 * reaches only `t`, and files of a foreign package reach only the target of its format or a plugin
 * carrier, which copies the package's support files. Files belonging to a remainder component
 * count toward that component, not as separate files. `carrier` is the configured
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
        referencedFiles(snapshot, mcpDir, [server.command, ...(server.args ?? [])]),
      ),
    });
  }

  if (targetMap[target]?.support.hook !== "none") {
    const hookDir =
      filtered.hooks === undefined ? filtered.root : path.dirname(filtered.hooks.path);
    const hooks: Array<[string, HookEntry]> = [
      ...Object.entries(filtered.hooks?.buckets ?? {}).flatMap(([event, entries]) =>
        (entries ?? []).map((entry): [string, HookEntry] => [event, entry]),
      ),
      ...Object.entries(filtered.hooks?.targets?.[target]?.hooks ?? {}).flatMap(
        ([event, entries]) => entries.map((entry): [string, HookEntry] => [event, entry]),
      ),
    ];
    for (const [event, entry] of hooks) {
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
    if (nativeTarget !== undefined && nativeTarget !== target) continue;
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
