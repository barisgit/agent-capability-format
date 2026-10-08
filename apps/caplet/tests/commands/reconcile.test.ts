import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyProject,
  cleanup,
  forceCanonicalSkills,
  makeScope,
  readText,
  runCaplet,
  writeText,
} from "../helpers";

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
    await forceCanonicalSkills(scope);
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
    await forceCanonicalSkills(scope);
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

test("apply heals a stale sidecar hash when disk already matches desired content", async () => {
  const scope = await makeScope();
  try {
    const first = await applyProject(scope);
    expect(first.exitCode).toBe(0);

    const sidecarPath = path.join(scope.cwd, ".claude", ".acf-managed.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as {
      managed: Array<{ path: string; hash: string; capability: string }>;
    };
    const victim = sidecar.managed.find(
      (entry) => entry.capability === "alpha-cap" && entry.path.endsWith(".md"),
    );
    expect(victim).toBeDefined();
    if (victim === undefined) throw new Error("unreachable");
    victim.hash = "sha256-deadbeef";
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

    // Dry-run must not claim everything is up to date while drift persists.
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
    expect(dry.stdout).not.toContain("Everything up to date");

    const heal = await applyProject(scope);
    expect(heal.exitCode).toBe(0);

    const healed = await readFile(sidecarPath, "utf8");
    expect(healed).not.toContain("sha256-deadbeef");

    const third = await applyProject(scope);
    expect(third.exitCode).toBe(0);
    expect(third.stdout).toContain("Everything up to date");
    expect(third.stdout + third.stderr).not.toContain("drifted");
  } finally {
    await cleanup(scope);
  }
});

test("dry-run does not mutate the sidecar when a facet's source is deleted", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "doomed", "SKILL.md"),
      "---\nname: doomed\ndescription: Doomed skill\n---\nBody.\n",
    );
    expect((await applyProject(scope)).exitCode).toBe(0);
    const sidecarPath = path.join(scope.cwd, ".claude", ".acf-managed.json");
    const before = await readFile(sidecarPath, "utf8");
    expect(before).toContain("doomed");

    await rm(path.join(scope.sourceRoot, "alpha", "skills", "doomed"), { recursive: true });

    const dry = await runCaplet(scope, [
      "apply",
      "--dry-run",
      "--mode",
      "force",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(dry.exitCode).toBe(0);
    expect(dry.stdout).not.toContain("Everything up to date");
    expect(await readFile(sidecarPath, "utf8")).toBe(before);
    // Nor the installed snapshots: a later apply must not see a half-applied preview.
    const snapshotSkill = path.join(
      scope.agentsDir,
      "capabilities",
      "alpha-cap",
      "skills",
      "doomed",
    );
    expect(await Bun.file(path.join(snapshotSkill, "SKILL.md")).exists()).toBe(true);

    const heal = await runCaplet(scope, [
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
    expect(heal.exitCode).toBe(0);
    const after = await readFile(sidecarPath, "utf8");
    expect(after).not.toContain("doomed");
    expect(
      await Bun.file(path.join(scope.cwd, ".claude", "skills", "doomed", "SKILL.md")).exists(),
    ).toBe(false);

    const third = await applyProject(scope);
    expect(third.exitCode).toBe(0);
    expect(third.stdout).toContain("Everything up to date");
  } finally {
    await cleanup(scope);
  }
});

test("synthesized skill deletion removes owned files but preserves unmanaged files", async () => {
  const scope = await makeScope();
  try {
    await forceCanonicalSkills(scope);
    const bare = path.join(scope.sourceRoot, "bare-skills");
    const docsBytes = "---\nname: docs\n---\ndocs\n";
    await writeText(path.join(bare, "skills", "docs", "SKILL.md"), docsBytes);
    await writeText(
      path.join(bare, "skills", "pdf", "SKILL.md"),
      "---\nname: pdf\ndescription: pdf\n---\npdf\n",
    );
    for (const name of ["docs", "pdf"]) {
      await writeText(path.join(bare, "skills", name, "references", "guide.md"), `${name} guide\n`);
    }
    await writeFile(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${bare}\n`,
      "utf8",
    );
    const first = await applyProject(scope);
    if (first.exitCode !== 0) throw new Error(first.stdout + first.stderr);
    const docsOutput = path.join(scope.agentsDir, "skills", "docs");
    // Imported skills are rendered like any other skill, with the reader's fallback description.
    expect(await Bun.file(path.join(docsOutput, "SKILL.md")).text()).toBe(
      "---\nname: docs\ndescription: Imported skill\n---\ndocs\n",
    );
    expect(await Bun.file(path.join(docsOutput, "references", "guide.md")).exists()).toBe(true);
    await writeText(path.join(docsOutput, "unmanaged.txt"), "keep\n");

    await rm(path.join(bare, "skills", "docs"), { recursive: true });
    const update = await runCaplet(scope, [
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

    expect(update.exitCode).toBe(0);
    expect(await Bun.file(path.join(docsOutput, "SKILL.md")).exists()).toBe(false);
    expect(await Bun.file(path.join(docsOutput, "references", "guide.md")).exists()).toBe(false);
    expect(await Bun.file(path.join(docsOutput, "unmanaged.txt")).text()).toBe("keep\n");
    expect((await applyProject(scope)).stdout).toContain("Everything up to date");
  } finally {
    await cleanup(scope);
  }
});
