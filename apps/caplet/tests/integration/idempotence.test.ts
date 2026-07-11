import { expect, test } from "bun:test";
import { applyProject, cleanup, makeScope, runCaplet } from "../helpers";

test("apply is idempotent", async () => {
  const scope = await makeScope();
  try {
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);
    expect(first.stdout + first.stderr).toContain("ok Applied 5 files");
    const second = await applyProject(scope);
    expect(second.exitCode).toBe(0);
    expect(second.stdout + second.stderr).toContain("ok Everything up to date");
    const diff = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(diff.exitCode).toBe(0);
    expect(diff.stdout + diff.stderr).toContain("ok Everything up to date");
  } finally {
    await cleanup(scope);
  }
});
