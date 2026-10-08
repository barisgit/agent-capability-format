import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { listTreeFiles } from "./tree.js";

export {
  type CapabilityDigests,
  computeCapabilityDigests,
  computePayloadDigest,
  PAYLOAD_DIGEST_PATTERN,
} from "./payload-digest.js";

/**
 * Computes the v1 `capabilityHash` (`sha256-<hex>`) of a materialized capability tree
 * exactly as SPEC.md §19.5 defines it. The encoding is frozen for `acf: 1`: it ignores
 * file modes and frames entries with `0x00` separators only, so it is ambiguous; use
 * {@link computePayloadDigest} for integrity checks.
 */
export async function computeContentHash(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const entry of await listTreeFiles(root)) {
    hash.update(Buffer.from(entry.rel, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(await readFile(entry.absPath));
    hash.update(Buffer.from([0]));
  }
  return `sha256-${hash.digest("hex")}`;
}
