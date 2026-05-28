import { expect, test } from "bun:test";
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
