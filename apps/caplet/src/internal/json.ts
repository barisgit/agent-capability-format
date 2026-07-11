import type { Diagnostic } from "@acf/core";

export const CAPLET_VERSION = "0.2.0";

export function readJson(args: Record<string, unknown>): boolean {
  return args.json === true;
}

export function printJson(
  command: string,
  ok: boolean,
  diagnostics: readonly Diagnostic[],
  payload: Record<string, unknown>,
): void {
  const envelope = { caplet: CAPLET_VERSION, command, ok, diagnostics, ...payload };
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}
