/**
 * The capability snapshot an executable-component inventory reads: which files a definition
 * reaches through ACF path placeholders or relative entrypoints, and the fingerprint that
 * changes when a component's definition or any of its files does.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listTreeFiles, type TreeFile } from "../hash/tree.js";
import { acfCapabilityDirPlaceholder } from "../types/index.js";

const PLACEHOLDER_PATH = /\$\{(ACF_CAPABILITY_DIR|ACF_PACKAGE_DIR|ACF_HOOK_DIR)\}(\/[^\s"'=:,;]+)/g;

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
  return relative.startsWith("..") ? "\u0000outside" : relative === "." ? "" : relative;
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
