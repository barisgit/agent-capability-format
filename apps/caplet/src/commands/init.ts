import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { exists } from "../internal/fs.js";
import { reporter } from "../internal/output.js";
import { specToCittyArgs } from "../internal/spec.js";

const TEMPLATE = `acf: 1\ncapabilities: []\n`;

export const initCommand = defineCommand({
  meta: { name: "init", description: "create .agents/capabilities.yml for this project" },
  args: specToCittyArgs("init") as ArgsDef,
  async run(context) {
    await runCommandSafely("init", context.args, async () => {
      const cwd = readCwd(context.args);
      const agentsDir = path.join(cwd, ".agents");
      const manifestPath = path.join(agentsDir, "capabilities.yml");
      const out = reporter(context.args);
      if (await exists(manifestPath)) {
        out.done(`Already initialized: ${manifestPath}`);
        return;
      }
      await mkdir(agentsDir, { recursive: true });
      await writeFile(manifestPath, TEMPLATE, "utf8");
      out.done("Initialized project scope");
      out.details([["Manifest", manifestPath]]);
      out.hint("Add a capability: caplet add <source>");
    });
  },
});
