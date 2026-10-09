import path from "node:path";
import type { AcfCapability, AssetRef, FacetFamily, ReadOnlyFs } from "@caplet/core";

/** One asset read from the capability, addressed relative to where it is written. */
export type AssetPayload = {
  /** POSIX path relative to the emitted artifact's directory. */
  relativePath: string;
  /** The asset's path inside the capability. */
  sourcePath: string;
  bytes: Uint8Array;
  mode: number;
};

/** The capability's assets that belong to the named facet. */
export function assetsForFacet(cap: AcfCapability, family: FacetFamily, name: string): AssetRef[] {
  return cap.assets.filter(
    (asset) => "name" in asset.facet && asset.facet.family === family && asset.facet.name === name,
  );
}

/**
 * `assetPath` (relative to the capability root) relative to `baseDir`; `assetPath` itself when the
 * asset lies outside `baseDir`.
 */
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

/**
 * Reads `assets` in path order, addressing each by `relativePathFor` (null skips it). The first
 * asset for a relative path wins; missing files are skipped and an unknown mode reads as 0644.
 */
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
    if (bytes !== null) {
      out.push({ relativePath, sourcePath: asset.path, bytes, mode: mode ?? 0o644 });
    }
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
