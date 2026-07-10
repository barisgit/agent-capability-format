import path from "node:path";
import type { AcfCapability, AssetRef, FacetFamily, ReadOnlyFs } from "@acf/core";

export type AssetPayload = { relativePath: string; bytes: Uint8Array; mode: number };

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

export async function readAssets(
  cap: AcfCapability,
  assets: readonly AssetRef[],
  fs: ReadOnlyFs,
  relativePathFor: (assetPath: string) => string | null,
): Promise<AssetPayload[]> {
  const out: AssetPayload[] = [];
  const seen = new Set<string>();
  for (const asset of [...assets].sort(
    (a, b) => a.path.localeCompare(b.path) || a.origin.localeCompare(b.origin),
  )) {
    const relativePath = relativePathFor(asset.path);
    if (relativePath === null || seen.has(relativePath)) continue;
    seen.add(relativePath);
    const assetSourcePath = path.join(cap.root, asset.path);
    const [bytes, mode] = await Promise.all([
      fs.readBytes(assetSourcePath),
      fs.readMode(assetSourcePath),
    ]);
    if (bytes !== null) out.push({ relativePath, bytes, mode: mode ?? 0o644 });
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
