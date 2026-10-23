import { expect, test } from "bun:test";
import { opencodeAdapter } from "../src";
import { codes, emitFixture } from "./util/capability";

test("opencode refuses hooks that require an executable plugin writer", async () => {
  const result = await emitFixture(opencodeAdapter, ".opencode");
  expect(
    result.diffs.some((diff) => diff.path.endsWith(".opencode/skills/research/SKILL.md")),
  ).toBe(false);
  expect(result.diffs.some((diff) => diff.path.endsWith("settings.json"))).toBe(false);
  expect(codes(result)).toContain("acf.support.refused");
});
