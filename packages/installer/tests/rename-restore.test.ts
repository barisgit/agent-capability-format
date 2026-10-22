import { expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { computeCapabilityDigests, entryCapabilityHash } from "@caplet/core";
import { resolveCapabilities, writeLockfile } from "../src";
import { cleanup, errors, tempDir, testScopeRoot, writeText } from "./helpers";

for (const bare of [false, true]) {
  test(`missing renamed ${bare ? "bare skill" : "ACF"} snapshot restores an older lock's exact approved digest`, async () => {
    const dir = await tempDir("acf-rename-restore-");
    try {
      const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
      const source = path.join(dir, "source");
      const original = "acf: 1\nname: original\nversion: 1.0.0\n";
      if (bare) {
        await writeText(
          path.join(source, "SKILL.md"),
          "---\nname: original\ndescription: Original\n---\nBody\n",
        );
      } else await writeText(path.join(source, "acf.yml"), original);
      await writeText(
        scopeRoot.manifestPath,
        `acf: 1\ncapabilities:\n  - source: path:${source}\n    rename: renamed\n`,
      );
      const first = await resolveCapabilities({ scopeRoot, mode: "auto" });
      expect(errors(first)).toEqual([]);
      const snapshot = path.join(scopeRoot.capabilitiesDir, "renamed");
      await writeText(
        path.join(snapshot, "acf.yml"),
        bare ? "acf: 1\nname: original\nversion: 0.0.0-unmanifested+local\n" : original,
      );
      const legacyDigests = await computeCapabilityDigests(snapshot);
      for (const entry of first.lockfile.entries) {
        entry.resolvedCapabilities = entry.resolvedCapabilities?.map((record) => ({
          ...record,
          ...legacyDigests,
        }));
        entry.capabilityHash =
          entryCapabilityHash(entry.resolvedCapabilities ?? []) ?? entry.capabilityHash;
      }
      await writeLockfile(scopeRoot.lockPath, first.lockfile);
      const before = await readFile(scopeRoot.lockPath, "utf8");
      await rm(snapshot, { recursive: true });
      const restored = await resolveCapabilities({ scopeRoot, mode: "auto", frozen: true });
      expect(errors(restored)).toEqual([]);
      expect(await computeCapabilityDigests(snapshot)).toEqual(legacyDigests);
      expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(before);
    } finally {
      await cleanup(dir);
    }
  });
}
