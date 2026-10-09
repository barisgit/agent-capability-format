import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCapabilities } from "../src";
import { cleanup, errors, tempDir, testScopeRoot, writeText } from "./helpers";

// SPEC §17.6: same-scope name collisions are errors with no implicit winner.
// The resolver must detect them before replacing any installed snapshot.

async function writeCapability(repo: string, name: string, marker: string): Promise<void> {
  await writeText(path.join(repo, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
  await writeText(path.join(repo, "marker.txt"), marker);
}

function collisionCodes(diagnostics: { code: string }[]): string[] {
  return diagnostics
    .map((item) => item.code)
    .filter((code) => code === "acf.capability.name-collision");
}

test("two sources with the same capability name fail without mutation", async () => {
  const dir = await tempDir("acf-installer-collision-sources-");
  try {
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    const one = path.join(dir, "one");
    const two = path.join(dir, "two");
    await writeCapability(one, "shared", "one");
    await writeCapability(two, "shared", "two");
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${one}\n  - source: path:${two}\n`,
    );

    const result = await resolveCapabilities({ scopeRoot, mode: "force" });

    expect(collisionCodes(result.diagnostics)).toEqual(["acf.capability.name-collision"]);
    const collision = result.diagnostics.find(
      (item) => item.code === "acf.capability.name-collision",
    );
    expect(collision?.severity).toBe("error");
    expect(collision?.data).toMatchObject({
      name: "shared",
      sources: [`path:${one}`, `path:${two}`],
    });
    expect(result.capabilities).toEqual([]);
    expect(await Bun.file(scopeRoot.lockPath).exists()).toBe(false);
    expect(
      await Bun.file(path.join(scopeRoot.capabilitiesDir, "shared", "marker.txt")).exists(),
    ).toBe(false);
  } finally {
    await cleanup(dir);
  }
});

test("new source colliding with a retained locked capability preserves snapshot and lock", async () => {
  const dir = await tempDir("acf-installer-collision-retained-");
  try {
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    const one = path.join(dir, "one");
    const two = path.join(dir, "two");
    await writeCapability(one, "shared", "one");
    await writeCapability(two, "shared", "two");
    await writeText(scopeRoot.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${one}\n`);
    const first = await resolveCapabilities({ scopeRoot, mode: "auto" });
    expect(errors(first)).toEqual([]);
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");

    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${one}\n  - source: path:${two}\n`,
    );
    const second = await resolveCapabilities({ scopeRoot, mode: "auto" });

    expect(collisionCodes(second.diagnostics)).toEqual(["acf.capability.name-collision"]);
    expect(
      await readFile(path.join(scopeRoot.capabilitiesDir, "shared", "marker.txt"), "utf8"),
    ).toBe("one");
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect(second.lockfile.entries.map((entry) => entry.sourceId)).toEqual([`path:${one}`]);
    expect(second.capabilities.map((item) => item.name)).toEqual(["shared"]);
  } finally {
    await cleanup(dir);
  }
});

test("rename onto another capability's name collides, rename to a free name resolves", async () => {
  const dir = await tempDir("acf-installer-collision-rename-");
  try {
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    const one = path.join(dir, "one");
    const two = path.join(dir, "two");
    await writeCapability(one, "alpha", "one");
    await writeCapability(two, "beta", "two");

    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${one}\n  - source: path:${two}\n    rename: alpha\n`,
    );
    const colliding = await resolveCapabilities({ scopeRoot, mode: "force" });
    expect(collisionCodes(colliding.diagnostics)).toEqual(["acf.capability.name-collision"]);
    expect(await Bun.file(scopeRoot.lockPath).exists()).toBe(false);
    expect(
      await Bun.file(path.join(scopeRoot.capabilitiesDir, "alpha", "marker.txt")).exists(),
    ).toBe(false);

    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${one}\n  - source: path:${two}\n    rename: gamma\n`,
    );
    const resolved = await resolveCapabilities({ scopeRoot, mode: "force" });
    expect(errors(resolved)).toEqual([]);
    expect(resolved.capabilities.map((item) => item.name)).toEqual(["alpha", "gamma"]);
    expect(
      await readFile(path.join(scopeRoot.capabilitiesDir, "alpha", "marker.txt"), "utf8"),
    ).toBe("one");
    expect(
      await readFile(path.join(scopeRoot.capabilitiesDir, "gamma", "marker.txt"), "utf8"),
    ).toBe("two");
  } finally {
    await cleanup(dir);
  }
});
