import { createHash, type Hash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { listTreeFiles, type TreeFile } from "./tree.js";

const PAYLOAD_DIGEST_PREFIX = "acf-tree-2:sha256:";

/** Matches a well-formed payload digest value. */
export const PAYLOAD_DIGEST_PATTERN = /^acf-tree-2:sha256:[a-f0-9]{64}$/;

/** Entry kind byte for a regular file; the only kind a snapshot contains. */
const ENTRY_KIND_FILE = 0x01;

/** Both content hashes of one capability tree. */
export type CapabilityDigests = {
  /** v1 hash of SPEC.md §19.5, kept unchanged for `acf: 1` lockfiles. */
  capabilityHash: string;
  /** `acf-tree-2:sha256:<hex>` payload digest of SPEC.md §19.6. */
  payloadDigest: string;
};

/**
 * Computes the `acf-tree-2` payload digest of a materialized capability tree
 * (install-integrity, Payload digest; SPEC.md §19.6). Unlike the v1 hash it frames
 * every length and includes the executable bit, so mode changes and path/content
 * boundary shifts change it. Rejects symlinks, special files and paths that collide
 * after NFC normalization, naming the offending path.
 */
export async function computePayloadDigest(root: string): Promise<string> {
  return (await computeCapabilityDigests(root)).payloadDigest;
}

/**
 * Computes the v1 `capabilityHash` and the `acf-tree-2` payload digest in one pass,
 * reading each file once. Fails like {@link computePayloadDigest}.
 */
export async function computeCapabilityDigests(root: string): Promise<CapabilityDigests> {
  const files = await listTreeFiles(root);
  rejectNfcCollisions(files);
  const v1 = createHash("sha256");
  const v2 = createHash("sha256");
  for (const file of files) {
    const pathBytes = Buffer.from(file.rel, "utf8");
    const content = await readFile(file.absPath);
    v1.update(pathBytes);
    v1.update(Buffer.from([0]));
    v1.update(content);
    v1.update(Buffer.from([0]));
    frameEntry(v2, pathBytes, file.executable, content);
  }
  return {
    capabilityHash: `sha256-${v1.digest("hex")}`,
    payloadDigest: `${PAYLOAD_DIGEST_PREFIX}${v2.digest("hex")}`,
  };
}

// Framing (SPEC.md §19.6): kind byte, u64be path length, path bytes, executable byte,
// u64be content length, content bytes.
function frameEntry(hash: Hash, pathBytes: Buffer, executable: boolean, content: Buffer): void {
  hash.update(Buffer.from([ENTRY_KIND_FILE]));
  hash.update(u64be(pathBytes.length));
  hash.update(pathBytes);
  hash.update(Buffer.from([executable ? 1 : 0]));
  hash.update(u64be(content.length));
  hash.update(content);
}

function u64be(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

function rejectNfcCollisions(files: readonly TreeFile[]): void {
  // Files are sorted by NFC path, so equal NFC paths are adjacent.
  for (let index = 1; index < files.length; index += 1) {
    const previous = files[index - 1];
    const current = files[index];
    if (previous !== undefined && current !== undefined && previous.rel === current.rel) {
      throw new Error(`normalization collision: ${current.rel}`);
    }
  }
}
