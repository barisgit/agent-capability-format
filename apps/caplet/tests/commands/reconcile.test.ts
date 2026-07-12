import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyProject, cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

async function narrowToAlpha(scope: Awaited<ReturnType<typeof makeScope>>): Promise<void> {
  await writeFile(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, "alpha")}\n`,
    "utf8",
  );
}

test("apply plans deletes for capabilities dropped from the manifest", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "beta", "skills", "beta-skill", "SKILL.md"),
      "---\nname: beta-skill\ndescription: Beta skill\n---\nBeta skill body.\n",
    );
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);
    const betaSkill = path.join(scope.agentsDir, "skills", "beta-skill", "SKILL.md");
    expect(await Bun.file(betaSkill).exists()).toBe(true);

    await narrowToAlpha(scope);
    const second = await applyProject(scope);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain("beta-");
    expect(await Bun.file(betaSkill).exists()).toBe(false);

    const sidecar = await readText(path.join(scope.agentsDir, ".acf-managed.json"));
    expect(sidecar).not.toContain("beta-cap");
    // The canonical notice is deleted with its last managed artifact.
    expect(await Bun.file(path.join(scope.agentsDir, "ACF-MANAGED.md")).exists()).toBe(false);
    const nativeNotice = await readText(path.join(scope.cwd, ".claude", "ACF-MANAGED.md"));
    expect(nativeNotice).not.toContain("beta-cap");

    const third = await applyProject(scope);
    expect(third.exitCode).toBe(0);
    expect(third.stdout).toContain("Everything up to date");
  } finally {
    await cleanup(scope);
  }
});

test("check flags orphaned managed files after the manifest narrows", async () => {
  const scope = await makeScope();
  try {
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);

    await narrowToAlpha(scope);
    const stale = await runCaplet(scope, [
      "check",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(stale.exitCode).toBe(1);
    expect(stale.stdout + stale.stderr).toContain("stale");

    const apply = await applyProject(scope);
    expect(apply.exitCode).toBe(0);
    const clean = await runCaplet(scope, [
      "check",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(clean.exitCode).toBe(0);
  } finally {
    await cleanup(scope);
  }
});

test("apply --dry-run previews deletes for changed selectors without touching the lockfile", async () => {
  const scope = await makeScope();
  try {
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);
    const lockPath = path.join(scope.agentsDir, "capabilities.lock");
    const lockBefore = await readText(lockPath);

    await narrowToAlpha(scope);
    const dry = await runCaplet(scope, [
      "apply",
      "--dry-run",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(dry.exitCode).toBe(0);
    expect(dry.stderr).not.toContain("acf.lock.drift");
    expect(dry.stdout).toContain("beta-");
    expect(dry.stdout).toContain("3 delete");

    const lockAfter = await readText(lockPath);
    expect(lockAfter).toBe(lockBefore);
    expect(
      await Bun.file(path.join(scope.agentsDir, "capabilities", "beta-cap", "acf.yml")).exists(),
    ).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("byte-identical ownership transfer updates the sidecar owner", async () => {
  const scope = await makeScope();
  try {
    const skillBody = "---\nname: shared-skill\ndescription: Shared skill\n---\nShared body.\n";
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "shared-skill", "SKILL.md"),
      skillBody,
    );
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);
    const sidecarPath = path.join(scope.agentsDir, ".acf-managed.json");
    const before = JSON.parse(await readFile(sidecarPath, "utf8")) as {
      managed: Array<{ path: string; capability: string }>;
    };
    expect(
      before.managed.some(
        (entry) => entry.path.includes("shared-skill") && entry.capability === "alpha-cap",
      ),
    ).toBe(true);

    // Move the identical skill from alpha to beta.
    const { rm } = await import("node:fs/promises");
    await rm(path.join(scope.sourceRoot, "alpha", "skills", "shared-skill"), {
      recursive: true,
    });
    await writeText(
      path.join(scope.sourceRoot, "beta", "skills", "shared-skill", "SKILL.md"),
      skillBody,
    );
    const second = await runCaplet(scope, [
      "apply",
      "--mode",
      "force",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(second.exitCode).toBe(0);

    const after = JSON.parse(await readFile(sidecarPath, "utf8")) as {
      managed: Array<{ path: string; capability: string }>;
    };
    const owners = after.managed
      .filter((entry) => entry.path.includes("shared-skill") && entry.path.endsWith("SKILL.md"))
      .map((entry) => entry.capability);
    expect(owners).toEqual(["beta-cap"]);

    const third = await applyProject(scope);
    expect(third.exitCode).toBe(0);
    expect(third.stdout).toContain("Everything up to date");
  } finally {
    await cleanup(scope);
  }
});
