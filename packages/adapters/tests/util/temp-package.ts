import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Writes `files` (POSIX paths relative to the package root) into a fresh temporary directory,
 * runs `body` on that directory, and removes it afterwards, whether `body` passes or throws.
 */
export async function withTempPackage<T>(
  prefix: string,
  files: Record<string, string>,
  body: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    for (const [relative, text] of Object.entries(files)) {
      const file = path.join(root, ...relative.split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
    }
    return await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
