import { expect, test } from "bun:test";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, runCaplet } from "../helpers";

test("the user .agents directory is never rediscovered as project scope", async () => {
  const scope = await makeScope();
  try {
    const capability = path.join(scope.home, ".agents", "capabilities", "alpha-cap");
    await mkdir(path.dirname(capability), { recursive: true });
    await cp(path.join(scope.sourceRoot, "alpha"), capability, { recursive: true });
    const cwd = path.join(scope.home, "Programming_local", "nested");
    await mkdir(cwd, { recursive: true });

    const result = await runCaplet(scope, ["ls", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.match(/alpha-cap {2}1\.0\.0/g)).toHaveLength(1);
    expect(result.stdout).toContain(`User  ${path.join(scope.home, ".agents")}`);
    expect(result.stdout).not.toContain("Project");
    expect(result.stdout).toContain("DONE  1 capability");
  } finally {
    await cleanup(scope);
  }
});
