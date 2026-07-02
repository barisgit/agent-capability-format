import { expect, test } from "bun:test";
import { cursorAdapter } from "../src";
import { byPath, codes, emitFixture, parseJsonDiff } from "./util/capability";

test("cursor emits MCP and file_context rule while diagnosing unsupported hooks", async () => {
  const result = await emitFixture(cursorAdapter, ".cursor");
  const got = codes(result);
  expect(got).toContain("acf.adapter.facet-unsupported");
  expect(
    result.diagnostics.some(
      (diag) => diag.code === "acf.adapter.facet-unsupported" && diag.family === "hook",
    ),
  ).toBe(true);
  expect(
    result.diagnostics.some(
      (diag) =>
        diag.code === "acf.adapter.trigger-unsupported" &&
        diag.message.includes("operation_result"),
    ),
  ).toBe(true);
  expect(byPath(result.diffs, ".agents/skills/research/SKILL.md").after).toContain(
    "Research skill",
  );
  expect(result.diffs.some((diff) => diff.path.includes(".cursor/skills"))).toBe(false);
  const rule = byPath(result.diffs, ".cursor/rules/test-cap__triggered.mdc");
  expect(rule.after).toContain("globs:");
  expect(rule.after).toContain("**/*.ts");
  expect(
    JSON.stringify(parseJsonDiff(byPath(result.diffs, ".cursor/mcp.json")).mcpServers),
  ).toContain("https://mcp.example.com/docs");
});
