import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

for (const damage of ["malformed JSON", "directory"] as const) {
  test(`invalid lock input is a path-specific diagnostic (${damage})`, async () => {
    const scope = await makeScope();
    try {
      const lockPath = path.join(scope.agentsDir, "capabilities.lock");
      const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
      const before = await readText(manifestPath);
      if (damage === "directory") await mkdir(lockPath);
      else await writeText(lockPath, "{\n");
      const code = damage === "directory" ? "acf.lock.unreadable" : "acf.lock.invalid";
      for (const args of [["apply"], ["list"], ["check"], ["check", "--frozen"]]) {
        const result = await runCaplet(scope, [
          ...args,
          "--cwd",
          scope.cwd,
          "--scope",
          "project",
          "--json",
        ]);
        expect(result.exitCode).toBe(2);
        const envelope = JSON.parse(result.stdout);
        expect(envelope).toMatchObject({
          ok: false,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              severity: "error",
              code,
              path: lockPath,
              message: expect.stringContaining(lockPath),
            }),
          ]),
        });
        if (args[0] === "check") expect(envelope.result).toBe("invalid");
        expect(result.stderr).not.toContain("at ");
      }
      const human = await runCaplet(scope, ["apply", "--cwd", scope.cwd, "--scope", "project"]);
      expect(human.exitCode).toBe(2);
      expect(human.stdout + human.stderr).toContain(lockPath);
      expect(await readText(manifestPath)).toBe(before);
    } finally {
      await cleanup(scope);
    }
  });
}
