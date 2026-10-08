import { expect, test } from "bun:test";
import { access } from "node:fs/promises";
import path from "node:path";
import { resolveCapabilities } from "../src";
import { cleanup, tempDir, testScopeRoot } from "./helpers";

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// A scope that declares nothing and has never been locked must stay untouched:
// running caplet in an unrelated project should not litter it with an empty lock.
test("resolving a scope with no manifest and no lock writes nothing", async () => {
  const dir = await tempDir("acf-installer-no-manifest-");
  try {
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });

    expect(result.capabilities).toEqual([]);
    expect(result.lockfile).toEqual({ acf: 1, entries: [] });
    expect(await exists(scopeRoot.lockPath)).toBe(false);
    expect(await exists(scopeRoot.agentsDir)).toBe(false);
  } finally {
    await cleanup(dir);
  }
});
