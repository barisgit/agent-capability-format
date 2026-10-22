import { expect, test } from "bun:test";
import { mkdir, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, runCaplet } from "../helpers";

test("project scope cannot write through an .agents symlink into another tree", async () => {
  const scope = await makeScope();
  try {
    const outside = path.join(scope.dir, "outside");
    const cwd = path.join(scope.dir, "symlink-project");
    await mkdir(outside);
    await mkdir(cwd);
    await symlink(outside, path.join(cwd, ".agents"));
    const result = await runCaplet(scope, [
      "add",
      path.join(scope.sourceRoot, "alpha"),
      "--cwd",
      cwd,
      "--scope",
      "project",
      "--no-apply",
      "--json",
      "-y",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("caplet init");
    expect(await readdir(outside)).toEqual([]);
  } finally {
    await cleanup(scope);
  }
});
