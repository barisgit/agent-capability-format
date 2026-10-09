import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { containmentViolation } from "../src/apply/containment";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "caplet-containment-"));
  await mkdir(path.join(dir, "root"));
  await writeFile(path.join(dir, "outside.json"), "{}\n");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("a declared file that is a symlink leaving its location is a violation", async () => {
  const mcpFile = path.join(dir, ".mcp.json");
  await symlink(path.join(dir, "outside.json"), mcpFile);
  const boundary = { roots: [path.join(dir, "root")], files: [mcpFile] };

  expect(await containmentViolation(mcpFile, boundary)).toContain("outside.json");
});

test("a final symlink is allowed only while it resolves inside the root", async () => {
  const root = path.join(dir, "root");
  await writeFile(path.join(root, "AGENTS.md"), "agents\n");
  await symlink(path.join(root, "AGENTS.md"), path.join(root, "CLAUDE.md"));
  await symlink(path.join(dir, "missing.md"), path.join(root, "dangling.md"));
  const boundary = { roots: [root], files: [] };

  expect(await containmentViolation(path.join(root, "CLAUDE.md"), boundary)).toBeNull();
  expect(await containmentViolation(path.join(root, "dangling.md"), boundary)).toContain(
    "dangling",
  );
});
