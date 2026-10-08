#!/usr/bin/env node
import { runMain } from "citty";
import { rewriteAlias, rootCommand } from "./cli.js";
import { renderCommandHelp, renderRootHelp } from "./help.js";
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
if (command !== undefined && commandSpec(command) === undefined) {
  process.stderr.write(
    `unknown command: ${command}\n  See caplet --help for available commands.\n`,
  );
  process.exit(2);
}
const flagError = unknownFlagError(command, command === undefined ? argv : argv.slice(1));
if (flagError !== undefined) {
  const helpTarget = command === undefined ? "caplet --help" : `caplet ${command} --help`;
  process.stderr.write(`${flagError}\n  See ${helpTarget} for available flags.\n`);
  process.exit(2);
}
await runMain(rootCommand, { rawArgs: argv });
