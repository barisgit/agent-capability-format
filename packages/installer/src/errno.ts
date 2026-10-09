/** Whether `error` is a Node.js system error with the given `code` (for example `ENOENT`). */
export function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
