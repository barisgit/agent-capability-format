import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { cacheKeyFor } from "./lockfile";

export function getCachePath(cacheDir: string, sourceId: string, ref?: string | undefined): string {
  return path.join(cacheDir, cacheKeyFor(sourceId, ref));
}

export async function ensureCleanCache(cachePath: string): Promise<void> {
  await rm(cachePath, { recursive: true, force: true });
  await mkdir(path.dirname(cachePath), { recursive: true });
}
