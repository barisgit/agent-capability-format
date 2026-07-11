import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet doctor checks environment", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["doctor", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Git available");
    expect(result.stdout).toContain("ok Claude Code adapter registered");
    expect(result.stdout).toContain("ok Project lockfile");
  } finally {
    await cleanup(scope);
  }
});
