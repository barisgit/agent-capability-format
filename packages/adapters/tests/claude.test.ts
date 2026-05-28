import { homedir } from "node:os";
import path from "node:path";
import { expect, test } from "bun:test";
import { claudeAdapter } from "../src";
import { byPath, emitFixture, emitInput, parseJsonDiff, readFixtureCapability } from "./util/capability";
import { makeInMemoryFs } from "./util/in-memory-fs";

test("claude emits all native artifacts with marker and JSON pointer ownership", async () => {
  const result = await emitFixture(claudeAdapter, ".claude");
  expect(byPath(result.diffs, ".agents/skills/research/SKILL.md").after).toContain("Research skill");
  expect(byPath(result.diffs, ".claude/agents/reviewer.md").after).toContain("Review code");
  expect(byPath(result.diffs, ".claude/commands/fix.md").after).toContain("Fix an issue");
  const instructions = byPath(result.diffs, ".claude/CLAUDE.md");
  expect(instructions.after).toContain("<!-- acf:begin test-cap.always -->");
  expect(instructions.owns).toEqual([{ kind: "marker", name: "test-cap.always" }]);
  expect(byPath(result.diffs, ".claude/.acf/instructions/test-cap/triggered.md").after).toContain("operation_result");
  expect(byPath(result.diffs, ".claude/hooks/test-cap__guard.sh").owns).toEqual([{ kind: "file" }]);
  const settingsDiff = byPath(result.diffs, ".claude/settings.json");
  expect(settingsDiff.owns.every((own) => own.kind === "json-pointer")).toBe(true);
  const hooks = parseJsonDiff(settingsDiff).hooks as Record<string, unknown[]>;
  expect(JSON.stringify(hooks.PreToolUse)).toContain("acf:test-cap:guard");
  expect(JSON.stringify(hooks.PreToolUse)).toContain("acf:test-cap:ask");
  expect(JSON.stringify(hooks.SessionStart)).toContain("acf:test-cap:init");
  const mcpDiff = byPath(result.diffs, ".mcp.json");
  expect(mcpDiff.owns).toContainEqual({ kind: "json-pointer", pointer: "/mcpServers/fs" });
  expect(mcpDiff.owns).toContainEqual({ kind: "json-pointer", pointer: "/mcpServers/docs" });
  expect(JSON.stringify(parseJsonDiff(mcpDiff).mcpServers)).toContain("https://mcp.example.com/docs");
});

test("claude preserves unrelated shared JSON text and uses absolute user skill root", async () => {
  const cap = await readFixtureCapability("user");
  const fs = makeInMemoryFs({
    "/home/me/.claude/settings.json": '{"z":1,"hooks":{"PreToolUse":[{"acfMarker":"manual","keep":true}]}}\n',
  });
  const result = await claudeAdapter.emit(emitInput(cap, "/home/me/.claude"), fs);
  const settings = byPath(result.diffs, "/home/me/.claude/settings.json");
  expect(settings.after).toContain('{"z":1,"hooks"');
  expect(settings.after).toContain('{"acfMarker":"manual","keep":true}');
  expect(result.diffs.some((diff) => diff.path === path.join(homedir(), ".agents", "skills", "research", "SKILL.md"))).toBe(true);
});
