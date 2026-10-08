import { expect, test } from "bun:test";
import path from "node:path";
import { scopeRoot } from "@caplet/core";
import { removeManifestEntry } from "../../src/internal/manifest";
import { applyProject, cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

test("caplet remove updates manifest and cleans sidecar-owned output", async () => {
  const scope = await makeScope();
  try {
    await applyProject(scope);
    const result = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities", "alpha-cap")).exists()).toBe(
      false,
    );
    expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).not.toContain("alpha");
    expect(await readText(path.join(scope.cwd, ".claude", "CLAUDE.md"))).not.toContain(
      "Alpha guidance",
    );
    const inventory = await readText(path.join(scope.cwd, ".claude", "ACF-MANAGED.md"));
    expect(inventory).not.toContain("alpha-cap");
    expect(inventory).toContain("beta-cap");
    const sidecar = JSON.parse(
      await readText(path.join(scope.cwd, ".claude", ".acf-managed.json")),
    );
    expect(
      sidecar.managed.some(
        (entry: { path: string; capability: string }) =>
          entry.path === "ACF-MANAGED.md" && entry.capability === "acf-system",
      ),
    ).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("caplet remove preserves a collection selector that differs from its capability name", async () => {
  const scope = await makeScope();
  try {
    const root = scopeRoot("project", scope.agentsDir);
    const collection = path.join(scope.sourceRoot, "collection");
    await writeText(
      path.join(collection, "acf", "group", "one", "acf.yml"),
      "acf: 1\nname: alpha-cap\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(collection, "acf", "group", "two", "acf.yml"),
      "acf: 1\nname: beta-cap\nversion: 1.0.0\n",
    );
    const source = `path:${collection}`;
    await Bun.write(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: ${source}\n    capabilities: [group/one, group/two]\n`,
    );
    await Bun.write(
      path.join(scope.agentsDir, "capabilities.lock"),
      `${JSON.stringify(
        {
          acf: 1,
          entries: [
            {
              capabilityHash: "sha256-test",
              capabilityNames: ["alpha-cap", "beta-cap"],
              capabilities: ["group/one", "group/two"],
              selectorsByCapability: {
                "alpha-cap": "group/one",
                "beta-cap": "group/two",
              },
              source,
              sourceId: source,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await removeManifestEntry(root, "alpha-cap");

    const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
    expect(manifest).toContain("capabilities: group/two");
    expect(manifest).not.toContain("group/one");
    const lock = JSON.parse(await readText(path.join(scope.agentsDir, "capabilities.lock")));
    expect(lock.entries[0].capabilityNames).toEqual(["beta-cap"]);
    expect(lock.entries[0].capabilities).toEqual(["group/two"]);
    expect(lock.entries[0].selectorsByCapability).toEqual({ "beta-cap": "group/two" });

    const updated = await runCaplet(scope, [
      "update",
      "--no-apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(updated.exitCode).toBe(0);
  } finally {
    await cleanup(scope);
  }
});

test("caplet remove refuses to corrupt nested selectors from a legacy lock", async () => {
  const scope = await makeScope();
  try {
    const root = scopeRoot("project", scope.agentsDir);
    const source = `path:${path.join(scope.sourceRoot, "collection")}`;
    const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
    const lockPath = path.join(scope.agentsDir, "capabilities.lock");
    const manifest = `acf: 1\ncapabilities:\n  - source: ${source}\n    capabilities: [group/one, group/two]\n`;
    const lock = `${JSON.stringify(
      {
        acf: 1,
        entries: [
          {
            capabilityHash: "sha256-test",
            capabilityNames: ["alpha-cap", "beta-cap"],
            capabilities: ["group/one", "group/two"],
            source,
            sourceId: source,
          },
        ],
      },
      null,
      2,
    )}\n`;
    await Bun.write(manifestPath, manifest);
    await Bun.write(lockPath, lock);

    await expect(removeManifestEntry(root, "alpha-cap")).rejects.toThrow(
      "run caplet update --no-apply, then retry",
    );
    expect(await readText(manifestPath)).toBe(manifest);
    expect(await readText(lockPath)).toBe(lock);
  } finally {
    await cleanup(scope);
  }
});

test("caplet remove keeps sibling selectors from a shared source entry", async () => {
  const scope = await makeScope();
  try {
    const root = scopeRoot("project", scope.agentsDir);
    const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
    const source = `path:${scope.sourceRoot}`;
    await Bun.write(
      manifestPath,
      `acf: 1\ncapabilities:\n  - source: ${source}\n    capabilities: [alpha-cap, beta-cap, gamma-cap]\n`,
    );
    await Bun.write(
      path.join(scope.agentsDir, "capabilities.lock"),
      `${JSON.stringify(
        {
          acf: 1,
          entries: [
            {
              capabilityHash: "sha256-test",
              capabilityNames: ["alpha-cap", "beta-cap", "gamma-cap"],
              capabilities: ["alpha-cap", "beta-cap", "gamma-cap"],
              source,
              sourceId: source,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await removeManifestEntry(root, "beta-cap");

    const manifest = await readText(manifestPath);
    expect(manifest).toContain("alpha-cap");
    expect(manifest).not.toContain("beta-cap");
    expect(manifest).toContain("gamma-cap");
    const lock = JSON.parse(await readText(path.join(scope.agentsDir, "capabilities.lock")));
    expect(lock.entries).toHaveLength(1);
    expect(lock.entries[0].capabilityNames).toEqual(["alpha-cap", "gamma-cap"]);
    expect(lock.entries[0].capabilities).toEqual(["alpha-cap", "gamma-cap"]);
  } finally {
    await cleanup(scope);
  }
});

test("caplet remove narrows an install-all entry to surviving capabilities", async () => {
  const scope = await makeScope();
  try {
    const root = scopeRoot("project", scope.agentsDir);
    const manifestPath = path.join(scope.agentsDir, "capabilities.yml");
    const source = `path:${scope.sourceRoot}`;
    await Bun.write(manifestPath, `acf: 1\ncapabilities:\n  - source: ${source}\n`);
    await Bun.write(
      path.join(scope.agentsDir, "capabilities.lock"),
      `${JSON.stringify(
        {
          acf: 1,
          entries: [
            {
              capabilityHash: "sha256-test",
              capabilityNames: ["alpha-cap", "beta-cap"],
              selectorsByCapability: {
                "alpha-cap": "alpha-cap",
                "beta-cap": "beta-cap",
              },
              source,
              sourceId: source,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await removeManifestEntry(root, "alpha-cap");

    const manifest = await readText(manifestPath);
    expect(manifest).toContain("capabilities: beta-cap");
    expect(manifest).not.toContain("alpha-cap");
    const lock = JSON.parse(await readText(path.join(scope.agentsDir, "capabilities.lock")));
    expect(lock.entries[0].capabilityNames).toEqual(["beta-cap"]);
    expect(lock.entries[0].capabilities).toEqual(["beta-cap"]);
  } finally {
    await cleanup(scope);
  }
});
