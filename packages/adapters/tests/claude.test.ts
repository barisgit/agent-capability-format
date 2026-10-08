import { expect, test } from "bun:test";
import { homedir } from "node:os";
import path from "node:path";
import { claudeAdapter } from "../src";
import {
  byPath,
  codes,
  emitFixture,
  emitInput,
  parseJsonDiff,
  readFixtureCapability,
} from "./util/capability";
import { makeInMemoryFs } from "./util/in-memory-fs";

test("claude emits all native artifacts with marker and JSON pointer ownership", async () => {
  const result = await emitFixture(claudeAdapter, ".claude");
  expect(result.diffs.some((diff) => diff.path.includes(".agents/skills"))).toBe(false);
  expect(byPath(result.diffs, ".claude/skills/research/SKILL.md").after).toContain(
    "Research skill",
  );
  const notice = byPath(result.diffs, ".claude/skills/research/ACF-MANAGED.md");
  expect(notice.after).toContain("Owning capability: `test-cap`");
  expect(notice.managementNotice).toBe("artifact");
  expect(notice.artifactRoot).toEndWith(".claude/skills/research");
  expect(byPath(result.diffs, ".claude/agents/reviewer.md").after).toContain("Review code");
  expect(byPath(result.diffs, ".claude/commands/fix.md").after).toContain("Fix an issue");
  const instructions = byPath(result.diffs, ".claude/CLAUDE.md");
  expect(instructions.after).toContain("<!-- acf:begin test-cap.always -->");
  expect(instructions.owns).toEqual([{ kind: "marker", name: "test-cap.always" }]);
  expect(byPath(result.diffs, ".claude/.acf/instructions/test-cap/triggered.md").after).toContain(
    "operation_result",
  );
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
  expect(JSON.stringify(parseJsonDiff(mcpDiff).mcpServers)).toContain(
    "https://mcp.example.com/docs",
  );
});

test("claude preserves unrelated shared JSON text and uses absolute user skill root", async () => {
  const cap = await readFixtureCapability("user");
  const fs = makeInMemoryFs({
    "/home/me/.claude/settings.json":
      '{"z":1,"hooks":{"PreToolUse":[{"acfMarker":"manual","keep":true}]}}\n',
  });
  const result = await claudeAdapter.emit(emitInput(cap, "/home/me/.claude"), fs);
  const settings = byPath(result.diffs, "/home/me/.claude/settings.json");
  expect(settings.after).toContain('{"z":1,"hooks"');
  expect(settings.after).toContain('{"acfMarker":"manual","keep":true}');
  expect(
    result.diffs.some(
      (diff) => diff.path === path.join(homedir(), ".agents", "skills", "research", "SKILL.md"),
    ),
  ).toBe(false);
  expect(
    result.diffs.some(
      (diff) => diff.path === path.join(homedir(), ".claude", "skills", "research", "SKILL.md"),
    ),
  ).toBe(true);
});

test("claude emits referenced skill assets to both roots when canonical is forced", async () => {
  const cap = await readFixtureCapability();
  const assetPath = path.join(cap.root, "skills", "research", "references", "guide.md");
  const result = await claudeAdapter.emit(
    emitInput(cap, ".claude", { skills: { canonical: true } }),
    makeInMemoryFs({ [assetPath]: "# Research Guide\n\nUse cited notes.\n" }),
  );
  expect(textAfter(byPath(result.diffs, ".agents/skills/research/references/guide.md"))).toContain(
    "Use cited notes",
  );
  expect(textAfter(byPath(result.diffs, ".claude/skills/research/references/guide.md"))).toContain(
    "Use cited notes",
  );
});

test("claude skill emission can suppress canonical or native destinations", async () => {
  const cap = await readFixtureCapability();
  const canonicalOff = await claudeAdapter.emit(
    emitInput(cap, ".claude", { skills: { canonical: false } }),
    makeInMemoryFs(),
  );
  expect(
    canonicalOff.diffs.some((diff) => diff.path.endsWith(".agents/skills/research/SKILL.md")),
  ).toBe(false);
  expect(
    canonicalOff.diffs.some((diff) => diff.path.endsWith(".claude/skills/research/SKILL.md")),
  ).toBe(true);

  const nativeOff = await claudeAdapter.emit(
    emitInput(cap, ".claude", { skills: { canonical: true, native: false } }),
    makeInMemoryFs(),
  );
  expect(
    nativeOff.diffs.some((diff) => diff.path.endsWith(".agents/skills/research/SKILL.md")),
  ).toBe(true);
  expect(
    nativeOff.diffs.some((diff) => diff.path.endsWith(".claude/skills/research/SKILL.md")),
  ).toBe(false);
});

test("claude emits referenced prose assets beside emitted prose files", async () => {
  const cap = await readFixtureCapability();
  const agentAsset = path.join(cap.root, "agents", "notes.md");
  const commandAsset = path.join(cap.root, "commands", "examples.md");
  const instructionAsset = path.join(cap.root, "instructions", "context.md");
  const result = await claudeAdapter.emit(
    emitInput(
      {
        ...cap,
        assets: [
          ...cap.assets,
          {
            path: "agents/notes.md",
            origin: "markdown",
            facet: { family: "agent", name: "reviewer" },
          },
          {
            path: "commands/examples.md",
            origin: "frontmatter",
            facet: { family: "command", name: "fix" },
          },
          {
            path: "instructions/context.md",
            origin: "markdown",
            facet: { family: "instruction", name: "triggered" },
          },
        ],
      },
      ".claude",
    ),
    makeInMemoryFs({
      [agentAsset]: "agent notes\n",
      [commandAsset]: "command examples\n",
      [instructionAsset]: "instruction context\n",
    }),
  );

  expect(textAfter(byPath(result.diffs, ".claude/agents/notes.md"))).toBe("agent notes\n");
  expect(textAfter(byPath(result.diffs, ".claude/commands/examples.md"))).toBe(
    "command examples\n",
  );
  expect(textAfter(byPath(result.diffs, ".claude/.acf/instructions/test-cap/context.md"))).toBe(
    "instruction context\n",
  );
});

test("claude rejects skill assets at the reserved management notice path", async () => {
  const cap = await readFixtureCapability();
  const sourcePath = path.join(cap.root, "skills", "research", "ACF-MANAGED.md");
  const result = await claudeAdapter.emit(
    emitInput(
      {
        ...cap,
        assets: [
          {
            path: "skills/research/ACF-MANAGED.md",
            origin: "frontmatter",
            facet: { family: "skill", name: "research" },
          },
        ],
      },
      ".claude",
    ),
    makeInMemoryFs({ [sourcePath]: "source-owned collision\n" }),
  );

  expect(codes(result)).toContain("acf.emit.managed-notice-reserved-path");
  expect(textAfter(byPath(result.diffs, ".claude/skills/research/ACF-MANAGED.md"))).toContain(
    "Owning capability: `test-cap`",
  );
  expect(result.diffs.some((diff) => diff.after === "source-owned collision\n")).toBe(false);
});

test("claude transports skill assets outside the skill directory with root-relative structure", async () => {
  const cap = await readFixtureCapability();
  const sharedAsset = path.join(cap.root, "shared", "outside.md");
  const result = await claudeAdapter.emit(
    emitInput(
      {
        ...cap,
        assets: [
          ...cap.assets,
          {
            path: "shared/outside.md",
            origin: "frontmatter",
            facet: { family: "skill", name: "research" },
          },
        ],
      },
      ".claude",
    ),
    makeInMemoryFs({ [sharedAsset]: "shared asset\n" }),
  );

  expect(textAfter(byPath(result.diffs, ".claude/skills/research/shared/outside.md"))).toBe(
    "shared asset\n",
  );
});

test("claude preserves binary asset bytes and executable mode", async () => {
  const cap = await readFixtureCapability();
  const binaryAsset = path.join(cap.root, "skills", "research", "image.png");
  const bytes = Uint8Array.from([0, 255, 1, 128]);
  const result = await claudeAdapter.emit(
    emitInput(
      {
        ...cap,
        assets: [
          {
            path: "skills/research/image.png",
            origin: "frontmatter",
            facet: { family: "skill", name: "research" },
          },
        ],
      },
      ".claude",
    ),
    makeInMemoryFs({ [binaryAsset]: { content: bytes, mode: 0o755 } }),
  );

  const diff = byPath(result.diffs, ".claude/skills/research/image.png");
  expect(diff.after).toEqual(bytes);
  expect(diff.afterMode).toBe(0o755);
  expect(codes(result)).not.toContain("acf.assets.unsupported");
});

function textAfter(diff: { after: string | Uint8Array | null }): string {
  if (diff.after === null) throw new Error("expected emitted content");
  return typeof diff.after === "string" ? diff.after : new TextDecoder().decode(diff.after);
}
