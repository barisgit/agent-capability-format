import { createInterface } from "node:readline";
import type { Diagnostic } from "@caplet/core";
import { printJson, readJson } from "./json.js";
import { reporter } from "./output.js";

/** Diagnostic code of a command invoked wrongly: bad flag values, unknown names, missing input. */
export const USAGE_ERROR_CODE = "acf.cli.usage";

/** An error a command throws to stop with `exitCode`; `code` is its diagnostic code. */
export type CommandError = Error & { exitCode: 1 | 2 | 4; code?: string | undefined };

/**
 * Runs a command body, turning a thrown {@link CommandError} into the command's failure output
 * ({@link reportCommandFailure}) and exit code. Other errors propagate.
 */
export async function runCommandSafely(
  command: string,
  args: Record<string, unknown>,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
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
