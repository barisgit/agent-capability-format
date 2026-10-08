import { expect, test } from "bun:test";
import { claudeAdapter, codexAdapter, opencodeAdapter, piAdapter } from "../src";
import { capabilityModel, emitModel, fileText, skillFacet, withCode } from "./util/model";

const manualOnly = skillFacet({
  name: "deploy",
  description: "Deploy the service",
  invocation: { model: false },
});

test("native serialization keeps canonical-only keys out of SKILL.md", async () => {
  const capability = capabilityModel({
    skills: [
      skillFacet({
        name: "review",
        description: "Review code",
        only: ["claude", "pi"],
        invocation: { user: true },
        targets: { pi: { native: { foo: "bar" } } },
      }),
    ],
  });
  const result = await emitModel(piAdapter, capability, ".pi", { canonicalSkillReaders: ["pi"] });
  const skill = fileText(result, ".agents/skills/review/SKILL.md");
  expect(skill).toContain("foo: bar");
  for (const key of ["only:", "targets:", "invocation:"]) expect(skill).not.toContain(key);
});

test("manual-only skill carries disable-model-invocation to Claude and Pi", async () => {
  const capability = capabilityModel({ skills: [manualOnly] });
  const claude = await emitModel(claudeAdapter, capability, ".claude");
  const pi = await emitModel(piAdapter, capability, ".pi", { canonicalSkillReaders: ["pi"] });
  expect(fileText(claude, ".claude/skills/deploy/SKILL.md")).toContain(
    "disable-model-invocation: true",
  );
  expect(fileText(pi, ".agents/skills/deploy/SKILL.md")).toContain(
    "disable-model-invocation: true",
  );
});

test("Codex receives invocation.model: false in agents/openai.yaml", async () => {
  const capability = capabilityModel({ skills: [manualOnly] });
  const result = await emitModel(codexAdapter, capability, ".codex", {
    canonicalSkillReaders: ["codex"],
  });
  expect(fileText(result, ".agents/skills/deploy/agents/openai.yaml")).toBe(
    "policy:\n  allow_implicit_invocation: false\n",
  );
  const skill = fileText(result, ".agents/skills/deploy/SKILL.md");
  expect(skill).not.toContain("invocation");
});

test("user-only skill is refused for Codex without writing files", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "deploy", description: "Deploy", invocation: { user: false } })],
  });
  const result = await emitModel(codexAdapter, capability, ".codex", {
    canonicalSkillReaders: ["codex"],
  });
  expect(result.diffs.filter((diff) => diff.path.includes("deploy"))).toEqual([]);
  const [refusal] = withCode(result, "acf.support.refused");
  expect(refusal?.data?.component).toBe("deploy");
  expect(refusal?.message).toContain("skill.invocation.user=false");
});

test("shared root is not written when one discovering target refuses the skill", async () => {
  const capability = capabilityModel({ skills: [manualOnly] });
  const options = { canonicalSkillReaders: ["pi", "opencode"] };
  const pi = await emitModel(piAdapter, capability, ".pi", options);
  const opencode = await emitModel(opencodeAdapter, capability, ".opencode", options);
  for (const result of [pi, opencode]) {
    expect(result.diffs.some((diff) => diff.path.includes(".agents/skills"))).toBe(false);
  }
  expect(fileText(pi, ".pi/skills/deploy/SKILL.md")).toContain("disable-model-invocation: true");
  expect(opencode.diffs).toEqual([]);
  expect(withCode(opencode, "acf.support.refused")[0]?.targetId).toBe("opencode");
});

test("shared root carries one rendering that satisfies every discovering target", async () => {
  const capability = capabilityModel({ skills: [manualOnly] });
  const options = { canonicalSkillReaders: ["codex", "pi"] };
  const codex = await emitModel(codexAdapter, capability, ".codex", options);
  const pi = await emitModel(piAdapter, capability, ".pi", options);
  const shared = (result: typeof codex) =>
    result.diffs
      .filter((diff) => diff.path.includes(".agents/skills"))
      .map((diff) => [diff.path, diff.after]);
  expect(shared(codex)).toEqual(shared(pi));
  expect(fileText(pi, ".agents/skills/deploy/SKILL.md")).toContain(
    "disable-model-invocation: true",
  );
  expect(fileText(pi, ".agents/skills/deploy/agents/openai.yaml")).toContain(
    "allow_implicit_invocation: false",
  );
});

test("a target-specific extra moves every discovering target to its native root", async () => {
  const capability = capabilityModel({
    skills: [
      skillFacet({
        name: "review",
        description: "Review code",
        targets: { pi: { native: { foo: "bar" } } },
      }),
    ],
  });
  const options = { canonicalSkillReaders: ["codex", "pi"] };
  const codex = await emitModel(codexAdapter, capability, ".codex", options);
  const pi = await emitModel(piAdapter, capability, ".pi", options);
  expect(fileText(pi, ".pi/skills/review/SKILL.md")).toContain("foo: bar");
  expect(fileText(codex, ".codex/skills/review/SKILL.md")).not.toContain("foo");
  expect(withCode(codex, "acf.extras.dropped")[0]?.data?.dropped).toBe("targets.pi.native.foo");
  for (const result of [codex, pi]) {
    expect(result.diffs.some((diff) => diff.path.includes(".agents/skills"))).toBe(false);
  }
});

test("a skill excluded for one discovering target is not written to the shared root", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review", only: ["pi"] })],
  });
  const pi = await emitModel(piAdapter, capability, ".pi", {
    canonicalSkillReaders: ["codex", "pi"],
  });
  expect(pi.diffs.some((diff) => diff.path.includes(".agents/skills"))).toBe(false);
  expect(fileText(pi, ".pi/skills/review/SKILL.md")).toBeDefined();
});

test("Claude-only selection writes no canonical copy", async () => {
  const capability = capabilityModel({ skills: [manualOnly] });
  const result = await emitModel(claudeAdapter, capability, ".claude", {
    canonicalSkillReaders: [],
  });
  expect(result.diffs.some((diff) => diff.path.includes(".agents/skills"))).toBe(false);
  expect(fileText(result, ".claude/skills/deploy/SKILL.md")).toBeDefined();
});

test("a Claude grant stays with Claude and is reported as not carried to Codex", async () => {
  const capability = capabilityModel({
    skills: [
      skillFacet({
        name: "git",
        description: "Git helper",
        targets: { claude: { native: { "allowed-tools": "Bash(git *)", when_to_use: "git" } } },
      }),
    ],
  });
  const claude = await emitModel(claudeAdapter, capability, ".claude");
  const codex = await emitModel(codexAdapter, capability, ".codex", {
    canonicalSkillReaders: ["codex"],
  });
  const claudeSkill = fileText(claude, ".claude/skills/git/SKILL.md");
  expect(claudeSkill).toContain("allowed-tools: Bash(git *)");
  expect(claudeSkill).toContain("when_to_use: git");
  expect(fileText(codex, ".agents/skills/git/SKILL.md")).not.toContain("allowed-tools");
  const dropped = withCode(codex, "acf.extras.dropped").map(
    (diagnostic) => diagnostic.data?.dropped,
  );
  expect(dropped).toEqual([
    "targets.claude.native.allowed-tools",
    "targets.claude.native.when_to_use",
  ]);
});

test("argument-hint is native for Claude and degraded elsewhere", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "fix", description: "Fix", "argument-hint": "[issue]" })],
  });
  const claude = await emitModel(claudeAdapter, capability, ".claude");
  const pi = await emitModel(piAdapter, capability, ".pi", { canonicalSkillReaders: ["pi"] });
  expect(fileText(claude, ".claude/skills/fix/SKILL.md")).toContain("argument-hint: ");
  expect(fileText(pi, ".agents/skills/fix/SKILL.md")).not.toContain("argument-hint");
  expect(withCode(pi, "acf.support.degraded")[0]?.data?.dropped).toBe("skill.argument-hint");
});
