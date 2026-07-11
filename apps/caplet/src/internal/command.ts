import { reporter } from "./output";

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
  process.stdout.write(`${question} [y/N] `);
  for await (const line of console) {
    return line.trim().toLowerCase() === "y" || line.trim().toLowerCase() === "yes";
  }
  return false;
}
