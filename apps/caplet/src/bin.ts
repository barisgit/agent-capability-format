#!/usr/bin/env bun
import { runMain } from "citty";
import { rootCommand } from "./cli";

await runMain(rootCommand);
