import { expect, test } from "bun:test";
import { chmod, mkdir, readdir, rm } from "node:fs/promises";
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

test("failed add relinquishes adopted files before a later apply", async () => {
  const scope = await makeScope();
  const native = path.join(scope.cwd, ".codex");
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    const source = path.join(scope.sourceRoot, "new");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: new\nversion: 1.0.0\n");
    await writeText(
      path.join(source, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Demo\n---\nDemo.\n",
    );
    await writeText(
      path.join(source, "agents", "helper.md"),
      "---\nname: helper\ndescription: Helper\n---\nHelp.\n",
    );
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "codex", "--json"];
    expect((await runCaplet(scope, ["add", source, ...args])).exitCode).toBe(0);
    const adopted = path.join(scope.agentsDir, "skills", "demo", "SKILL.md");
    const bytes = await readText(adopted);
    expect((await runCaplet(scope, ["remove", "new", ...args])).exitCode).toBe(0);
    await writeText(adopted, bytes);
    const sidecar = path.join(scope.agentsDir, ".acf-managed.json");
    const ownership = await readText(sidecar);
    await rm(native, { recursive: true, force: true });
    await mkdir(native);
    await chmod(native, 0o555);
    const failed = await runCaplet(scope, ["add", source, ...args]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain("EACCES");
    expect(await readText(sidecar)).toBe(ownership);
    await chmod(native, 0o755);
    expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
    expect(await readText(adopted)).toBe(bytes);
  } finally {
    await chmod(native, 0o755).catch(() => {});
    await cleanup(scope);
  }
});

test("rollback skips an unchanged read-only sidecar and restores later roots", async () => {
  const scope = await makeScope();
  const cursor = path.join(scope.cwd, ".cursor");
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    const source = path.join(scope.sourceRoot, "new");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: new\nversion: 1.0.0\n");
    await writeText(
      path.join(source, "agents", "helper.md"),
      "---\nname: helper\ndescription: Helper\nonly: [codex]\n---\nHelp.\n",
    );
    await writeText(
      path.join(source, "instructions", "always.md"),
      "---\nname: always\ndescription: Always\nactivation:\n  when:\n    file_context:\n      paths: ['**/*.ts']\nonly: [cursor]\n---\nHelp.\n",
    );
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "cursor,codex", "--json"];
    expect((await runCaplet(scope, ["add", source, ...args])).exitCode).toBe(0);
    const adopted = path.join(scope.cwd, ".codex", "agents", "helper.md");
    const bytes = await readText(adopted);
    expect((await runCaplet(scope, ["remove", "new", ...args])).exitCode).toBe(0);
    await writeText(adopted, bytes);
    const sidecars = [cursor, path.join(scope.cwd, ".codex")].map((root) =>
      path.join(root, ".acf-managed.json"),
    );
    const before = await Promise.all(sidecars.map(readText));
    await chmod(cursor, 0o555);
    const failed = await runCaplet(scope, ["add", source, ...args]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain("EACCES");
    expect(failed.stderr).not.toContain("rollback failed");
    expect(await Promise.all(sidecars.map(readText))).toEqual(before);
    await chmod(cursor, 0o755);
    expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
    expect(await readText(adopted)).toBe(bytes);
  } finally {
    await chmod(cursor, 0o755).catch(() => {});
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
