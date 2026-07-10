import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet check validates resolved capabilities", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["check", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain("DONE  Validation passed");
  } finally {
    await cleanup(scope);
  }
});
