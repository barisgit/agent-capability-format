import { expect, test } from "bun:test";
import { chmod, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveCapabilities, writeLockfile } from "../src";
import { cleanup, tempDir, testScopeRoot, writeText } from "./helpers";

test("lock writes replace the file atomically instead of truncating it", async () => {
  const dir = await tempDir();
  try {
    const file = path.join(dir, "capabilities.lock");
    await writeLockfile(file, { acf: 1, entries: [] });
    const inode = (await stat(file)).ino;
    await writeLockfile(file, { acf: 1, entries: [] });
    expect((await stat(file)).ino).not.toBe(inode);
    expect(await readdir(dir)).toEqual(["capabilities.lock"]);
  } finally {
    await cleanup(dir);
  }
});

test("a failed lock write rolls back replaced, removed and newly installed snapshots", async () => {
  const dir = await tempDir();
  const lockDir = path.join(dir, "locks");
  try {
    const root = {
      ...testScopeRoot("project", path.join(dir, ".agents")),
      lockPath: path.join(lockDir, "capabilities.lock"),
    };
    const sources = ["one", "two", "three"].map((name) => path.join(dir, name));
    for (const [index, source] of sources.entries()) {
      await writeText(path.join(source, "acf.yml"), `acf: 1\nname: cap-${index}\nversion: 1.0.0\n`);
      await writeText(path.join(source, "marker.txt"), "old");
    }
    const manifest = (selected: string[]) =>
      `acf: 1\ncapabilities:\n${selected.map((source) => `  - source: path:${source}\n`).join("")}`;
    await writeText(root.manifestPath, manifest(sources.slice(0, 2)));
    await resolveCapabilities({ scopeRoot: root, mode: "force" });
    const before = await readFile(root.lockPath, "utf8");
    await writeText(path.join(sources[0] ?? "", "marker.txt"), "new");
    await writeText(root.manifestPath, manifest(sources.filter((_, index) => index !== 1)));
    await mkdir(lockDir, { recursive: true });
    await chmod(root.lockPath, 0o444);
    await chmod(lockDir, 0o555);
    await expect(resolveCapabilities({ scopeRoot: root, mode: "force" })).rejects.toThrow();
    expect(await readFile(root.lockPath, "utf8")).toBe(before);
    expect(await readFile(path.join(root.capabilitiesDir, "cap-0", "marker.txt"), "utf8")).toBe(
      "old",
    );
    expect(await readFile(path.join(root.capabilitiesDir, "cap-1", "marker.txt"), "utf8")).toBe(
      "old",
    );
    expect((await readdir(root.capabilitiesDir)).sort()).toEqual(["cap-0", "cap-1"]);
  } finally {
    await chmod(lockDir, 0o755).catch(() => {});
    await cleanup(dir);
  }
});
