import { homedir } from "node:os";
import path from "node:path";
import {
  type AcfCapability,
  type Diagnostic,
  type FileDiff,
  MANAGEMENT_NOTICE_FILENAME,
  type ReadOnlyFs,
  renderArtifactNotice,
  type Scope,
  type SkillFacet,
  type TargetDefinition,
} from "@acf/core";
import { type AssetPayload, readAssets } from "./assets";
import { makeFileDiff } from "./diff";
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
    const assets = await readSkillAssets(cap, skill, fs);
    for (const root of destinations) {
      const skillRoot = path.join(root, skill.name);
      const skillPath = path.join(skillRoot, "SKILL.md");
      const facet = { family: "skill" as const, name: skill.name };
      if (cap.synthesized) {
        await pushSkillPrimaryBytes(diffs, emittedPaths, fs, skillPath, skill, {
          artifactRoot: skillRoot,
          facet,
        });
      } else {
        await pushTextDiff(
          diffs,
          emittedPaths,
          fs,
          skillPath,
          renderMarkdownFile(skill.frontmatter, skill.body),
          { artifactRoot: skillRoot, facet },
        );
      }

      await pushTextDiff(
        diffs,
        emittedPaths,
        fs,
        path.join(skillRoot, MANAGEMENT_NOTICE_FILENAME),
        renderArtifactNotice(cap.manifest.name),
        { artifactRoot: skillRoot, facet, managementNotice: "artifact" },
      );

      for (const asset of assets) {
        if (asset.relativePath === MANAGEMENT_NOTICE_FILENAME) {
          diagnostics.push({
            severity: "error",
            code: "acf.emit.managed-notice-reserved-path",
            message: `${MANAGEMENT_NOTICE_FILENAME} is reserved for ACF management notices`,
            path: path.join(skillRoot, asset.relativePath),
            family: "skill",
            capability: { name: cap.manifest.name },
            data: { facet: skill.name, sourcePath: asset.sourcePath },
          });
          continue;
        }
        await pushAssetDiff(
          diffs,
          emittedPaths,
          fs,
          path.join(skillRoot, asset.relativePath),
          asset,
          { artifactRoot: skillRoot, facet },
        );
      }

      async function pushAssetDiff(
        diffs: FileDiff[],
        emittedPaths: Set<string>,
        fs: ReadOnlyFs,
        outPath: string,
        asset: AssetPayload,
        metadata: Pick<FileDiff, "artifactRoot" | "facet">,
      ): Promise<void> {
        if (emittedPaths.has(outPath)) return;
        emittedPaths.add(outPath);
        const [before, beforeMode] = await Promise.all([
          fs.readBytes(outPath),
          fs.readMode(outPath),
        ]);
        const diff = makeFileDiff(outPath, before, asset.bytes, [{ kind: "file" }], {
          before: beforeMode,
          after: asset.mode,
        });
        Object.assign(diff, metadata);
        diffs.push(diff);
      }
    }
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

async function pushSkillPrimaryBytes(
  diffs: FileDiff[],
  emittedPaths: Set<string>,
  fs: ReadOnlyFs,
  outPath: string,
  skill: SkillFacet,
  metadata: Pick<FileDiff, "artifactRoot" | "facet">,
): Promise<void> {
  if (emittedPaths.has(outPath)) return;
  emittedPaths.add(outPath);
  const [before, after, beforeMode, afterMode] = await Promise.all([
    fs.readBytes(outPath),
    fs.readBytes(skill.primaryFile),
    fs.readMode(outPath),
    fs.readMode(skill.primaryFile),
  ]);
  if (after === null) return;
  const diff = makeFileDiff(outPath, before, after, [{ kind: "file" }], {
    before: beforeMode,
    after: afterMode ?? 0o644,
  });
  Object.assign(diff, metadata);
  diffs.push(diff);
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
  const emitNative = opts.native ?? !target.discoversCanonicalSkills;
  if (emitNative && nativeRoot !== null) roots.push(nativeRoot);
  return [...new Set(roots)].sort((a, b) => a.localeCompare(b));
}

async function readSkillAssets(
  cap: AcfCapability,
  skill: SkillFacet,
  fs: ReadOnlyFs,
): Promise<AssetPayload[]> {
  const skillPrefix = `skills/${skill.name}/`;
  const assets = cap.assets.filter((asset) => {
    if (asset.path.startsWith(skillPrefix)) return true;
    if (asset.path.startsWith("skills/")) return false;
    return (
      "name" in asset.facet && asset.facet.family === "skill" && asset.facet.name === skill.name
    );
  });
  return await readAssets(cap, assets, fs, (assetPath) => relativeSkillAssetPath(skill, assetPath));
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
  metadata?: Pick<FileDiff, "artifactRoot" | "facet" | "managementNotice">,
): Promise<void> {
  if (emittedPaths.has(outPath)) return;
  emittedPaths.add(outPath);
  const before = await fs.readText(outPath);
  const diff = makeFileDiff(outPath, before, after, [{ kind: "file" }]);
  if (metadata !== undefined) Object.assign(diff, metadata);
  diffs.push(diff);
}
