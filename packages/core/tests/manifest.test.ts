import { expect, test } from "bun:test";
import path from "node:path";
import { manifestSchema } from "../src";
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
    expect(codes(cap)).toContain("acf.manifest.invalid-field");
  } finally {
    await cleanup(dir);
  }
});

test("unknown manifest fields are errors while Markdown frontmatter remains permissive", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: test-cap\nversion: 1.0.0\nunknownFutureField: typo\n",
    "ACF.md": "---\ncustom: overview\n---\nNotes.\n",
    "skills/demo/SKILL.md": "---\nname: demo\ndescription: Demo\ncustom: skill\n---\nBody.\n",
  });
  try {
    expect(cap.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "acf.manifest.invalid-field",
        message: expect.stringContaining("unknownFutureField"),
        path: path.join(dir, "acf.yml"),
      }),
    );
    expect(
      cap.diagnostics.filter((d) => d.code === "acf.markdown.unknown-frontmatter-field"),
    ).toHaveLength(2);
    expect(
      manifestSchema.safeParse({
        acf: 1,
        name: "test-cap",
        version: "1.0.0",
        unknownFutureField: "typo",
      }).success,
    ).toBe(false);
  } finally {
    await cleanup(dir);
  }
});

test("manifest versions obey strict SemVer 2.0.0", () => {
  for (const version of [
    "01.0.0",
    "1.02.0",
    "1.0.03",
    "1.0.0-01",
    "1.0.0-a..b",
    "1.0.0+",
    "1.0.0\n",
    "v1.0.0",
    "1.0.0-",
  ]) {
    expect({
      version,
      valid: manifestSchema.safeParse({ acf: 1, name: "demo", version }).success,
    }).toEqual({ version, valid: false });
  }
  for (const version of ["0.0.0", "1.0.0-alpha.1+build.01", "1.0.0-0", "1.0.0+001"]) {
    expect({
      version,
      valid: manifestSchema.safeParse({ acf: 1, name: "demo", version }).success,
    }).toEqual({ version, valid: true });
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

test("a manifest whose root is not a mapping is an error, not a fallback", async () => {
  for (const text of ["- a\n- b\n", "just text\n", ""]) {
    const { cap, dir } = await readTempCapability({ "acf.yml": text });
    try {
      expect(cap.diagnostics.map((d) => [d.severity, d.code, d.path])).toEqual([
        ["error", "acf.manifest.invalid-field", path.join(dir, "acf.yml")],
      ]);
    } finally {
      await cleanup(dir);
    }
  }
});
