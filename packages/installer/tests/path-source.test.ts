import { expect, test } from "bun:test";
import { access, cp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "@acf/core/hash";
import { fetchCapability, readLockfile, resolveCapabilities } from "../src";
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

test("path collections select exact and globbed capabilities and reconcile removals", async () => {
  const dir = await tempDir("acf-installer-collection-");
  try {
    const repo = path.join(dir, "repo");
    const agentsDir = path.join(dir, ".agents");
    const scopeRoot = testScopeRoot("project", agentsDir);
    for (const [relative, name] of [
      ["cap1", "cap1"],
      ["cap2", "cap2"],
      ["group1/cap3", "cap3"],
      ["group1/nested/cap4", "cap4"],
    ] as const) {
      await writeText(
        path.join(repo, "acf", relative, "acf.yml"),
        `acf: 1\nname: ${name}\nversion: 1.0.0\n`,
      );
    }
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${repo}\n    capabilities: [cap1, group1/*]\n`,
    );

    const first = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(first.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(first.capabilities.map((item) => item.name)).toEqual(["cap1", "cap3"]);
    expect(first.lockfile.entries[0]?.capabilities).toEqual(["cap1", "group1/*"]);

    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${repo}\n    capabilities: [group1/**, group1/cap3]\n`,
    );
    const second = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    expect(second.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(second.capabilities.map((item) => item.name)).toEqual(["cap3", "cap4"]);
    await expect(access(path.join(scopeRoot.capabilitiesDir, "cap1"))).rejects.toThrow();
  } finally {
    await cleanup(dir);
  }
});

test("globstar selectors include top-level and nested capabilities", async () => {
  const dir = await tempDir("acf-installer-globstar-");
  try {
    const repo = path.join(dir, "repo");
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(
      path.join(repo, "acf", "top", "acf.yml"),
      "acf: 1\nname: top\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(repo, "acf", "group", "nested", "acf.yml"),
      "acf: 1\nname: nested\nversion: 1.0.0\n",
    );
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${repo}\n    capabilities: "**"\n`,
    );

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(result.capabilities.map((item) => item.name)).toEqual(["nested", "top"]);
  } finally {
    await cleanup(dir);
  }
});

test("selectors reject direct capability sources without mutating the snapshot", async () => {
  const dir = await tempDir("acf-installer-direct-selector-");
  try {
    const repo = path.join(dir, "repo");
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: direct\nversion: 1.0.0\n");
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${repo}\n    capabilities: direct\n`,
    );

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "acf.resolve.capability-selector-direct-source",
    );
    await expect(access(path.join(scopeRoot.capabilitiesDir, "direct"))).rejects.toThrow();
  } finally {
    await cleanup(dir);
  }
});

test("unmatched capability selectors fail without changing prior snapshots or lock", async () => {
  const dir = await tempDir("acf-installer-unmatched-");
  try {
    const repo = path.join(dir, "repo");
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(
      path.join(repo, "acf", "cap1", "acf.yml"),
      "acf: 1\nname: cap1\nversion: 1.0.0\n",
    );
    await writeText(scopeRoot.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${repo}\n`);
    await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    const before = await readFile(scopeRoot.lockPath, "utf8");
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${repo}\n    capabilities: missing/*\n`,
    );

    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "acf.resolve.capability-selector-unmatched",
    );
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(before);
    await access(path.join(scopeRoot.capabilitiesDir, "cap1"));
  } finally {
    await cleanup(dir);
  }
});

test("a later selector failure preserves earlier source snapshots and the lock", async () => {
  const dir = await tempDir("acf-installer-atomic-selectors-");
  try {
    const firstRepo = path.join(dir, "first");
    const secondRepo = path.join(dir, "second");
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(
      path.join(firstRepo, "acf", "one", "acf.yml"),
      "acf: 1\nname: one\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(secondRepo, "acf", "two", "acf.yml"),
      "acf: 1\nname: two\nversion: 1.0.0\n",
    );
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${firstRepo}\n  - source: path:${secondRepo}\n`,
    );
    await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    const snapshotBefore = await readFile(
      path.join(scopeRoot.capabilitiesDir, "one", "acf.yml"),
      "utf8",
    );

    await writeText(
      path.join(firstRepo, "acf", "one", "acf.yml"),
      "acf: 1\nname: one\nversion: 2.0.0\n",
    );
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${firstRepo}\n    capabilities: one\n  - source: path:${secondRepo}\n    capabilities: missing\n`,
    );
    const failed = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(failed.diagnostics.map((item) => item.code)).toContain(
      "acf.resolve.capability-selector-unmatched",
    );
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    expect(await readFile(path.join(scopeRoot.capabilitiesDir, "one", "acf.yml"), "utf8")).toBe(
      snapshotBefore,
    );
  } finally {
    await cleanup(dir);
  }
});

test("a missing git ref cannot prune a locked sibling snapshot", async () => {
  const dir = await tempDir("acf-installer-atomic-ref-");
  try {
    const pathRepo = path.join(dir, "path-source");
    const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
    await writeText(
      path.join(pathRepo, "acf", "new-cap", "acf.yml"),
      "acf: 1\nname: new-cap\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(scopeRoot.capabilitiesDir, "locked-cap", "acf.yml"),
      "acf: 1\nname: locked-cap\nversion: 1.0.0\n",
    );
    await writeText(
      scopeRoot.lockPath,
      `${JSON.stringify(
        {
          acf: 1,
          entries: [
            {
              capabilityHash:
                "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              capabilityNames: ["locked-cap"],
              source: "github:owner/repo",
              sourceId: "github:owner/repo",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const lockBefore = await readFile(scopeRoot.lockPath, "utf8");
    await writeText(
      scopeRoot.manifestPath,
      `acf: 1\ncapabilities:\n  - source: github:owner/repo\n  - source: path:${pathRepo}\n`,
    );

    const failed = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(failed.diagnostics.map((item) => item.code)).toContain("acf.resolve.ref-required");
    expect(await readFile(scopeRoot.lockPath, "utf8")).toBe(lockBefore);
    await access(path.join(scopeRoot.capabilitiesDir, "locked-cap", "acf.yml"));
    await expect(access(path.join(scopeRoot.capabilitiesDir, "new-cap"))).rejects.toThrow();
  } finally {
    await cleanup(dir);
  }
});

test("capability paths cannot escape their source root", async () => {
  await expect(
    fetchCapability(
      { source: { kind: "path", location: fixture }, path: "../outside" },
      { cacheDir: path.join(fixture, ".cache") },
    ),
  ).rejects.toThrow("capability path escapes source root");
});
