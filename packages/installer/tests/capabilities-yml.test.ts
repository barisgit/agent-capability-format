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
