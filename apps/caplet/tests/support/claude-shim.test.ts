import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { claudeShim } from "./claude-path.js";

let dir = "";
afterEach(async () => {
  if (dir !== "") await rm(dir, { recursive: true, force: true });
});

test("the claude shim replays transcripts across processes and fails unknown argv", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "caplet-shim-"));
  const shim = await claudeShim(dir, {
    transcripts: ["list-json-empty", "install-user"],
    replace: { "spike-mkt": "acf-user" },
  });
  const run = (args: string[]) => {
    const proc = Bun.spawnSync(["claude", ...args], { env: { ...process.env, ...shim.env } });
    return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
  };
  expect(run(["plugin", "list", "--json"])).toEqual({ code: 0, out: "[]\n", err: "" });
  expect(run(["plugin", "list", "--json"]).code).toBe(99);
  expect(run(["plugin", "install", "probe@acf-user", "--scope", "user"]).code).toBe(0);
  expect(await shim.unused()).toEqual([]);
  expect(await shim.unexpected()).toEqual(["claude plugin list --json"]);
  expect(await shim.calls()).toHaveLength(3);
});
