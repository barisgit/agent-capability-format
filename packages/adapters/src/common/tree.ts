import path from "node:path";
import type { ReadOnlyFs } from "@caplet/core";

/** One regular file of a walked tree. */
export type TreeFile = {
  /** POSIX path relative to the walked root. */
  path: string;
  bytes: Uint8Array;
  mode: number;
};

/**
 * Every regular file under `root`, sorted by relative path. `skip` prunes a file or a whole
 * directory by its relative POSIX path. Relies on the `ReadOnlyFs` contract that reading a
 * directory yields null and listing a file yields [].
 */
export async function listTree(
  fs: ReadOnlyFs,
  root: string,
  options: {
    skip?: (relativePath: string) => boolean;
  } = {},
): Promise<TreeFile[]> {
  const files: TreeFile[] = [];
  const walk = async (relativeDir: string): Promise<void> => {
    const entries = await fs.listDir(path.join(root, ...splitPosix(relativeDir)));
    for (const name of [...entries].sort()) {
      const relativePath = relativeDir === "" ? name : `${relativeDir}/${name}`;
      if (options.skip?.(relativePath) === true) continue;
      const absolute = path.join(root, ...splitPosix(relativePath));
      const bytes = await fs.readBytes(absolute);
      if (bytes !== null) {
        files.push({ path: relativePath, bytes, mode: (await fs.readMode(absolute)) ?? 0o644 });
        continue;
      }
      await walk(relativePath);
    }
  };
  await walk("");
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function splitPosix(relativePath: string): string[] {
  return relativePath === "" ? [] : relativePath.split("/");
}
