import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, runCaplet } from "../helpers";

test("caplet fetch materializes capability tree and lockfile", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("caplet fetch is deprecated");
    expect(result.stdout).toContain("ok Updated 2 capabilities");
    expect(
      await Bun.file(path.join(scope.agentsDir, "capabilities", "alpha-cap", "acf.yml")).exists(),
    ).toBe(true);
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities.lock")).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});
