import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inspectSource } from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

test("inventory discovers one capability per shallow skills directory without mutating the source", async () => {
  const dir = await tempDir("acf-inventory-skills-");
  try {
    await writeText(
      path.join(dir, "skills", "pdf", "SKILL.md"),
      "---\nname: pdf\ndescription: PDF\n---\nBody.\n",
    );
    await writeText(
      path.join(dir, "skills", "docs", "SKILL.md"),
      "---\nname: docs\ndescription: Docs\n---\nBody.\n",
    );
    const before = await readFile(path.join(dir, "skills", "pdf", "SKILL.md"));
    const inventory = await inspectSource(dir);
    expect(inventory.candidates.map((item) => [item.name, item.selector])).toEqual([
      ["docs", "docs"],
      ["pdf", "pdf"],
    ]);
    expect(inventory.candidates.every((item) => item.synthesized)).toBe(true);
    expect(await Bun.file(path.join(dir, "acf.yml")).exists()).toBe(false);
    expect(await readFile(path.join(dir, "skills", "pdf", "SKILL.md"))).toEqual(before);
  } finally {
    await cleanup(dir);
  }
});

test("inventory applies manifested, root skill, skills directory, then one-level precedence", async () => {
  const manifested = await tempDir("acf-inventory-manifested-");
  const rootSkill = await tempDir("acf-inventory-root-");
  const oneLevel = await tempDir("acf-inventory-one-level-");
  try {
    await writeText(
      path.join(manifested, "acf", "authored", "acf.yml"),
      "acf: 1\nname: authored\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(manifested, "skills", "ignored", "SKILL.md"),
      "---\nname: ignored\ndescription: Ignored\n---\n",
    );
    expect(
      (await inspectSource(manifested)).candidates.map((item) => [item.name, item.selector]),
    ).toEqual([["authored", "authored"]]);

    await writeText(
      path.join(rootSkill, "SKILL.md"),
      "---\nname: root-skill\ndescription: Root\n---\n",
    );
    await writeText(
      path.join(rootSkill, "skills", "ignored", "SKILL.md"),
      "---\nname: ignored\ndescription: Ignored\n---\n",
    );
    expect((await inspectSource(rootSkill)).candidates.map((item) => item.name)).toEqual([
      "root-skill",
    ]);

    await writeText(
      path.join(oneLevel, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: Alpha\n---\n",
    );
    await writeText(
      path.join(oneLevel, "deep", "nested", "SKILL.md"),
      "---\nname: nested\ndescription: Nested\n---\n",
    );
    expect((await inspectSource(oneLevel)).candidates.map((item) => item.name)).toEqual(["alpha"]);
  } finally {
    await cleanup(manifested);
    await cleanup(rootSkill);
    await cleanup(oneLevel);
  }
});

test("inventory reports invalid layouts and duplicate declared names with source paths", async () => {
  const invalid = await tempDir("acf-inventory-invalid-");
  const duplicate = await tempDir("acf-inventory-duplicate-");
  try {
    await writeText(
      path.join(invalid, "deep", "nested", "SKILL.md"),
      "---\nname: nested\ndescription: Nested\n---\n",
    );
    const invalidResult = await inspectSource(invalid);
    expect(invalidResult.candidates).toEqual([]);
    expect(invalidResult.diagnostics.map((item) => item.code)).toContain(
      "acf.resolve.no-capabilities",
    );

    for (const directory of ["one", "two"]) {
      await writeText(
        path.join(duplicate, "skills", directory, "SKILL.md"),
        "---\nname: same\ndescription: Same\n---\n",
      );
    }
    const duplicateResult = await inspectSource(duplicate);
    const collision = duplicateResult.diagnostics.find(
      (item) => item.code === "acf.capability.name-collision",
    );
    expect(collision?.path).toContain(path.join("skills", "two"));
  } finally {
    await cleanup(invalid);
    await cleanup(duplicate);
  }
});

test("inventory reports a bare skill with malformed frontmatter YAML", async () => {
  const dir = await tempDir("acf-inventory-broken-");
  try {
    await writeText(
      path.join(dir, "skills", "pdf", "SKILL.md"),
      "---\nname: pdf\ndescription: [unclosed\n---\nBody.\n",
    );
    const inventory = await inspectSource(dir);
    expect(inventory.candidates).toEqual([]);
    expect(inventory.diagnostics.map((item) => item.code)).toEqual([
      "acf.import.skill-frontmatter-invalid",
    ]);
  } finally {
    await cleanup(dir);
  }
});
