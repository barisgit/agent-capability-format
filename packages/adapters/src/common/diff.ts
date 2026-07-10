import type { AcfOwnership, FileDiff } from "@acf/core";

export function makeFileDiff(
  path: string,
  before: string | null,
  after: string | null,
  owns: AcfOwnership[],
): FileDiff {
  return { path, before, after, owns };
}
