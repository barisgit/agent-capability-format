import { expect, test } from "bun:test";
import { chmod, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { cleanup, fetchProject, makeScope, readText, runCaplet, writeText } from "../helpers";

test("add names the real conflicting snapshot path, not its disposable preview", async () => {
  const scope = await makeScope();
  try {
    const source = path.join(scope.sourceRoot, "new");
    const destination = path.join(scope.agentsDir, "capabilities", "new");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: new\nversion: 1.0.0\n");
    await writeText(path.join(destination, "acf.yml"), "acf: 1\nname: new\nversion: 2.0.0\n");
    const result = await runCaplet(scope, [
      "add",
      source,
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "codex",
      "--json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "acf.apply.unowned",
        path: destination,
        message: expect.stringContaining(`directory ${destination};`),
      }),
    );
  } finally {
    await cleanup(scope);
  }
});

for (const failure of ["facet collision", "unowned output", "late write failure"] as const) {
  test(`failed add restores manifest, lock and snapshots (${failure})`, async () => {
    const scope = await makeScope();
    const native = path.join(scope.cwd, ".codex");
    try {
      await fetchProject(scope);
      const manifest = path.join(scope.agentsDir, "capabilities.yml");
      const lock = path.join(scope.agentsDir, "capabilities.lock");
      const beforeManifest = await readText(manifest);
      const beforeLock = await readText(lock);
      const beforeSnapshots = await readdir(path.join(scope.agentsDir, "capabilities"));
      const source = path.join(scope.sourceRoot, "new");
      await writeText(path.join(source, "acf.yml"), "acf: 1\nname: new\nversion: 1.0.0\n");
      const helper = failure === "facet collision" ? "alpha-helper" : "new-helper";
      await writeText(
        path.join(source, "agents", `${helper}.md`),
        `---\nname: ${helper}\ndescription: New helper\n---\nNew guidance.\n`,
      );
      if (failure === "unowned output")
        await writeText(path.join(native, "agents", "new-helper.md"), "Mine\n");
      if (failure === "late write failure") {
        await mkdir(native, { recursive: true });
        await chmod(native, 0o555);
      }
      const result = await runCaplet(scope, [
        "add",
        source,
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        "--target",
        "codex",
        "--json",
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(await readText(manifest)).toBe(beforeManifest);
      expect(await readText(lock)).toBe(beforeLock);
      expect(await readdir(path.join(scope.agentsDir, "capabilities"))).toEqual(beforeSnapshots);
      if (failure === "facet collision")
        expect(result.stdout).toContain("acf.facet.name-collision");
      if (failure === "unowned output") expect(result.stdout).toContain("acf.apply.unowned");
    } finally {
      await chmod(native, 0o755).catch(() => {});
      await cleanup(scope);
    }
  });
}
