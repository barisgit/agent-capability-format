import { expect, test } from "bun:test";
import { nativeExtras } from "../src";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("skills require directory shape", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skills/bad.md": "---\nname: bad\ndescription: Bad\n---\n",
  });
  try {
    expect(codes(cap)).toContain("acf.skill.shape.not-directory");
  } finally {
    await cleanup(dir);
  }
});

test("skill frontmatter validates and basename must match name", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skills/right/SKILL.md": "---\nname: wrong\ndescription: Mismatch\n---\nbody\n",
  });
  try {
    expect(codes(cap)).toContain("acf.facet.name-mismatch");
  } finally {
    await cleanup(dir);
  }
});

test("import marker allows missing descriptions and collects every portable skill file", async () => {
  const skillBytes = "---\nname: imported\n---\nBody.\n";
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: imported\nversion: 0.0.0-unmanifested+local\n",
    ".acf-import.json": '{"acf":1,"synthesized":true}\n',
    "skills/imported/SKILL.md": skillBytes,
    "skills/imported/references/guide.md": "Guide\n",
    "skills/imported/scripts/run.py": "print('ok')\n",
    "skills/imported/.cache/hidden.md": "hidden\n",
    "skills/imported/node_modules/pkg/index.js": "dependency\n",
    "skills/imported/ACF-MANAGED.md": "managed\n",
  });
  try {
    expect(codes(cap)).toContain("acf.import.skill-description-missing");
    expect(cap.skills[0]?.frontmatter.description).toBe("Imported skill");
    expect(cap.assets.map((asset) => asset.path)).toEqual([
      "skills/imported/references/guide.md",
      "skills/imported/scripts/run.py",
    ]);
    expect(await Bun.file(cap.skills[0]?.primaryFile ?? "").text()).toBe(skillBytes);
  } finally {
    await cleanup(dir);
  }
});

test("import marker keeps every bare skill key: core, per target, or agent-plugins", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: imported\nversion: 0.0.0-unmanifested+local\n",
    ".acf-import.json": '{"acf":1,"synthesized":true}\n',
    "skills/guarded/SKILL.md":
      "---\nname: guarded\ndescription: Guarded\ndisable-model-invocation: true\n" +
      "user-invocable: false\npaths:\n  - src/**\nallowed-tools: Read\nx-team: docs\n---\nBody.\n",
  });
  try {
    const frontmatter = cap.skills[0]?.frontmatter;
    expect(frontmatter?.invocation).toEqual({ model: false, user: false });
    const targets = frontmatter?.targets;
    expect(nativeExtras(targets, "claude")).toEqual({ paths: ["src/**"], "allowed-tools": "Read" });
    expect(nativeExtras(targets, "cursor")).toEqual({});
    expect(nativeExtras(targets, "agent-plugins")).toEqual({ "x-team": "docs" });
    expect(codes(cap)).not.toContain("acf.markdown.unknown-frontmatter-field");
    expect(cap.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});

test("authored capabilities do not gain implicit skill assets", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skills/authored/SKILL.md": "---\nname: authored\ndescription: Authored\n---\nBody.\n",
    "skills/authored/unreferenced.txt": "not an asset\n",
  });
  try {
    expect(cap.assets).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});

test("malformed frontmatter YAML is reported per file instead of aborting the read", async () => {
  const broken = "---\nname: x\ndescription: [unclosed\n---\nbody\n";
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "ACF.md": broken,
    "skills/review/SKILL.md": broken,
    "agents/helper.md": broken,
    "skills/fine/SKILL.md": "---\nname: fine\ndescription: Fine\n---\nbody\n",
  });
  try {
    expect(cap.diagnostics.filter((d) => d.code === "acf.schema.invalid-yaml").length).toBe(3);
    expect(cap.skills.map((skill) => skill.name)).toEqual(["fine"]);
    expect(cap.agents).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});
