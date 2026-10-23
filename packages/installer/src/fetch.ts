import { realpath } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilityEntry,
  CREDENTIAL_IN_URL,
  isErrno,
  type SourceSpec,
  sourceUrlCredentialProblem,
} from "@caplet/core";
import { ensureCleanCache, getCachePath } from "./cache.js";
import { cloneFull, cloneShallow, looksLikeSha, revParseHead } from "./git.js";
import { canonicalizePathLocation, entrySourceId, sourceString } from "./lockfile.js";

/** Where and how {@link fetchCapability} clones git sources. */
export type FetchOptions = {
  /** Holds one clone per source id and ref, replaced on every fetch. */
  cacheDir: string;
  /** Clone only the ref at depth 1 unless it is a commit SHA. Defaults to true. */
  shallow?: boolean | undefined;
  /** Clone with `--filter=blob:none`. Defaults to true. */
  blobless?: boolean | undefined;
  /** Extra clone attempts after a failure. Defaults to 0. */
  retries?: number | undefined;
};

/** A source made available locally. */
export type FetchedCapability = {
  /** The entry's `path:` within the source or clone. */
  root: string;
  /** Checked-out commit; null for `path:` sources. */
  commit: string | null;
  /** The entry's source id (`entrySourceId`). */
  sourceId: string;
};

/**
 * Makes an entry's source available locally: a `path:` source where it is, a git source as a
 * fresh clone of `ref` in `opts.cacheDir`. Throws when a git source has no `ref` or a
 * credential-bearing URL, when git still fails after `opts.retries`, or when `path:` escapes
 * the source root.
 */
export async function fetchCapability(
  entry: CapabilityEntry,
  opts: FetchOptions,
): Promise<FetchedCapability> {
  const normalized = withAbsolutePathSource(entry);
  const repositoryId = sourceString(normalized.source);
  const id = entrySourceId(normalized);
  switch (normalized.source.kind) {
    case "path": {
      const root = await resolveEntryPath(normalized.source.location, entry.path);
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

/** `entry` with a `path:` location made absolute against the working directory. */
function withAbsolutePathSource(entry: CapabilityEntry): CapabilityEntry {
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
    root: await resolveEntryPath(destination, entry.path),
    commit,
    sourceId: id,
  };
}

/** Invalid selected source path: absent, not traversable, or outside its source boundary. */
export class SourcePathError extends Error {
  readonly exitCode = 2;

  constructor(
    message: string,
    readonly code:
      | "acf.source.path-escape"
      | "acf.resolve.no-capabilities" = "acf.source.path-escape",
    readonly path?: string,
  ) {
    super(message);
  }
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

async function resolveEntryPath(root: string, entryPath: string | undefined): Promise<string> {
  if (entryPath === undefined) return root;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, entryPath);
  assertSelectedPathInside(resolvedRoot, resolved, entryPath);
  // Lexical containment alone does not constrain a selected symlink's destination.
  let realRoot: string;
  let realSelected: string;
  try {
    [realRoot, realSelected] = await Promise.all([realpath(resolvedRoot), realpath(resolved)]);
  } catch (error) {
    if (!isErrno(error, "ENOENT") && !isErrno(error, "ENOTDIR")) throw error;
    throw new SourcePathError(
      `no capabilities at selected source path ${resolved}: path is missing or not a directory`,
      "acf.resolve.no-capabilities",
      resolved,
    );
  }
  assertSelectedPathInside(realRoot, realSelected, entryPath);
  return realSelected;
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

/** Checks paths using this filesystem's separators, both before and after symlink resolution. */
function assertSelectedPathInside(root: string, selected: string, entryPath: string): void {
  const relative = path.relative(root, selected);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new SourcePathError(`capability path escapes source root: ${entryPath}`);
  }
}
