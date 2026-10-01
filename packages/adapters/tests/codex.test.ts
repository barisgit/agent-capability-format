import { expect, test } from "bun:test";
import { codexAdapter } from "../src";
import { byPath, codes, emitFixture, parseJsonDiff } from "./util/capability";

test("codex emits artifacts and diagnoses unsupported pre_compact hook event", async () => {
  const result = await emitFixture(codexAdapter, ".codex");
  expect(byPath(result.diffs, ".agents/skills/research/SKILL.md").after).toContain(
    "Research skill",
  );
  expect(result.diffs.some((diff) => diff.path.endsWith(".codex/skills/research/SKILL.md"))).toBe(
    false,
  );
  expect(byPath(result.diffs, ".codex/agents/reviewer.md").after).toContain("Review code");
  expect(byPath(result.diffs, ".codex/commands/fix.md").after).toContain("Fix an issue");
  expect(codes(result)).toContain("acf.adapter.hook-event-unsupported");
  const hooks = parseJsonDiff(byPath(result.diffs, ".codex/settings.json")).hooks as Record<
    string,
    unknown[]
  >;
  expect(hooks.PreCompact).toBeUndefined();
  expect(JSON.stringify(hooks.PermissionRequest)).toContain("acf:test-cap:ask");
  expect(
    JSON.stringify(parseJsonDiff(byPath(result.diffs, ".codex/mcp.json")).mcpServers),
  ).toContain("server.js");
});
