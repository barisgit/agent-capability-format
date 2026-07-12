import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { reporter } from "../internal/output";
import { specToCittyArgs } from "../internal/spec";

const TEMPLATE = `acf: 1\ncapabilities: []\n`;

export const initCommand = defineCommand({
  meta: { name: "init", description: "create .agents/capabilities.yml for this project" },
  args: specToCittyArgs("init") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      const agentsDir = path.join(cwd, ".agents");
      const manifestPath = path.join(agentsDir, "capabilities.yml");
      const out = reporter(context.args);
      if (await Bun.file(manifestPath).exists()) {
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
