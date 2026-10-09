import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

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

test("caplet diff shows pending FileDiffs", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("warn Dry run: 5 changes not applied");
    expect(result.stdout).toContain("CLAUDE.md");
  } finally {
    await cleanup(scope);
  }
});
