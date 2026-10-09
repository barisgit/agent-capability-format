import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScopeRoot } from "@caplet/core";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  retainLockedCapabilities,
  type SourceSpec,
  stringifyYml,
} from "@caplet/core";
import {
  canonicalizePathLocation,
  entrySourceId,
  type LockEntry,
  readCapabilitiesYml,
  readLockfile,
  sourceString,
  sourceUrlCredentialProblem,
  writeLockfile,
} from "@caplet/installer";
import { validationError } from "./args.js";

export type ParsedAddSource = {
  source: string;
  spec: SourceSpec;
  selector?: string;
};

export function parseAddSource(input: string): ParsedAddSource {
  if (!input.startsWith("github:")) return { source: input, spec: parseSourceSpec(input) };
  const separator = input.lastIndexOf("@");
  if (separator < "github:".length) return { source: input, spec: parseSourceSpec(input) };
  const source = input.slice(0, separator);
  const selector = input.slice(separator + 1);
  if (selector.length === 0) throw validationError("capability name after @ must not be empty");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selector)) {
    throw validationError(`invalid capability selector: ${selector}`);
  }
  return { source, spec: parseSourceSpec(source), selector };
}

export type ManifestEntryOptions = {
  ref?: string | undefined;
  path?: string | undefined;
  rename?: string | undefined;
  capabilities?: string[] | undefined;
};

export function buildManifestEntry(
  source: string,
  opts: ManifestEntryOptions = {},
): CapabilityEntry {
  const entry = buildEntry(source, opts);
  if (opts.capabilities !== undefined) entry.capabilities = opts.capabilities;
  return entry;
}

export function parseSourceSpec(source: string): SourceSpec {
  if (source.startsWith("github:")) return { kind: "github", repo: source.slice("github:".length) };
  if (source.startsWith("git:")) {
    const url = source.slice("git:".length);
    const credentialProblem = sourceUrlCredentialProblem(url);
    if (credentialProblem !== null) throw validationError(credentialProblem);
    return { kind: "git", url };
  }
  if (source.startsWith("path:")) return { kind: "path", location: source.slice("path:".length) };
  if (source.length > 0) return { kind: "path", location: source };
  throw validationError("source must not be empty");
}

export async function addManifestEntry(
  root: ScopeRoot,
  source: string | CapabilityEntry,
  opts: ManifestEntryOptions = {},
): Promise<CapabilityEntry> {
  const manifest = await readManifestForMutation(root);
  const entry = typeof source === "string" ? buildManifestEntry(source, opts) : source;
  const duplicate = manifest.capabilities.some(
    (candidate) =>
      entrySourceId(candidate, path.dirname(root.manifestPath)) ===
      entrySourceId(entry, path.dirname(root.manifestPath)),
  );
  if (duplicate) {
    throw validationError(
      `source already exists: ${sourceString(entry.source, path.dirname(root.manifestPath))}`,
    );
  }
  manifest.capabilities.push(entry);
  await writeCapabilitiesYml(root, manifest);
  return entry;
}

/**
 * Drops every capability in `names` from the scope's capabilities.yml, narrowing a shared source
 * entry to its survivors, updates the lockfile to match and deletes their installed snapshots. All
 * names must be installed: an unknown one throws before anything is written.
 */
export async function removeManifestEntries(
  root: ScopeRoot,
  names: readonly string[],
): Promise<void> {
  const removing = new Set(names);
  const manifest = await readManifestForMutation(root);
  const lock = await readLockfile(root.lockPath);
  const sourceIdsToRemove = new Set<string>();
  const lockUpdates = new Map<
    string,
    {
      capabilityNames: string[];
      capabilities: string[];
      selectorsByCapability: Record<string, string>;
      rename?: CapabilityEntry["rename"];
    }
  >();
  const found = new Set<string>();
  const kept = manifest.capabilities.flatMap((entry) => {
    const id = entrySourceId(entry, path.dirname(root.manifestPath));
    const legacyId = sourceString(entry.source, path.dirname(root.manifestPath));
    const lockEntry = lock?.entries.find(
      (candidate) => candidate.sourceId === id || candidate.sourceId === legacyId,
    );
    const installed = lockEntry?.capabilityNames ?? namesFromEntry(entry);
    const matched = installed.filter((candidate) => removing.has(candidate));
    if (typeof entry.rename === "string" && removing.has(entry.rename)) matched.push(entry.rename);
    if (matched.length === 0) return [entry];
    for (const candidate of matched) found.add(candidate);
    const survivors = installed.filter((candidate) => !removing.has(candidate));
    if (survivors.length === 0) {
      sourceIdsToRemove.add(id);
      sourceIdsToRemove.add(legacyId);
      return [];
    }

    function originalCapabilityName(entry: CapabilityEntry, installedName: string): string {
      if (typeof entry.rename !== "object") return installedName;
      return (
        Object.entries(entry.rename).find(([, renamed]) => renamed === installedName)?.[0] ??
        installedName
      );
    }
    function selectorForRemoval(
      entry: CapabilityEntry,
      lockEntry: LockEntry | undefined,
      installedName: string,
    ): string {
      const mapped = lockEntry?.selectorsByCapability?.[installedName];
      if (mapped !== undefined) return mapped;
      const originalName = originalCapabilityName(entry, installedName);
      if (entry.capabilities?.includes(originalName)) return originalName;
      throw validationError(
        "lockfile lacks exact selectors for safe removal; run caplet update --no-apply, then retry",
      );
    }
    const selectorsByCapability = Object.fromEntries(
      survivors.map((candidate) => [candidate, selectorForRemoval(entry, lockEntry, candidate)]),
    );
    const capabilities = survivors.map(
      (candidate) => selectorsByCapability[candidate] ?? originalCapabilityName(entry, candidate),
    );
    const next: CapabilityEntry = { ...entry, capabilities };
    if (typeof entry.rename === "object") {
      const rename = Object.fromEntries(
        Object.entries(entry.rename).filter(
          ([original, renamed]) => capabilities.includes(original) || survivors.includes(renamed),
        ),
      );
      if (Object.keys(rename).length === 0) delete next.rename;
      else next.rename = rename;
    }
    if (lockEntry !== undefined) {
      lockUpdates.set(lockEntry.sourceId, {
        capabilityNames: survivors,
        capabilities,
        selectorsByCapability,
        ...(next.rename === undefined ? {} : { rename: next.rename }),
      });
    }
    return [next];
  });
  const unknown = names.filter((name) => !found.has(name));
  if (unknown.length > 0) {
    throw validationError(
      `unknown ${unknown.length === 1 ? "capability" : "capabilities"}: ${unknown.join(", ")}`,
    );
  }
  await writeCapabilitiesYml(root, { ...manifest, capabilities: kept });
  if (lock !== null) {
    await writeLockfile(root.lockPath, {
      acf: 1,
      entries: lock.entries
        .filter((entry) => !sourceIdsToRemove.has(entry.sourceId))
        .map((entry) => {
          const update = lockUpdates.get(entry.sourceId);
          if (update === undefined) return entry;
          const next = { ...retainLockedCapabilities(entry, update.capabilityNames), ...update };
          if (update.rename === undefined) delete next.rename;
          return next;
        }),
    });
  }
  for (const name of names) {
    await rm(path.join(root.capabilitiesDir, name), { recursive: true, force: true });
  }
}

/**
 * Reads capabilities.yml for an add/remove rewrite. An unreadable or invalid manifest parses as
 * empty, so rewriting it would silently drop every existing entry (and reconciliation would then
 * delete their installed snapshots). Refuse instead and leave the file, lock, and installs alone.
 */
export async function readManifestForMutation(root: ScopeRoot): Promise<CapabilitiesYml> {
  const manifest = await readCapabilitiesYml(root.manifestPath);
  const errors = manifest.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    const details = errors.map((item) => `${item.code}: ${item.message}`).join("; ");
    throw validationError(
      `refusing to modify invalid ${root.manifestPath} (fix it first): ${details}`,
    );
  }
  return manifest.value;
}

export async function writeCapabilitiesYml(
  root: ScopeRoot,
  manifest: CapabilitiesYml,
): Promise<void> {
  await mkdir(path.dirname(root.manifestPath), { recursive: true });
  const humanReadable = manifest.capabilities.map(
    ({ source, capabilities: selected, ...entry }) => ({
      source: manifestSourceString(source),
      ...(selected === undefined
        ? {}
        : { capabilities: selected.length === 1 ? selected[0] : selected }),
      ...entry,
    }),
  );
  const document = {
    acf: 1,
    ...(manifest.defaults === undefined ? {} : { defaults: manifest.defaults }),
    capabilities: humanReadable,
  };
  await writeFile(root.manifestPath, stringifyYml(document), "utf8");
}

// Path locations are written exactly as stored: relative ones stay relative to the manifest
// directory (SPEC 18.3). New CLI inputs are made absolute against the caller's cwd before they
// reach the manifest (see anchorPathSource).
function manifestSourceString(source: SourceSpec): string {
  if (source.kind === "path") return `path:${source.location}`;
  return sourceString(source);
}

/** Returns the entry with a relative or home-relative `path:` location made absolute from baseDir. */
export function anchorPathSource(entry: CapabilityEntry, baseDir: string): CapabilityEntry {
  if (entry.source.kind !== "path") return entry;
  return {
    ...entry,
    source: { kind: "path", location: canonicalizePathLocation(entry.source.location, baseDir) },
  };
}

function buildEntry(source: string, opts: ManifestEntryOptions): CapabilityEntry {
  const entry: CapabilityEntry = { source: parseSourceSpec(source) };
  if (opts.ref !== undefined) entry.ref = opts.ref;
  if (opts.path !== undefined) entry.path = opts.path;
  if (opts.rename !== undefined) entry.rename = opts.rename;
  if ((entry.source.kind === "git" || entry.source.kind === "github") && entry.ref === undefined) {
    throw validationError(
      `git and github sources require --ref (try: caplet add ${source} --ref main)`,
    );
  }
  return entry;
}

function namesFromEntry(entry: CapabilityEntry): string[] {
  if (typeof entry.rename === "string") return [entry.rename];
  if (entry.rename !== undefined) return Object.values(entry.rename);
  if (entry.source.kind === "path") return [path.basename(entry.source.location)];
  return [];
}
