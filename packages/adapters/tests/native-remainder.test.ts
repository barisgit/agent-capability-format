import { expect, test } from "bun:test";
import type { AcfCapability, NativeRemainderComponent } from "@caplet/core";
import { codexAdapter, piAdapter } from "../src";
import { CAP_ROOT, capabilityModel, emitModel, PROJECT, skillFacet, withCode } from "./util/model";

/** A Claude plugin with one skill and the given remainder, as the Claude plugin reader builds it. */
function claudePlugin(remainder: NativeRemainderComponent[]): AcfCapability {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "plain", description: "Plain skill" })],
    source: { format: "claude-plugin", path: ".", snapshotRoot: CAP_ROOT },
  });
  capability.remainder = remainder;
  return capability;
}

const guardHook: NativeRemainderComponent = {
  format: "claude-plugin",
  kind: "hook",
  name: "hooks",
  paths: ["hooks/hooks.json"],
  class: "restricting",
  executable: true,
};

const reviewerAgent: NativeRemainderComponent = {
  format: "claude-plugin",
  kind: "agent",
  name: "reviewer",
  paths: ["agents/reviewer.md"],
  class: "functional",
  executable: false,
};

test("a restricting Claude plugin hook refuses the whole package for a loose target", async () => {
  const result = await emitModel(codexAdapter, claudePlugin([guardHook]), `${PROJECT}/.codex`);
  const [refusal] = withCode(result, "acf.support.refused");
  expect(refusal?.targetId).toBe("codex");
  expect(refusal?.message).toContain("hook hooks");
  expect(refusal?.data).toMatchObject({ family: "hook", component: "hooks", blocks: "package" });
});

test("a functional Claude plugin agent is omitted for a loose target", async () => {
  const result = await emitModel(codexAdapter, claudePlugin([reviewerAgent]), `${PROJECT}/.codex`);
  expect(withCode(result, "acf.support.refused")).toEqual([]);
  const [omitted] = withCode(result, "acf.support.component-omitted");
  expect(omitted?.severity).toBe("lossy");
  expect(omitted?.data).toMatchObject({ family: "agent", component: "reviewer" });
  expect(result.diffs.some((diff) => diff.path.endsWith("plain/SKILL.md"))).toBe(true);
});

test("no shared skill copy is written when another reader refuses the package", async () => {
  const result = await emitModel(piAdapter, claudePlugin([guardHook]), `${PROJECT}/.pi`, {
    canonicalSkillReaders: ["codex", "pi"],
  });
  const written = result.diffs.map((diff) => diff.path);
  expect(written.some((file) => file.includes(".agents/skills/"))).toBe(false);
  expect(written.some((file) => file.endsWith(".pi/skills/plain/SKILL.md"))).toBe(true);
});
