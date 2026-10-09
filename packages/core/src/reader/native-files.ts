/**
 * Reads a native ACF capability's `native/<target>/` file extras (capability-model-layers,
 * File-level native extras). Each target directory holds regular files that a plugin-carrier
 * writer copies byte- and mode-exact into the generated package, so links, special files and
 * names a host could read as a different path are rejected here, before anything is emitted.
 * Files under `native/` are never read as ACF facets.
 */
import type { Dirent } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { AGENT_PLUGINS_DIALECT, NATIVE_FILES_DIR } from "../extras/index.js";
import { isTargetId } from "../targets/index.js";
import type { Diagnostic, NativeFileExtra } from "../types/index.js";

/**
 * Files under `<root>/native/<target>/`, by target and then depth-first in entry-name order;
 * pushes errors for the rest.
 */
export async function readNativeFiles(
  root: string,
  diagnostics: Diagnostic[],
): Promise<NativeFileExtra[]> {
  const dir = path.join(root, NATIVE_FILES_DIR);
  const info = await lstat(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (info === undefined) return [];
  // Checked without following links: a linked native/ could copy files from outside the root.
  if (!info.isDirectory()) {
    diagnostics.push(unsupported(dir, `${NATIVE_FILES_DIR}/ must be a directory`));
    return [];
  }
  const files: NativeFileExtra[] = [];
  for (const entry of await sortedEntries(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      diagnostics.push(unsupported(full, "a link cannot be copied into a package"));
    } else if (!entry.isDirectory() || !isTargetId(entry.name)) {
      diagnostics.push(unknownTarget(entry, full));
    } else {
      await collect(entry.name, full, "", files, diagnostics);
    }
  }
  return files;
}

async function collect(
  target: string,
  dir: string,
  prefix: string,
  files: NativeFileExtra[],
  diagnostics: Diagnostic[],
): Promise<void> {
  for (const entry of await sortedEntries(dir)) {
    const full = path.join(dir, entry.name);
    const rel = `${prefix}${entry.name}`;
    if (entry.name.includes("\\")) {
      diagnostics.push(unsupported(full, "a backslash in a name is a path separator on Windows"));
    } else if (entry.isDirectory()) {
      await collect(target, full, `${rel}/`, files, diagnostics);
    } else if (entry.isFile()) {
      const executable = ((await stat(full)).mode & 0o111) !== 0;
      files.push({ target, path: rel, executable });
    } else {
      const kind = entry.isSymbolicLink() ? "a link" : "a special file";
      diagnostics.push(unsupported(full, `${kind} cannot be copied into a package`));
    }
  }
}

async function sortedEntries(dir: string): Promise<Dirent[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function unknownTarget(entry: Dirent, full: string): Diagnostic {
  const message =
    entry.name === AGENT_PLUGINS_DIALECT
      ? `${NATIVE_FILES_DIR}/${entry.name} is a dialect only format readers write; use a target id`
      : `${NATIVE_FILES_DIR}/${entry.name} must be a directory named after a target id`;
  return { severity: "error", code: "acf.native.unknown-target", message, path: full };
}

function unsupported(full: string, reason: string): Diagnostic {
  return {
    severity: "error",
    code: "acf.native.unsupported-entry",
    message: `${full} is not a regular file: ${reason}`,
    path: full,
  };
}
