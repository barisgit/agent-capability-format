import { expect, test } from "bun:test";
import { homedir } from "node:os";
import path from "node:path";
import { targetMap } from "../src";

test("pi user paths use Pi's global agent directory", () => {
  const pi = targetMap.pi;
  if (pi === undefined) throw new Error("missing Pi target");
  expect(pi.installPaths.user).toBe(path.join(homedir(), ".pi", "agent"));
  expect(pi.skillInstallPaths?.user).toBe(path.join(homedir(), ".pi", "agent", "skills"));
  expect(pi.mappings.mcpInstallPath.user).toBe(path.join(homedir(), ".pi", "agent", "mcp.json"));

  expect(pi.installPaths.project).toBe(path.join(".", ".pi"));
  expect(pi.skillInstallPaths?.project).toBe(path.join(".", ".pi", "skills"));
});
