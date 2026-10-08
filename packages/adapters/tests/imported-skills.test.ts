import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readCapability } from "@caplet/core";
import { claudeAdapter, opencodeAdapter } from "../src";
import { emitModel, fileText, withCode } from "./util/model";

const SKILLS: Record<string, string> = {
  manual: "disable-model-invocation: true",
  hidden: "user-invocable: false",
  scoped: "paths:\n  - src/**",
};

test("an imported skill keeps each restricting key: written for Claude, refused for OpenCode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "acf-import-"));
  try {
    await writeFile(path.join(root, "acf.yml"), "acf: 1\nname: imported\nversion: 0.0.0\n");
    await writeFile(path.join(root, ".acf-import.json"), '{"acf":1,"synthesized":true}\n');
    for (const [name, key] of Object.entries(SKILLS)) {
      await mkdir(path.join(root, "skills", name), { recursive: true });
      await writeFile(
        path.join(root, "skills", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill\n${key}\n---\nBody.\n`,
      );
    }
    const capability = await readCapability(root, "project", { kind: "local", directory: root });

    const claude = await emitModel(claudeAdapter, capability, ".claude", { carrier: "loose" });
    for (const [name, key] of Object.entries(SKILLS)) {
      expect(fileText(claude, `.claude/skills/${name}/SKILL.md`)).toContain(key);
    }
    expect(withCode(claude, "acf.support.refused")).toEqual([]);

    const opencode = await emitModel(opencodeAdapter, capability, ".opencode", {
      canonicalSkillReaders: ["opencode"],
    });
    expect(opencode.diffs.filter((diff) => diff.path.includes("/skills/"))).toEqual([]);
    const refused = withCode(opencode, "acf.support.refused").map((item) => item.data?.component);
    expect(refused.sort()).toEqual(Object.keys(SKILLS).sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
