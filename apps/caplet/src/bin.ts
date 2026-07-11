#!/usr/bin/env bun
import { runMain } from "citty";
import { rewriteAlias, rootCommand } from "./cli";

const rawArgs = process.argv.slice(2);
const hasCommand = rawArgs.some((token) => !token.startsWith("-"));
const wantsHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
const base =
  hasCommand || wantsHelp || rawArgs.includes("--version") ? rawArgs : ["status", ...rawArgs];
const { argv, notice } = rewriteAlias(base);
if (notice !== undefined) process.stderr.write(`${notice}\n`);
await runMain(rootCommand, { rawArgs: argv });
