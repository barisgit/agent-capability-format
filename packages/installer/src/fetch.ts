import path from "node:path";
import type { CapabilityEntry, SourceSpec } from "@acf/core";
import { ensureCleanCache, getCachePath } from "./cache";
import { cloneFull, cloneShallow, looksLikeSha, revParseHead } from "./git";
import { canonicalizePathLocation, sourceId } from "./lockfile";

export type FetchOptions = {
  cacheDir: string;
  shallow?: boolean | undefined;
  blobless?: boolean | undefined;
  retries?: number | undefined;
};

export type FetchedCapability = { root: string; commit: string | null; sourceId: string };

export async function fetchCapability(
  entry: CapabilityEntry,
  opts: FetchOptions,
): Promise<FetchedCapability> {
  const normalized = normalizePublicPathEntry(entry);
  const id = sourceId(normalized.source);
  switch (normalized.source.kind) {
    case "path": {
      const root = entry.path
        ? path.join(normalized.source.location, entry.path)
        : normalized.source.location;
      return { root, commit: null, sourceId: id };
    }
    case "github":
    case "git":
      return await fetchGitCapability({ ...normalized, source: normalized.source }, id, opts);
  }
}

function normalizePublicPathEntry(entry: CapabilityEntry): CapabilityEntry {
  if (entry.source.kind !== "path") return entry;
  return {
    ...entry,
    source: { kind: "path", location: canonicalizePathLocation(entry.source.location) },
  };
}

async function fetchGitCapability(
  entry: CapabilityEntry & { source: Extract<SourceSpec, { kind: "github" | "git" }> },
  id: string,
  opts: FetchOptions,
): Promise<FetchedCapability> {
  const ref = entry.ref;
  if (ref === undefined) throw new Error("acf.resolve.ref-required: git sources require ref");
  const destination = getCachePath(opts.cacheDir, id, ref);
  const url = gitUrl(entry.source);
  const shallow = opts.shallow ?? true;
  const blobless = opts.blobless ?? true;
  await retry(opts.retries ?? 0, async () => {
    await ensureCleanCache(destination);
    if (shallow && !looksLikeSha(ref)) {
      await cloneShallow({ url, destination, ref, blobless });
    } else {
      await cloneFull({ url, destination, ref, blobless });
    }
  });
  const commit = await revParseHead(destination);
  return {
    root: entry.path ? path.join(destination, entry.path) : destination,
    commit,
    sourceId: id,
  };
}

function gitUrl(source: Extract<SourceSpec, { kind: "github" | "git" }>): string {
  if (source.kind === "git") return source.url;
  const token = process.env.GITHUB_TOKEN;
  if (token !== undefined && token.length > 0) {
    return `https://x-access-token:${encodeURIComponent(token)}@github.com/${source.repo}.git`;
  }
  return `https://github.com/${source.repo}.git`;
}

async function retry(retries: number, fn: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    }
  }
  throw lastError;
}
