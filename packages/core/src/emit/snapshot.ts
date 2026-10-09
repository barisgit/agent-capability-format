/**
 * The capability snapshot an executable-component inventory reads: which files a definition
 * reaches through ACF or plugin-root path placeholders or relative entrypoints, and the fingerprint that
 * changes when a component's definition or any of its files does.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listTreeFiles, type TreeFile } from "../hash/tree.js";
import { acfCapabilityDirPlaceholder } from "../types/index.js";
import { leavesBase } from "../utils/paths.js";

const PLACEHOLDER_PATH = /\$\{(ACF_CAPABILITY_DIR|ACF_PACKAGE_DIR|ACF_HOOK_DIR)\}(\/[^\s"'=:,;]+)/g;
/** `${NAME}/path`, ending where a shell word or a JSON or YAML value would. */
const PACKAGE_ROOT_PATH = /\$\{([A-Z_]+)\}(\/[^\s"'=:,;\\|&<>()`]+)/g;

/** A capability's files at the time of the inventory, relative to its resolved root. */
export type Snapshot = {
  root: string;
  files: readonly TreeFile[];
};

/** Lists the files under `root` as a snapshot. */
export async function readSnapshot(root: string): Promise<Snapshot> {
  return { root: path.resolve(root), files: await listTreeFiles(root) };
}

/** Files of the snapshot that `values` name through an ACF path placeholder. */
export function referencedFiles(
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

/**
 * Snapshot files a stdio server's `command` or `args` name by a relative path, resolved under a
 * working directory inside the capability (`${ACF_CAPABILITY_DIR}[/dir]` or `./dir`). Only exact
 * files count, so a directory argument does not pull in a tree; `--option=value` contributes its
 * value. A command without `/` runs from PATH, not the working directory, and an omitted or
 * data-directory `cwd` resolves nothing because the server then assumes no packaged directory.
 */
export function relativeEntrypoints(
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

/**
 * Snapshot files that `values` name below a placeholder for a plugin package's root, such as
 * `${CLAUDE_PLUGIN_ROOT}/scripts/start.js`: the code a plugin configuration runs. `names` are
 * the placeholder names that mean the package root, and `bases` the snapshot-relative
 * directories the package draws its files from, highest precedence first; a path resolves in the
 * first base that holds it, as a plugin carrier copies `native/<target>/` over the capability's
 * own files. A directory path counts every file under it.
 */
export function packageRootReferences(
  snapshot: Snapshot,
  bases: readonly string[],
  names: readonly string[],
  values: readonly string[],
): TreeFile[] {
  const chosen: TreeFile[] = [];
  for (const value of values) {
    for (const match of value.matchAll(PACKAGE_ROOT_PATH)) {
      if (!names.includes(match[1] ?? "")) continue;
      const relative = path.posix.normalize((match[2] ?? "").slice(1)).normalize("NFC");
      // The package root itself, or a path leaving it, names no file the configuration owns.
      if (relative === "." || leavesBase(relative)) continue;
      for (const base of bases) {
        const prefix = base === "" ? relative : `${base}/${relative}`;
        const files = filesUnder(snapshot, [prefix]);
        if (files.length === 0) continue;
        chosen.push(...files);
        break;
      }
    }
  }
  return union(snapshot, chosen);
}

/**
 * Every string a component's definition or files hold, for {@link packageRootReferences}: the
 * string leaves of the definition and of each file that parses as JSON, else the file's text.
 */
export async function componentStrings(
  definition: unknown,
  files: readonly TreeFile[],
): Promise<string[]> {
  const strings = stringLeaves(definition);
  for (const file of files) {
    const text = await readFile(file.absPath, "utf8");
    try {
      strings.push(...stringLeaves(JSON.parse(text)));
    } catch {
      strings.push(text);
    }
  }
  return strings;
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(stringLeaves);
}

/**
 * `files` in the byte order of their `rel`, as a snapshot lists them, so files a plugin package
 * draws from several bases hash in the order the same foreign package's files would.
 */
export function byRel(files: readonly TreeFile[]): TreeFile[] {
  return [...files].sort((a, b) =>
    Buffer.compare(Buffer.from(a.rel, "utf8"), Buffer.from(b.rel, "utf8")),
  );
}

/** Files in any of `lists`, once each, in snapshot order. */
export function union(snapshot: Snapshot, ...lists: readonly (readonly TreeFile[])[]): TreeFile[] {
  const chosen = new Set(lists.flat());
  return snapshot.files.filter((file) => chosen.has(file));
}

/** Snapshot files at or under any of `prefixes`. */
export function filesUnder(snapshot: Snapshot, prefixes: readonly string[]): TreeFile[] {
  return snapshot.files.filter((file) => underAny(file.rel, prefixes));
}

/** Whether `rel` is one of `prefixes` or lies under one; an empty prefix holds everything. */
export function underAny(rel: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      prefix === "" ||
      rel === prefix ||
      rel.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}

/** `absolute` as a snapshot-relative NFC path; a path outside the root matches no file. */
export function relativeTo(root: string, absolute: string): string {
  const relative = path.relative(root, absolute).split(path.sep).join("/").normalize("NFC");
  // A path outside the snapshot can match no snapshot file.
  return leavesBase(relative) ? "\u0000outside" : relative === "." ? "" : relative;
}

/**
 * Digest of a component's definition and its files' paths, modes and contents, so a change to
 * any of them changes the fingerprint.
 */
export async function fingerprint(
  definition: unknown,
  files: readonly TreeFile[],
): Promise<string> {
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
