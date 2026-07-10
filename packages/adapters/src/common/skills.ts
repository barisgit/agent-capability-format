import { homedir } from "node:os";
import path from "node:path";
import type {
  AcfCapability,
  FileDiff,
  ReadOnlyFs,
  Scope,
  SkillFacet,
  TargetDefinition,
} from "@acf/core";
import { type AssetPayload, assetsForFacet, readAssets } from "./assets";
import { makeFileDiff } from "./diff";
import { renderMarkdownFile } from "./text";

export type SkillEmitOptions = { native?: boolean | undefined; canonical?: boolean | undefined };

export async function emitSkills(
  cap: AcfCapability,
  scope: Scope,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  opts: SkillEmitOptions = {},
): Promise<FileDiff[]> {
  const destinations = skillDestinations(scope, target, opts);
  if (destinations.length === 0) return [];
  const diffs: FileDiff[] = [];
  const emittedPaths = new Set<string>();

  for (const skill of [...cap.skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const assets = await readSkillAssets(cap, skill, fs);
    for (const root of destinations) {
      const skillRoot = path.join(root, skill.name);
      const skillPath = path.join(skillRoot, "SKILL.md");
      await pushTextDiff(
        diffs,
        emittedPaths,
        fs,
        skillPath,
        renderMarkdownFile(skill.frontmatter, skill.body),
      );

      for (const asset of assets) {
        await pushAssetDiff(
          diffs,
          emittedPaths,
          fs,
          path.join(skillRoot, asset.relativePath),
          asset,
        );
      }

      async function pushAssetDiff(
        diffs: FileDiff[],
        emittedPaths: Set<string>,
        fs: ReadOnlyFs,
        outPath: string,
        asset: AssetPayload,
      ): Promise<void> {
        if (emittedPaths.has(outPath)) return;
        emittedPaths.add(outPath);
        const [before, beforeMode] = await Promise.all([
          fs.readBytes(outPath),
          fs.readMode(outPath),
        ]);
        diffs.push(
          makeFileDiff(outPath, before, asset.bytes, [{ kind: "file" }], {
            before: beforeMode,
            after: asset.mode,
          }),
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

async function readSkillAssets(
  cap: AcfCapability,
  skill: SkillFacet,
  fs: ReadOnlyFs,
): Promise<AssetPayload[]> {
  return await readAssets(cap, assetsForFacet(cap, "skill", skill.name), fs, (assetPath) =>
    relativeSkillAssetPath(skill, assetPath),
  );
}

function relativeSkillAssetPath(skill: SkillFacet, assetPath: string): string | null {
  const prefix = `skills/${skill.name}/`;
  if (!assetPath.startsWith(prefix)) return assetPath;
  const relativePath = assetPath.slice(prefix.length);
  return relativePath.length > 0 ? relativePath : assetPath;
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
