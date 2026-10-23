import { expect, test } from "bun:test";
import path from "node:path";
import { readCapabilitiesYml } from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

test("unknown only and except target ids are rejected with suggestions", async () => {
  const dir = await tempDir("acf-installer-target-typo-");
  try {
    const file = path.join(dir, "capabilities.yml");
    for (const field of ["only", "except"]) {
      await writeText(
        file,
        `acf: 1\ncapabilities:\n  - source: path:./one\n    ${field}: [cluade]\n`,
      );
      const result = await readCapabilitiesYml(file);
      expect(result.value.capabilities).toEqual([]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "acf.target.unknown-id",
          message: expect.stringContaining('did you mean "claude"?'),
        }),
      );
    }
  } finally {
    await cleanup(dir);
  }
});

test("valid capabilities.yml parses source shorthands", async () => {
  const dir = await tempDir("acf-installer-yml-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: github:owner/repo\n    ref: main\n    include:\n      skills: [example]\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics).toEqual([]);
    expect(result.value.capabilities[0]?.source).toEqual({ kind: "github", repo: "owner/repo" });
    expect(result.value.capabilities[0]?.include).toEqual({ skills: ["example"] });
  } finally {
    await cleanup(dir);
  }
});

test("include and exclude take plural family keys and suggest them for singular ones", async () => {
  const dir = await tempDir("acf-installer-yml-selection-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: path:./one\n    exclude:\n      skill: [draft]\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'unknown key "skill" — did you mean "skills"?',
    ]);
  } finally {
    await cleanup(dir);
  }
});

test("capability selectors normalize scalar and list syntax", async () => {
  const dir = await tempDir("acf-installer-selectors-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: path:./one\n    capabilities: cap1\n  - source: path:./two\n    capabilities: [cap2, group1/*]\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics).toEqual([]);
    expect(result.value.capabilities.map((entry) => entry.capabilities)).toEqual([
      ["cap1"],
      ["cap2", "group1/*"],
    ]);
  } finally {
    await cleanup(dir);
  }
});

test("invalid capability selectors return diagnostics", async () => {
  const dir = await tempDir("acf-installer-selector-invalid-");
  try {
    const manifestPath = path.join(dir, "capabilities.yml");
    for (const selector of [
      "../private",
      "/absolute",
      "group//skill",
      "group\\\\skill",
      "foo**bar",
    ]) {
      await writeText(
        manifestPath,
        `acf: 1\ncapabilities:\n  - source: path:./repo\n    capabilities: ${JSON.stringify(selector)}\n`,
      );
      const result = await readCapabilitiesYml(manifestPath);
      expect(result.diagnostics.some((item) => item.severity === "error")).toBe(true);
    }
  } finally {
    await cleanup(dir);
  }
});

test("capability renames must be safe slugs", async () => {
  const dir = await tempDir("acf-installer-rename-invalid-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: path:./repo\n    rename: ../../outside\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics.some((item) => item.severity === "error")).toBe(true);
  } finally {
    await cleanup(dir);
  }
});

test("malformed capabilities.yml returns diagnostics", async () => {
  const dir = await tempDir("acf-installer-yml-bad-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(file, "acf: 1\ncapabilities:\n  - source: registry:missing\n");
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "acf.capabilities-yml.source.unknown-scheme",
    );
    expect(result.value.capabilities).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});

test("unknown entry key is rejected with did-you-mean hint", async () => {
  const dir = await tempDir("acf-installer-unknown-key-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: github:owner/repo\n    ref: main\n    capatibilities: engineering-workflows\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.value.capabilities).toEqual([]);
    const issue = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "acf.capabilities-yml.unknown-key",
    );
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toBe('unknown key "capatibilities" — did you mean "capabilities"?');
  } finally {
    await cleanup(dir);
  }
});

test("unknown top-level key is rejected", async () => {
  const dir = await tempDir("acf-installer-unknown-top-key-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(file, "acf: 1\ncapabilitys: []\ncapabilities: []\n");
    const result = await readCapabilitiesYml(file);
    const issue = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "acf.capabilities-yml.unknown-key",
    );
    expect(issue?.message).toBe('unknown key "capabilitys" — did you mean "capabilities"?');
  } finally {
    await cleanup(dir);
  }
});

test("unknown key without a close match omits the hint", async () => {
  const dir = await tempDir("acf-installer-unknown-far-key-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: path:./repo\n    somethingelse: true\n",
    );
    const result = await readCapabilitiesYml(file);
    const issue = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "acf.capabilities-yml.unknown-key",
    );
    expect(issue?.message).toBe('unknown key "somethingelse"');
  } finally {
    await cleanup(dir);
  }
});

test("credential-bearing source URLs are rejected without echoing the secret", async () => {
  const dir = await tempDir("acf-installer-credentials-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: git:https://x-access-token:s3cret@github.com/o/r\n    ref: main\n  - source: path:./kept\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "acf.source.credential-in-url",
    ]);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(JSON.stringify(result)).not.toContain("s3cret");
    expect(result.value.capabilities).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});
