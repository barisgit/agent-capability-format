import { defineCommand } from "citty";
import { globalArgs, readCwd, readOptionalString, readScope, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { addManifestEntry } from "../internal/manifest";
import { reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";

export const addCommand = defineCommand({
  meta: { name: "add", description: "append a source to capabilities.yml" },
  args: {
    ...globalArgs,
    source: { type: "positional", required: true, description: "source to add" },
    ref: { type: "string", description: "git ref" },
    rename: { type: "string", description: "capability rename" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const source = context.args.source;
      if (typeof source !== "string" || source.length === 0) throw validationError("source is required");
      const scope = readScope(context.args);
      if (scope === "all") throw validationError("add requires --scope=user or --scope=project");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      const entry = await addManifestEntry(root, source, {
        ref: readOptionalString(context.args, "ref"),
        rename: readOptionalString(context.args, "rename"),
      });
      reporter(context.args).log(`added ${entry.source.kind} source to ${root.manifestPath}`);
    });
  },
});
