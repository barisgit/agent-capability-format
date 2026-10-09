import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { type AcfOwnership, isErrno } from "@caplet/core";

/**
 * Where one target may write for one scope: whole directory trees (`roots`) and single files
 * the target declares outside them (`files`, e.g. Claude's project `.mcp.json`).
 */
export type OutputBoundary = { roots: readonly string[]; files: readonly string[] };

/**
 * How caplet owns a file: `file` when it owns the whole file (generated skill and plugin files,
 * `ACF-MANAGED.md`, the sidecar), `regions` when it only merges owned regions into a host file
 * the user owns (`settings.json`, `CLAUDE.md`, `.mcp.json`, `config.toml`, ...).
 */
export type FileOwnership = "file" | "regions";

/** The ownership of a file caplet owns through `owns`; only owned regions make it `regions`. */
export function fileOwnership(owns: readonly AcfOwnership[]): FileOwnership {
  return owns.length > 0 && owns.every((own) => own.kind !== "file") ? "regions" : "file";
}

/**
 * Returns why writing or deleting `filePath` would leave `boundary`, or `null` when it stays
 * inside. Existing parent directories are followed through symbolic links, because writing below
 * a link follows it: a parent that leads outside its root is a violation. The root itself may be
 * a link (a dotfiles checkout, for example) and is compared by its resolved location.
 *
 * A link at the file itself is followed for a whole file, so it must resolve inside the root (a
 * declared file, `boundary.files`, to its own location). For a region-merged file the link is the
 * user's own setup, such as `settings.json` linked into a dotfiles checkout, and caplet writes
 * through it wherever it points. A dangling link anywhere in the path is a violation either way,
 * since a write would create a file wherever it points.
 */
export async function containmentViolation(
  filePath: string,
  boundary: OutputBoundary,
  ownership: FileOwnership,
): Promise<string | null> {
  const absolute = path.resolve(filePath);
  const resolved = await resolveExistingPrefix(absolute);
  const parent = await resolveExistingPrefix(path.dirname(absolute));
  if (resolved === null || parent === null) {
    return `${filePath} has a dangling symbolic link in its path`;
  }
  // The file's own location: its parents followed, the file itself not.
  const location = path.join(parent, path.basename(absolute));
  const checked = ownership === "regions" ? location : resolved;
  if (boundary.files.some((file) => path.resolve(file) === absolute) && checked === location) {
    return null;
  }
  for (const root of boundary.roots) {
    const resolvedRoot = await resolveExistingPrefix(path.resolve(root));
    if (resolvedRoot !== null && isStrictlyInside(checked, resolvedRoot)) return null;
  }
  return checked === absolute
    ? `${filePath} is outside the output root`
    : `${filePath} resolves outside the output root (to ${checked})`;
}

/**
 * Resolves the longest existing prefix of `entry` through symbolic links and appends the missing
 * remainder. Returns `null` when a component exists only as a dangling link, because creating
 * it, or directories below it, would write wherever the link later points.
 */
async function resolveExistingPrefix(entry: string): Promise<string | null> {
  const missing: string[] = [];
  let current = entry;
  for (;;) {
    try {
      return path.join(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (!isErrno(error, "ENOENT") && !isErrno(error, "ENOTDIR")) throw error;
    }
    if (await isSymlink(current)) return null;
    const parent = path.dirname(current);
    if (parent === current) return path.join(current, ...missing.reverse());
    missing.push(path.basename(current));
    current = parent;
  }
}

async function isSymlink(entry: string): Promise<boolean> {
  try {
    return (await lstat(entry)).isSymbolicLink();
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) return false;
    throw error;
  }
}

/** Whether `candidate` is `root` or lies below it. */
export function isInsideOrEqual(candidate: string, root: string): boolean {
  return path.relative(root, candidate) === "" || isStrictlyInside(candidate, root);
}

/** Whether `candidate` lies below `root`; `root` itself does not count. */
export function isStrictlyInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
