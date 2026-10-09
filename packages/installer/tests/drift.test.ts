import { expect, test } from "bun:test";
import type { CapabilitiesYml } from "@caplet/core";
import { type CapabilitiesLock, detectLockDrift } from "../src";

test("yml entries missing from lock are diagnosed", () => {
  const yml: CapabilitiesYml = {
    acf: 1,
    capabilities: [
      { source: { kind: "github", repo: "owner/one" }, ref: "main" },
      { source: { kind: "github", repo: "owner/two" }, ref: "main" },
    ],
  };
  const lock: CapabilitiesLock = {
    acf: 1,
    entries: [
      {
        capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        capabilityNames: ["one"],
        ref: "main",
        resolvedSha: "abc123",
        source: "github:owner/one",
        sourceId: "github:owner/one",
      },
    ],
  };
  expect(detectLockDrift(yml, lock).map((diagnostic) => diagnostic.code)).toEqual([
    "acf.lock.missing-entry",
  ]);
});

test("capability selector drift is diagnosed", () => {
  const yml: CapabilitiesYml = {
    acf: 1,
    capabilities: [
      {
        source: { kind: "path", location: "/repo" },
        capabilities: ["engineering"],
      },
    ],
  };
  const lock: CapabilitiesLock = {
    acf: 1,
    entries: [
      {
        capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        capabilityNames: ["hardware"],
        capabilities: ["hardware"],
        source: "path:/repo",
        sourceId: "path:/repo",
      },
    ],
  };
  const diagnostics = detectLockDrift(yml, lock);
  expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["acf.lock.drift"]);
  expect(diagnostics[0]?.data).toMatchObject({
    ymlCapabilities: ["engineering"],
    lockCapabilities: ["hardware"],
  });
});

test("legacy source-only lock ids remain valid for path entries", () => {
  const yml: CapabilitiesYml = {
    acf: 1,
    capabilities: [
      { source: { kind: "github", repo: "owner/capabilities" }, ref: "main", path: "alpha" },
    ],
  };
  const lock: CapabilitiesLock = {
    acf: 1,
    entries: [
      {
        capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        capabilityNames: ["alpha"],
        ref: "main",
        resolvedSha: "abc123",
        source: "github:owner/capabilities",
        sourceId: "github:owner/capabilities",
      },
    ],
  };
  expect(detectLockDrift(yml, lock)).toEqual([]);
});

test("rename and requested format drift are diagnosed; detected formats are not intent", () => {
  const source = { kind: "path", location: "/repo" } as const;
  const lockEntry = {
    capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    capabilityNames: ["kit"],
    format: "claude-plugin" as const,
    rename: { "review-kit": "kit" },
    source: "path:/repo",
    sourceId: "path:/repo",
  };
  const lock: CapabilitiesLock = { acf: 1, entries: [lockEntry] };
  const same: CapabilitiesYml = {
    acf: 1,
    capabilities: [{ source, format: "claude-plugin", rename: { "review-kit": "kit" } }],
  };
  expect(detectLockDrift(same, lock)).toEqual([]);

  const renamed = detectLockDrift(
    { acf: 1, capabilities: [{ source, format: "claude-plugin", rename: "other" }] },
    lock,
  );
  expect(renamed.map((diagnostic) => diagnostic.code)).toEqual(["acf.lock.drift"]);
  expect(renamed[0]?.data).toMatchObject({
    ymlRename: "other",
    lockRename: { "review-kit": "kit" },
  });

  // Removing `format:` hands the choice back to detection, which is a different intent.
  const detected = detectLockDrift(
    { acf: 1, capabilities: [{ source, rename: { "review-kit": "kit" } }] },
    lock,
  );
  expect(detected.map((diagnostic) => diagnostic.code)).toEqual(["acf.lock.drift"]);
  expect(detected[0]?.data).toMatchObject({ ymlFormat: null, lockFormat: "claude-plugin" });
});

test("include/exclude drift is diagnosed regardless of family and name order", () => {
  const source = { kind: "path", location: "/repo" } as const;
  const lockEntry = {
    capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    capabilityNames: ["hardware"],
    exclude: { skills: ["a", "b"], mcp: ["files"] },
    source: "path:/repo",
    sourceId: "path:/repo",
  };
  const lock: CapabilitiesLock = { acf: 1, entries: [lockEntry] };
  const same: CapabilitiesYml = {
    acf: 1,
    capabilities: [{ source, exclude: { mcp: ["files"], skills: ["b", "a"] } }],
  };
  const changed: CapabilitiesYml = {
    acf: 1,
    capabilities: [{ source, exclude: { skills: ["a"] } }],
  };

  expect(detectLockDrift(same, lock)).toEqual([]);
  const diagnostics = detectLockDrift(changed, lock);
  expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["acf.lock.drift"]);
  expect(diagnostics[0]?.data).toMatchObject({
    ymlSelection: { include: null, exclude: { skills: ["a"] } },
  });
});

test("a lock entry capabilities.yml no longer declares is drift", () => {
  const kept = { kind: "github" as const, repo: "owner/kept" };
  const yml: CapabilitiesYml = { acf: 1, capabilities: [{ source: kept, ref: "main" }] };
  const entry = (name: string) => ({
    capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    capabilityNames: [name],
    ref: "main",
    resolvedSha: "abc123",
    source: `github:owner/${name}`,
    sourceId: `github:owner/${name}`,
  });
  const lock: CapabilitiesLock = { acf: 1, entries: [entry("kept"), entry("removed")] };

  const diagnostics = detectLockDrift(yml, lock);

  expect(diagnostics.map((item) => [item.severity, item.code, item.data?.sourceId])).toEqual([
    ["error", "acf.lock.drift", "github:owner/removed"],
  ]);
  expect(diagnostics[0]?.message).toContain("github:owner/removed");
});
