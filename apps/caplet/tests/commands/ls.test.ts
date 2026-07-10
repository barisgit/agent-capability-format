import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet ls lists capabilities per scope", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["ls", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("project:");
    expect(result.stdout).toContain("alpha-cap@1.0.0");
    expect(result.stdout).toContain("beta-cap@1.0.0");
  } finally {
    await cleanup(scope);
  }
});
