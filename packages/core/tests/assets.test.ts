import { expect, test } from "bun:test";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("assets collect markdown and frontmatter references", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skills/ok/SKILL.md":
      "---\nname: ok\ndescription: Ok\nassets: ['./asset.txt']\n---\n![img](./asset.txt)\n",
    "skills/ok/asset.txt": "asset\n",
  });
  try {
    expect(cap.assets.map((asset) => asset.path)).toContain("skills/ok/asset.txt");
  } finally {
    await cleanup(dir);
  }
});

test("asset absolute path, traversal, and missing file are diagnosed", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skills/bad/SKILL.md":
      "---\nname: bad\ndescription: Bad\nassets: ['/abs.png', '../outside.png', './missing.png']\n---\nbody\n",
  });
  try {
    const got = codes(cap);
    expect(got).toContain("acf.path.absolute");
    expect(got.filter((code) => code === "acf.path.traversal").length).toBeGreaterThanOrEqual(2);
  } finally {
    await cleanup(dir);
  }
});
