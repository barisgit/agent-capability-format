#!/usr/bin/env bun
import { runMain } from "citty";
import { rootCommand } from "./cli";

const rawArgs = process.argv.slice(2);
await runMain(rootCommand, { rawArgs: rawArgs.length === 0 ? ["--help"] : rawArgs });
