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

/** Options of {@link execClaudeCli}. Caplet passes only `cwd`; tests set the others. */
export type ExecClaudeCliOptions = {
  /**
   * Working directory. Claude resolves `local` and `project` scope from it, so project-scope
   * commands must run in the project root.
   */
  cwd: string;
  /** Program to run; defaults to `claude` on `PATH`. */
  binary?: string | undefined;
  /** Kill the command after this long; defaults to two minutes (install fetches over the network). */
  timeoutMs?: number | undefined;
  /** After the timeout's SIGTERM, wait this long before SIGKILL; defaults to five seconds. */
  killGraceMs?: number | undefined;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_KILL_GRACE_MS = 5_000;

/**
 * The real `claude` runner: spawns the binary with an argument vector and no stdin. A command
 * still running at the timeout gets SIGTERM, then SIGKILL after the grace period, and is
 * reported as terminated once it exits, even if a process it started still holds its output open.
 */
export function execClaudeCli(options: ExecClaudeCliOptions): ClaudeCli {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(options.binary ?? "claude", [...args], {
        cwd: options.cwd,
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
      let timedOut = false;
      let killTimer: NodeJS.Timeout | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(
          () => child.kill("SIGKILL"),
          options.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
        );
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      // The first settled outcome wins: a spawn failure may be followed by `close`, and a killed
      // command's `exit` by a `close` that waits on its output.
      const settle = (outcome: ClaudeCliOutcome) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        resolve(outcome);
      };
      child.on("error", (error: NodeJS.ErrnoException) => {
        settle({
          kind: "unavailable",
          reason: error.code === "ENOENT" ? "missing" : "failed-to-start",
          message: error.message,
        });
      });
      child.on("exit", (_code, signal) => {
        if (!timedOut) return;
        // A process the command started may keep the pipes open; stop waiting for them.
        child.stdout.destroy();
        child.stderr.destroy();
        settle({ kind: "terminated", signal: signal ?? "unknown signal", stdout, stderr });
      });
      child.on("close", (code, signal) => {
        settle(
          code === null
            ? { kind: "terminated", signal: signal ?? "unknown signal", stdout, stderr }
            : { kind: "exited", exitCode: code, stdout, stderr },
        );
      });
    });
}
