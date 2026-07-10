import { readLockfile } from "@acf/installer";
import { defineCommand } from "citty";
import { globalArgs, readCwd, readScope, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";
import { fetchScopes } from "../internal/workflow";

export const updateCommand = defineCommand({
  meta: { name: "update", description: "re-resolve one or all capability entries" },
  args: {
    ...globalArgs,
    name: { type: "positional", description: "optional capability name" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = typeof context.args.name === "string" ? context.args.name : undefined;
      if (name !== undefined) await ensureKnownName(context.args, name);
      const result = await fetchScopes(context.args, "force", name);
      const code = finishWithDiagnostics(result.diagnostics, context.args);
      const count = result.results.reduce(
        (sum, item) =>
          sum +
          item.capabilities.filter((capability) => name === undefined || capability.name === name)
            .length,
        0,
      );
      if (code === 0) {
        const out = reporter(context.args);
        out.heading("update");
        out.done(name === undefined ? `Updated ${count} capabilities` : `Updated ${name}`);
        out.details([["Resolved", `${count} ${count === 1 ? "capability" : "capabilities"}`]]);
      }
      process.exitCode = code;
    });
  },
});

async function ensureKnownName(args: Record<string, unknown>, name: string): Promise<void> {
  const cwd = readCwd(args);
  for (const root of await resolveScopeRoots(readScope(args), cwd)) {
    const lock = await readLockfile(root.lockPath);
    if (lock?.entries.some((entry) => entry.capabilityNames.includes(name)) === true) return;
  }
  throw validationError(`unknown capability: ${name}`);
}
