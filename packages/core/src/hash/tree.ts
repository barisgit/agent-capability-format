import { lstat } from "node:fs/promises";
import path from "node:path";
import { listRegularFilesRecursive } from "../utils/fs.js";

/** One regular file of a capability tree, as both content hashes see it. */
export type TreeFile = {
  absPath: string;
  /** Path relative to the tree root with `/` separators, NFC-normalized. */
  rel: string;
  executable: boolean;
};

/**
 * Whether a file mode counts as executable: the owner execute bit (`0o100`), as git records it
 * and the payload digest frames it (SPEC.md §19.6). Every executable classification in core
 * uses this, so a file is executable to the reader, the digest and the change report alike.
 */
export function isExecutableMode(mode: number): boolean {
  return (mode & 0o100) !== 0;
}

/**
 * Lists every regular file under `root` sorted by the bytes of its NFC relative path.
 * Symlinks and special files are rejected (SPEC.md §19.5 step 1); duplicates after NFC
 * normalization are kept, so callers decide whether a collision is an error.
 */
export async function listTreeFiles(root: string): Promise<TreeFile[]> {
  const absRoot = path.resolve(root);
  const files = await listRegularFilesRecursive(absRoot, {
    rejectSymlinks: true,
    rejectSpecial: true,
  });
  const entries = await Promise.all(
    files.map(async (absPath) => ({
      absPath,
      rel: path.relative(absRoot, absPath).split(path.sep).join("/").normalize("NFC"),
      executable: isExecutableMode((await lstat(absPath)).mode),
    })),
  );
  return entries.sort((a, b) =>
    Buffer.compare(Buffer.from(a.rel, "utf8"), Buffer.from(b.rel, "utf8")),
  );
}
