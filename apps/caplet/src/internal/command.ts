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
