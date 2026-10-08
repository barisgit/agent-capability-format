import { expect, test } from "bun:test";
import path from "node:path";
import { readLockfile } from "@caplet/installer";
import { cleanup, fetchProject, makeScope, readText, runCaplet, writeText } from "../helpers";

test("caplet update refreshes lockfile", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "update",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Updated alpha-cap");
  } finally {
    await cleanup(scope);
  }
});

test("caplet update with a name refreshes only that capability", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const alphaSource = path.join(scope.sourceRoot, "alpha", "instructions", "always.md");
    const betaSource = path.join(scope.sourceRoot, "beta", "instructions", "always.md");
    await writeText(
      alphaSource,
      (await readText(alphaSource)).replace("Alpha guidance", "Alpha updated"),
    );
    await writeText(
      betaSource,
      (await readText(betaSource)).replace("Beta guidance", "Beta updated"),
    );

    const result = await runCaplet(scope, [
      "update",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);

    const alphaInstalled = await readText(
      path.join(scope.agentsDir, "capabilities", "alpha-cap", "instructions", "always.md"),
    );
    const betaInstalled = await readText(
      path.join(scope.agentsDir, "capabilities", "beta-cap", "instructions", "always.md"),
    );
    expect(alphaInstalled).toContain("Alpha updated");
    expect(betaInstalled).toContain("Beta guidance");
    expect(betaInstalled).not.toContain("Beta updated");

    const lock = await readLockfile(path.join(scope.agentsDir, "capabilities.lock"));
    expect(lock?.entries).toHaveLength(2);
  } finally {
    await cleanup(scope);
  }
});
