import { expect, test } from "bun:test";
import path from "node:path";
import { pluginPackageDir, readCapability } from "@caplet/core";
import { claudeAdapter, opencodeAdapter } from "../src";
import { emitModel, filesAt, fileText, withCode } from "./util/model";
import { withTempPackage } from "./util/temp-package";

const SKILLS: Record<string, string> = {
  manual: "disable-model-invocation: true",
  hidden: "user-invocable: false",
  scoped: "paths:\n  - src/**",
};

test("an imported skill keeps each restricting key: written for Claude, refused for OpenCode", async () => {
  const files: Record<string, string> = {
    "acf.yml": "acf: 1\nname: imported\nversion: 0.0.0\n",
    ".acf-import.json": '{"acf":1,"synthesized":true}\n',
  };
  for (const [name, key] of Object.entries(SKILLS))
    files[`skills/${name}/SKILL.md`] =
      `---\nname: ${name}\ndescription: ${name} skill\n${key}\n---\nBody.\n`;
  await withTempPackage("acf-import-", files, async (root) => {
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
  });
});

test("an imported skill's Claude plugin holds none of caplet's bookkeeping", async () => {
  const files = {
    "acf.yml": "acf: 1\nname: fine\nversion: 0.0.0-unmanifested+local\n",
    ".acf-import.json": '{"acf":1,"synthesized":true}\n',
    "skills/fine/SKILL.md": "---\nname: fine\ndescription: Fine\n---\nBody.\n",
    "skills/fine/notes.md": "Notes.\n",
  };
  await withTempPackage("acf-import-", files, async (root) => {
    const capability = await readCapability(root, "project", { kind: "local", directory: root });
    const dir = pluginPackageDir(".claude", "fine");
    const pluginFiles = async (): Promise<string[]> =>
      (await emitModel(claudeAdapter, capability, ".claude", {}, filesAt(root, files))).diffs
        .map((diff) => path.relative(dir, diff.path))
        .sort();
    const expected = [".claude-plugin/plugin.json", "skills/fine/SKILL.md", "skills/fine/notes.md"];

    // Installed through a lock record, and read without one (a lock from before records).
    capability.source = {
      format: "skills",
      path: ".",
      snapshotRoot: path.join(root, "skills", "fine"),
    };
    expect(await pluginFiles()).toEqual(expected);
    delete capability.source;
    expect(await pluginFiles()).toEqual(expected);
  });
});
