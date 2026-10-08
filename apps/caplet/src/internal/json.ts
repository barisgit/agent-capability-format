import { readFileSync } from "node:fs";
import type { Diagnostic } from "@caplet/core";

// Read at runtime rather than imported so the compiled output stays inside dist/.
// src/internal/ and dist/internal/ sit at the same depth, so the relative URL reaches
// the package's own package.json both from source and from the published tarball.
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

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
