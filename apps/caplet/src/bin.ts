#!/usr/bin/env node
import { runCommand } from "citty";
import { rewriteAlias, rootCommand } from "./cli.js";
import { renderCommandHelp, renderRootHelp } from "./help.js";
import { INTERNAL_ERROR_CODE, reportCommandFailure } from "./internal/command.js";
import { CAPLET_VERSION } from "./internal/json.js";
import { commandSpec, unknownFlagError, wantsJson } from "./internal/spec.js";

// Losing an output reader must not interrupt mutations, rollback or cleanup, or mask failure.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
    // Drop only this stream's later output. Honor write callbacks so callers can still finish.
    stream.write = (
      _chunk,
      encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
      callback?: (error?: Error) => void,
    ) => {
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (done !== undefined) queueMicrotask(() => done());
      return true;
    };
  });
}

const rawArgs = process.argv.slice(2);
const first = rawArgs[0];
const hasCommand = first !== undefined && !first.startsWith("-");
if (rawArgs.includes("--version") || rawArgs.includes("-V")) {
  process.stdout.write(`${CAPLET_VERSION}\n`);
  process.exit(0);
}
const wantsHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
const base = hasCommand || wantsHelp ? rawArgs : ["status", ...rawArgs];
const argv = rewriteAlias(first === "help" ? rawArgs.slice(1).concat("--help") : base);
const command = argv[0]?.startsWith("-") ? undefined : argv[0];
if (argv.includes("--help") || argv.includes("-h")) {
  const help = command === undefined ? renderRootHelp() : renderCommandHelp(command);
  if (help !== undefined) {
    process.stdout.write(help);
    process.exit(0);
  }
}
const helpTarget = command === undefined ? "caplet --help" : `caplet ${command} --help`;
const commandArgs = command === undefined ? argv : argv.slice(1);
const json = wantsJson(command, commandArgs);

/** Ends a run the command line itself got wrong: exit 2, with a JSON envelope under `--json`. */
function usageFailure(message: string, hint: string): never {
  if (json) reportCommandFailure(command ?? "caplet", { json: true }, message);
  else process.stderr.write(`${message}\n  ${hint}\n`);
  process.exit(2);
}

if (command !== undefined && commandSpec(command) === undefined) {
  usageFailure(`unknown command: ${command}`, "See caplet --help for available commands.");
}
const flagError = unknownFlagError(command, commandArgs);
if (flagError !== undefined) usageFailure(flagError, `See ${helpTarget} for available flags.`);
try {
  await runCommand(rootCommand, { rawArgs: argv });
} catch (error) {
  // citty rejects arguments it cannot parse, such as a missing required positional, with a
  // CLIError, which it does not export.
  if (error instanceof Error && error.name === "CLIError") {
    usageFailure(error.message, `See ${helpTarget} for usage.`);
  }
  internalFailure(error);
}

/**
 * Ends a run that failed unexpectedly: exit 1, the error with its stack on stderr, and under
 * `--json` the command's envelope with an `acf.cli.internal` error so stdout always parses.
 */
function internalFailure(error: unknown): never {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${detail}\n`);
  if (json) {
    const message = error instanceof Error ? error.message : String(error);
    reportCommandFailure(
      command ?? "caplet",
      { json: true },
      `internal error: ${message}`,
      INTERNAL_ERROR_CODE,
    );
  }
  process.exit(1);
}
