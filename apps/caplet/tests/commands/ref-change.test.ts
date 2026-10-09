import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, runCaplet, type TestScope, writeText } from "../helpers";

/**
 * A git source with tags `v1` and `v2` whose instruction text differs, listed in the
 * project's capabilities.yml at `v1` and applied once.
 */
async function installedAtV1(): Promise<{
  scope: TestScope;
  setRef: (ref: string) => Promise<void>;
  lockPath: string;
  snapshotText: () => Promise<string>;
}> {
  const scope = await makeScope();
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
  await writeInstruction("First guidance");
  git(["init", "-q", "-b", "main"]);
  git(["add", "."]);
  git(["commit", "-q", "-m", "first"]);
  git(["tag", "v1"]);
  await writeInstruction("Second guidance");
  git(["commit", "-q", "-am", "second"]);
  git(["tag", "v2"]);
  const setRef = (ref: string) =>
    writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: git:file://${repo}\n    ref: ${ref}\n`,
    );
  await setRef("v1");
  const first = await apply(scope);
  expect(first.stdout + first.stderr).not.toContain("error");
  expect(first.exitCode).toBe(0);
  return {
    scope,
    setRef,
    lockPath: path.join(scope.agentsDir, "capabilities.lock"),
    snapshotText: () =>
      readFile(path.join(scope.agentsDir, "capabilities", "git-cap", instruction), "utf8"),
  };
}

function apply(scope: TestScope, flags: string[] = []) {
  return runCaplet(scope, [
    "apply",
    ...flags,
    "--yes",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
  ]);
}

test("apply refetches an entry whose ref changed and applies it in the same run", async () => {
  const { scope, setRef, lockPath, snapshotText } = await installedAtV1();
  try {
    await setRef("v2");
    const result = await apply(scope);
    expect(result.stdout + result.stderr).not.toContain("acf.lock.drift");
    expect(result.exitCode).toBe(0);
    expect(await snapshotText()).toContain("Second guidance");
    expect(await readFile(lockPath, "utf8")).toContain('"ref": "v2"');
    expect((await apply(scope)).stdout).toContain("Everything up to date");
  } finally {
    await cleanup(scope);
  }
});

test("update refetches an entry whose ref changed in the same run", async () => {
  const { scope, setRef, snapshotText } = await installedAtV1();
  try {
    await setRef("v2");
    const result = await runCaplet(scope, [
      "update",
      "git-cap",
      "--yes",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(result.stdout + result.stderr).not.toContain("acf.lock.drift");
    expect(result.exitCode).toBe(0);
    expect(await snapshotText()).toContain("Second guidance");
  } finally {
    await cleanup(scope);
  }
});

test("offline and frozen applies keep a changed ref as drift and write nothing", async () => {
  const { scope, setRef, lockPath, snapshotText } = await installedAtV1();
  try {
    await setRef("v2");
    const lockBefore = await readFile(lockPath, "utf8");

    const offline = await apply(scope, ["--offline"]);
    expect(offline.stdout + offline.stderr).toContain("acf.lock.drift");
    expect(offline.stderr).toContain("capabilities.yml ref differs from lock");
    expect(offline.exitCode).not.toBe(0);

    const frozen = await apply(scope, ["--frozen"]);
    expect(frozen.stdout + frozen.stderr).toContain("acf.lock.drift");
    expect(frozen.exitCode).toBe(3);

    expect(await readFile(lockPath, "utf8")).toBe(lockBefore);
    expect(await snapshotText()).toContain("First guidance");
  } finally {
    await cleanup(scope);
  }
});
