import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScopeRoot } from "@acf/core";
import { type CapabilityEntry, type SourceSpec, stringifyYml } from "@acf/core";
import {
  entrySourceId,
  type LockEntry,
  readCapabilitiesYml,
  readLockfile,
  sourceId,
  sourceString,
  writeLockfile,
} from "@acf/installer";
import { validationError } from "./args";

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
  if (source.startsWith("git:")) return { kind: "git", url: source.slice("git:".length) };
  if (source.startsWith("path:")) return { kind: "path", location: source.slice("path:".length) };
  if (source.length > 0) return { kind: "path", location: source };
  throw validationError("source must not be empty");
}

export async function addManifestEntry(
  root: ScopeRoot,
  source: string | CapabilityEntry,
  opts: ManifestEntryOptions = {},
): Promise<CapabilityEntry> {
  const manifest = await readCapabilitiesYml(root.manifestPath);
  const entry = typeof source === "string" ? buildManifestEntry(source, opts) : source;
  const duplicate = manifest.value.capabilities.some(
    (candidate) =>
      entrySourceId(candidate, path.dirname(root.manifestPath)) ===
      entrySourceId(entry, path.dirname(root.manifestPath)),
  );
  if (duplicate) throw validationError(`source already exists: ${sourceString(entry.source)}`);
  manifest.value.capabilities.push(entry);
  await writeCapabilitiesYml(root, manifest.value.capabilities);
  return entry;
}

export async function removeManifestEntry(root: ScopeRoot, name: string): Promise<void> {
  const manifest = await readCapabilitiesYml(root.manifestPath);
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
  let found = false;
  const kept = manifest.value.capabilities.flatMap((entry) => {
    const id = entrySourceId(entry, path.dirname(root.manifestPath));
    const legacyId = sourceId(entry.source, path.dirname(root.manifestPath));
    const lockEntry = lock?.entries.find(
      (candidate) => candidate.sourceId === id || candidate.sourceId === legacyId,
    );
    const names = lockEntry?.capabilityNames ?? namesFromEntry(entry);
    if (!names.includes(name) && entry.rename !== name) return [entry];
    found = true;
    const survivors = names.filter((candidate) => candidate !== name);
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
  if (!found) throw validationError(`unknown capability: ${name}`);
  await writeCapabilitiesYml(root, kept);
  if (lock !== null) {
    await writeLockfile(root.lockPath, {
      acf: 1,
      entries: lock.entries
        .filter((entry) => !sourceIdsToRemove.has(entry.sourceId))
        .map((entry) => {
          const update = lockUpdates.get(entry.sourceId);
          if (update === undefined) return entry;
          const next = { ...entry, ...update };
          if (update.rename === undefined) delete next.rename;
          return next;
        }),
    });
  }
  await rm(path.join(root.capabilitiesDir, name), { recursive: true, force: true });
}

export async function writeCapabilitiesYml(
  root: ScopeRoot,
  capabilities: CapabilityEntry[],
): Promise<void> {
  await mkdir(path.dirname(root.manifestPath), { recursive: true });
  const humanReadable = capabilities.map(({ source, capabilities: selected, ...entry }) => ({
    source: sourceString(source),
    ...(selected === undefined
      ? {}
      : { capabilities: selected.length === 1 ? selected[0] : selected }),
    ...entry,
  }));
  await writeFile(root.manifestPath, stringifyYml({ acf: 1, capabilities: humanReadable }), "utf8");
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
