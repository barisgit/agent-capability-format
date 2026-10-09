import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

/**
 * Where one target may write for one scope: whole directory trees (`roots`) and single files
 * the target declares outside them (`files`, e.g. Claude's project `.mcp.json`).
 */
export type OutputBoundary = { roots: readonly string[]; files: readonly string[] };

/**
 * Returns why writing or deleting `filePath` would leave `boundary`, or `null` when it stays
 * inside. The path is followed through every existing symbolic link, the file itself included,
 * because writing and changing the mode of a link follow it: a parent or file link that points
 * outside its root is a violation, and so is a dangling one, which a write would create wherever
 * it points. The root itself may be a link (a dotfiles checkout, for example) and is compared by
 * its resolved location; a declared file (`boundary.files`) must resolve to its own location.
 */
export async function containmentViolation(
  filePath: string,
  boundary: OutputBoundary,
): Promise<string | null> {
  const absolute = path.resolve(filePath);
  const resolved = await resolveExistingPrefix(absolute);
  if (resolved === null) return `${filePath} has a dangling symbolic link in its path`;
  for (const file of boundary.files) {
    if (path.resolve(file) !== absolute) continue;
    const location = await resolveExistingPrefix(path.dirname(absolute));
    if (location !== null && path.join(location, path.basename(absolute)) === resolved) return null;
  }
  for (const root of boundary.roots) {
    const resolvedRoot = await resolveExistingPrefix(path.resolve(root));
    if (resolvedRoot !== null && isStrictlyInside(resolved, resolvedRoot)) return null;
  }
  return resolved === absolute
    ? `${filePath} is outside the output root`
    : `${filePath} resolves outside the output root (to ${resolved})`;
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

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
