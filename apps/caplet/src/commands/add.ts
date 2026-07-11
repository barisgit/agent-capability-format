import { defineCommand } from "citty";
import {
  globalArgs,
  readCwd,
  readExplicitScope,
  readOptionalString,
  readVerbose,
  targetArg,
  validationError,
} from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { addManifestEntry } from "../internal/manifest";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
import { inferScope, resolveScopeRoots } from "../internal/scopes";
import { applyEmitPlan, buildEmitPlan, fetchScopes } from "../internal/workflow";

export const addCommand = defineCommand({
  meta: { name: "add", description: "add capabilities from a source and apply them" },
  args: {
    ...globalArgs,
    ...targetArg,
    source: { type: "positional", required: true, description: "source to add" },
    pin: { type: "string", description: "pin a git ref (branch, tag, or commit)" },
    ref: { type: "string", description: "deprecated alias for --pin" },
    path: { type: "string", description: "capability directory inside the source" },
    as: { type: "string", description: "install under a different capability name" },
    rename: { type: "string", description: "deprecated alias for --as" },
    apply: {
      type: "boolean",
      default: true,
      description: "apply after updating the manifest",
      negativeDescription: "edit the manifest only; skip resolve and apply",
    },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const source = context.args.source;
      if (typeof source !== "string" || source.length === 0)
        throw validationError("source is required");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const scope = await inferScope(readExplicitScope(context.args), cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      const entry = await addManifestEntry(root, source, {
        ref: readOptionalString(context.args, "pin") ?? readOptionalString(context.args, "ref"),
        path: readOptionalString(context.args, "path"),
        rename:
          readOptionalString(context.args, "as") ?? readOptionalString(context.args, "rename"),
      });
      const out = reporter(context.args);
      out.done(`Added ${entry.source.kind} source (${scope} scope)`);
      out.details([
        ["Manifest", root.manifestPath],
        ["Source", source],
        ...(entry.path === undefined ? [] : ([["Path", entry.path]] as Array<[string, string]>)),
      ]);
      if (context.args.apply === false) return;
      const scopedArgs = { ...context.args, scope };
      const fetched = await fetchScopes(scopedArgs, "auto");
      const plan = await buildEmitPlan(scopedArgs);
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      printDiagnostics(diagnostics, context.args);
      const code = exitCodeForDiagnostics(diagnostics, context.args);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      if (view.fileCount === 0) {
        out.done("Everything up to date");
        return;
      }
      out.log("");
      out.plan(view);
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
    });
  },
});
