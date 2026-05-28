import { homedir } from "node:os";
import path from "node:path";
import type { AcfCapability, FileDiff, ReadOnlyFs, Scope } from "@acf/core";
import { makeFileDiff } from "./diff";
import { renderMarkdownFile } from "./text";

export async function emitSkillsCanonical(
  cap: AcfCapability,
  scope: Scope,
  fs: ReadOnlyFs,
  capabilityName = cap.manifest.name,
): Promise<FileDiff[]> {
  void capabilityName;
  const skillsRoot = skillsRootForScope(scope);
  const diffs: FileDiff[] = [];
  for (const skill of [...cap.skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const outPath = path.join(skillsRoot, skill.name, "SKILL.md");
    const before = await fs.readText(outPath);
    diffs.push(makeFileDiff(outPath, before, renderMarkdownFile(skill.frontmatter, skill.body), [
      { kind: "file" },
    ]));
  }
  return diffs;
}

export function skillsRootForScope(scope: Scope): string {
  // Shared ACF skills root; target installRoot is intentionally not used for skills.
  return scope === "user"
    ? path.join(homedir(), ".agents", "skills")
    : path.join(".", ".agents", "skills");
}
