import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesLock,
  detectLockDrift,
  entrySourceId,
  readLockfile,
  writeLockfile,
} from "../src";
import { cleanup, tempDir } from "./helpers";

test("lockfile round-trips with sorted entries and alphabetical entry keys", async () => {
  const dir = await tempDir("acf-installer-lock-");
  try {
    const lockPath = path.join(dir, "capabilities.lock");
    const lock: CapabilitiesLock = {
      acf: 1,
      entries: [
        {
          sourceId: "github:z/repo",
          source: "github:z/repo",
          ref: "main",
          resolvedSha: "bbbb",
          resolvedAt: "2026-05-28T00:00:00.000Z",
          capabilityHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          capabilityNames: ["zeta"],
          capabilities: ["z/**", "a"],
        },
        {
          sourceId: "github:a/repo",
          source: "github:a/repo",
          ref: "v1",
          resolvedSha: "aaaa",
          resolvedAt: "2026-05-28T00:00:00.000Z",
          capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          capabilityNames: ["alpha"],
          include: { skill: ["b", "a"] },
        },
      ],
    };

    await writeLockfile(lockPath, lock);
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as { acf: number; entries: Array<Record<string, unknown>> };
    expect(parsed.entries.map((entry) => entry.sourceId)).toEqual([
      "github:a/repo",
      "github:z/repo",
    ]);
    expect(Object.keys(parsed.entries[0] ?? {})).toEqual([
      "capabilityHash",
      "capabilityNames",
      "include",
      "ref",
      "resolvedAt",
      "resolvedSha",
      "source",
      "sourceId",
    ]);
    const reread = await readLockfile(lockPath);
    expect(reread?.acf).toBe(1);
    expect(reread?.entries.map((entry) => entry.sourceId)).toEqual([
      "github:a/repo",
      "github:z/repo",
    ]);
    expect(reread?.entries[0]?.include).toEqual({ skill: ["a", "b"] });
    expect(reread?.entries[1]?.capabilities).toEqual(["a", "z/**"]);
  } finally {
    await cleanup(dir);
  }
});

test("lockfiles reject capability names that could escape the snapshot root", async () => {
  const dir = await tempDir("acf-installer-lock-unsafe-");
  try {
    const lockPath = path.join(dir, "capabilities.lock");
    await Bun.write(
      lockPath,
      JSON.stringify({
        acf: 1,
        entries: [
          {
            capabilityHash:
              "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            capabilityNames: ["../../outside"],
            source: "path:/repo",
            sourceId: "path:/repo",
          },
        ],
      }),
    );
    await expect(readLockfile(lockPath)).rejects.toThrow("invalid lock capabilityNames");
  } finally {
    await cleanup(dir);
  }
});

test("entry source ids distinguish monorepo paths", () => {
  const source = { kind: "github" as const, repo: "owner/capabilities" };
  expect(entrySourceId({ source })).toBe("github:owner/capabilities");
  expect(entrySourceId({ source, path: "capabilities/alpha" })).toBe(
    "github:owner/capabilities#path=capabilities%2Falpha",
  );
  expect(entrySourceId({ source, path: "capabilities\\alpha" })).toBe(
    "github:owner/capabilities#path=capabilities%2Falpha",
  );
});

test("unsupported lockfile version is diagnosed", () => {
  const lock = { acf: 2 as 1, entries: [] };
  expect(
    detectLockDrift({ acf: 1, capabilities: [] }, lock).map((diagnostic) => diagnostic.code),
  ).toEqual(["acf.lock.unsupported-version"]);
});

test("lockfiles round-trip optional synthesized provenance and accept older entries", async () => {
  const dir = await tempDir("acf-installer-lock-synthesized-");
  try {
    const lockPath = path.join(dir, "capabilities.lock");
    const base = {
      capabilityHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      capabilityNames: ["skill"],
      source: "path:/repo",
      sourceId: "path:/repo",
    };
    await writeLockfile(lockPath, { acf: 1, entries: [{ ...base, synthesized: true }, base] });
    const reread = await readLockfile(lockPath);
    expect(reread?.entries.map((entry) => entry.synthesized)).toEqual([true, undefined]);
  } finally {
    await cleanup(dir);
  }
});
