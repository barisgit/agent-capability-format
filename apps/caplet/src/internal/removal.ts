/**
 * Plan side of `caplet remove`: the removal of named capabilities' managed output from one scope,
 * applied by `applyEmitPlan` like an apply that deselected them, but without emitting anything,
 * so pending changes of other capabilities stay pending.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  AcfManagedSidecar,
  CapletConfig,
  Diagnostic,
  ScopeRoot,
  TargetId,
} from "@caplet/core";
import type { OutputBoundary } from "../apply/containment.js";
import { readSidecar, SIDECAR_FILENAME } from "../apply/sidecar.js";
import { claudeGate } from "./claude-host-flow.js";
import { planClaudeMarketplaces, sidecarPlugins } from "./claude-marketplace.js";
import { planClaudeMigration } from "./claude-migration.js";
import { diskReadOnlyFs } from "./fs.js";
import { addManagementNotices } from "./managed-notices.js";
import {
  type ApplicablePlan,
  type BlockedCapability,
  type EmittedDiff,
  fileDiffChanged,
  installRootFor,
  outputBoundary,
  plannedRemoval,
  type RootContext,
  type StaleSidecarEntry,
  sidecarOwner,
} from "./workflow.js";

/** An output root `caplet remove` may clean: one whose sidecar exists. */
export type RemovalRoot = { installRoot: string; context: RootContext; boundary: OutputBoundary };

/**
 * The roots of `scopeRoot` that hold caplet output for `targets`: the canonical skills root and
 * each target's install root, each once and only where a sidecar already exists, so a removal
 * never creates one for a target caplet never wrote.
 */
export function removalRoots(input: {
  scopeRoot: ScopeRoot;
  targets: readonly TargetId[];
  config: CapletConfig;
  cwd: string;
}): RemovalRoot[] {
  const { scopeRoot, targets, config, cwd } = input;
  const candidates: Array<{ installRoot: string; context: RootContext }> = [
    {
      installRoot: scopeRoot.agentsDir,
      context: { scopeRoot, targetId: targets[0] ?? "claude", destination: "canonical" },
    },
  ];
  for (const targetId of targets) {
    const installRoot = installRootFor(targetId, scopeRoot, config, cwd);
    if (installRoot !== null) {
      candidates.push({ installRoot, context: { scopeRoot, targetId, destination: "native" } });
    }
  }
  const roots: RemovalRoot[] = [];
  for (const candidate of candidates) {
    if (roots.some((root) => root.installRoot === candidate.installRoot)) continue;
    if (!existsSync(path.join(candidate.installRoot, SIDECAR_FILENAME))) continue;
    const boundary = outputBoundary(
      { ...candidate.context, installRoot: candidate.installRoot },
      cwd,
    );
    roots.push({ ...candidate, boundary });
  }
  return roots;
}

/**
 * Plans removing every sidecar entry of `names` under `roots`. Each removal carries its plan-time
 * content as the apply precondition; one the user edited is kept and reported as `acf.apply.drift`
 * (`plannedRemoval`). A Claude root's marketplace keeps listing every other plugin at the version
 * installed on disk, so the host step uninstalls only the removed plugins, retires the marketplace
 * when none is left, and the plugin files go only after Claude confirms the uninstall.
 */
export async function planRemoval(input: {
  cwd: string;
  roots: readonly RemovalRoot[];
  names: readonly string[];
}): Promise<ApplicablePlan & { diagnostics: Diagnostic[] }> {
  const removing = new Set(input.names);
  const sidecars = new Map(
    await Promise.all(
      input.roots.map(
        async (root) =>
          [
            root.installRoot,
            await readSidecar(path.join(root.installRoot, SIDECAR_FILENAME)),
          ] as const,
      ),
    ),
  );

  const claude = await planClaudeAfterRemoval(input.roots, sidecars, removing);

  const diagnostics: Diagnostic[] = [];
  const removals: EmittedDiff[] = [];
  const staleEntries: StaleSidecarEntry[] = [];
  const staleByRoot = new Map<string, Set<string>>();
  const rootContexts = new Map<string, RootContext>();
  for (const root of input.roots) {
    rootContexts.set(root.installRoot, root.context);
    for (const entry of sidecars.get(root.installRoot)?.managed ?? []) {
      if (!removing.has(entry.capability)) continue;
      const planned = plannedRemoval({
        entry,
        owns: entry.owns,
        installRoot: root.installRoot,
        context: root.context,
        claudeRoots: claude.roots,
      });
      if ("kept" in planned) {
        diagnostics.push(planned.kept);
        continue;
      }
      removals.push(planned.removal);
      const bucket = staleByRoot.get(root.installRoot) ?? new Set<string>();
      bucket.add(`${entry.capability}\u0000${entry.path}`);
      staleByRoot.set(root.installRoot, bucket);
      staleEntries.push({
        installRoot: root.installRoot,
        path: entry.path,
        capability: entry.capability,
        owns: entry.owns,
        owner: sidecarOwner({ ...root.context, carrier: entry.carrier ?? "loose" }),
      });
    }
  }

  const desired = await addManagementNotices(claude.diffs, diskReadOnlyFs(), diagnostics, {
    staleByRoot,
    rootContexts,
  });
  const diffs = [...desired, ...removals].filter((item) => fileDiffChanged(item.diff));
  for (const item of diffs) {
    const gate = claudeGate(item, claude.roots);
    if (gate !== undefined) item.gate = gate;
  }
  const migration = planClaudeMigration(diffs);
  return {
    cwd: input.cwd,
    diffs: migration.diffs,
    migration: migration.migration,
    claude: claude.roots,
    staleEntries,
    diagnostics,
  };
}

/**
 * The marketplace of each Claude root once `removing` is gone. The other plugins stay installed as
 * they are, so they are listed as a blocked capability is: at the version installed on disk.
 */
async function planClaudeAfterRemoval(
  roots: readonly RemovalRoot[],
  sidecars: ReadonlyMap<string, AcfManagedSidecar>,
  removing: ReadonlySet<string>,
): ReturnType<typeof planClaudeMarketplaces> {
  const claudeRoots = roots.filter(
    (root) => root.context.destination === "native" && root.context.targetId === "claude",
  );
  const kept: BlockedCapability[] = claudeRoots.flatMap((root) =>
    sidecarPlugins(sidecars.get(root.installRoot)?.managed ?? [])
      .filter((capability) => !removing.has(capability))
      .map((capability) => ({ scope: root.context.scopeRoot.scope, target: "claude", capability })),
  );
  return await planClaudeMarketplaces({
    roots: claudeRoots.map((root) => ({
      scopeRoot: root.context.scopeRoot,
      installRoot: root.installRoot,
    })),
    plugins: [],
    blocked: kept,
  });
}
