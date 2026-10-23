import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet } from "../helpers";

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
