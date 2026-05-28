import path from "node:path";
import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet emit dry-run shows pending diffs without writing", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["emit", "--cwd", scope.cwd, "--scope", "project", "--target", "claude", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pending diffs");
    expect(await Bun.file(path.join(scope.cwd, ".claude", "CLAUDE.md")).exists()).toBe(false);
  } finally {
    await cleanup(scope);
  }
});
