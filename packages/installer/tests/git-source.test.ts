import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fetchCapability } from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

const execFileAsync = promisify(execFile);
const maybeTest = process.env.ACF_E2E_GIT === undefined ? test.skip : test;

maybeTest("git source clones a fixed sha", async () => {
  const dir = await tempDir("acf-installer-git-");
  try {
    const repo = path.join(dir, "repo");
    await mkdir(repo, { recursive: true });
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: git-cap\nversion: 1.0.0\n");
    await runGit(["init"], repo);
    await runGit(["add", "."], repo);
    await runGit(["commit", "-m", "fixture"], repo);
    const sha = (await runGit(["rev-parse", "HEAD"], repo)).trim();

    const fetched = await fetchCapability(
      { source: { kind: "git", url: repo }, ref: sha },
      { cacheDir: path.join(dir, "cache") },
    );
    expect(fetched.commit).toBe(sha);
    expect(fetched.root).toContain(path.join(dir, "cache"));
  } finally {
    await cleanup(dir);
  }
});

async function runGit(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: "installer-test@example.com",
      GIT_AUTHOR_NAME: "Installer Test",
      GIT_COMMITTER_EMAIL: "installer-test@example.com",
      GIT_COMMITTER_NAME: "Installer Test",
    },
  });
  return String(result.stdout);
}
