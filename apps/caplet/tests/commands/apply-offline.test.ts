import { expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

for (const legacy of [true, false]) {
  for (const damage of ["empty", "unreadable manifest", "missing skills"] as const) {
    test(`offline apply preserves outputs for ${legacy ? "legacy" : "current"} locks with ${damage}`, async () => {
      const scope = await makeScope();
      try {
        if (damage === "missing skills") {
          await writeText(
            path.join(scope.sourceRoot, "bare", "SKILL.md"),
            "---\nname: bare\ndescription: Bare skill\n---\nUse it.\n",
          );
          await writeText(
            path.join(scope.agentsDir, "capabilities.yml"),
            `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, "bare")}\n`,
          );
        }
        const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "claude", "--json"];
        expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
        const sidecar = path.join(scope.cwd, ".claude", ".acf-managed.json");
        const ownership = await readText(sidecar);
        const managed = (JSON.parse(ownership) as { managed: Array<{ path: string }> }).managed;
        const outputs = await Promise.all(
          managed.map(async (item) => {
            const file = path.join(scope.cwd, ".claude", item.path);
            return { file, text: await readText(file) };
          }),
        );
        const lockPath = path.join(scope.agentsDir, "capabilities.lock");
        if (legacy) {
          const lock = JSON.parse(await readText(lockPath)) as {
            entries: Array<{ resolvedCapabilities?: unknown }>;
          };
          for (const entry of lock.entries) delete entry.resolvedCapabilities;
          await writeText(lockPath, JSON.stringify(lock));
        }
        const lockBefore = await readText(lockPath);
        const snapshot = path.join(
          scope.agentsDir,
          "capabilities",
          damage === "missing skills" ? "bare" : "beta-cap",
        );
        if (damage === "empty") {
          await rm(snapshot, { recursive: true });
          await mkdir(snapshot);
        } else if (damage === "unreadable manifest") {
          await rm(path.join(snapshot, "acf.yml"));
          await mkdir(path.join(snapshot, "acf.yml"));
        } else await rm(path.join(snapshot, "skills"), { recursive: true });
        const result = await runCaplet(scope, ["apply", "--offline", ...args]);
        expect(result.exitCode).toBe(2);
        expect(result.stdout).toContain("acf.lock.snapshot-missing");
        expect(await readText(sidecar)).toBe(ownership);
        expect(await readText(lockPath)).toBe(lockBefore);
        for (const output of outputs) expect(await readText(output.file)).toBe(output.text);
      } finally {
        await cleanup(scope);
      }
    });
  }
}

test("offline apply preserves output and ownership when a locked snapshot is missing", async () => {
  const scope = await makeScope();
  try {
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "claude", "--json"];
    expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
    const output = path.join(scope.cwd, ".claude", "CLAUDE.md");
    const sidecar = path.join(scope.cwd, ".claude", ".acf-managed.json");
    const before = await readText(output);
    const ownership = await readText(sidecar);
    await rm(path.join(scope.agentsDir, "capabilities", "beta-cap"), { recursive: true });
    const frozenPreview = await runCaplet(scope, [
      "apply",
      "--offline",
      "--dry-run",
      "--frozen",
      ...args,
    ]);
    expect(frozenPreview.exitCode).toBe(3);
    expect(frozenPreview.stdout).toContain("acf.lock.snapshot-missing");
    const result = await runCaplet(scope, ["apply", "--offline", ...args]);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "acf.lock.snapshot-missing",
        capability: { name: "beta-cap" },
      }),
    );
    expect(await readText(output)).toBe(before);
    expect(await readText(sidecar)).toBe(ownership);
    expect(
      await Bun.file(path.join(scope.agentsDir, "capabilities", "beta-cap", "acf.yml")).exists(),
    ).toBe(false);
  } finally {
    await cleanup(scope);
  }
});

test("a frozen dry run plans a missing snapshot restore without changing installed state", async () => {
  const scope = await makeScope();
  try {
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "claude", "--json"];
    expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
    const lock = path.join(scope.agentsDir, "capabilities.lock");
    const sidecar = path.join(scope.cwd, ".claude", ".acf-managed.json");
    const before = { lock: await readText(lock), sidecar: await readText(sidecar) };
    const snapshot = path.join(scope.agentsDir, "capabilities", "beta-cap");
    await rm(snapshot, { recursive: true });
    const preview = await runCaplet(scope, ["apply", "--frozen", "--dry-run", ...args]);
    expect(preview.exitCode).toBe(0);
    expect(JSON.parse(preview.stdout).plan.fileCount).toBe(0);
    expect(await Bun.file(path.join(snapshot, "acf.yml")).exists()).toBe(false);
    expect(await readText(lock)).toBe(before.lock);
    expect(await readText(sidecar)).toBe(before.sidecar);
    const applied = await runCaplet(scope, ["apply", "--frozen", ...args]);
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout).plan).toEqual(JSON.parse(preview.stdout).plan);
    expect(await Bun.file(path.join(snapshot, "acf.yml")).exists()).toBe(true);
    expect(await readText(lock)).toBe(before.lock);
    expect(await readText(sidecar)).toBe(before.sidecar);
  } finally {
    await cleanup(scope);
  }
});

test("caplet apply --dry-run --offline rejects declared sources that have not been resolved", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "apply",
      "--dry-run",
      "--offline",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("acf.lock.missing-entry");
    expect(result.stdout).not.toContain("Output is up to date");
  } finally {
    await cleanup(scope);
  }
});
