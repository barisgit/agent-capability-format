import { spawn } from "node:child_process";

/** What one `claude` invocation did. Spawn errors and signals are outcomes, never exceptions. */
export type ClaudeCliOutcome =
  | { kind: "exited"; exitCode: number; stdout: string; stderr: string }
  | { kind: "terminated"; signal: string; stdout: string; stderr: string }
  | { kind: "unavailable"; reason: "missing" | "failed-to-start"; message: string };

/**
 * Runs `claude` with `args` (the arguments after the program name). Implementations must not
 * use a shell and must not throw for a failed command; a test fake may throw on an unexpected
 * invocation so the mistake is loud.
 */
export type ClaudeCli = (args: readonly string[]) => Promise<ClaudeCliOutcome>;

export type ExecClaudeCliOptions = {
  /**
   * Working directory. Claude resolves `local` and `project` scope from it, so project-scope
   * commands must run in the project root.
   */
  cwd: string;
  /** Program to run; defaults to `claude` on `PATH`. */
  binary?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  /** Kill the command after this long; defaults to two minutes (install fetches over the network). */
  timeoutMs?: number | undefined;
};

const DEFAULT_TIMEOUT_MS = 120_000;

/** The real `claude` runner: spawns the binary with an argument vector and no stdin. */
export function execClaudeCli(options: ExecClaudeCliOptions): ClaudeCli {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(options.binary ?? "claude", [...args], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      const timer = setTimeout(
        () => child.kill("SIGTERM"),
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      // A spawn failure may be followed by `close`; the first settled outcome wins.
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        resolve({
          kind: "unavailable",
          reason: error.code === "ENOENT" ? "missing" : "failed-to-start",
          message: error.message,
        });
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve(
          code === null
            ? { kind: "terminated", signal: signal ?? "unknown signal", stdout, stderr }
            : { kind: "exited", exitCode: code, stdout, stderr },
        );
      });
    });
}
