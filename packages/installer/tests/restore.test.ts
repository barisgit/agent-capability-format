import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveScopeCapabilities } from "@caplet/core";
import { resolveCapabilities } from "../src";
import { cleanup, errors, tempDir, testScopeRoot, writeText } from "./helpers";

/** Installs a collection source (`acf/<name>/`) providing `names` and returns its paths. */
async function installCollection(dir: string, names: readonly string[]) {
  const repo = path.join(dir, "repo");
  for (const name of names) await addCapability(repo, name);
  const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
  await writeText(scopeRoot.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${repo}\n`);
  const result = await resolveCapabilities({ scopeRoot, mode: "auto" });
  expect(errors(result)).toEqual([]);
  return { repo, scopeRoot };
}

async function addCapability(repo: string, name: string): Promise<void> {
  await writeText(
    path.join(repo, "acf", name, "acf.yml"),
    `acf: 1\nname: ${name}\nversion: 1.0.0\n`,
  );
  await writeText(path.join(repo, "acf", name, "notes.md"), `${name}\n`);
}

for (const records of [true, false]) {
  test(`a restore that yields a capability the lock does not name installs nothing${records ? "" : " (lock without records)"}`, async () => {
    const dir = await tempDir("acf-restore-extra-");
    try {
      const { repo, scopeRoot } = await installCollection(dir, ["alpha", "beta"]);
      if (!records) {
        const lock = JSON.parse(await readFile(scopeRoot.lockPath, "utf8")) as {
          entries: Array<Record<string, unknown>>;
        };
        for (const entry of lock.entries) delete entry.resolvedCapabilities;
        await writeFile(scopeRoot.lockPath, JSON.stringify(lock), "utf8");
      }
      const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
      await rm(path.join(scopeRoot.capabilitiesDir, "alpha"), { recursive: true });
      await addCapability(repo, "gamma");

      const result = await resolveCapabilities({ scopeRoot, mode: "auto" });

      expect(errors(result).map((item) => [item.code, item.data?.name])).toEqual([
        ["acf.lock.digest-mismatch", "gamma"],
      ]);
      expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
      for (const name of ["alpha", "gamma"]) {
        expect(await Bun.file(path.join(scopeRoot.capabilitiesDir, name, "acf.yml")).exists()).toBe(
          false,
        );
      }
    } finally {
      await cleanup(dir);
    }
  });
}

test("restoring a missing sibling leaves a modified present snapshot as it is and reported", async () => {
  const dir = await tempDir("acf-restore-sibling-");
  try {
    const { scopeRoot } = await installCollection(dir, ["alpha", "beta"]);
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    await rm(path.join(scopeRoot.capabilitiesDir, "alpha"), { recursive: true });
    const tampered = path.join(scopeRoot.capabilitiesDir, "beta", "notes.md");
    await writeText(tampered, "tampered\n");

    const result = await resolveCapabilities({ scopeRoot, mode: "auto" });

    expect(errors(result)).toEqual([]);
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect(await readFile(path.join(scopeRoot.capabilitiesDir, "alpha", "notes.md"), "utf8")).toBe(
      "alpha\n",
    );
    expect(await readFile(tampered, "utf8")).toBe("tampered\n");
    const resolved = await resolveScopeCapabilities(scopeRoot);
    expect(resolved.capabilities.map((capability) => capability.manifest.name)).toEqual(["alpha"]);
    expect(resolved.diagnostics.map((item) => [item.code, item.data?.name])).toEqual([
      ["acf.lock.digest-mismatch", "beta"],
    ]);
  } finally {
    await cleanup(dir);
  }
});
