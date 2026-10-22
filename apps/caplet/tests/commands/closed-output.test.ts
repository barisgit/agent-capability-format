import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { cleanup, makeScope, type TestScope, writeText } from "../helpers";

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
  // The deprecated alias writes a notice before the asynchronous command runs.
  const result = await runWithClosedReader(["diff"], "stderr");
  expect(result.code).toBe(0);
  expect(result.signal).toBeNull();
});

/** Closes a pipe's reader immediately, like `head -c 0`, before Node can write to it. */
async function runWithClosedReader(args: string[], stream: "stdout" | "stderr") {
  const child = spawn("node", [bin, ...args, "--cwd", scope.cwd], {
    cwd: scope.cwd,
    env: { ...process.env, HOME: scope.home, USERPROFILE: scope.home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child[stream].destroy();
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
