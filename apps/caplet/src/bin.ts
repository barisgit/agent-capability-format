#!/usr/bin/env bun
import { runMain } from "citty";
import { rewriteAlias, rootCommand } from "./cli";

const rawArgs = process.argv.slice(2);
const first = rawArgs[0];
const hasCommand = first !== undefined && !first.startsWith("-");
const wantsHelp =
  rawArgs.includes("--help") || rawArgs.includes("-h") || rawArgs.includes("--version");
const base = hasCommand || wantsHelp ? rawArgs : ["status", ...rawArgs];
const { argv, notice } = rewriteAlias(base);
if (notice !== undefined) process.stderr.write(`${notice}\n`);
await runMain(rootCommand, { rawArgs: argv });
