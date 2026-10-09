#!/usr/bin/env node
import { runCommand } from "citty";
import { rewriteAlias, rootCommand } from "./cli.js";
import { renderCommandHelp, renderRootHelp } from "./help.js";
import { reportCommandFailure } from "./internal/command.js";
import { CAPLET_VERSION } from "./internal/json.js";
import { commandSpec, unknownFlagError } from "./internal/spec.js";

const rawArgs = process.argv.slice(2);
const first = rawArgs[0];
const hasCommand = first !== undefined && !first.startsWith("-");
if (rawArgs.includes("--version") || rawArgs.includes("-V")) {
  process.stdout.write(`${CAPLET_VERSION}\n`);
  process.exit(0);
}
const wantsHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
const base = hasCommand || wantsHelp ? rawArgs : ["status", ...rawArgs];
const { argv, notice } = rewriteAlias(first === "help" ? rawArgs.slice(1).concat("--help") : base);
if (notice !== undefined) process.stderr.write(`${notice}\n`);
const command = argv[0]?.startsWith("-") ? undefined : argv[0];
if (argv.includes("--help") || argv.includes("-h")) {
  const help = command === undefined ? renderRootHelp() : renderCommandHelp(command);
  if (help !== undefined) {
    process.stdout.write(help);
    process.exit(0);
  }
}
const helpTarget = command === undefined ? "caplet --help" : `caplet ${command} --help`;

/** Ends a run the command line itself got wrong: exit 2, with a JSON envelope under `--json`. */
function usageFailure(message: string, hint: string): never {
  if (argv.includes("--json")) reportCommandFailure(command ?? "caplet", { json: true }, message);
  else process.stderr.write(`${message}\n  ${hint}\n`);
  process.exit(2);
}

if (command !== undefined && commandSpec(command) === undefined) {
  usageFailure(`unknown command: ${command}`, "See caplet --help for available commands.");
}
const flagError = unknownFlagError(command, command === undefined ? argv : argv.slice(1));
if (flagError !== undefined) usageFailure(flagError, `See ${helpTarget} for available flags.`);
try {
  await runCommand(rootCommand, { rawArgs: argv });
} catch (error) {
  // citty rejects arguments it cannot parse, such as a missing required positional, with a
  // CLIError, which it does not export.
  if (error instanceof Error && error.name === "CLIError") {
    usageFailure(error.message, `See ${helpTarget} for usage.`);
  }
  throw error;
}
