import { defineCommand } from "citty";
import { addCommand } from "./commands/add.js";
import { applyCommand } from "./commands/apply.js";
import { checkCommand } from "./commands/check.js";
import { completionCommand } from "./commands/completion.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { removeCommand } from "./commands/remove.js";
import { showCommand } from "./commands/show.js";
import { statusCommand } from "./commands/status.js";
import { updateCommand } from "./commands/update.js";
import { CAPLET_VERSION } from "./internal/json.js";

export const rootCommand = defineCommand({
  meta: {
    name: "caplet",
    version: CAPLET_VERSION,
    description: "install agent capabilities and sync them into your AI tools",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    remove: removeCommand,
    update: updateCommand,
    apply: applyCommand,
    list: listCommand,
    show: showCommand,
    check: checkCommand,
    doctor: doctorCommand,
    status: statusCommand,
    completion: completionCommand,
  },
});

/** Normalize the supported list shorthand before parsing. */
export function rewriteAlias(argv: string[]): string[] {
  return argv[0] === "ls" ? ["list", ...argv.slice(1)] : argv;
}
