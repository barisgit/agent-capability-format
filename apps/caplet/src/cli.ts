import { defineCommand } from "citty";
import { addCommand } from "./commands/add";
import { applyCommand } from "./commands/apply";
import { checkCommand } from "./commands/check";
import { diffCommand } from "./commands/diff";
import { doctorCommand } from "./commands/doctor";
import { emitCommand } from "./commands/emit";
import { fetchCommand } from "./commands/fetch";
import { inspectCommand } from "./commands/inspect";
import { lsCommand } from "./commands/ls";
import { removeCommand } from "./commands/remove";
import { updateCommand } from "./commands/update";

export const rootCommand = defineCommand({
  meta: {
    name: "caplet",
    version: "0.1.0",
    description: "ACF capability installer and emitter",
  },
  subCommands: {
    add: addCommand,
    apply: applyCommand,
    check: checkCommand,
    diff: diffCommand,
    doctor: doctorCommand,
    emit: emitCommand,
    fetch: fetchCommand,
    inspect: inspectCommand,
    ls: lsCommand,
    remove: removeCommand,
    update: updateCommand,
  },
});
