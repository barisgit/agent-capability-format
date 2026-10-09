import { expect, test } from "bun:test";
import { opencodeAdapter } from "../src";
import { byPath, emitFixture, parseJsonDiff } from "./util/capability";

test("opencode maps canonical hook events to native event names", async () => {
  const result = await emitFixture(opencodeAdapter, ".opencode");
  expect(
    result.diffs.some((diff) => diff.path.endsWith(".opencode/skills/research/SKILL.md")),
  ).toBe(false);
  const hooks = parseJsonDiff(byPath(result.diffs, ".opencode/settings.json")).hooks as Record<
    string,
    unknown[]
  >;
  expect(JSON.stringify(hooks["session.compact.before"])).toContain(
    "acf:test-cap:pre_compact:compact",
  );
  expect(JSON.stringify(hooks["permission.asked"])).toContain(
    "acf:test-cap:permission_request:ask",
  );
  expect(JSON.stringify(hooks["tool.execute.before"])).toContain("acf:test-cap:pre_tool:guard");
});
