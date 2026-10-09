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

test("each manifest schema error takes the code of the field it is in", async () => {
  const header = "acf: 1\nname: test-cap\n";
  for (const [body, code] of [
    ["acf: 2\nname: test-cap\nversion: 1.0.0\n", "acf.manifest.acf-version-unknown"],
    ["acf: 1\nname: Bad_Name\nversion: 1.0.0\n", "acf.manifest.invalid-name"],
    [`${header}version: nope\n`, "acf.manifest.invalid-field"],
    [header, "acf.manifest.invalid-field"],
    [`${header}version: 1.0.0\nhomepage: not-a-url\n`, "acf.manifest.invalid-field"],
    [
      `${header}version: 1.0.0\nauthors:\n  - name: Ann\n    bogus: 1\n`,
      "acf.manifest.invalid-field",
    ],
    // An author's name is not the capability name.
    [`${header}version: 1.0.0\nauthors:\n  - name: ''\n`, "acf.manifest.invalid-field"],
    [`${header}version: 1.0.0\nkeywords: one\n`, "acf.manifest.invalid-field"],
  ] as const) {
    const { cap, dir } = await readTempCapability({ "acf.yml": body });
    try {
      expect({ body, codes: codes(cap) }).toEqual({ body, codes: [code] });
    } finally {
      await cleanup(dir);
    }
  }
});
