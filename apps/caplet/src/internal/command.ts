import { createInterface } from "node:readline";
import { type Diagnostic, LockfileError } from "@caplet/core";
import { readCwd } from "./args.js";
import { printJson, readJson } from "./json.js";
import { printDiagnostics, reporter } from "./output.js";

/** Diagnostic code of a command invoked wrongly: bad flag values, unknown names, missing input. */
export const USAGE_ERROR_CODE = "acf.cli.usage";

/** Diagnostic code of an error no command handles: a caplet bug or an unforeseen environment. */
export const INTERNAL_ERROR_CODE = "acf.cli.internal";

/** Describes an unexpected throw for the JSON diagnostic and stderr, retaining its stack. */
export function describeUnexpectedError(error: unknown): { message: string; detail: string } {
  if (!(error instanceof Error)) {
    const message = String(error);
    return { message, detail: message };
  }
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    code === undefined || error.message.includes(code)
      ? error.message
      : `${code}: ${error.message}`;
  const stack = error.stack;
  // A runtime's stack can omit the message, as seen with async fs errors in Bun 1.3.12.
  // Keep complete stacks unchanged, but never let an incomplete stack hide the actual failure.
  const detail = stack?.includes(message)
    ? stack
    : `${error.name}: ${message}${stack ? `\n${stack}` : ""}`;
  return { message, detail };
}

/** An error a command throws to stop with `exitCode`; `code` is its diagnostic code. */
export type CommandError = Error & { exitCode: 1 | 2 | 4; code?: string | undefined };

/**
 * Runs a command body, reporting a thrown {@link CommandError} with its exit code or a
 * {@link LockfileError} with its path-specific diagnostic and exit 2. Other errors propagate.
 */
export async function runCommandSafely(
  command: string,
  args: Record<string, unknown>,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    // Carry the absolute invocation root through every stage before any command can chdir.
    // In particular, a relative -C must never be interpreted from the selected directory.
    args.cwd = readCwd(args);
    await fn();
  } catch (error) {
    if (error instanceof LockfileError) {
      if (readJson(args)) printJson(command, false, [error.diagnostic], {});
      else printDiagnostics([error.diagnostic], args);
      process.exitCode = 2;
      return;
    }
    if (isCommandError(error)) {
      reportCommandFailure(command, args, error.message, error.code);
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

/**
 * Reports a command that stopped before doing its work. Under `--json` stdout gets the command's
 * envelope with `ok: false` and one error diagnostic (`code`, default {@link USAGE_ERROR_CODE}),
 * so scripts always have an envelope to parse; otherwise the message goes to stderr. The caller
 * sets the exit code.
 */
export function reportCommandFailure(
  command: string,
  args: Record<string, unknown>,
  message: string,
  code: string = USAGE_ERROR_CODE,
): void {
  if (readJson(args)) {
    const diagnostic: Diagnostic = { severity: "error", code, message };
    printJson(command, false, [diagnostic], {});
    return;
  }
  reporter(args).error(message);
}

function isCommandError(error: unknown): error is CommandError {
  return (
    error instanceof Error &&
    "exitCode" in error &&
    (error.exitCode === 1 || error.exitCode === 2 || error.exitCode === 4)
  );
}

/**
 * Asks a yes/no question on the terminal; anything but `y`/`yes` is no. Without an interactive
 * stdin and stdout there is nobody to ask, so the answer is yes.
 */
export async function confirm(question: string): Promise<boolean> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return true;
  return await new Promise((resolve) => {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    prompt.question(`${question} [y/N] `, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
      prompt.close();
    });
    // stdin closed (e.g. Ctrl-D) before an answer counts as "no"; after an answer
    // the promise is already settled and this resolve is a no-op.
    prompt.once("close", () => resolve(false));
  });
}
