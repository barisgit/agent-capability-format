import type { AcfOwnership, FileContent, FileDiff } from "@caplet/core";

/**
 * A file diff owning `owns`; `modes` is given for files whose permission bits are written too
 * (assets), and omitted for generated text.
 */
export function makeFileDiff(
  path: string,
  before: FileContent | null,
  after: FileContent | null,
  owns: AcfOwnership[],
  modes?: { before: number | null; after: number | null },
): FileDiff {
  return modes === undefined
    ? { path, before, after, owns }
    : { path, before, after, beforeMode: modes.before, afterMode: modes.after, owns };
}
