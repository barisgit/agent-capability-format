import { defineCommand } from "citty";
import { globalArgs, readFetchMode } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { fetchScopes } from "../internal/workflow";

export const fetchCommand = defineCommand({
  meta: { name: "fetch", description: "resolve capabilities.yml into capability trees" },
  args: {
    ...globalArgs,
    mode: {
      type: "string",
      default: "auto",
      description: "fetch mode: auto, never, or force",
    },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const result = await fetchScopes(context.args, readFetchMode(context.args));
      const code = finishWithDiagnostics(result.diagnostics, context.args);
      if (code === 0) {
        const count = result.results.reduce((sum, item) => sum + item.capabilities.length, 0);
        const out = reporter(context.args);
        out.heading("fetch");
        out.done(`Fetched ${count} ${count === 1 ? "capability" : "capabilities"}`);
        out.details([["Scopes", result.scopes.map((scope) => scope.scope).join(", ")]]);
      }
      process.exitCode = code;
    });
  },
});
