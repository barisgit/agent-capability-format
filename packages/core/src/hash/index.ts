import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listRegularFilesRecursive } from "../utils/fs";

export async function computeContentHash(root: string): Promise<string> {
  const absRoot = path.resolve(root);
  const files = await listRegularFilesRecursive(absRoot, {
    rejectSymlinks: true,
    rejectSpecial: true,
  });
  const entries = files.map((absPath) => ({
    absPath,
    rel: path.relative(absRoot, absPath).split(path.sep).join("/").normalize("NFC"),
  }));
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.rel, "utf8"), Buffer.from(b.rel, "utf8")));

  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(Buffer.from(entry.rel, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(await readFile(entry.absPath));
    hash.update(Buffer.from([0]));
  }
  return `sha256-${hash.digest("hex")}`;
}
