import { expect, test } from "bun:test";
import { piAdapter } from "../src";
import { byPath, codes, emitFixture, parseJsonDiff } from "./util/capability";

test("pi emits all six families without facet-unsupported and diagnoses partial triggers", async () => {
  const result = await emitFixture(piAdapter, ".pi");
  const got = codes(result);
  expect(got).not.toContain("acf.adapter.facet-unsupported");
  expect(got).toContain("acf.adapter.trigger-unsupported");
  expect(result.diagnostics.some((diag) => diag.code === "acf.adapter.trigger-unsupported" && diag.message.includes("operation_result"))).toBe(true);
  expect(result.diagnostics.some((diag) => diag.code === "acf.adapter.trigger-unsupported" && diag.message.includes("file_context"))).toBe(true);
  expect(byPath(result.diffs, ".agents/skills/research/SKILL.md")).toBeDefined();
  expect(byPath(result.diffs, ".pi/agents/reviewer.md")).toBeDefined();
  expect(byPath(result.diffs, ".pi/commands/fix.md")).toBeDefined();
  expect(byPath(result.diffs, ".pi/.acf/instructions/test-cap/always.md").after).toContain("Always prefer small");
  const hooks = (parseJsonDiff(byPath(result.diffs, ".pi/settings.json")).hooks ?? {}) as Record<string, unknown[]>;
  expect(JSON.stringify(hooks.tool_call_before)).toContain("acf:test-cap:guard");
  expect(JSON.stringify(hooks.pre_compact)).toContain("acf:test-cap:compact");
  expect(parseJsonDiff(byPath(result.diffs, ".pi/mcp.json")).mcpServers).toBeDefined();
});
