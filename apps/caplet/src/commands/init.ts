import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findProjectAgentsDir } from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd, validationError } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { exists } from "../internal/fs.js";
import { printJson, readJson } from "../internal/json.js";
import { reporter } from "../internal/output.js";
import { specToCittyArgs } from "../internal/spec.js";

const TEMPLATE = `acf: 1\ncapabilities: []\n`;

export const initCommand = defineCommand({
  meta: { name: "init", description: "create .agents/capabilities.yml for this project" },
  args: specToCittyArgs("init") as ArgsDef,
  async run(context) {
    await runCommandSafely("init", context.args, async () => {
      const cwd = readCwd(context.args);
      const agentsDir = await findProjectAgentsDir(cwd, { allowMissing: true });
      if (agentsDir === undefined)
        throw validationError(
          "cannot initialize project scope: .agents aliases the user scope or points outside this directory; select a project with --cwd",
        );
      const manifestPath = path.join(agentsDir, "capabilities.yml");
      const out = reporter(context.args);
      const created = !(await exists(manifestPath));
      if (created) {
        await mkdir(agentsDir, { recursive: true });
        await writeFile(manifestPath, TEMPLATE, "utf8");
      }
      if (readJson(context.args)) {
        printJson("init", true, [], { manifest: manifestPath, created });
        return;
      }
      if (!created) {
        out.done(`Already initialized: ${manifestPath}`);
        return;
      }
      out.done("Initialized project scope");
      out.details([["Manifest", manifestPath]]);
      out.hint("Add a capability: caplet add <source>");
    });
  },
});
