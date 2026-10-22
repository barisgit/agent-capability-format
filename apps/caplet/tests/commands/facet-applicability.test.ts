import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, runCaplet, writeText } from "../helpers";

test("facet collisions include agents and commands but respect target applicability", async () => {
  const scope = await makeScope();
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    for (const name of ["first", "second"]) {
      const root = path.join(scope.agentsDir, "capabilities", name);
      await writeText(path.join(root, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
      for (const family of ["agents", "commands"]) {
        await writeText(
          path.join(root, family, "shared.md"),
          "---\nname: shared\ndescription: Shared\nonly: [claude]\n---\nBody\n",
        );
      }
    }
    const args = ["apply", "--cwd", scope.cwd, "--scope", "project", "--json"];
    const disjoint = await runCaplet(scope, [...args, "--target", "codex"]);
    expect(disjoint.exitCode).toBe(0);
    expect(disjoint.stdout).not.toContain("acf.facet.name-collision");
    const collision = await runCaplet(scope, [...args, "--target", "claude"]);
    expect(collision.exitCode).toBe(2);
    const envelope = JSON.parse(collision.stdout) as {
      diagnostics: Array<{ code: string; family?: string; message: string }>;
    };
    const clashes = envelope.diagnostics.filter((item) => item.code === "acf.facet.name-collision");
    expect(clashes.map((item) => item.family).sort()).toEqual(["agent", "command"]);
    for (const item of clashes) {
      expect(item.message).toContain("first, second");
      expect(item.message).toContain("shared");
      expect(item.message).toContain("exclude");
    }
  } finally {
    await cleanup(scope);
  }
});

test("native remainder omitted on a target does not collide there", async () => {
  const scope = await makeScope();
  try {
    const sources = [];
    for (const name of ["first", "second"]) {
      const root = path.join(scope.sourceRoot, name);
      sources.push(root);
      await writeText(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name }));
      await writeText(
        path.join(root, "commands", "shared.md"),
        "---\ndescription: Shared\n---\nBody\n",
      );
    }
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n${sources.map((source) => `  - source: path:${source}\n`).join("")}`,
    );
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "codex",
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acf.support.component-omitted");
    expect(result.stdout).not.toContain("acf.facet.name-collision");
  } finally {
    await cleanup(scope);
  }
});
