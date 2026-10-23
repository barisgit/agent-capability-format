import { afterEach, expect, test } from "bun:test";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  applyProject,
  cleanup,
  fetchProject,
  makeScope,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers";

const scopes: TestScope[] = [];

afterEach(async () => {
  while (scopes.length > 0) {
    const scope = scopes.pop();
    if (scope !== undefined) await cleanup(scope);
  }
});

async function setup(): Promise<TestScope> {
  const scope = await makeScope();
  scopes.push(scope);
  return scope;
}

test("apply refuses a snapshot modified after locking and writes nothing", async () => {
  const scope = await setup();
  await fetchProject(scope);
  await writeText(
    path.join(scope.agentsDir, "capabilities", "alpha-cap", "instructions", "always.md"),
    "---\nname: always\ndescription: Always\nactivation: always\n---\nInjected guidance\n",
  );

  const result = await applyProject(scope);

  expect(result.exitCode).not.toBe(0);
  const output = result.stdout + result.stderr;
  expect(output).toContain("acf.lock.digest-mismatch");
  expect(output).toContain("alpha-cap");
  expect(await readdir(scope.cwd)).toEqual([".agents"]);

  const status = await runCaplet(scope, ["status", "--cwd", scope.cwd, "--scope", "project"]);
  expect(status.stdout + status.stderr).toContain("acf.lock.digest-mismatch");
  // Only the verified capability counts as installed.
  expect(status.stdout).toMatch(/capabilities\s+beta-cap\n/);
});

test("a frozen apply restores a missing snapshot at the locked commit after the branch moved", async () => {
  const scope = await setup();
  const repo = path.join(scope.dir, "repo");
  const git = (args: string[]) => {
    const proc = Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...args], {
      cwd: repo,
    });
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  };
  const instruction = path.join("instructions", "always.md");
  const writeInstruction = (text: string) =>
    writeText(
      path.join(repo, instruction),
      `---\nname: always\ndescription: Always\nactivation: always\n---\n${text}\n`,
    );
  await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: git-cap\nversion: 1.0.0\n");
  await writeInstruction("Locked guidance");
  git(["init", "-q", "-b", "main"]);
  git(["add", "."]);
  git(["commit", "-q", "-m", "locked"]);
  await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
  const added = await runCaplet(scope, [
    "add",
    `git:file://${repo}`,
    "--pin",
    "main",
    "--yes",
    "--no-apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);
  expect(added.exitCode).toBe(0);
  await fetchProject(scope);
  const lockPath = path.join(scope.agentsDir, "capabilities.lock");
  const lockBefore = await readFile(lockPath, "utf8");

  await writeInstruction("Moved guidance");
  git(["commit", "-q", "-am", "moved"]);
  const snapshot = path.join(scope.agentsDir, "capabilities", "git-cap");
  await rm(snapshot, { recursive: true });
  await rm(path.join(scope.agentsDir, ".cache"), { recursive: true, force: true });

  const result = await runCaplet(scope, [
    "apply",
    "--frozen",
    "--yes",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
  ]);

  expect(result.stdout + result.stderr).not.toContain("error");
  expect(result.exitCode).toBe(0);
  expect(await readFile(path.join(snapshot, instruction), "utf8")).toContain("Locked guidance");
  expect(await readFile(lockPath, "utf8")).toBe(lockBefore);
});
