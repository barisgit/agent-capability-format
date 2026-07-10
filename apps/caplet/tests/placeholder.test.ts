import { expect, test } from "bun:test";
import { cleanup, makeScope, runCaplet } from "./helpers";

test("caplet without a command shows help and succeeds", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, []);
    expect(result.exitCode).toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain("USAGE caplet");
    expect(output).not.toContain("No command specified");
  } finally {
    await cleanup(scope);
  }
});
