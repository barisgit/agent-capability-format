import path from "node:path";
import type { CapabilityEntry, SourceSpec } from "@caplet/core";
import { ensureCleanCache, getCachePath } from "./cache.js";
import { cloneFull, cloneShallow, looksLikeSha, revParseHead } from "./git.js";
import { canonicalizePathLocation, entrySourceId, sourceId } from "./lockfile.js";
import { CREDENTIAL_IN_URL, sourceUrlCredentialProblem } from "./source-credentials.js";

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
  const repositoryId = sourceId(normalized.source);
  const id = entrySourceId(normalized);
  switch (normalized.source.kind) {
    case "path": {
      const root = resolveEntryPath(normalized.source.location, entry.path);
      return { root, commit: null, sourceId: id };
    }
    case "github":
    case "git": {
      const fetched = await fetchGitCapability(
        { ...normalized, source: normalized.source },
        repositoryId,
        opts,
      );
      return { ...fetched, sourceId: id };
    }
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
  const credentialProblem = sourceUrlCredentialProblem(url);
  if (credentialProblem !== null) throw new Error(`${CREDENTIAL_IN_URL}: ${credentialProblem}`);
  const authHeader = githubAuthHeader(entry.source);
  const shallow = opts.shallow ?? true;
  const blobless = opts.blobless ?? true;
  await retry(opts.retries ?? 0, async () => {
    await ensureCleanCache(destination);
    if (shallow && !looksLikeSha(ref)) {
      await cloneShallow({ url, destination, ref, blobless, authHeader });
    } else {
      await cloneFull({ url, destination, ref, blobless, authHeader });
    }
  });
  const commit = await revParseHead(destination);
  return {
    root: resolveEntryPath(destination, entry.path),
    commit,
    sourceId: id,
  };
}

function gitUrl(source: Extract<SourceSpec, { kind: "github" | "git" }>): string {
  if (source.kind === "git") return source.url;
  return `https://github.com/${source.repo}.git`;
}

// GITHUB_TOKEN is sent as an HTTP Basic header scoped to the clone URL instead of
// URL userinfo, so it stays out of git argv, error messages, and cached config.
function githubAuthHeader(
  source: Extract<SourceSpec, { kind: "github" | "git" }>,
): string | undefined {
  if (source.kind !== "github") return undefined;
  const token = process.env.GITHUB_TOKEN;
  if (token === undefined || token.length === 0) return undefined;
  const credential = Buffer.from(`x-access-token:${token}`).toString("base64");
  return `Authorization: Basic ${credential}`;
}

function resolveEntryPath(root: string, entryPath: string | undefined): string {
  if (entryPath === undefined) return root;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, entryPath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`capability path escapes source root: ${entryPath}`);
  }
  return resolved;
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
