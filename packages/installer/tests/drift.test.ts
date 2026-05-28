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
