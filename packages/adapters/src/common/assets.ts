import path from "node:path";
import type {
  AcfCapability,
  AssetRef,
  Diagnostic,
  FacetFamily,
  ReadOnlyFs,
  TargetId,
} from "@acf/core";
import { pushLossy } from "./diagnostics";

export type TextAsset = { relativePath: string; text: string };

export function assetsForFacet(cap: AcfCapability, family: FacetFamily, name: string): AssetRef[] {
  return cap.assets.filter(
    (asset) => "name" in asset.facet && asset.facet.family === family && asset.facet.name === name,
  );
}

export function relativeAssetPathFromBase(
  cap: AcfCapability,
  baseDir: string,
  assetPath: string,
): string {
  const absAsset = path.join(cap.root, assetPath);
  const relativePath = path.relative(baseDir, absAsset).split(path.sep).join("/");
  if (
    relativePath.length > 0 &&
    !relativePath.startsWith("../") &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }
  return assetPath;
}

export async function readTextAssets(
  cap: AcfCapability,
  assets: readonly AssetRef[],
  fs: ReadOnlyFs,
  targetId: TargetId,
  family: FacetFamily,
  name: string,
  diagnostics: Diagnostic[],
  relativePathFor: (assetPath: string) => string | null,
): Promise<TextAsset[]> {
  const out: TextAsset[] = [];
  const seen = new Set<string>();
  for (const asset of [...assets].sort(
    (a, b) => a.path.localeCompare(b.path) || a.origin.localeCompare(b.origin),
  )) {
    const relativePath = relativePathFor(asset.path);
    if (relativePath === null || seen.has(relativePath)) continue;
    seen.add(relativePath);
    const assetSourcePath = path.join(cap.root, asset.path);
    if (await isBinary(fs, assetSourcePath)) {
      // FileDiff is text-only today; keep binary asset transport lossy until a bytes channel exists.
      pushLossy(diagnostics, {
        code: "acf.assets.unsupported",
        message: `binary ${family} assets are not transported yet: ${asset.path}`,
        targetId,
        family,
        path: asset.path,
        data: { facet: name },
      });
      continue;
    }
    const text = await fs.readText(assetSourcePath);
    if (text !== null) out.push({ relativePath, text });
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function isBinary(fs: ReadOnlyFs, absPath: string): Promise<boolean> {
  const bytes = await fs.readBytes(absPath);
  if (bytes === null) return false;
  return bytes.includes(0);
}
