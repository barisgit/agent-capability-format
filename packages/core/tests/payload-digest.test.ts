import { expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import path from "node:path";
import { computeContentHash, computePayloadDigest } from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

// Expected value computed independently from the SPEC.md §19.6 framing (Python reference).
const PINNED_DIGEST =
  "acf-tree-2:sha256:6ee7dc29452a8f6e41968100f72a1570473fc672b6bc45b11cbcf4ec21c7af88";
const PINNED_V1 = "sha256-caea9ae18287baa1a8dc655f5f8293ed71daf39fbc08f42f30675e1da16a89a0";

test("payload digest matches the pinned acf-tree-2 value for a fixed tree", async () => {
  const dir = await tempDir("acf-digest-pinned-");
  try {
    await writeText(path.join(dir, "acf.yml"), "acf: 1\nname: pinned\nversion: 1.0.0\n");
    await writeText(path.join(dir, "scripts", "run.sh"), "#!/bin/sh\necho hi\n");
    await chmod(path.join(dir, "scripts", "run.sh"), 0o755);
    // Decomposed on disk; the digest frames the NFC form.
    await writeText(path.join(dir, "docs", "e\u0301.md"), "accent\n");
    expect(await computePayloadDigest(dir)).toBe(PINNED_DIGEST);
    expect(await computeContentHash(dir)).toBe(PINNED_V1);
  } finally {
    await cleanup(dir);
  }
});

test("a mode-only change changes the payload digest but not the v1 hash", async () => {
  const dir = await tempDir("acf-digest-mode-");
  try {
    const script = path.join(dir, "scripts", "run.sh");
    await writeText(script, "#!/bin/sh\n");
    await chmod(script, 0o644);
    const before = { digest: await computePayloadDigest(dir), v1: await computeContentHash(dir) };
    await chmod(script, 0o755);
    expect(await computePayloadDigest(dir)).not.toBe(before.digest);
    expect(await computeContentHash(dir)).toBe(before.v1);
  } finally {
    await cleanup(dir);
  }
});

test("snapshots with identical v1 concatenations get different payload digests", async () => {
  const one = await tempDir("acf-digest-ambiguous-a-");
  const two = await tempDir("acf-digest-ambiguous-b-");
  try {
    // v1 bytes of both trees: "a\0" "\0b\0x" "\0" == "a\0" "" "\0" "b\0" "x" "\0".
    await writeText(path.join(one, "a"), "\0b\0x");
    await writeText(path.join(two, "a"), "");
    await writeText(path.join(two, "b"), "x");
    expect(await computeContentHash(one)).toBe(await computeContentHash(two));
    expect(await computePayloadDigest(one)).not.toBe(await computePayloadDigest(two));
  } finally {
    await cleanup(one);
    await cleanup(two);
  }
});

test("payload digest rejects paths that collide after NFC normalization", async () => {
  const dir = await tempDir("acf-digest-collision-");
  try {
    await writeText(path.join(dir, "\u00e9.md"), "composed");
    await writeText(path.join(dir, "e\u0301.md"), "decomposed");
    await expect(computePayloadDigest(dir)).rejects.toThrow("normalization collision");
  } finally {
    await cleanup(dir);
  }
});
