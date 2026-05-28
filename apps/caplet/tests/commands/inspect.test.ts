import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet inspect prints capability details", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["inspect", "alpha-cap", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"name": "alpha-cap"');
    expect(result.stdout).toContain('"instructions"');
  } finally {
    await cleanup(scope);
  }
});
