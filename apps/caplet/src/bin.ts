#!/usr/bin/env bun
import { runMain } from "citty";
import { rewriteAlias, rootCommand } from "./cli";
import { rootHelp } from "./help";
import { CAPLET_VERSION } from "./internal/json";

const rawArgs = process.argv.slice(2);
const first = rawArgs[0];
const hasCommand = first !== undefined && !first.startsWith("-");
if (rawArgs.includes("--version") || rawArgs.includes("-V")) {
  process.stdout.write(`${CAPLET_VERSION}\n`);
  process.exit(0);
}
if (!hasCommand && (rawArgs.includes("--help") || rawArgs.includes("-h"))) {
  process.stdout.write(rootHelp());
  process.exit(0);
}
const wantsHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
const base = hasCommand || wantsHelp ? rawArgs : ["status", ...rawArgs];
const { argv, notice } = rewriteAlias(base);
if (notice !== undefined) process.stderr.write(`${notice}\n`);
await runMain(rootCommand, { rawArgs: argv });
