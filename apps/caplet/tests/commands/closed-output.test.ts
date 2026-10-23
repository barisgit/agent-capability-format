import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, type TestScope, writeText } from "../helpers";

let scope: TestScope;
let bin: string;

beforeAll(async () => {
  scope = await makeScope();
  await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
  await writeText(path.join(scope.dir, "package.json"), await Bun.file("package.json").text());
  // Bundle the source for Node so this contract runs without a prior dist build, including in CI.
  const build = await Bun.build({
    entrypoints: [scope.bin],
    outdir: path.join(scope.dir, "node-cli", "internal"),
    target: "node",
    format: "esm",
    naming: "caplet.mjs",
  });
  expect(build.success).toBe(true);
  bin = path.join(scope.dir, "node-cli", "internal", "caplet.mjs");
});

afterAll(async () => {
  await cleanup(scope);
});

for (const args of [["check"], ["check", "--json"], ["list"], ["status"]]) {
  test(`Node caplet ${args.join(" ")} exits quietly when stdout's reader closes`, async () => {
    const result = await runWithClosedReader(args, "stdout");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
  });
}

test("Node caplet exits quietly when stderr's reader closes", async () => {
  // Usage failures write to stderr and retain their status when its reader closes.
  const result = await runWithClosedReader(["unknown-command"], "stderr");
  expect(result.code).toBe(2);
  expect(result.signal).toBeNull();
});

test("Node add completes the same mutation after stdout closes on the first line", async () => {
  await writeText(
    path.join(scope.sourceRoot, "alpha", "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review changes\n---\nReview.\n",
  );
  const args = [
    "add",
    `path:${path.join(scope.sourceRoot, "alpha")}`,
    "--scope",
    "project",
    "--target",
    "codex",
  ];
  const ordinary = await runWithClosedReader(args);
  expect(ordinary.code).toBe(0);
  const expected = await projectFiles();
  expect(Object.keys(expected)).toContain(".agents/capabilities.lock");
  expect(Object.keys(expected)).toContain(".agents/skills/review/SKILL.md");
  await rm(scope.agentsDir, { recursive: true });
  await rm(path.join(scope.cwd, ".codex"), { recursive: true, force: true });
  await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
  const piped = await runWithClosedReader(args, "stdout", true);
  expect(piped.code).toBe(ordinary.code);
  expect(piped.signal).toBeNull();
  expect(piped.stderr).not.toContain("EPIPE");
  expect(await projectFiles()).toEqual(expected);
});

for (const stream of ["stdout", "stderr"] as const) {
  test(`Node add preserves failure status and rolls back with a closed ${stream} reader`, async () => {
    await rm(scope.agentsDir, { recursive: true, force: true });
    const manifest = "# Keep this formatting on rollback\nacf: 1\ncapabilities: []\n";
    const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
    await writeText(manifestPath, manifest);
    const source = path.join(scope.sourceRoot, "refused");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: refused\nversion: 1.0.0\n");
    // Pi refuses SSE: failure occurs after add has changed the manifest and printed its first line.
    await writeText(
      path.join(source, "mcp", "mcp.yml"),
      "servers:\n  - name: events\n    transport: sse\n    url: https://mcp.example.com/events\n",
    );
    const args = ["add", `path:${source}`, "--scope", "project", "--target", "pi"];
    const ordinary = await runWithClosedReader(args);
    expect(ordinary.code).toBe(2);
    expect(await readText(manifestPath)).toBe(manifest);
    const closed = await runWithClosedReader(args, stream);
    expect(closed.code).toBe(ordinary.code);
    expect(closed.signal).toBeNull();
    expect(closed.stderr).not.toContain("EPIPE");
    expect(await readText(manifestPath)).toBe(manifest);
  });
}

/** Captures all mutation artifacts, normalizing the lockfile's resolution timestamp only. */
async function projectFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(scope.cwd, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(scope.cwd, file);
    const text = await readText(file);
    files[relative] =
      relative === ".agents/capabilities.lock"
        ? text.replace(/("resolvedAt": )"[^"]+"/g, '$1"<timestamp>"')
        : text;
  }
  return files;
}

/** Closes immediately (`head -c 0`) or after the first output line (`head -1`). */
async function runWithClosedReader(
  args: string[],
  stream?: "stdout" | "stderr",
  afterLine = false,
) {
  const child = spawn("node", [bin, ...args, "--cwd", scope.cwd], {
    cwd: scope.cwd,
    env: { ...process.env, HOME: scope.home, USERPROFILE: scope.home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (stream !== undefined) {
    if (afterLine) {
      let output = "";
      child[stream].on("data", (data: Buffer) => {
        output += data.toString();
        if (output.includes("\n")) child[stream].destroy();
      });
    } else child[stream].destroy();
  }
  let stderr = "";
  if (stream !== "stderr") {
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
  }
  if (stream !== "stdout") child.stdout.resume();
  return await new Promise<{ code: number | null; signal: string | null; stderr: string }>(
    (resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code, signal, stderr }));
    },
  );
}
