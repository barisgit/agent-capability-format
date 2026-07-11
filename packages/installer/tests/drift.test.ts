import { expect, test } from "bun:test";
import type { CapabilitiesYml } from "@acf/core";
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
