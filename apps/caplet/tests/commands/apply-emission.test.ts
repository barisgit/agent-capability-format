import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

test("default emission plans canonical skills once and only uses required native roots", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research skill\n---\nUse structured research notes.\n",
    );
    await fetchProject(scope);

    const result = await runCaplet(scope, [
      "apply",
      "--offline",
      "--dry-run",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.match(/skills\/research\/SKILL\.md/g)).toHaveLength(2);
    expect(result.stdout).toContain("canonical  .agents");
    expect(result.stdout).toContain("claude  .claude");
  } finally {
    await cleanup(scope);
  }
});

test("caplet target config can disable canonical skill emission", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research skill\n---\nUse structured research notes.\n",
    );
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "targets:\n  claude:\n    skills:\n      canonical: false\n",
    );
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "apply",
      "--offline",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
      "--dry-run",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skills/research/SKILL.md");
    expect(result.stdout).not.toContain("canonical  .agents");
  } finally {
    await cleanup(scope);
  }
});
