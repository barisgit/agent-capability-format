import { expect, test } from "bun:test";
import path from "node:path";
import { piAdapter } from "../src";
import {
  byPath,
  codes,
  emitFixture,
  emitInput,
  fixtureRoot,
  parseJsonDiff,
  readFixtureCapability,
} from "./util/capability";
import { makeInMemoryFs } from "./util/in-memory-fs";

test("pi emits all six families without facet-unsupported and diagnoses partial triggers", async () => {
  const result = await emitFixture(piAdapter, ".pi", {
    [path.join(fixtureRoot, "skills/review/checklist.md")]: "# Review checklist\n",
  });
  const got = codes(result);
  expect(got).not.toContain("acf.adapter.facet-unsupported");
  expect(got).toContain("acf.adapter.trigger-unsupported");
  expect(
    result.diagnostics.some(
      (diag) =>
        diag.code === "acf.adapter.trigger-unsupported" &&
        diag.message.includes("operation_result"),
    ),
  ).toBe(true);
  expect(
    result.diagnostics.some(
      (diag) =>
        diag.code === "acf.adapter.trigger-unsupported" && diag.message.includes("file_context"),
    ),
  ).toBe(true);
  expect(byPath(result.diffs, ".agents/skills/research/SKILL.md")).toBeDefined();
  expect(byPath(result.diffs, ".agents/skills/review/checklist.md")).toBeDefined();
  expect(
    result.diffs.some((diff) =>
      diff.path.endsWith(".agents/skills/research/skills/review/checklist.md"),
    ),
  ).toBe(false);
  expect(result.diffs.some((diff) => diff.path.endsWith(".pi/skills/research/SKILL.md"))).toBe(
    false,
  );
  expect(byPath(result.diffs, ".pi/agents/reviewer.md")).toBeDefined();
  expect(byPath(result.diffs, ".pi/commands/fix.md")).toBeDefined();
  expect(byPath(result.diffs, ".pi/.acf/instructions/test-cap/always.md").after).toContain(
    "Always prefer small",
  );
  const hooks = (parseJsonDiff(byPath(result.diffs, ".pi/settings.json")).hooks ?? {}) as Record<
    string,
    unknown[]
  >;
  expect(JSON.stringify(hooks.tool_call_before)).toContain("acf:test-cap:pre_tool:guard");
  expect(JSON.stringify(hooks.pre_compact)).toContain("acf:test-cap:pre_compact:compact");
  expect(parseJsonDiff(byPath(result.diffs, ".pi/mcp.json")).mcpServers).toBeDefined();
});

test("pi emits native skills only when explicitly enabled", async () => {
  const capability = await readFixtureCapability();
  const result = await piAdapter.emit(
    emitInput(capability, ".pi", { skills: { native: true } }),
    makeInMemoryFs(),
  );

  expect(byPath(result.diffs, ".pi/skills/research/SKILL.md")).toBeDefined();
});
