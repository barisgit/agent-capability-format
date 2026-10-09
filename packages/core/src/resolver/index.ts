import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { isForeignFormat, readForeignPackage } from "../formats/index.js";
import { computePayloadDigest } from "../hash/payload-digest.js";
import {
  type CapabilitiesLock,
  digestMismatchDiagnostic,
  findLockedCapability,
  type LockEntry,
  type LockedCapability,
  readLockfile,
} from "../lock/index.js";
import { readCapability } from "../reader/index.js";
import type {
  AcfCapability,
  CapabilityOrigin,
  CapabilitySource,
  Diagnostic,
  Scope,
  ScopeRoot,
} from "../types/index.js";
import { exists } from "../utils/fs.js";
import { applyEntrySelection } from "./selection.js";

export { applyEntrySelection, type EntrySelection } from "./selection.js";

export type ResolveScopeOptions = {
  /**
   * Lock describing the installed snapshots; read from `root.lockPath` when omitted. Pass
   * the in-memory lock when snapshots were just materialized without writing the lock.
   */
  lock?: CapabilitiesLock | null | undefined;
};

export type RepositoryDiscovery = { roots: string[]; diagnostics: Diagnostic[]; legacy: boolean };

export function scopeRoot(scope: Scope, agentsDir: string): ScopeRoot {
  return {
    scope,
    agentsDir,
    capabilitiesDir: path.join(agentsDir, "capabilities"),
    manifestPath: path.join(agentsDir, "capabilities.yml"),
    lockPath: path.join(agentsDir, "capabilities.lock"),
  };
}

export async function discoverScopes(cwd: string): Promise<ScopeRoot[]> {
  const scopes: ScopeRoot[] = [];
  const userDir = path.join(homedir(), ".agents");
  if (await exists(userDir)) scopes.push(scopeRoot("user", userDir));
  const projectDir = await findProjectAgentsDir(path.resolve(cwd));
  if (projectDir !== undefined && projectDir !== userDir)
    scopes.push(scopeRoot("project", projectDir));
  return scopes;
}

export async function discoverCapabilityRoots(repoRoot: string): Promise<string[]> {
  return (await discoverRepository(repoRoot)).roots;
}

export async function discoverRepository(repoRoot: string): Promise<RepositoryDiscovery> {
  const root = path.resolve(repoRoot);
  if (await hasManifest(root)) return { roots: [root], diagnostics: [], legacy: false };
  const acfDir = path.join(root, "acf");
  if (await exists(acfDir)) {
    const roots = await findManifestDirs(acfDir);
    return { roots: roots.sort(), diagnostics: [], legacy: false };
  }
  return {
    roots: [],
    diagnostics: [
      {
        severity: "info",
        code: "acf.resolve.no-capabilities",
        message: "no ACF capabilities discovered",
        path: root,
      },
    ],
    legacy: false,
  };
}

export async function readRepositoryCapabilities(
  repoRoot: string,
  scope: Scope = "project",
  origin: CapabilityOrigin = { kind: "local", directory: repoRoot },
): Promise<{ capabilities: AcfCapability[]; diagnostics: Diagnostic[] }> {
  const discovery = await discoverRepository(repoRoot);
  const capabilities: AcfCapability[] = [];
  const diagnostics = [...discovery.diagnostics];
  for (const root of discovery.roots) {
    const cap = await readCapability(root, scope, origin);
    cap.diagnostics.push(...discovery.diagnostics);
    capabilities.push(cap);
  }
  return { capabilities: capabilities.sort(byCapabilityName), diagnostics };
}

/**
 * Reads every installed capability snapshot of `root`. Capabilities with a lock record
 * carry their `source` provenance and resolve under the locked (possibly renamed) name; an
 * Agent Plugins or Claude plugin snapshot is read by the format reader its record names.
 */
export async function resolveScopeCapabilities(
  root: ScopeRoot,
  options: ResolveScopeOptions = {},
): Promise<{ capabilities: AcfCapability[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const capabilities: AcfCapability[] = [];
  if (!(await exists(root.capabilitiesDir))) return { capabilities, diagnostics };
  const lock = options.lock === undefined ? await readLockfile(root.lockPath) : options.lock;
  // A lock entry mirrors its capabilities.yml include/exclude, so selection follows the lock.
  const select = (capability: AcfCapability, entry: LockEntry | undefined): AcfCapability => {
    if (entry === undefined) return capability;
    const selected = applyEntrySelection(capability, entry);
    diagnostics.push(...selected.diagnostics);
    return selected.capability;
  };
  for (const entry of await readdir(root.capabilitiesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root.capabilitiesDir, entry.name);
    const locked = lock === null ? undefined : findLockedCapability(lock, entry.name);
    for (const capability of await readSnapshotCapabilities(root.scope, dir, locked, diagnostics))
      capabilities.push(select(capability, locked?.entry));
  }
  diagnostics.push(...sameScopeCollisionDiagnostics(capabilities));
  return { capabilities: capabilities.sort(byCapabilityName), diagnostics };
}

/**
 * The capabilities of installed snapshot `dir`, read by the format its lock record names and
 * carrying that record's provenance and name. A snapshot that no longer matches its record, or
 * a foreign package that does not load, yields none and pushes why to `diagnostics`.
 */
async function readSnapshotCapabilities(
  scope: Scope,
  dir: string,
  locked: ReturnType<typeof findLockedCapability>,
  diagnostics: Diagnostic[],
): Promise<AcfCapability[]> {
  const record = locked?.capability;
  // A snapshot counts as installed only while it still matches its lock record.
  const mismatch = record === undefined ? undefined : await verifySnapshot(dir, record);
  if (mismatch !== undefined) {
    diagnostics.push(mismatch);
    return [];
  }
  if (record !== undefined && isForeignFormat(record.format)) {
    const read = await readForeignPackage(record.format, dir, {
      scope,
      origin: { kind: "local", directory: dir },
      rename: record.name,
      revision: locked?.entry.resolvedSha ?? null,
      sourcePath: record.path,
    });
    if (read.capability !== undefined) return [read.capability];
    diagnostics.push(...read.diagnostics);
    return [];
  }
  const discovery = await discoverRepository(dir);
  diagnostics.push(...discovery.diagnostics);
  const capabilities: AcfCapability[] = [];
  for (const capRoot of discovery.roots) {
    const cap = await readCapability(capRoot, scope, { kind: "local", directory: capRoot });
    cap.diagnostics.push(...discovery.diagnostics);
    if (capRoot === dir) await applyLockedSource(cap, record, dir);
    capabilities.push(cap);
  }
  return capabilities;
}

/** Gives the capability at a snapshot root its lock record's provenance and locked name. */
async function applyLockedSource(
  cap: AcfCapability,
  record: LockedCapability | undefined,
  dir: string,
): Promise<void> {
  const source = await lockedSource(record, dir);
  if (source === undefined) return;
  // The snapshot keeps the package's own acf.yml; `rename` lives only in the lock.
  if (record !== undefined && record.name !== cap.manifest.name) {
    source.renamedFrom = cap.manifest.name;
    cap.manifest.name = record.name;
  }
  cap.source = source;
}

/**
 * Provenance of the installed snapshot `dir` from its lock record. A bare skill keeps its
 * original package as the only directory under `skills/` beside the synthesized
 * `acf.yml`, so that directory is its snapshot root.
 */
async function lockedSource(
  record: LockedCapability | undefined,
  dir: string,
): Promise<CapabilitySource | undefined> {
  if (record === undefined) return undefined;
  const snapshotRoot = record.format === "skills" ? await skillPackageRoot(dir) : dir;
  const source: CapabilitySource = { format: record.format, path: record.path, snapshotRoot };
  if (record.formatVersion !== undefined) source.formatVersion = record.formatVersion;
  return source;
}

/** The digest-mismatch error when snapshot `dir` no longer matches `record`. */
async function verifySnapshot(
  dir: string,
  record: LockedCapability,
): Promise<Diagnostic | undefined> {
  let actual: string;
  try {
    actual = await computePayloadDigest(dir);
  } catch (error) {
    // Links or special files added after locking make the tree undigestable.
    actual = `unreadable snapshot (${error instanceof Error ? error.message : String(error)})`;
  }
  if (actual === record.payloadDigest) return undefined;
  return digestMismatchDiagnostic(record.name, "snapshot", record.payloadDigest, actual);
}

async function skillPackageRoot(dir: string): Promise<string> {
  const skillsDir = path.join(dir, "skills");
  const skills = (await readdir(skillsDir, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );
  return skills.length === 1 && skills[0] !== undefined
    ? path.join(skillsDir, skills[0].name)
    : dir;
}

export function deduplicateCapabilities(
  user: AcfCapability[],
  project: AcfCapability[],
): { effective: AcfCapability[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, AcfCapability>();
  for (const cap of user) byName.set(cap.manifest.name, cap);
  for (const cap of project) {
    if (byName.has(cap.manifest.name))
      diagnostics.push({
        severity: "info",
        code: "acf.capability.shadowed",
        message: `project capability ${cap.manifest.name} shadows user capability`,
        data: { name: cap.manifest.name },
      });
    byName.set(cap.manifest.name, cap);
  }
  return { effective: [...byName.values()].sort(byCapabilityName), diagnostics };
}

export function sameScopeCollisionDiagnostics(capabilities: AcfCapability[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, AcfCapability>();
  for (const cap of capabilities) {
    const existing = seen.get(cap.manifest.name);
    if (existing !== undefined) {
      diagnostics.push({
        severity: "error",
        code: "acf.capability.name-collision",
        message: `capability name collision: ${cap.manifest.name}`,
        path: cap.root,
        data: { existing: existing.root, duplicate: cap.root },
      });
    } else {
      seen.set(cap.manifest.name, cap);
    }
  }
  return diagnostics;
}

async function findProjectAgentsDir(cwd: string): Promise<string | undefined> {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, ".agents");
    if (await exists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function hasManifest(dir: string): Promise<boolean> {
  return (await exists(path.join(dir, "acf.yml"))) || (await exists(path.join(dir, "acf.yaml")));
}

async function findManifestDirs(root: string): Promise<string[]> {
  const out: string[] = [];
  await walkForManifests(root, out);
  return out;
}

async function walkForManifests(dir: string, out: string[]): Promise<void> {
  if (await hasManifest(dir)) {
    out.push(dir);
    return;
  }
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) await walkForManifests(path.join(dir, entry.name), out);
  }
}

function byCapabilityName(a: AcfCapability, b: AcfCapability): number {
  return a.manifest.name.localeCompare(b.manifest.name);
}
