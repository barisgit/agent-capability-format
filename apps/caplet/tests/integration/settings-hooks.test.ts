import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

for (const effect of ["observe", "block"] as const) {
  test(`apply refuses an unsupported ${effect} hook without changing host settings`, async () => {
    const scope = await makeScope();
    try {
      await writeText(
        path.join(scope.sourceRoot, "alpha", "hooks", "hooks.yml"),
        `pre_tool:\n  - name: guard-bash\n    effect: ${effect}\n    run:\n      command: "echo guard"\n    match:\n      operation: "shell"\n`,
      );
      const settingsPath = path.join(scope.cwd, ".opencode", "settings.json");
      const before = '{"userKey":"KEEP-ME"}\n';
      await writeText(settingsPath, before);
      const result = await runCaplet(scope, [
        "apply",
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        "--target",
        "opencode",
        "--json",
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('"acf.support.refused"');
      const report = JSON.parse(result.stdout) as { outcomes: unknown[] };
      expect(report.outcomes).toContainEqual(
        expect.objectContaining({
          capability: "alpha-cap",
          target: "opencode",
          family: "hook",
          component: "guard-bash",
          outcome: "blocked",
          source: "hook.run",
          recovery: expect.stringContaining("exclude"),
        }),
      );
      expect(await readText(settingsPath)).toBe(before);
    } finally {
      await cleanup(scope);
    }
  });
}
