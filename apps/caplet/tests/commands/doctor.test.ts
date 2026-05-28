import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet doctor checks environment", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["doctor", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pass git available");
    expect(result.stdout).toContain("pass target claude");
    expect(result.stdout).toContain("pass lockfile project");
  } finally {
    await cleanup(scope);
  }
});
