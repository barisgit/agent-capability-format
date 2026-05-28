import path from "node:path";
import { expect, test } from "bun:test";
import { cleanup, makeScope, readText, runCaplet } from "../helpers";

test("caplet add appends a source to capabilities.yml", async () => {
  const scope = await makeScope();
  try {
    const source = `path:${path.join(scope.sourceRoot, "alpha")}`;
    const result = await runCaplet(scope, ["add", source, "--rename", "alpha-copy", "--cwd", scope.cwd, "--scope", "user"]);
    expect(result.exitCode).toBe(0);
    const manifest = await readText(path.join(scope.home, ".agents", "capabilities.yml"));
    expect(manifest).toContain("alpha-copy");
    expect(manifest).toContain(scope.sourceRoot);
  } finally {
    await cleanup(scope);
  }
});
