import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type AcfManagedSidecar,
  type Diagnostic,
  type FileDiff,
  MANAGEMENT_NOTICE_FILENAME,
  type ReadOnlyFs,
  type RootInventoryArtifact,
  renderRootInventory,
} from "@caplet/core";
import { readSidecar } from "../apply/sidecar";
import type { EmittedDiff, RootContext } from "./workflow";

export async function addManagementNotices(
  desired: readonly EmittedDiff[],
  fs: ReadOnlyFs,
  diagnostics: Diagnostic[],
  opts?: {
    staleByRoot?: ReadonlyMap<string, ReadonlySet<string>>;
    rootContexts?: ReadonlyMap<string, RootContext>;
  },
): Promise<EmittedDiff[]> {
  const output = [...desired];
  const byRoot = groupByInstallRoot(desired);
  const staleByRoot = opts?.staleByRoot ?? new Map<string, ReadonlySet<string>>();
  const roots = new Set([...byRoot.keys(), ...staleByRoot.keys()]);
  for (const installRoot of roots) {
    const items = byRoot.get(installRoot) ?? [];
    const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
    const stale = staleByRoot.get(installRoot) ?? new Set<string>();
    const artifacts = mergedInventoryArtifacts(items, installRoot, sidecar, stale);
    const noticePath = path.join(installRoot, MANAGEMENT_NOTICE_FILENAME);
    const before = await fs.readText(noticePath);
    if (artifacts.length === 0 && (before === null || stale.size === 0)) continue;
    const first = items[0];
    const context =
      first !== undefined
        ? { scopeRoot: first.scopeRoot, targetId: first.targetId, destination: first.destination }
        : opts?.rootContexts?.get(installRoot);
    if (context === undefined) continue;
    output.push({
      scopeRoot: context.scopeRoot,
      targetId: context.targetId,
      destination: context.destination,
      installRoot,
      capabilityName: ACF_SYSTEM_OWNER,
      diff: {
        path: noticePath,
        before,
        after: artifacts.length === 0 ? null : renderRootInventory(artifacts),
        owns: [{ kind: "file" }],
        managementNotice: "root",
      },
    });
  }
  await diagnoseNoticeCollisions(output, diagnostics);
  return output;
}

export async function rootNoticeDiffFromSidecar(
  installRoot: string,
  sidecar: AcfManagedSidecar,
  fs: ReadOnlyFs,
): Promise<FileDiff> {
  const artifacts = inventoryArtifactsFromSidecar(sidecar);
  const noticePath = path.join(installRoot, MANAGEMENT_NOTICE_FILENAME);
  return {
    path: noticePath,
    before: await fs.readText(noticePath),
    after: artifacts.length === 0 ? null : renderRootInventory(artifacts),
    owns: [{ kind: "file" }],
    managementNotice: "root",
  };
}

function artifactRootFromSidecar(
  relativePath: string,
  facet: AcfManagedSidecar["managed"][number]["facet"],
): string | null {
  if (facet?.family !== "skill") return null;
  const segments = relativePath.split("/");
  const index = segments.lastIndexOf(facet.name);
  if (index === -1) return null;
  return `${segments.slice(0, index + 1).join("/")}/`;
}

function groupByInstallRoot(items: readonly EmittedDiff[]): Map<string, EmittedDiff[]> {
  const groups = new Map<string, EmittedDiff[]>();
  for (const item of items) {
    const group = groups.get(item.installRoot) ?? [];
    group.push(item);
    groups.set(item.installRoot, group);
  }
  return groups;
}

function inventoryArtifacts(
  items: readonly EmittedDiff[],
  installRoot: string,
): RootInventoryArtifact[] {
  const artifacts: RootInventoryArtifact[] = [];
  for (const item of items) {
    const diff = item.diff;
    if (diff.after === null || diff.managementNotice !== undefined) continue;
    if (diff.artifactRoot !== undefined) {
      artifacts.push({
        capability: item.capabilityName,
        path: `${inventoryRelativePath(installRoot, diff.artifactRoot)}/`,
        kind: "directory",
        ownership: diff.owns.map((own) => own.kind),
        facet: diff.facet,
      });
      continue;
    }
    artifacts.push({
      capability: item.capabilityName,
      path: inventoryRelativePath(installRoot, diff.path),
      kind: diff.owns.every((own) => own.kind === "file") ? "file" : "shared",
      ownership: diff.owns.map((own) => own.kind),
      facet: diff.facet,
    });
  }
  return artifacts;
}

function mergedInventoryArtifacts(
  items: readonly EmittedDiff[],
  installRoot: string,
  sidecar: AcfManagedSidecar,
  stale: ReadonlySet<string> = new Set(),
): RootInventoryArtifact[] {
  const replaced = new Set([
    ...items
      .filter((item) => item.diff.managementNotice === undefined)
      .map(
        (item) => `${item.capabilityName}\0${inventoryRelativePath(installRoot, item.diff.path)}`,
      ),
    ...stale,
  ]);
  const retained = inventoryArtifactsFromSidecar(sidecar, replaced);
  return [...retained, ...inventoryArtifacts(items, installRoot)];
}

function inventoryArtifactsFromSidecar(
  sidecar: AcfManagedSidecar,
  excluded: ReadonlySet<string> = new Set(),
): RootInventoryArtifact[] {
  const artifacts: RootInventoryArtifact[] = [];
  for (const entry of sidecar.managed) {
    if (
      entry.capability === ACF_SYSTEM_OWNER ||
      path.basename(entry.path) === MANAGEMENT_NOTICE_FILENAME ||
      excluded.has(`${entry.capability}\0${entry.path}`)
    ) {
      continue;
    }
    const facetRoot = artifactRootFromSidecar(entry.path, entry.facet);
    artifacts.push({
      capability: entry.capability,
      path: facetRoot ?? entry.path,
      kind:
        facetRoot !== null
          ? "directory"
          : entry.owns.every((ownership) => ownership.kind === "file")
            ? "file"
            : "shared",
      ownership: entry.owns.map((ownership) => ownership.kind),
      facet: entry.facet,
    });
  }
  return artifacts;
}

async function diagnoseNoticeCollisions(
  items: readonly EmittedDiff[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const sidecars = new Map<string, Awaited<ReturnType<typeof readSidecar>>>();
  for (const item of items) {
    if (item.diff.managementNotice === undefined || item.diff.before === null) continue;
    let sidecar = sidecars.get(item.installRoot);
    if (sidecar === undefined) {
      sidecar = await readSidecar(path.join(item.installRoot, ".acf-managed.json"));
      sidecars.set(item.installRoot, sidecar);
    }
    const relative = noticeRelativePath(item.installRoot, item.diff.path);
    const owned = sidecar.managed.some(
      (entry) =>
        entry.path === relative && entry.owns.some((ownership) => ownership.kind === "file"),
    );
    if (owned) continue;
    diagnostics.push({
      severity: "error",
      code: "acf.emit.managed-notice-destination-collision",
      message: `refusing to overwrite unowned reserved notice path: ${relative}`,
      path: item.diff.path,
      targetId: item.targetId,
      data: { installRoot: item.installRoot, relativePath: relative },
    });
  }
}

function inventoryRelativePath(root: string, candidate: string): string {
  return path.relative(root, candidate).split(path.sep).join("/") || ".";
}

function noticeRelativePath(root: string, candidate: string): string {
  const relative = path.relative(root, candidate).split(path.sep).join("/");
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`managed artifact escapes install root: ${candidate}`);
  }
  return relative;
}
