import { expect, test } from "bun:test";
import path from "node:path";
import { applyProject, cleanup, makeScope, readText, runCaplet } from "../helpers";

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

import { scopeRoot } from "@acf/core";
import { removeManifestEntry } from "../../src/internal/manifest";

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
