import { expect, test } from "bun:test";
import path from "node:path";
import { applyProject, cleanup, makeScope, readText, runCaplet } from "../helpers";

test("caplet remove updates manifest and cleans sidecar-owned output", async () => {
  const scope = await makeScope();
  try {
    await applyProject(scope);
    const result = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities", "alpha-cap")).exists()).toBe(
      false,
    );
    expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).not.toContain("alpha");
    expect(await readText(path.join(scope.cwd, ".claude", "CLAUDE.md"))).not.toContain(
      "Alpha guidance",
    );
    const inventory = await readText(path.join(scope.cwd, ".claude", "ACF-MANAGED.md"));
    expect(inventory).not.toContain("alpha-cap");
    expect(inventory).toContain("beta-cap");
    const sidecar = JSON.parse(
      await readText(path.join(scope.cwd, ".claude", ".acf-managed.json")),
    );
    expect(
      sidecar.managed.some(
        (entry: { path: string; capability: string }) =>
          entry.path === "ACF-MANAGED.md" && entry.capability === "acf-system",
      ),
    ).toBe(true);
  } finally {
    await cleanup(scope);
  }
});
