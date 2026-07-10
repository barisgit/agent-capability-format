import path from "node:path";
import {
  type AcfCapability,
  type EmitInput,
  type EmitOptions,
  readCapability,
  type Scope,
  type TargetAdapter,
} from "@acf/core";
import { makeInMemoryFs } from "./in-memory-fs";

export const fixtureRoot = path.resolve("tests", "fixtures", "full");

export async function readFixtureCapability(scope: Scope = "project"): Promise<AcfCapability> {
  return await readCapability(fixtureRoot, scope, { kind: "local", directory: fixtureRoot });
}

export function emitInput(
  capability: AcfCapability,
  installRoot: string,
  options: EmitOptions = {},
): EmitInput {
  return { capability, scope: capability.scope, installRoot, options };
}

export async function emitFixture(
  adapter: TargetAdapter,
  installRoot: string,
  files: Record<string, string> = {},
) {
  const capability = await readFixtureCapability();
  return await adapter.emit(emitInput(capability, installRoot), makeInMemoryFs(files));
}

export function byPath<T extends { path: string }>(items: T[], suffix: string): T {
  const found = items.find((item) => item.path.endsWith(suffix));
  if (found === undefined) throw new Error(`missing diff ending with ${suffix}`);
  return found;
}

export function codes(result: { diagnostics: Array<{ code: string }> }): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

export function parseJsonDiff(diff: {
  after: string | Uint8Array | null;
}): Record<string, unknown> {
  if (diff.after === null) throw new Error("diff has null after");
  if (typeof diff.after !== "string") throw new Error("JSON diff has binary content");
  return JSON.parse(diff.after) as Record<string, unknown>;
}
