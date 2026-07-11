import path from "node:path";
import { ACF_SYSTEM_OWNER, readCapletConfig, targetIds } from "@acf/core";
import { defineCommand } from "citty";
import { applyDiffs } from "../apply/apply-diffs";
import { readSidecar, removeOwnedRegions, writeSidecar } from "../apply/sidecar";
import {
  globalArgs,
  readCwd,
  readExplicitScope,
  targetArg,
  validationError,
} from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { diskReadOnlyFs } from "../internal/fs";
import { rootNoticeDiffFromSidecar } from "../internal/managed-notices";
import { removeManifestEntry } from "../internal/manifest";
import { reporter } from "../internal/output";
import { inferScope, resolveScopeRoots } from "../internal/scopes";
import { installRootFor } from "../internal/workflow";

export const removeCommand = defineCommand({
  meta: { name: "remove", description: "remove a capability and its managed output" },
  args: {
    ...globalArgs,
    ...targetArg,
    name: { type: "positional", required: true, description: "capability name" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = context.args.name;
      if (typeof name !== "string" || name.length === 0) throw validationError("name is required");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const scope = await inferScope(readExplicitScope(context.args), cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      await removeManifestEntry(root, name);
      const config = (await readCapletConfig(cwd)).config;
      const selectedTargets =
        typeof context.args.target === "string" ? [context.args.target] : [...targetIds];
      let cleaned = 0;
      const installRoots = new Set<string>([root.agentsDir]);
      for (const targetId of selectedTargets) {
        const installRoot = installRootFor(targetId, root, config, path.resolve(cwd));
        if (installRoot !== null) installRoots.add(installRoot);
      }
      for (const installRoot of installRoots) {
        const sidecarPath = path.join(installRoot, ".acf-managed.json");
        const sidecar = await readSidecar(sidecarPath);
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
