import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeContentHash } from "../src";
import { addSymlink, cleanup, tempDir, writeText } from "./helpers";

test("VAL-HASH deterministic, ignores mtime, changes on content", async () => {
  const dir = await tempDir("acf-hash-");
  try {
    await writeText(path.join(dir, "acf.yml"), "acf: 1\nname: cafe\nversion: 1.0.0\n");
    await writeText(path.join(dir, "nested", "é.txt"), "one");
    await writeText(path.join(dir, "z.txt"), "two");
    const first = await computeContentHash(dir);
    expect(await computeContentHash(dir)).toBe(first);
    await utimes(path.join(dir, "z.txt"), new Date(1_000_000), new Date(1_000_000));
    expect(await computeContentHash(dir)).toBe(first);
    await writeFile(path.join(dir, "z.txt"), "changed", "utf8");
    expect(await computeContentHash(dir)).not.toBe(first);
  } finally {
    await cleanup(dir);
  }
});

test("VAL-HASH hashes a decomposed path name as its NFC form", async () => {
  const composed = await tempDir("acf-hash-nfc-");
  const decomposed = await tempDir("acf-hash-nfd-");
  try {
    await writeText(path.join(composed, "\u00e9.txt"), "one");
    await writeText(path.join(decomposed, "e\u0301.txt"), "one");
    expect(await computeContentHash(decomposed)).toBe(await computeContentHash(composed));
  } finally {
    await cleanup(composed);
    await cleanup(decomposed);
  }
});

test("VAL-HASH rejects symlinks", async () => {
  const dir = await tempDir("acf-hash-symlink-");
  try {
    await writeText(path.join(dir, "file.txt"), "x");
    await addSymlink(path.join(dir, "file.txt"), path.join(dir, "link.txt"));
    await expect(computeContentHash(dir)).rejects.toThrow("symlink not allowed");
  } finally {
    await cleanup(dir);
  }
});

test("VAL-HASH rejects special files", async () => {
  const dir = await tempDir("acf-hash-fifo-");
  try {
    execFileSync("mkfifo", [path.join(dir, "fifo")]);
    await expect(computeContentHash(dir)).rejects.toThrow("special file not allowed");
  } finally {
    await cleanup(dir);
  }
});
