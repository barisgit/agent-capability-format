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

test("a whole-file link leaving its location is a violation; a merged file's link is followed", async () => {
  const mcpFile = path.join(dir, ".mcp.json");
  await symlink(path.join(dir, "outside.json"), mcpFile);
  const root = path.join(dir, "root");
  const settings = path.join(root, "settings.json");
  await symlink(path.join(dir, "outside.json"), settings);
  const boundary = { roots: [root], files: [mcpFile] };

  expect(await containmentViolation(mcpFile, boundary, "file")).toContain("outside.json");
  expect(await containmentViolation(settings, boundary, "file")).toContain("outside.json");
  expect(await containmentViolation(mcpFile, boundary, "regions")).toBeNull();
  expect(await containmentViolation(settings, boundary, "regions")).toBeNull();
});

test("a whole-file link is allowed only while it resolves inside the root", async () => {
  const root = path.join(dir, "root");
  await writeFile(path.join(root, "AGENTS.md"), "agents\n");
  await symlink(path.join(root, "AGENTS.md"), path.join(root, "CLAUDE.md"));
  await symlink(path.join(dir, "missing.md"), path.join(root, "dangling.md"));
  const boundary = { roots: [root], files: [] };

  expect(await containmentViolation(path.join(root, "CLAUDE.md"), boundary, "file")).toBeNull();
  for (const ownership of ["file", "regions"] as const) {
    expect(
      await containmentViolation(path.join(root, "dangling.md"), boundary, ownership),
    ).toContain("dangling");
  }
});

test("a merged file under a parent directory leaving the root is a violation", async () => {
  const root = path.join(dir, "root");
  await mkdir(path.join(dir, "elsewhere"));
  await symlink(path.join(dir, "elsewhere"), path.join(root, "hooks"));
  const boundary = { roots: [root], files: [] };

  expect(
    await containmentViolation(path.join(root, "hooks", "settings.json"), boundary, "regions"),
  ).toContain("elsewhere");
});
