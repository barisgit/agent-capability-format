import type { Diagnostic } from "@caplet/core";
import packageJson from "../../package.json" with { type: "json" };

/** The caplet release version; package.json is the single source of truth. */
export const CAPLET_VERSION: string = packageJson.version;

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
