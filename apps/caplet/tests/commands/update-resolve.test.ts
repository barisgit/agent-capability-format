import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

test("caplet update --no-apply materializes capability tree and lockfile", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "update",
      "--no-apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Updated 2 capabilities");
    expect(
      await Bun.file(path.join(scope.agentsDir, "capabilities", "alpha-cap", "acf.yml")).exists(),
    ).toBe(true);
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities.lock")).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("a path source can select acf/ itself and preserve nested collection selectors", async () => {
  const scope = await makeScope();
  try {
    const collection = path.join(scope.sourceRoot, "collection", "acf");
    await writeText(
      path.join(collection, "nested", "one", "acf.yml"),
      "acf: 1\nname: selected-cap\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(collection, "two", "acf.yml"),
      "acf: 1\nname: other-cap\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${collection}/\n    capabilities: nested/*\n`,
    );
    await fetchProject(scope);
    const listed = await runCaplet(scope, [
      "list",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(listed.exitCode).toBe(0);
    expect(
      JSON.parse(listed.stdout).scopes[0].capabilities.map((cap: { name: string }) => cap.name),
    ).toEqual(["selected-cap"]);
  } finally {
    await cleanup(scope);
  }
});
