import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

/**
 * Where one target may write for one scope: whole directory trees (`roots`) and single files
 * the target declares outside them (`files`, e.g. Claude's project `.mcp.json`).
 */
export type OutputBoundary = { roots: readonly string[]; files: readonly string[] };

/**
 * Returns why writing or deleting `filePath` would leave `boundary`, or `null` when it stays
 * inside. Existing parent directories are followed through symbolic links before the check, so
 * a parent link that points outside its root is a violation; the root itself may be a link
 * (a dotfiles checkout, for example) and is compared by its resolved location. The final path
 * component is not followed: replacing or removing a file never needs its target.
 */
export async function containmentViolation(
  filePath: string,
  boundary: OutputBoundary,
): Promise<string | null> {
  const absolute = path.resolve(filePath);
  if (boundary.files.some((file) => path.resolve(file) === absolute)) return null;
  const resolvedParent = await resolveExistingPrefix(path.dirname(absolute));
  if (resolvedParent === null) return `${filePath} has a dangling symbolic link in its parents`;
  const resolved = path.join(resolvedParent, path.basename(absolute));
  for (const root of boundary.roots) {
    const resolvedRoot = await resolveExistingPrefix(path.resolve(root));
    if (resolvedRoot !== null && isStrictlyInside(resolved, resolvedRoot)) return null;
  }
  return resolved === absolute
    ? `${filePath} is outside the output root`
    : `${filePath} resolves outside the output root (to ${resolved})`;
}

/**
 * Resolves the longest existing prefix of `directory` through symbolic links and appends the
 * missing remainder. Returns `null` when a component exists only as a dangling link, because
 * creating directories below it would write wherever the link later points.
 */
async function resolveExistingPrefix(directory: string): Promise<string | null> {
  const missing: string[] = [];
  let current = directory;
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

function isStrictlyInside(candidate: string, root: string): boolean {
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
