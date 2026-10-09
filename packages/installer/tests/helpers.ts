import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Diagnostic, ScopeRoot } from "@caplet/core";

export async function tempDir(prefix = "acf-installer-"): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

/** The error diagnostics of a result, in order. */
export function errors(result: { diagnostics: readonly Diagnostic[] }): Diagnostic[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

export function testScopeRoot(scope: "user" | "project", agentsDir: string): ScopeRoot {
  return {
    scope,
    agentsDir,
    capabilitiesDir: path.join(agentsDir, "capabilities"),
    manifestPath: path.join(agentsDir, "capabilities.yml"),
    lockPath: path.join(agentsDir, "capabilities.lock"),
  };
}
