import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, runCaplet, writeText } from "../helpers";

test("shadowed executable facets are reported as removed, not desired", async () => {
  const scope = await makeScope();
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    const user = path.join(scope.home, ".agents", "capabilities", "user-cap");
    await writeText(path.join(user, "acf.yml"), "acf: 1\nname: user-cap\nversion: 1.0.0\n");
    await writeText(
      path.join(user, "skills", "kept", "SKILL.md"),
      "---\nname: kept\ndescription: Kept\n---\nBody\n",
    );
    const server = "servers:\n  - name: shared\n    transport: stdio\n    command: node\n";
    await writeText(path.join(user, "mcp", "mcp.yml"), server);
    const flags = ["--cwd", scope.cwd, "--target", "codex", "--json"];
    expect((await runCaplet(scope, ["apply", "--scope", "user", ...flags])).exitCode).toBe(0);
    const project = path.join(scope.agentsDir, "capabilities", "project-cap");
    await writeText(path.join(project, "acf.yml"), "acf: 1\nname: project-cap\nversion: 1.0.0\n");
    await writeText(path.join(project, "mcp", "mcp.yml"), server);
    const applied = await runCaplet(scope, ["apply", ...flags]);
    expect(applied.exitCode).toBe(0);
    const result = JSON.parse(applied.stdout) as {
      executables: Array<{ capability: string; change: string }>;
    };
    expect(result.executables).toContainEqual(
      expect.objectContaining({ capability: "user-cap", change: "removed" }),
    );
    expect(result.executables).toContainEqual(
      expect.objectContaining({ capability: "project-cap", change: "added" }),
    );
    const again = await runCaplet(scope, ["apply", ...flags]);
    expect(again.exitCode).toBe(0);
    expect((JSON.parse(again.stdout) as { executables: unknown[] }).executables).toEqual([]);
    await rm(path.join(project, "mcp", "mcp.yml"));
    const unshadowed = await runCaplet(scope, ["apply", ...flags]);
    expect(unshadowed.exitCode).toBe(0);
    expect(
      (JSON.parse(unshadowed.stdout) as { executables: unknown[] }).executables,
    ).toContainEqual(expect.objectContaining({ capability: "user-cap", change: "added" }));
  } finally {
    await cleanup(scope);
  }
});
