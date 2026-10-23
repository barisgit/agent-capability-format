/** Subprocess and usage-failure conventions for package preparation commands. */
import { execFileSync } from "node:child_process";

/** Captures stdout for inspection while forwarding diagnostics; nonzero exits throw. */
export function run(command: string, args: string[], cwd: string, env = process.env): string {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/** Ends an invalid package preparation command with the CLI's one-line error. */
export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
