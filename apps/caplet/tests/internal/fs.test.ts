import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { diskReadOnlyFs } from "../../src/internal/fs";

test("reading a directory yields null and listing a file yields no entries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "caplet-fs-"));
  try {
    const file = path.join(root, "file.txt");
    await writeFile(file, "x");
    const fs = diskReadOnlyFs();
    expect(await fs.readText(root)).toBeNull();
    expect(await fs.readBytes(root)).toBeNull();
    expect(await fs.listDir(file)).toEqual([]);
    expect(await fs.listDir(root)).toEqual(["file.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
