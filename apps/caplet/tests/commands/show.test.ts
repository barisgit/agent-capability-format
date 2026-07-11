import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

test("caplet show prints a human capability view", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "show",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha-cap 1.0.0");
    expect(result.stdout).toContain("project scope");
    expect(result.stdout).toContain("instructions");
    expect(result.stdout).toContain("TARGET");
    expect(result.stdout).toContain("supported");
  } finally {
    await cleanup(scope);
  }
});

test("caplet show --json prints machine-readable details", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "show",
      "alpha-cap",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"name": "alpha-cap"');
    expect(result.stdout).toContain('"instructions"');
  } finally {
    await cleanup(scope);
  }
});
