/** Publishable workspace discovery and archive identity, shared by preparation and release gating. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Source checkout whose manifests and built output these commands operate on. */
export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const WORKSPACE_PARENTS = ["apps", "packages"];

/** Release metadata read from repository-owned workspace manifests, not registry responses. */
export type PackageManifest = {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
};

/** A workspace directory relative to the checkout, paired with its release metadata. */
export type WorkspacePackage = { dir: string; manifest: PackageManifest };

function readManifest(file: string): PackageManifest {
  return JSON.parse(readFileSync(file, "utf8")) as PackageManifest;
}

/** Publishable workspace packages, each after the workspace packages it depends on. */
export function publishOrder(): WorkspacePackage[] {
  const byName = new Map<string, WorkspacePackage>();
  for (const parent of WORKSPACE_PARENTS) {
    for (const entry of readdirSync(path.join(REPOSITORY_ROOT, parent))) {
      const dir = path.join(parent, entry);
      const file = path.join(REPOSITORY_ROOT, dir, "package.json");
      if (!existsSync(file)) continue;
      const manifest = readManifest(file);
      if (manifest.private !== true) byName.set(manifest.name, { dir, manifest });
    }
  }
  const ordered: WorkspacePackage[] = [];
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    const pkg = byName.get(name);
    if (pkg === undefined || ordered.includes(pkg)) return;
    if (visiting.has(name)) throw new Error(`dependency cycle through ${name}`);
    visiting.add(name);
    for (const dep of Object.keys(pkg.manifest.dependencies ?? {}).sort()) visit(dep);
    visiting.delete(name);
    ordered.push(pkg);
  };
  for (const name of [...byName.keys()].sort()) visit(name);
  return ordered;
}

/** Stable archive filename shared by preparation and publication. */
export function tarballName(manifest: PackageManifest): string {
  return `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`;
}
