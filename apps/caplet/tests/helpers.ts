import { expect } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type TestScope = {
  dir: string;
  home: string;
  cwd: string;
  agentsDir: string;
  sourceRoot: string;
  bin: string;
};

export type RunResult = { exitCode: number; stdout: string; stderr: string };

export async function makeScope(): Promise<TestScope> {
  const dir = await mkdtemp(path.join(tmpdir(), "caplet-test-"));
  const home = path.join(dir, "home");
  const cwd = path.join(dir, "project");
  const agentsDir = path.join(cwd, ".agents");
  const sourceRoot = path.join(dir, "sources");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(path.join(home, ".agents"), { recursive: true });
  await writeCapability(
    path.join(sourceRoot, "alpha"),
    "alpha-cap",
    "Alpha guidance",
    "alpha-server",
  );
  await writeCapability(path.join(sourceRoot, "beta"), "beta-cap", "Beta guidance", "beta-server");
  await writeFile(
    path.join(agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${path.join(sourceRoot, "alpha")}\n  - source: path:${path.join(sourceRoot, "beta")}\n`,
    "utf8",
  );
  return { dir, home, cwd, agentsDir, sourceRoot, bin: path.resolve("src/bin.ts") };
}

export async function cleanup(scope: TestScope): Promise<void> {
  await rm(scope.dir, { recursive: true, force: true });
}

export async function runCaplet(scope: TestScope, args: string[]): Promise<RunResult> {
  const proc = Bun.spawn(["bun", scope.bin, ...args], {
    cwd: path.resolve("../.."),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: scope.home, USERPROFILE: scope.home },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export async function fetchProject(scope: TestScope): Promise<void> {
  const result = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
  expect(result.exitCode).toBe(0);
}

export async function applyProject(scope: TestScope): Promise<RunResult> {
  return await runCaplet(scope, [
    "apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
  ]);
}

/**
 * Opts Claude into the shared `.agents/skills` root, which a Claude-only selection does not
 * write by default, for tests about shared-root bookkeeping.
 */
export async function forceCanonicalSkills(scope: TestScope): Promise<void> {
  await writeText(
    path.join(scope.agentsDir, "caplet.yml"),
    "targets:\n  claude:\n    skills:\n      canonical: true\n",
  );
}

export async function readText(filePath: string): Promise<string> {
  return await readFile(filePath, "utf8");
}

export async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

async function writeCapability(
  root: string,
  name: string,
  instruction: string,
  serverName: string,
): Promise<void> {
  await mkdir(path.join(root, "instructions"), { recursive: true });
  await mkdir(path.join(root, "mcp"), { recursive: true });
  await mkdir(path.join(root, "agents"), { recursive: true });
  await writeFile(
    path.join(root, "acf.yml"),
    `acf: 1\nname: ${name}\nversion: 1.0.0\ndescription: ${name}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "instructions", "always.md"),
    `---\nname: always\ndescription: Always ${name}\nactivation: always\n---\n${instruction}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "mcp", "mcp.yml"),
    `servers:\n  - name: ${serverName}\n    transport: stdio\n    command: node\n    args: [server.js]\n`,
    "utf8",
  );
  const helperName = `${name.replaceAll("-cap", "")}-helper`;
  await writeFile(
    path.join(root, "agents", `${helperName}.md`),
    `---\nname: ${helperName}\ndescription: Helper ${name}\n---\nHelp for ${name}.\n`,
    "utf8",
  );
}
