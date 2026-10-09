import { expect, test } from "bun:test";
import path from "node:path";
import { readLockfile, scopeRoot } from "@caplet/core";
import { removeManifestEntries } from "../../src/internal/manifest";
import { applyProject, cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

/** Every `.acf-managed.json` under `dir`, relative to it. */
async function sidecarFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/.acf-managed.json").scan({ cwd: dir, dot: true })) {
    files.push(file);
  }
  return files.sort();
}

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

test("caplet remove removes every named capability", async () => {
  const scope = await makeScope();
  try {
    expect((await applyProject(scope)).exitCode).toBe(0);
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "claude"];

    const result = await runCaplet(scope, ["remove", "alpha-cap", "beta-cap", ...args]);

    expect(result.exitCode).toBe(0);
    const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
    expect(manifest).not.toContain("alpha");
    expect(manifest).not.toContain("beta");
    const mcp = await readText(path.join(scope.cwd, ".mcp.json"));
    expect(mcp).not.toContain("alpha-server");
    expect(mcp).not.toContain("beta-server");
    expect(
      await Bun.file(path.join(scope.cwd, ".claude", "agents", "beta-helper.md")).exists(),
    ).toBe(false);
  } finally {
    await cleanup(scope);
  }
});

test("caplet remove with an unknown name changes nothing", async () => {
  const scope = await makeScope();
  try {
    expect((await applyProject(scope)).exitCode).toBe(0);
    const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));

    const result = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "nope",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("nope");
    expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).toBe(manifest);
    expect(await readText(path.join(scope.cwd, ".mcp.json"))).toContain("alpha-server");
  } finally {
    await cleanup(scope);
  }
});

test("caplet remove without --target writes no sidecar for a target it never wrote", async () => {
  const scope = await makeScope();
  try {
    expect((await applyProject(scope)).exitCode).toBe(0);
    const before = await sidecarFiles(scope.cwd);

    const result = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(await sidecarFiles(scope.cwd)).toEqual(before);
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

    await removeManifestEntries(root, ["alpha-cap"]);

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

    await expect(removeManifestEntries(root, ["alpha-cap"])).rejects.toThrow(
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

    await removeManifestEntries(root, ["beta-cap"]);

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

    await removeManifestEntries(root, ["alpha-cap"]);

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

test("caplet remove narrows per-capability lock records with the names", async () => {
  const scope = await makeScope();
  try {
    const root = scopeRoot("project", scope.agentsDir);
    const collection = path.join(scope.sourceRoot, "collection");
    for (const name of ["alpha-cap", "beta-cap"]) {
      await writeText(
        path.join(collection, "acf", name, "acf.yml"),
        `acf: 1\nname: ${name}\nversion: 1.0.0\n`,
      );
    }
    await Bun.write(root.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${collection}\n`);
    const fetched = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    expect(fetched.exitCode).toBe(0);
    const before = (await readLockfile(root.lockPath))?.entries[0]?.resolvedCapabilities ?? [];
    const beta = before.find((record) => record.name === "beta-cap");

    await removeManifestEntries(root, ["alpha-cap"]);

    const entry = (await readLockfile(root.lockPath))?.entries[0];
    expect(entry?.resolvedCapabilities).toEqual(beta === undefined ? [] : [beta]);
    expect(entry?.capabilityHash).toBe(beta?.capabilityHash);
  } finally {
    await cleanup(scope);
  }
});
