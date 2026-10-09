import { expect, test } from "bun:test";
import { cleanup, makeScope, runCaplet } from "../helpers";

test("caplet diff --offline rejects declared sources that have not been resolved", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "diff",
      "--offline",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("acf.lock.missing-entry");
    expect(result.stdout).not.toContain("Output is up to date");
  } finally {
    await cleanup(scope);
  }
});
