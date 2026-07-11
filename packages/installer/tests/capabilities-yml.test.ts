import { expect, test } from "bun:test";
import path from "node:path";
import { readCapabilitiesYml } from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

test("valid capabilities.yml parses source shorthands", async () => {
  const dir = await tempDir("acf-installer-yml-");
  try {
    const file = path.join(dir, "capabilities.yml");
    await writeText(
      file,
      "acf: 1\ncapabilities:\n  - source: github:owner/repo\n    ref: main\n    include:\n      skill: [example]\n",
    );
    const result = await readCapabilitiesYml(file);
    expect(result.diagnostics).toEqual([]);
    expect(result.value.capabilities[0]?.source).toEqual({ kind: "github", repo: "owner/repo" });
    expect(result.value.capabilities[0]?.include).toEqual({ skill: ["example"] });
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
