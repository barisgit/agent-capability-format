import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCapabilities } from "../src";
import { cleanup, errors, tempDir, testScopeRoot, writeText } from "./helpers";

function git(repo: string, args: string[]): void {
  const proc = Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd: repo,
  });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
}

test("a frozen forced resolution keeps the locked commit after the branch moved", async () => {
  const dir = await tempDir("acf-frozen-force-");
  try {
    const repo = path.join(dir, "repo");
    const notes = (text: string) => writeText(path.join(repo, "notes.md"), text);
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: git-cap\nversion: 1.0.0\n");
    await notes("locked\n");
    git(repo, ["init", "-q", "-b", "main"]);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "locked"]);
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: git:file://${repo}\n    ref: main\n`,
    );
    expect(errors(await resolveCapabilities({ scopeRoot, mode: "auto" }))).toEqual([]);
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    await notes("moved\n");
    git(repo, ["commit", "-q", "-am", "moved"]);

    const result = await resolveCapabilities({ scopeRoot, mode: "force", frozen: true });

    expect(errors(result)).toEqual([]);
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect(
      await readFile(path.join(scopeRoot.capabilitiesDir, "git-cap", "notes.md"), "utf8"),
    ).toBe("locked\n");
  } finally {
    await cleanup(dir);
  }
});

test("a frozen resolution fails when capabilities.yml no longer declares a locked source", async () => {
  const dir = await tempDir("acf-frozen-removed-");
  try {
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    const sources = ["kept", "removed"].map((name) => path.join(dir, name));
    for (const source of sources) {
      await writeText(
        path.join(source, "acf.yml"),
        `acf: 1\nname: ${path.basename(source)}\nversion: 1.0.0\n`,
      );
    }
    const declare = (declared: string[]) =>
      writeText(
        scopeRoot.manifestPath,
        `acf: 1\ncapabilities:\n${declared.map((source) => `  - source: path:${source}\n`).join("")}`,
      );
    await declare(sources);
    expect(errors(await resolveCapabilities({ scopeRoot, mode: "auto" }))).toEqual([]);
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    await declare(sources.slice(0, 1));

    const result = await resolveCapabilities({ scopeRoot, mode: "auto", frozen: true });

    expect(errors(result).map((item) => [item.code, item.data?.sourceId])).toEqual([
      ["acf.lock.drift", `path:${sources[1]}`],
    ]);
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect(
      await Bun.file(path.join(scopeRoot.capabilitiesDir, "removed", "acf.yml")).exists(),
    ).toBe(true);
  } finally {
    await cleanup(dir);
  }
});
