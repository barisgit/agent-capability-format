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
