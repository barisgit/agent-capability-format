import { homedir } from "node:os";
import path from "node:path";
import type {
  AcfCapability,
  Diagnostic,
  FileDiff,
  ReadOnlyFs,
  Scope,
  SkillFacet,
  TargetDefinition,
} from "@acf/core";
import { makeFileDiff } from "./diff";
import { pushLossy } from "./diagnostics";
import { renderMarkdownFile } from "./text";

export type SkillEmitOptions = { native?: boolean | undefined; canonical?: boolean | undefined };

export async function emitSkills(
  cap: AcfCapability,
  scope: Scope,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  opts: SkillEmitOptions = {},
  diagnostics: Diagnostic[] = [],
): Promise<FileDiff[]> {
  const destinations = skillDestinations(scope, target, opts);
  if (destinations.length === 0) return [];
  const diffs: FileDiff[] = [];
  const emittedPaths = new Set<string>();

  for (const skill of [...cap.skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const assets = await readSkillAssets(cap, skill, fs, target, diagnostics);
    for (const root of destinations) {
      const skillRoot = path.join(root, skill.name);
      const skillPath = path.join(skillRoot, "SKILL.md");
      await pushTextDiff(diffs, emittedPaths, fs, skillPath, renderMarkdownFile(skill.frontmatter, skill.body));

      for (const asset of assets) {
        await pushTextDiff(
          diffs,
          emittedPaths,
          fs,
          path.join(skillRoot, asset.relativePath),
          asset.text,
        );
      }
    }
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

export function skillsRootForScope(scope: Scope): string {
  // Shared ACF skills root; target installRoot is intentionally not used for skills.
  return scope === "user"
    ? path.join(homedir(), ".agents", "skills")
    : path.join(".", ".agents", "skills");
}

function skillDestinations(
  scope: Scope,
  target: TargetDefinition,
  opts: SkillEmitOptions,
): string[] {
  const roots: string[] = [];
  if (opts.canonical !== false) roots.push(skillsRootForScope(scope));
  const nativeRoot = target.skillInstallPaths?.[scope] ?? null;
  if (opts.native !== false && nativeRoot !== null) roots.push(nativeRoot);
  return [...new Set(roots)].sort((a, b) => a.localeCompare(b));
}

function skillAssets(cap: AcfCapability, skill: SkillFacet) {
  return cap.assets.filter(
    (asset) =>
      "name" in asset.facet && asset.facet.family === "skill" && asset.facet.name === skill.name,
  );
}

async function readSkillAssets(
  cap: AcfCapability,
  skill: SkillFacet,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  diagnostics: Diagnostic[],
): Promise<Array<{ relativePath: string; text: string }>> {
  const out: Array<{ relativePath: string; text: string }> = [];
  const seen = new Set<string>();
  for (const asset of skillAssets(cap, skill)) {
    const relativePath = relativeSkillAssetPath(skill, asset.path);
    if (relativePath === null || seen.has(relativePath)) continue;
    seen.add(relativePath);
    const assetSourcePath = path.join(cap.root, asset.path);
    if (await isBinary(fs, assetSourcePath)) {
      // FileDiff is text-only today; keep binary asset transport lossy until a bytes channel exists.
      pushLossy(diagnostics, {
        code: "acf.adapter.facet-unsupported",
        message: `binary skill assets are not transported yet: ${asset.path}`,
        targetId: target.id,
        family: "skill",
        path: asset.path,
        data: { skill: skill.name },
      });
      continue;
    }
    const text = await fs.readText(assetSourcePath);
    if (text !== null) out.push({ relativePath, text });
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function relativeSkillAssetPath(skill: SkillFacet, assetPath: string): string | null {
  const prefix = `skills/${skill.name}/`;
  if (!assetPath.startsWith(prefix)) return null;
  const relativePath = assetPath.slice(prefix.length);
  return relativePath.length > 0 ? relativePath : null;
}

async function pushTextDiff(
  diffs: FileDiff[],
  emittedPaths: Set<string>,
  fs: ReadOnlyFs,
  outPath: string,
  after: string,
): Promise<void> {
  if (emittedPaths.has(outPath)) return;
  emittedPaths.add(outPath);
  const before = await fs.readText(outPath);
  diffs.push(makeFileDiff(outPath, before, after, [{ kind: "file" }]));
}

async function isBinary(fs: ReadOnlyFs, absPath: string): Promise<boolean> {
  const bytes = await fs.readBytes(absPath);
  if (bytes === null) return false;
  return bytes.includes(0);
}
