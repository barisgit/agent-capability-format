import { createInterface } from "node:readline";
import { reporter } from "./output.js";

export async function runCommandSafely(
  args: Record<string, unknown>,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (isExitCodeError(error)) {
      reporter(args).error(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

function isExitCodeError(error: unknown): error is Error & { exitCode: 1 | 2 | 4 } {
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
