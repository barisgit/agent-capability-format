import path from "node:path";
import { expect, test } from "bun:test";
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

test("caplet emit dry-run shows pending diffs without writing", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["emit", "--cwd", scope.cwd, "--scope", "project", "--target", "claude", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PENDING  4 files");
    expect(await Bun.file(path.join(scope.cwd, ".claude", "CLAUDE.md")).exists()).toBe(false);
  } finally {
    await cleanup(scope);
  }
});

test("default emission plans canonical skills once and only uses required native roots", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research skill\n---\nUse structured research notes.\n",
    );
    await fetchProject(scope);

    const result = await runCaplet(scope, [
      "emit",
      "--dry-run",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.match(/\.agents\/skills\/research\/SKILL\.md/g)).toHaveLength(1);
    expect(result.stdout).toContain("project / canonical / alpha-cap");
    expect(result.stdout).toContain(".claude/skills/research/SKILL.md");
    expect(result.stdout).not.toContain(".codex/skills/research/SKILL.md");
    expect(result.stdout).not.toContain(".opencode/skills/research/SKILL.md");
    expect(result.stdout).not.toContain(".pi/skills/research/SKILL.md");
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
    const result = await runCaplet(scope, ["emit", "--cwd", scope.cwd, "--scope", "project", "--target", "claude", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude/skills/research/SKILL.md");
    expect(result.stdout).not.toContain(".agents/skills/research/SKILL.md");
  } finally {
    await cleanup(scope);
  }
});
