import { readdir } from "node:fs/promises";
import path from "node:path";
import { isErrno } from "./guards.js";

/**
 * The collection anchor shared by format detection, discovery and selectors. A child `acf/`
 * takes precedence; otherwise the source itself is a collection only if it contains manifests.
 * An absent collection returns the conventional child path, not the source's basename.
 */
export async function collectionRoot(sourceRoot: string): Promise<string> {
  const root = path.resolve(sourceRoot);
  const child = path.join(root, "acf");
  const entries = await directoryEntries(root);
  if (entries.some((entry) => entry.name === "acf" && entry.isDirectory())) return child;
  return (await containsManifest(root)) ? root : child;
}

async function directoryEntries(root: string) {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) return [];
    throw error;
  }
}

async function containsManifest(root: string): Promise<boolean> {
  const entries = await directoryEntries(root);
  if (entries.some((entry) => entry.isFile() && ["acf.yml", "acf.yaml"].includes(entry.name)))
    return true;
  for (const entry of entries) {
    if (
      !entry.name.startsWith(".") &&
      entry.isDirectory() &&
      (await containsManifest(path.join(root, entry.name)))
    )
      return true;
  }
  return false;
}

/**
 * Whether `relative`, a `path.relative` result or a normalized relative path, points outside its
 * base: it is absolute, `..`, or its first segment is `..`. A name that only begins with two dots,
 * such as `..skills`, stays inside.
 */
export function leavesBase(relative: string): boolean {
  return path.isAbsolute(relative) || relative.split(/[/\\]/, 1)[0] === "..";
}
