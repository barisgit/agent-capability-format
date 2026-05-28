import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, ScopeRoot } from "@acf/core";

export type PruneResult = { removed: string[]; diagnostics: Diagnostic[] };

export async function pruneCapabilities(
  scopeRoot: ScopeRoot,
  keep: Set<string>,
): Promise<PruneResult> {
  const removed: string[] = [];
  const diagnostics: Diagnostic[] = [];
  try {
    await mkdir(scopeRoot.capabilitiesDir, { recursive: true });
    for (const entry of await readdir(scopeRoot.capabilitiesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || keep.has(entry.name)) continue;
      await rm(path.join(scopeRoot.capabilitiesDir, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "acf.prune.failed",
      message: error instanceof Error ? error.message : "failed to prune capabilities",
      path: scopeRoot.capabilitiesDir,
    });
  }
  return { removed: removed.sort(), diagnostics };
}
