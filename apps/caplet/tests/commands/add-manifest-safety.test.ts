import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cleanup,
  fetchProject,
  makeScope,
  readText,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers";

const scopes: TestScope[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  delete process.env.CAPLET_TEST_GIT_LOG;
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

async function writeMinimalCapability(root: string, name: string): Promise<void> {
  await writeText(
    path.join(root, "acf.yml"),
    `acf: 1\nname: ${name}\nversion: 1.0.0\ndescription: ${name}\n`,
  );
  await writeText(
    path.join(root, "instructions", "always.md"),
    `---\nname: always\ndescription: Always ${name}\nactivation: always\n---\n${name} guidance\n`,
  );
}

for (const [label, invalid] of [
  ["YAML parse error", "acf: 1\ncapabilities: [\n"],
  ["schema error", "acf: 1\ncapabilities:\n  - source: path:../sources/alpha\n    sourc: typo\n"],
] as const) {
  test(`add refuses to rewrite an invalid capabilities.yml (${label})`, async () => {
    const scope = await setup();
    await fetchProject(scope);
    const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
    const lockPath = path.join(scope.agentsDir, "capabilities.lock");
    const installed = path.join(scope.agentsDir, "capabilities", "alpha-cap");
    const lockBefore = await readFile(lockPath);
    await writeFile(manifestPath, invalid, "utf8");
    const gamma = path.join(scope.sourceRoot, "gamma");
    await writeMinimalCapability(gamma, "gamma-cap");

    const result = await runCaplet(scope, [
      "add",
      `path:${gamma}`,
      "--yes",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.stderr).toContain("Refusing to modify invalid");
    expect(await readText(manifestPath)).toBe(invalid);
    expect(await readFile(lockPath)).toEqual(lockBefore);
    expect((await stat(installed)).isDirectory()).toBe(true);
    expect(
      await Bun.file(path.join(scope.agentsDir, "capabilities", "gamma-cap", "acf.yml")).exists(),
    ).toBe(false);
  });
}

test("remove refuses to rewrite an invalid capabilities.yml", async () => {
  const scope = await setup();
  await fetchProject(scope);
  const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
  const lockPath = path.join(scope.agentsDir, "capabilities.lock");
  const lockBefore = await readFile(lockPath);
  const invalid = "acf: 1\ncapabilities: [\n";
  await writeFile(manifestPath, invalid, "utf8");

  const result = await runCaplet(scope, [
    "remove",
    "alpha-cap",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);

  expect(result.exitCode).toBe(2);
  expect(result.stdout + result.stderr).toContain("Refusing to modify invalid");
  expect(await readText(manifestPath)).toBe(invalid);
  expect(await readFile(lockPath)).toEqual(lockBefore);
  expect((await stat(path.join(scope.agentsDir, "capabilities", "alpha-cap"))).isDirectory()).toBe(
    true,
  );
});

test("add and remove keep relative path sources relative to the manifest directory", async () => {
  const scope = await setup();
  const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
  // Manifest dir is <dir>/project/.agents, so ../../sources/alpha is <dir>/sources/alpha.
  await writeText(manifestPath, "acf: 1\ncapabilities:\n  - source: path:../../sources/alpha\n");

  const added = await runCaplet(scope, [
    "add",
    `path:${path.join(scope.sourceRoot, "beta")}`,
    "--yes",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);
  expect(added.exitCode).toBe(0);
  expect(await readText(manifestPath)).toContain("source: path:../../sources/alpha\n");
  expect(
    await Bun.file(path.join(scope.agentsDir, "capabilities", "alpha-cap", "acf.yml")).exists(),
  ).toBe(true);

  const removed = await runCaplet(scope, [
    "remove",
    "beta-cap",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);
  expect(removed.exitCode).toBe(0);
  const manifest = await readText(manifestPath);
  expect(manifest).toContain("source: path:../../sources/alpha\n");
  expect(manifest).not.toContain("beta");
});

test("add resolves a new relative CLI path against --cwd", async () => {
  const scope = await setup();
  const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
  await writeText(manifestPath, "acf: 1\ncapabilities: []\n");
  const gamma = path.join(scope.sourceRoot, "gamma");
  await writeMinimalCapability(gamma, "gamma-cap");

  const result = await runCaplet(scope, [
    "add",
    "../sources/gamma",
    "--yes",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);

  expect(result.exitCode).toBe(0);
  expect(await readText(manifestPath)).toContain(`source: path:${gamma}\n`);
  expect(
    await Bun.file(path.join(scope.agentsDir, "capabilities", "gamma-cap", "acf.yml")).exists(),
  ).toBe(true);
});

test("add preserves top-level fetch defaults when rewriting the manifest", async () => {
  const scope = await setup();
  const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
  await writeText(
    manifestPath,
    "acf: 1\ndefaults:\n  fetch:\n    shallow: false\n    blobless: false\ncapabilities: []\n",
  );
  const result = await runCaplet(scope, [
    "add",
    `path:${path.join(scope.sourceRoot, "alpha")}`,
    "--yes",
    "--no-apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);
  expect(result.exitCode).toBe(0);
  const manifest = Bun.YAML.parse(await readText(manifestPath)) as {
    defaults?: unknown;
    capabilities: unknown[];
  };
  expect(manifest.defaults).toEqual({ fetch: { shallow: false, blobless: false } });
  expect(manifest.capabilities).toHaveLength(1);
});

async function gitFixture(scope: TestScope): Promise<{ url: string; log: string }> {
  const repo = path.join(scope.dir, "repo");
  await writeMinimalCapability(repo, "git-cap");
  const git = (args: string[]) => {
    const proc = Bun.spawnSync(["git", ...args], { cwd: repo });
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  };
  git(["init", "-q", "-b", "main"]);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "add", "."]);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"]);

  // Wrap git so the test can observe which clone flags the add inspection uses.
  const realGit = Bun.which("git");
  if (realGit === null) throw new Error("git not found");
  const binDir = path.join(scope.dir, "bin");
  const log = path.join(scope.dir, "git.log");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    path.join(binDir, "git"),
    `#!/bin/sh\necho "$@" >> "$CAPLET_TEST_GIT_LOG"\nexec "${realGit}" "$@"\n`,
    "utf8",
  );
  await chmod(path.join(binDir, "git"), 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
  process.env.CAPLET_TEST_GIT_LOG = log;
  return { url: `git:file://${repo}`, log };
}

async function addGitAndReadClones(scope: TestScope, defaults: string): Promise<string[]> {
  const { url, log } = await gitFixture(scope);
  await writeText(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\n${defaults}capabilities: []\n`,
  );
  const result = await runCaplet(scope, [
    "add",
    url,
    "--ref",
    "main",
    "--yes",
    "--no-apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);
  expect(result.exitCode).toBe(0);
  return (await readText(log)).split("\n").filter((line) => line.startsWith("clone "));
}

test("add inspection uses installer fetch defaults when none are configured", async () => {
  const scope = await setup();
  const clones = await addGitAndReadClones(scope, "");
  expect(clones).toHaveLength(1);
  expect(clones[0]).toContain("--depth 1");
  expect(clones[0]).toContain("--filter=blob:none");
});

test("add inspection honors configured shallow and blobless defaults", async () => {
  const scope = await setup();
  const clones = await addGitAndReadClones(
    scope,
    "defaults:\n  fetch:\n    shallow: false\n    blobless: false\n",
  );
  expect(clones).toHaveLength(1);
  expect(clones[0]).not.toContain("--depth");
  expect(clones[0]).not.toContain("--filter");
});
