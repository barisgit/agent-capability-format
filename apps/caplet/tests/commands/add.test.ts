import path from "node:path";
import { expect, test } from "bun:test";
import { cleanup, makeScope, readText, runCaplet } from "../helpers";

test("caplet add writes a source that fetch can resolve", async () => {
  const scope = await makeScope();
  try {
    const source = `path:${path.join(scope.sourceRoot, "alpha")}`;
    const result = await runCaplet(scope, ["add", source, "--rename", "alpha-copy", "--cwd", scope.cwd, "--scope", "user"]);
    expect(result.exitCode).toBe(0);
    const manifest = await readText(path.join(scope.home, ".agents", "capabilities.yml"));
    expect(manifest).toContain("alpha-copy");
    expect(manifest).toContain(scope.sourceRoot);

    const fetched = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "user"]);
    expect(fetched.exitCode).toBe(0);
    expect(await Bun.file(path.join(scope.home, ".agents", "capabilities", "alpha-copy", "acf.yml")).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});
