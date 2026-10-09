import { expect, test } from "bun:test";
import { claudeAdapter, codexAdapter, opencodeAdapter, piAdapter } from "../src";
import { CAP_ROOT, capabilityModel, emitModel, fileText, skillFacet, withCode } from "./util/model";

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
  const claude = await emitModel(claudeAdapter, capability, ".claude", { carrier: "loose" });
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

test("a server another discovering target refuses keeps the skill out of the shared root", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review code" })],
    servers: [
      {
        name: "search",
        transport: "stdio",
        command: "search-server",
        targets: { codex: { native: { disabled_tools: ["delete"] } } },
      },
    ],
  });
  const options = { canonicalSkillReaders: ["codex", "pi"] };
  const codex = await emitModel(codexAdapter, capability, ".codex", options);
  const pi = await emitModel(piAdapter, capability, ".pi", options);
  expect(withCode(pi, "acf.support.refused")[0]?.data?.component).toBe("search");
  expect(codex.diffs.some((diff) => diff.path.includes(".agents/skills"))).toBe(false);
  expect(fileText(codex, ".codex/skills/review/SKILL.md")).toContain("name: review");
});

function withBundledMetadata(yaml: string) {
  const capability = capabilityModel({ skills: [manualOnly] });
  capability.assets = [
    {
      path: "skills/deploy/agents/openai.yaml",
      origin: "implicit",
      facet: { family: "skill", name: "deploy" },
    },
  ];
  return emitModel(
    codexAdapter,
    capability,
    ".codex",
    { canonicalSkillReaders: ["codex"] },
    {
      [`${CAP_ROOT}/skills/deploy/agents/openai.yaml`]: yaml,
    },
  );
}

test("a bundled agents/openai.yaml keeps its keys and gains the generated policy", async () => {
  const result = await withBundledMetadata(
    "# Shown in the Codex app\ninterface:\n  display_name: Deploy\npolicy:\n  products: [codex]\n",
  );
  expect(fileText(result, ".agents/skills/deploy/agents/openai.yaml")).toBe(
    "# Shown in the Codex app\ninterface:\n  display_name: Deploy\npolicy:\n  products: [ codex ]\n  allow_implicit_invocation: false\n",
  );
  expect(withCode(result, "acf.extras.conflict")).toEqual([]);
});

test("a bundled agents/openai.yaml that contradicts a generated key is a conflict", async () => {
  const result = await withBundledMetadata("policy:\n  allow_implicit_invocation: true\n");
  const [conflict] = withCode(result, "acf.extras.conflict");
  expect(conflict?.severity).toBe("error");
  expect(conflict?.path).toBe("skills/deploy/agents/openai.yaml");
  expect(conflict?.message).toContain("policy.allow_implicit_invocation");
});

test("Claude-only selection writes no canonical copy", async () => {
  const capability = capabilityModel({ skills: [manualOnly] });
  const result = await emitModel(claudeAdapter, capability, ".claude", {
    carrier: "loose",
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
  const claude = await emitModel(claudeAdapter, capability, ".claude", { carrier: "loose" });
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
  const claude = await emitModel(claudeAdapter, capability, ".claude", { carrier: "loose" });
  const pi = await emitModel(piAdapter, capability, ".pi", { canonicalSkillReaders: ["pi"] });
  expect(fileText(claude, ".claude/skills/fix/SKILL.md")).toContain("argument-hint: ");
  expect(fileText(pi, ".agents/skills/fix/SKILL.md")).not.toContain("argument-hint");
  expect(withCode(pi, "acf.support.degraded")[0]?.data?.dropped).toBe("skill.argument-hint");
});

test("Claude body placeholders are reported where the target does not expand them", async () => {
  const skillDir = ["$", "{CLAUDE_SKILL_DIR}"].join("");
  const placeholders = skillFacet(
    { name: "triage", description: "Triage an issue" },
    `Triage issue $ARGUMENTS ($ARGUMENTS[0] first) with ${skillDir}/checklist.md.\n`,
  );
  const plain = skillFacet({ name: "plain", description: "Plain" }, "Costs $5.\n");
  const capability = capabilityModel({ skills: [placeholders, plain] });

  const codex = await emitModel(codexAdapter, capability, "/project/.codex");
  expect(withCode(codex, "acf.skill.placeholder-unexpanded")).toEqual([
    expect.objectContaining({
      severity: "lossy",
      message: `codex does not expand the Claude placeholders $ARGUMENTS, $ARGUMENTS[0], ${skillDir} in the body of skill triage; they reach it as written`,
    }),
  ]);
  expect(fileText(codex, "triage/SKILL.md")).toContain("Triage issue $ARGUMENTS");
  const claude = await emitModel(claudeAdapter, capability, "/project/.claude");
  expect(withCode(claude, "acf.skill.placeholder-unexpanded")).toEqual([]);
});

test("a dotted Codex extra naming __proto__ is written as its own key, not through the prototype", async () => {
  const capability = capabilityModel({
    skills: [
      skillFacet({
        name: "review",
        description: "Review",
        targets: { codex: { native: { "__proto__.reviewPolluted": "yes", "constructor.x": 1 } } },
      }),
    ],
  });
  const result = await emitModel(codexAdapter, capability, ".codex", {
    canonicalSkillReaders: ["codex"],
  });
  expect(Object.hasOwn(Object.prototype, "reviewPolluted")).toBe(false);
  expect(fileText(result, ".agents/skills/review/agents/openai.yaml")).toBe(
    "__proto__:\n  reviewPolluted: yes\nconstructor:\n  x: 1\n",
  );
});
