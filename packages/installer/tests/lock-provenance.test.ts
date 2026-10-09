import { expect, test } from "bun:test";
import { chmod, cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeContentHash, computePayloadDigest } from "@caplet/core/hash";
import { serializeLock } from "@caplet/core/lock";
import { assertGoldenTree, goldenCase, treeFromFiles } from "@caplet/golden";
import { readLockfile, resolveCapabilities } from "../src";
import { cleanup, errors, tempDir, testScopeRoot, writeText } from "./helpers";

const fixtures = fileURLToPath(new URL("./fixtures/locks", import.meta.url));
const golden = goldenCase(import.meta.dir, "multi-capability-lock");

test("lockfiles written before per-capability records round-trip byte for byte", async () => {
  const lockPath = path.join(fixtures, "legacy.lock");
  const lock = await readLockfile(lockPath);
  expect(lock?.entries.every((entry) => entry.resolvedCapabilities === undefined)).toBe(true);
  expect(lock === null ? null : serializeLock(lock)).toBe(await readFile(lockPath, "utf8"));
});

test("a multi-capability source locks each capability's provenance and digests", async () => {
  const dir = await tempDir("acf-installer-multi-lock-");
  try {
    const repo = path.join(dir, "repo");
    await cp(golden.input, repo, { recursive: true });
    // Executable bits may not survive every checkout; the golden expects this one set.
    await chmod(path.join(repo, "acf", "alpha", "scripts", "run.sh"), 0o755);
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(scopeRoot.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${repo}\n`);

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    expect(errors(result)).toEqual([]);

    const records = result.lockfile.entries[0]?.resolvedCapabilities ?? [];
    expect(records.map((record) => record.name)).toEqual(["alpha", "beta"]);
    for (const record of records) {
      const installed = path.join(scopeRoot.capabilitiesDir, record.name);
      expect(record.payloadDigest).toBe(await computePayloadDigest(installed));
      expect(record.capabilityHash).toBe(await computeContentHash(installed));
    }
    expect(records[0]?.payloadDigest).not.toBe(records[1]?.payloadDigest);

    const actual = (await readFile(scopeRoot.lockPath, "utf8"))
      .replaceAll(repo, "<SOURCE>")
      .replace(/"resolvedAt": "[^"]+"/, '"resolvedAt": "<RESOLVED_AT>"');
    await assertGoldenTree(treeFromFiles({ "capabilities.lock": actual }), golden.expected);
  } finally {
    await cleanup(dir);
  }
});

test("an entry locked without records gains them on its next resolution", async () => {
  const dir = await tempDir("acf-installer-lock-upgrade-");
  try {
    const repo = path.join(dir, "repo");
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: solo\nversion: 1.0.0\n");
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(scopeRoot.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${repo}\n`);
    await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    const lock = JSON.parse(await readFile(scopeRoot.lockPath, "utf8")) as {
      entries: Array<Record<string, unknown>>;
    };
    for (const entry of lock.entries) delete entry.resolvedCapabilities;
    await writeFile(scopeRoot.lockPath, JSON.stringify(lock), "utf8");

    await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });

    const upgraded = await readLockfile(scopeRoot.lockPath);
    expect(upgraded?.entries[0]?.resolvedCapabilities).toEqual([
      {
        capabilityHash: await computeContentHash(path.join(scopeRoot.capabilitiesDir, "solo")),
        format: "acf",
        name: "solo",
        path: ".",
        payloadDigest: await computePayloadDigest(path.join(scopeRoot.capabilitiesDir, "solo")),
      },
    ]);
  } finally {
    await cleanup(dir);
  }
});
