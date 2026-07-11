import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScopeRoot } from "@acf/core";
import { type CapabilityEntry, type SourceSpec, stringifyYml } from "@acf/core";
import {
  entrySourceId,
  readCapabilitiesYml,
  readLockfile,
  sourceId,
  sourceString,
  writeLockfile,
} from "@acf/installer";
import { validationError } from "./args";

export function parseSourceSpec(source: string): SourceSpec {
  if (source.startsWith("github:")) return { kind: "github", repo: source.slice("github:".length) };
  if (source.startsWith("git:")) return { kind: "git", url: source.slice("git:".length) };
  if (source.startsWith("path:")) return { kind: "path", location: source.slice("path:".length) };
  if (source.length > 0) return { kind: "path", location: source };
  throw validationError("source must not be empty");
}

export async function addManifestEntry(
  root: ScopeRoot,
  source: string,
  opts: { ref?: string | undefined; path?: string | undefined; rename?: string | undefined },
): Promise<CapabilityEntry> {
  const manifest = await readCapabilitiesYml(root.manifestPath);
  const entry = buildEntry(source, opts);
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
  const kept = manifest.value.capabilities.filter((entry) => {
    const id = entrySourceId(entry, path.dirname(root.manifestPath));
    const legacyId = sourceId(entry.source, path.dirname(root.manifestPath));
    const lockEntry = lock?.entries.find(
      (candidate) => candidate.sourceId === id || candidate.sourceId === legacyId,
    );
    const names = lockEntry?.capabilityNames ?? namesFromEntry(entry);
    const remove = names.includes(name) || entry.rename === name;
    if (remove) {
      sourceIdsToRemove.add(id);
      sourceIdsToRemove.add(legacyId);
    }
    return !remove;
  });
  if (kept.length === manifest.value.capabilities.length)
    throw validationError(`unknown capability: ${name}`);
  await writeCapabilitiesYml(root, kept);
  if (lock !== null) {
    await writeLockfile(root.lockPath, {
      acf: 1,
      entries: lock.entries.filter((entry) => !sourceIdsToRemove.has(entry.sourceId)),
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

function buildEntry(
  source: string,
  opts: { ref?: string | undefined; path?: string | undefined; rename?: string | undefined },
): CapabilityEntry {
  const entry: CapabilityEntry = { source: parseSourceSpec(source) };
  if (opts.ref !== undefined) entry.ref = opts.ref;
  if (opts.path !== undefined) entry.path = opts.path;
  if (opts.rename !== undefined) entry.rename = opts.rename;
  if ((entry.source.kind === "git" || entry.source.kind === "github") && entry.ref === undefined) {
    throw validationError("git and github sources require --ref");
  }
  return entry;
}

function namesFromEntry(entry: CapabilityEntry): string[] {
  if (typeof entry.rename === "string") return [entry.rename];
  if (entry.rename !== undefined) return Object.values(entry.rename);
  if (entry.source.kind === "path") return [path.basename(entry.source.location)];
  return [];
}
