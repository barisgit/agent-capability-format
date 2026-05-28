import { expect, test } from "bun:test";
import { applyProject, cleanup, makeScope, runCaplet } from "../helpers";

test("apply is idempotent", async () => {
  const scope = await makeScope();
  try {
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);
    expect(first.stdout + first.stderr).toContain("applied");
    const second = await applyProject(scope);
    expect(second.exitCode).toBe(0);
    expect(second.stdout + second.stderr).toContain("applied 0 writes and 0 deletes");
    const diff = await runCaplet(scope, ["diff", "--cwd", scope.cwd, "--scope", "project", "--target", "claude"]);
    expect(diff.exitCode).toBe(0);
    expect(diff.stdout + diff.stderr).toContain("0 pending diffs");
  } finally {
    await cleanup(scope);
  }
});
