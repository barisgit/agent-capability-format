/**
 * The apply stage of the caplet workflow: carrying out an {@link ApplicablePlan} root by root,
 * with Claude host reconciliation between its two phases.
 */
import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type Diagnostic,
  MANAGEMENT_NOTICE_FILENAME,
  type TargetId,
} from "@caplet/core";
import { type ApplyResult, applyDiffs, resolveDiffPath } from "../apply/apply-diffs.js";
import {
  containmentViolation,
  type FileOwnership,
  fileOwnership,
  type OutputBoundary,
} from "../apply/containment.js";
import {
  type ManagedEntry,
  ownershipKey,
  readSidecar,
  relativeSidecarPath,
  SIDECAR_FILENAME,
  type SidecarOwner,
  writeSidecar,
} from "../apply/sidecar.js";
import { type ClaudeReport, gatedChange, gateOpen, reconcileClaude } from "./claude-host-flow.js";
import { type ClaudeRootPlan, recordClaudeMarketplaces } from "./claude-marketplace.js";
import { driftedWarning } from "./claude-migration.js";
import { diskReadOnlyFs } from "./fs.js";
import { rootNoticeDiffFromSidecar } from "./managed-notices.js";
import {
  type ApplicablePlan,
  type ApplySummary,
  type EmittedDiff,
  fileDiffChanged,
  outputBoundary,
  type StaleSidecarEntry,
  sidecarOwner,
} from "./workflow.js";

/**
 * Applies a plan root by root. Before anything under an output root is written, every planned
 * path there must stay inside the root's boundary (`outputBoundary`); a violation fails that
 * root with `acf.apply.outside-root` and leaves it, including its sidecar, untouched while other
 * roots still apply. Changes whose files moved on since planning are skipped by `applyDiffs`,
 * and their stale sidecar entries are kept so the next plan proposes them again.
 *
 * Claude install roots apply in two phases: every change without a gate, then host
 * reconciliation through the `claude` CLI (the plugin files must exist before Claude installs
 * them), then the gated changes whose host state allows them. A held-back change keeps its sidecar
 * entry, so the next apply retries it, and the root's inventory is rebuilt from the sidecar.
 */
export async function applyEmitPlan(plan: ApplicablePlan): Promise<ApplySummary> {
  const diagnostics: Diagnostic[] = [];
  const blockedRoots = await outsideRootFailures(plan, diagnostics);
  const progress: ApplyProgress = {
    blockedRoots,
    results: [],
    diagnostics,
    skipped: new Set(),
    heldBackRoots: new Set(),
  };
  await applyItems(
    progress,
    plan.diffs.filter((item) => item.gate === undefined),
  );
  const claudeRoots = plan.claude.filter((root) => !blockedRoots.has(root.installRoot));
  const claude = await applyGatedChanges(progress, plan, claudeRoots);
  await removeStaleSidecarEntries(
    plan.staleEntries.filter(
      (entry) =>
        !blockedRoots.has(entry.installRoot) &&
        !progress.skipped.has(skipKey(entry.installRoot, entry.path, entry.capability)),
    ),
  );
  await rewriteHeldBackInventories(progress);
  await recordClaudeMarketplaces(claudeRoots);
  return { results: progress.results, diagnostics, claude };
}

/** What applying one plan has done so far. */
type ApplyProgress = {
  /** Roots that failed the containment check; nothing under them is written. */
  blockedRoots: ReadonlySet<string>;
  results: ApplyResult[];
  diagnostics: Diagnostic[];
  /** {@link skipKey}s of changes left unapplied, whose stale sidecar entries stay. */
  skipped: Set<string>;
  /** Roots with a held-back change, whose inventory the plan wrote assuming every change. */
  heldBackRoots: Set<string>;
};

function skipKey(installRoot: string, relativePath: string, capability: string): string {
  return `${installRoot}\u0000${relativePath}\u0000${capability}`;
}

/** Applies `items` grouped by root, capability and owner, outside the blocked roots. */
async function applyItems(progress: ApplyProgress, items: readonly EmittedDiff[]): Promise<void> {
  for (const group of groupByApplyTarget(items)) {
    if (progress.blockedRoots.has(group.installRoot)) continue;
    const result = await applyDiffs(group.diffs, {
      installRoot: group.installRoot,
      capabilityName: group.capabilityName,
      sidecarPath: path.join(group.installRoot, SIDECAR_FILENAME),
      owner: group.owner,
    });
    progress.results.push(result);
    progress.diagnostics.push(...result.diagnostics);
    for (const skippedPath of result.skipped) {
      const relative = relativeSidecarPath(group.installRoot, skippedPath);
      progress.skipped.add(skipKey(group.installRoot, relative, group.capabilityName));
    }
  }
}

function holdBack(progress: ApplyProgress, item: EmittedDiff): void {
  progress.heldBackRoots.add(item.installRoot);
  const relative = relativeSidecarPath(
    item.installRoot,
    resolveDiffPath(item.installRoot, item.diff.path),
  );
  progress.skipped.add(skipKey(item.installRoot, relative, item.capabilityName));
}

/**
 * The second apply phase: reconciles `claudeRoots` with the host, applies each gated change whose
 * gate opened, and holds back the rest. Returns the host report, with the renames to announce,
 * or `undefined` when there is no Claude root to reconcile, which holds back every release.
 */
async function applyGatedChanges(
  progress: ApplyProgress,
  plan: ApplicablePlan,
  claudeRoots: readonly ClaudeRootPlan[],
): Promise<ClaudeReport | undefined> {
  const { releases, renames } = plan.migration;
  if (claudeRoots.length === 0) {
    for (const release of releases) holdBack(progress, release.item);
    return undefined;
  }
  const claude = await reconcileClaude(claudeRoots, plan.cwd);
  progress.diagnostics.push(...claude.diagnostics);
  const open: EmittedDiff[] = [];
  for (const item of plan.diffs) {
    if (item.gate === undefined) continue;
    const change = gatedChange(item, item.gate, claude);
    if (change === undefined) holdBack(progress, item);
    else open.push(change);
  }
  await applyItems(progress, open);
  // A drifted artifact stays on disk; its sidecar entry goes with the stale entries.
  for (const release of releases) {
    if (gateOpen(release.gate, claude)) progress.diagnostics.push(driftedWarning(release));
    else holdBack(progress, release.item);
  }
  claude.renames = renames.filter((rename) => gateOpen(rename.gate, claude));
  return claude;
}

/**
 * Rewrites the `ACF-MANAGED.md` inventory of each root with a held-back change from its sidecar:
 * the planned inventory assumed every change applied. Only Claude roots hold changes back.
 */
async function rewriteHeldBackInventories(progress: ApplyProgress): Promise<void> {
  for (const installRoot of progress.heldBackRoots) {
    const sidecarPath = path.join(installRoot, SIDECAR_FILENAME);
    const notice = await rootNoticeDiffFromSidecar(
      installRoot,
      await readSidecar(sidecarPath),
      diskReadOnlyFs(),
    );
    if (!fileDiffChanged(notice)) continue;
    const result = await applyDiffs([notice], {
      installRoot,
      capabilityName: ACF_SYSTEM_OWNER,
      sidecarPath,
      owner: { target: "claude", carrier: "loose" },
    });
    progress.results.push(result);
    progress.diagnostics.push(...result.diagnostics);
  }
}

/** One path apply may write or delete, with the boundary it must stay inside. */
type ContainmentCheck = {
  installRoot: string;
  path: string;
  boundary: OutputBoundary;
  ownership: FileOwnership;
};

/** How an `acf.apply.outside-root` error names an output root. */
type RootLabel = { label: string; targetId?: TargetId };

/**
 * Checks every path apply may write or delete under each output root before anything is
 * written: each planned change against its target's boundary, and the root's own sidecar and
 * `ACF-MANAGED.md` for every root apply may touch, including roots that only sweep stale sidecar
 * entries or record a Claude marketplace. Each failing root gets one `acf.apply.outside-root`
 * error; the returned roots must be left untouched.
 */
async function outsideRootFailures(
  plan: ApplicablePlan,
  diagnostics: Diagnostic[],
): Promise<Set<string>> {
  const labels = rootLabels(plan);
  const checks: ContainmentCheck[] = plan.diffs.map((item) => ({
    installRoot: item.installRoot,
    path: resolveDiffPath(item.installRoot, item.diff.path),
    boundary: outputBoundary(item, plan.cwd),
    ownership: fileOwnership(item.diff.owns),
  }));
  for (const installRoot of labels.keys()) {
    const boundary = { roots: [installRoot], files: [] };
    for (const file of [SIDECAR_FILENAME, MANAGEMENT_NOTICE_FILENAME]) {
      checks.push({ installRoot, path: path.join(installRoot, file), boundary, ownership: "file" });
    }
  }
  const blocked = new Set<string>();
  for (const check of checks) {
    if (blocked.has(check.installRoot)) continue;
    const violation = await containmentViolation(check.path, check.boundary, check.ownership);
    if (violation === null) continue;
    blocked.add(check.installRoot);
    const owner = labels.get(check.installRoot);
    diagnostics.push({
      severity: "error",
      code: "acf.apply.outside-root",
      message: `nothing applied for ${owner?.label ?? check.installRoot}: ${violation}`,
      path: check.path,
      ...(owner?.targetId === undefined ? {} : { targetId: owner.targetId }),
      data: { installRoot: check.installRoot },
    });
  }
  return blocked;
}

/** Every root apply may touch, in plan order, with the label its containment error uses. */
function rootLabels(plan: ApplicablePlan): Map<string, RootLabel> {
  const labels = new Map<string, RootLabel>();
  for (const item of plan.diffs) {
    if (labels.has(item.installRoot)) continue;
    const label = item.destination === "canonical" ? "canonical skills" : item.targetId;
    labels.set(item.installRoot, {
      label: `${label} (${item.scopeRoot.scope} scope)`,
      targetId: item.targetId,
    });
  }
  for (const root of plan.claude) {
    if (labels.has(root.installRoot)) continue;
    labels.set(root.installRoot, {
      label: `claude (${root.scopeRoot.scope} scope)`,
      targetId: "claude",
    });
  }
  for (const entry of plan.staleEntries) {
    if (labels.has(entry.installRoot)) continue;
    const target = entry.owner.target;
    labels.set(
      entry.installRoot,
      target === "canonical" ? { label: "canonical skills" } : { label: target, targetId: target },
    );
  }
  return labels;
}

async function removeStaleSidecarEntries(stale: readonly StaleSidecarEntry[]): Promise<void> {
  const byRoot = new Map<string, StaleSidecarEntry[]>();
  for (const entry of stale) {
    const bucket = byRoot.get(entry.installRoot) ?? [];
    bucket.push(entry);
    byRoot.set(entry.installRoot, bucket);
  }
  for (const [installRoot, removals] of byRoot) {
    const sidecarPath = path.join(installRoot, SIDECAR_FILENAME);
    const sidecar = await readSidecar(sidecarPath);
    const before = sidecar.managed.length;
    const removed = new Set(removals.map(staleIdentity));
    sidecar.managed = sidecar.managed.filter((entry) => !removed.has(staleIdentity(entry)));
    if (sidecar.managed.length !== before) {
      await writeSidecar(sidecarPath, sidecar, removals[0]?.owner);
    }
  }
}

function staleIdentity(entry: Pick<ManagedEntry, "path" | "capability" | "owns">): string {
  const owns = entry.owns.map(ownershipKey).sort().join("|");
  return `${entry.path}\u0000${entry.capability}\u0000${owns}`;
}

/** Changes `applyDiffs` applies together: one root, capability and sidecar owner. */
type ApplyGroup = {
  installRoot: string;
  capabilityName: string;
  owner: SidecarOwner;
  diffs: EmittedDiff["diff"][];
};

function groupByApplyTarget(items: readonly EmittedDiff[]): ApplyGroup[] {
  const groups = new Map<string, ApplyGroup>();
  for (const item of items) {
    // The owner is recorded on every entry a group writes, so it is part of the group key: the
    // reserved owner writes the loose inventory and the plugin-carrier marketplace in one root.
    const owner = sidecarOwner(item);
    const key = `${item.installRoot}\0${item.capabilityName}\0${owner.target}\0${owner.carrier}`;
    const group = groups.get(key) ?? {
      installRoot: item.installRoot,
      capabilityName: item.capabilityName,
      owner,
      diffs: [],
    };
    group.diffs.push(item.diff);
    groups.set(key, group);
  }
  const order = (group: ApplyGroup) =>
    `${group.installRoot}:${group.capabilityName}:${group.owner.target}:${group.owner.carrier}`;
  return [...groups.values()].sort((a, b) => order(a).localeCompare(order(b)));
}
