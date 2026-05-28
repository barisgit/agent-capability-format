import { expect, test } from "bun:test";
import { cp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "@acf/core/hash";
import { readLockfile, resolveCapabilities } from "../src";
import { cleanup, tempDir, testScopeRoot, writeText } from "./helpers";

const fixture = fileURLToPath(new URL("./fixtures/local-cap", import.meta.url));

test("path source resolves into scope capabilities and is idempotent", async () => {
  const dir = await tempDir("acf-installer-path-");
  try {
    const agentsDir = path.join(dir, ".agents");
    const scopeRoot = testScopeRoot("project", agentsDir);
    await cp(fixture, path.join(agentsDir, "fixtures", "local-cap"), { recursive: true });
    await writeText(
      scopeRoot.manifestPath,
      "acf: 1\ncapabilities:\n  - source: path:./fixtures/local-cap\n",
    );

    const first = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    expect(first.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(first.capabilities).toHaveLength(1);
    expect(first.capabilities[0]?.name).toBe("local-cap");

    const installedRoot = path.join(scopeRoot.capabilitiesDir, "local-cap");
    const expectedHash = await computeContentHash(installedRoot);
    expect(first.capabilities[0]?.contentHash).toBe(expectedHash);

    const lock = await readLockfile(scopeRoot.lockPath);
    const entry = lock?.entries[0];
    expect(entry?.sourceId).toBe(`path:${path.join(agentsDir, "fixtures", "local-cap")}`);
    expect(entry?.capabilityHash).toBe(expectedHash);
    expect(entry?.capabilityNames).toEqual(["local-cap"]);
    expect(entry !== undefined && "resolvedSha" in entry).toBe(false);

    const before = await readFile(scopeRoot.lockPath, "utf8");
    const second = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    const after = await readFile(scopeRoot.lockPath, "utf8");
    expect(second.capabilities[0]?.contentHash).toBe(expectedHash);
    expect(after).toBe(before);
  } finally {
    await cleanup(dir);
  }
});
