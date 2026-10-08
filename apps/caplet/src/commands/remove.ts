import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type AcfManagedSidecar,
  readCapletConfig,
  targetIds,
} from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { applyDiffs } from "../apply/apply-diffs.js";
import type { OutputBoundary } from "../apply/containment.js";
import {
  ownedPathViolations,
  readSidecar,
  removeOwnedRegions,
  writeSidecar,
} from "../apply/sidecar.js";
import { readCwd, readExplicitScope, validationError } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { diskReadOnlyFs } from "../internal/fs.js";
import { rootNoticeDiffFromSidecar } from "../internal/managed-notices.js";
import { removeManifestEntry } from "../internal/manifest.js";
import { reporter } from "../internal/output.js";
import { inferScope, resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";
import { installRootFor, outputBoundary } from "../internal/workflow.js";

export const removeCommand = defineCommand({
  meta: { name: "remove", description: "remove a capability and its managed output" },
  args: specToCittyArgs("remove") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = context.args.name;
      if (typeof name !== "string" || name.length === 0) throw validationError("name is required");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const scope = await inferScope(readExplicitScope(context.args), cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      const config = (await readCapletConfig(cwd)).config;
      const selectedTargets =
        typeof context.args.target === "string" ? [context.args.target] : [...targetIds];
      const resolvedCwd = path.resolve(cwd);
      const boundaries = new Map<string, OutputBoundary>([
        [root.agentsDir, { roots: [root.agentsDir], files: [] }],
      ]);
      for (const targetId of selectedTargets) {
        const installRoot = installRootFor(targetId, root, config, resolvedCwd);
        if (installRoot === null || boundaries.has(installRoot)) continue;
        const context = { scopeRoot: root, targetId, destination: "native" as const, installRoot };
        boundaries.set(installRoot, outputBoundary(context, resolvedCwd));
      }
      // Check every root before changing anything so a refused removal leaves the manifest,
      // the outputs and the sidecars as they were.
      const sidecars = new Map<string, AcfManagedSidecar>();
      const violations: string[] = [];
      for (const [installRoot, boundary] of boundaries) {
        const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
        sidecars.set(installRoot, sidecar);
        violations.push(...(await ownedPathViolations(sidecar, installRoot, name, boundary)));
      }
      if (violations.length > 0) {
        throw validationError(`refusing to remove ${name}: ${violations.join("; ")}`);
      }
      await removeManifestEntry(root, name);
      let cleaned = 0;
      for (const [installRoot, sidecar] of sidecars) {
        const sidecarPath = path.join(installRoot, ".acf-managed.json");
        const result = await removeOwnedRegions(sidecar, installRoot, name);
        await writeSidecar(sidecarPath, result.sidecar);
        const rootNotice = await rootNoticeDiffFromSidecar(
          installRoot,
          result.sidecar,
          diskReadOnlyFs(),
        );
        const noticeResult = await applyDiffs([rootNotice], {
          installRoot,
          capabilityName: ACF_SYSTEM_OWNER,
          sidecarPath,
        });
        cleaned +=
          result.written.length +
          result.deleted.length +
          noticeResult.written.length +
          noticeResult.deleted.length;
      }
      const out = reporter(context.args);
      out.done(`Removed ${name} (${scope} scope)`);
      out.details([
        ["Managed", `${cleaned} managed ${cleaned === 1 ? "region" : "regions"} cleaned`],
      ]);
    });
  },
});
