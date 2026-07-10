import type { AcfOwnership, FileContent, FileDiff } from "@acf/core";

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
