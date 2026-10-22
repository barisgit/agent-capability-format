import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

test("same-scope facet collision blocks emission and exclude restores a fixed point", async () => {
  const scope = await makeScope();
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    for (const name of ["cap-a", "cap-b"]) {
      const root = path.join(scope.agentsDir, "capabilities", name);
      await writeText(path.join(root, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
      await writeText(
        path.join(root, "skills", "foo", "SKILL.md"),
        `---\nname: foo\ndescription: From ${name}\n---\n${name}\n`,
      );
    }
    for (const command of ["apply", "check", "status"]) {
      const result = await runCaplet(scope, [
        command,
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        ...(command === "status" ? [] : ["--target", "codex"]),
        "--json",
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("acf.facet.name-collision");
      expect(result.stdout).toContain("cap-a");
      expect(result.stdout).toContain("cap-b");
      expect(result.stdout).toContain("foo");
      expect(result.stdout).toContain("exclude");
      expect(await Bun.file(path.join(scope.agentsDir, "skills", "foo", "SKILL.md")).exists()).toBe(
        false,
      );
    }
    // Keep the source skill intact and resolve the clash using the documented manifest selection.
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.agentsDir, "capabilities", "cap-b")}\n    exclude:\n      skills: [foo]\n`,
    );
    const apply = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "codex",
    ]);
    expect(apply.exitCode).toBe(0);
    expect(await readText(path.join(scope.agentsDir, "skills", "foo", "SKILL.md"))).toContain(
      "cap-a",
    );
    const check = await runCaplet(scope, [
      "check",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "codex",
    ]);
    expect(check.exitCode).toBe(0);
  } finally {
    await cleanup(scope);
  }
});

test("project facet shadows a differently named user capability with an info diagnostic", async () => {
  const scope = await makeScope();
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    for (const [agents, name] of [
      [scope.agentsDir, "project-cap"],
      [path.join(scope.home, ".agents"), "user-cap"],
    ] as const) {
      const root = path.join(agents, "capabilities", name);
      await writeText(path.join(root, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
      await writeText(
        path.join(root, "skills", "foo", "SKILL.md"),
        `---\nname: foo\ndescription: From ${name}\n---\n${name}\n`,
      );
    }
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--target",
      "codex",
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acf.facet.shadowed");
    expect(result.stdout).toContain('"severity": "info"');
    expect(await readText(path.join(scope.home, ".agents", "skills", "foo", "SKILL.md"))).toContain(
      "user-cap",
    );
    expect(await readText(path.join(scope.agentsDir, "skills", "foo", "SKILL.md"))).toContain(
      "project-cap",
    );
  } finally {
    await cleanup(scope);
  }
});
