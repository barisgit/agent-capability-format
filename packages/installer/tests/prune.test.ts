import { expect, test } from "bun:test";
import { access } from "node:fs/promises";
import path from "node:path";
import { pruneCapabilities } from "../src";
import { cleanup, tempDir, testScopeRoot, writeText } from "./helpers";

test("prune removes capability dirs not in keep set", async () => {
  const dir = await tempDir("acf-installer-prune-");
  try {
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(
      path.join(scopeRoot.capabilitiesDir, "a", "acf.yml"),
      "acf: 1\nname: a\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(scopeRoot.capabilitiesDir, "b", "acf.yml"),
      "acf: 1\nname: b\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(scopeRoot.capabilitiesDir, "c", "acf.yml"),
      "acf: 1\nname: c\nversion: 1.0.0\n",
    );

    const result = await pruneCapabilities(scopeRoot, new Set(["a", "b"]));
    expect(result).toEqual({ removed: ["c"], diagnostics: [] });
    await access(path.join(scopeRoot.capabilitiesDir, "a"));
    await access(path.join(scopeRoot.capabilitiesDir, "b"));
    await expect(access(path.join(scopeRoot.capabilitiesDir, "c"))).rejects.toThrow();
  } finally {
    await cleanup(dir);
  }
});
