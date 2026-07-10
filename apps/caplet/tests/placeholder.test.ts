import { expect, test } from "bun:test";
import { cleanup, makeScope, runCaplet } from "./helpers";

test("caplet without a command shows help and succeeds", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, []);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USAGE caplet");
    expect(result.stderr).toBe("");
  } finally {
    await cleanup(scope);
  }
});
