import path from "node:path";
import { expect, test } from "bun:test";
import { applyProject, cleanup, makeScope, readText } from "../helpers";

test("caplet apply fetches and writes native artifacts", async () => {
  const scope = await makeScope();
  try {
    const result = await applyProject(scope);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("DONE  Applied 4 files");
    expect(await readText(path.join(scope.cwd, ".claude", "CLAUDE.md"))).toContain("Alpha guidance");
    expect(await Bun.file(path.join(scope.cwd, ".claude", ".acf-managed.json")).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});
