import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { readCapability } from "../reader/index.js";
import type {
  AcfCapability,
  CapabilityOrigin,
  Diagnostic,
  Scope,
  ScopeRoot,
} from "../types/index.js";
import { exists } from "../utils/fs.js";

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

export async function resolveScopeCapabilities(
  root: ScopeRoot,
): Promise<{ capabilities: AcfCapability[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const capabilities: AcfCapability[] = [];
  if (!(await exists(root.capabilitiesDir))) return { capabilities, diagnostics };
  for (const entry of await readdir(root.capabilitiesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root.capabilitiesDir, entry.name);
    const discovery = await discoverRepository(dir);
    diagnostics.push(...discovery.diagnostics);
    for (const capRoot of discovery.roots) {
      const cap = await readCapability(capRoot, root.scope, { kind: "local", directory: capRoot });
      cap.diagnostics.push(...discovery.diagnostics);
      capabilities.push(cap);
    }
  }
  diagnostics.push(...sameScopeCollisionDiagnostics(capabilities));
  return { capabilities: capabilities.sort(byCapabilityName), diagnostics };
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
