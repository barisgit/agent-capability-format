import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet } from "../helpers";

for (const flag of ["-C", "--cwd"]) {
  test(`${flag} resolves a relative project once for every command`, async () => {
    const scope = await makeScope();
    try {
      await mkdir(path.join(scope.dir, "fresh"));
      const initialized = await runCaplet(scope, ["init", flag, "fresh"], {}, scope.dir);
      expect(initialized.exitCode).toBe(0);
      expect(await readText(path.join(scope.dir, "fresh", ".agents", "capabilities.yml"))).toBe(
        "acf: 1\ncapabilities: []\n",
      );
      const relative = "project";
      const run = (args: string[]) => runCaplet(scope, [...args, flag, relative], {}, scope.dir);
      // If a command resolves the flag again after chdir, it must not silently use this tree.
      const nested = path.resolve(scope.cwd, relative);
      const fetched = await runCaplet(scope, [
        "update",
        "--cwd",
        scope.cwd,
        "--no-apply",
        "--json",
      ]);
      expect(fetched.exitCode).toBe(0);
      const commands = [
        ["init"],
        ["status", "--json"],
        ["apply", "--target", "codex", "-y", "--json"],
        ["check", "--target", "codex", "--json"],
        ["update", "--target", "codex", "-y", "--json"],
        ["remove", "alpha-cap", "-y", "--json"],
        ["add", path.join(scope.sourceRoot, "alpha"), "--target", "codex", "-y", "--json"],
        ["list", "--json"],
        ["show", "alpha-cap", "--json"],
        ["doctor", "--json"],
        ["remove", "alpha-cap", "-y", "--json"],
      ];
      for (const args of commands) {
        if (args[0] === "apply") await mkdir(nested, { recursive: true });
        const result = await run(args);
        expect(result.stderr).not.toContain("ENOENT");
        expect(result.exitCode, `${args[0]}: ${result.stdout}\n${result.stderr}`).toBe(0);
        if (args[0] === "apply") {
          expect(await readText(path.join(scope.agentsDir, "capabilities.lock"))).toContain(
            "alpha-cap",
          );
          expect(await Bun.file(path.join(nested, ".agents", "capabilities.lock")).exists()).toBe(
            false,
          );
          expect(await Bun.file(path.join(scope.cwd, ".codex", "config.toml")).exists()).toBe(true);
        }
        if (args[0] === "show") expect(result.stdout).toContain("alpha-cap");
      }
      expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).not.toContain(
        `path:${path.join(scope.sourceRoot, "alpha")}`,
      );
    } finally {
      await cleanup(scope);
    }
  });
}
