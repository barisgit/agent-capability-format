import { expect, test } from "bun:test";
import { codexAdapter } from "../src";
import { byPath, codes, emitFixture } from "./util/capability";

test("codex emits other artifacts but refuses unsupported hooks", async () => {
  const result = await emitFixture(codexAdapter, ".codex");
  expect(byPath(result.diffs, ".agents/skills/research/SKILL.md").after).toContain(
    "Research skill",
  );
  expect(result.diffs.some((diff) => diff.path.endsWith(".codex/skills/research/SKILL.md"))).toBe(
    false,
  );
  expect(byPath(result.diffs, ".codex/agents/reviewer.md").after).toContain("Review code");
  expect(byPath(result.diffs, ".codex/commands/fix.md").after).toContain("Fix an issue");
  expect(codes(result)).toContain("acf.support.refused");
  expect(result.diffs.some((diff) => diff.path.endsWith("settings.json"))).toBe(false);
  const config = Bun.TOML.parse(String(byPath(result.diffs, ".codex/config.toml").after)) as {
    mcp_servers: Record<string, { args: string[] }>;
  };
  expect(config.mcp_servers.fs?.args[0]).toEndWith("server.js");
});
