import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, codes, readTempCapability, tempDir, writeText } from "./helpers";

test("duplicate acf.yml and acf.yaml fails", async () => {
  const dir = await tempDir("acf-manifest-");
  try {
    await writeText(path.join(dir, "acf.yml"), "acf: 1\nname: one\nversion: 1.0.0\n");
    await writeText(path.join(dir, "acf.yaml"), "acf: 1\nname: one\nversion: 1.0.0\n");
    const { readCapability } = await import("../src");
    const cap = await readCapability(dir, "project", { kind: "local", directory: dir });
    expect(codes(cap)).toContain("acf.manifest.duplicate-file");
  } finally {
    await cleanup(dir);
  }
});

test("invalid name/version and unknown fields are diagnosed", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: Bad_Name\nversion: nope\nextra: true\n",
  });
  try {
    expect(codes(cap)).toContain("acf.manifest.invalid-name");
    expect(codes(cap)).toContain("acf.markdown.unknown-frontmatter-field");
  } finally {
    await cleanup(dir);
  }
});

test("only and except are mutually exclusive", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: test-cap\nversion: 1.0.0\nonly: [claude]\nexcept: [codex]\n",
  });
  try {
    expect(codes(cap)).toContain("acf.manifest.only-and-except");
  } finally {
    await cleanup(dir);
  }
});
