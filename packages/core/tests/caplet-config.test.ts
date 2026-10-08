import { expect, test } from "bun:test";
import { capletConfigSchema } from "../src/caplet-config/index.js";

test("targets.claude.carrier accepts plugin and loose", () => {
  for (const carrier of ["plugin", "loose"]) {
    const parsed = capletConfigSchema.safeParse({ targets: { claude: { carrier } } });
    expect(parsed.success).toBe(true);
  }
});

test("a plugin carrier for a target without one fails naming the target and its carriers", () => {
  const parsed = capletConfigSchema.safeParse({ targets: { codex: { carrier: "plugin" } } });

  expect(parsed.success).toBe(false);
  const issue = parsed.error?.issues[0];
  expect(issue?.path).toEqual(["targets", "codex", "carrier"]);
  expect(issue?.message).toBe(
    "targets.codex.carrier: plugin is not available for codex; only loose is available",
  );
});
