import path from "node:path";
import { defineCommand } from "citty";
import { readCapletConfig, targetIds } from "@acf/core";
import { readSidecar, removeOwnedRegions, writeSidecar } from "../apply/sidecar";
import { globalArgs, readCwd, readScope, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { removeManifestEntry } from "../internal/manifest";
import { reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";
import { installRootFor } from "../internal/workflow";

export const removeCommand = defineCommand({
  meta: { name: "remove", description: "remove a capability and its managed output" },
  args: {
    ...globalArgs,
    name: { type: "positional", required: true, description: "capability name" },
    target: { type: "string", description: "target id to clean" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = context.args.name;
      if (typeof name !== "string" || name.length === 0) throw validationError("name is required");
      const scope = readScope(context.args);
      if (scope === "all") throw validationError("remove requires --scope=user or --scope=project");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      await removeManifestEntry(root, name);
      const config = (await readCapletConfig(cwd)).config;
      const selectedTargets = typeof context.args.target === "string" ? [context.args.target] : [...targetIds];
      let cleaned = 0;
      for (const targetId of selectedTargets) {
        const installRoot = installRootFor(targetId, root, config, path.resolve(cwd));
        if (installRoot === null) continue;
        const sidecarPath = path.join(installRoot, ".acf-managed.json");
        const sidecar = await readSidecar(sidecarPath);
        const result = await removeOwnedRegions(sidecar, installRoot, name);
        await writeSidecar(sidecarPath, result.sidecar);
        cleaned += result.written.length + result.deleted.length;
      }
      reporter(context.args).log(`removed ${name}; cleaned ${cleaned} managed regions`);
    });
  },
});
