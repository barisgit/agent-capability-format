import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  type Diagnostic,
  discoverScopes,
  isErrno,
  isTargetId,
  makeDiagnostic,
  type ScopeRoot,
  scopeRoot,
  type TargetId,
} from "@caplet/core";

/** Scope, fetch policy and filtering for direct SDK facet queries. */
export type GetOptions = {
  scope?: "user" | "project" | "all";
  cwd?: string;
  home?: string;
  fetch?: "auto" | "never" | "force";
  capabilities?: string[];
  includeDiagnostics?: boolean;
};

/** Query options with defaults fixed and paths anchored before any resolution. */
export type NormalizedGetOptions = {
  target: TargetId;
  scope: "user" | "project" | "all";
  cwd: string;
  home: string;
  fetch: "auto" | "never" | "force";
  includeDiagnostics: boolean;
  capabilities?: readonly string[] | undefined;
};

/** Anchors query paths against the invocation directory and supplies SDK defaults. */
export function normalizeGetOptions(opts: GetOptions & { target: TargetId }): NormalizedGetOptions {
  const normalized: NormalizedGetOptions = {
    target: opts.target,
    scope: opts.scope ?? "all",
    cwd: path.resolve(opts.cwd ?? process.cwd()),
    home: path.resolve(opts.home ?? homedir()),
    fetch: opts.fetch ?? "never",
    includeDiagnostics: opts.includeDiagnostics ?? false,
  };
  if (opts.capabilities !== undefined) normalized.capabilities = opts.capabilities;
  return normalized;
}

/** Reports an unregistered target before reading scopes or fetching sources. */
export function validateTarget(target: TargetId): Diagnostic[] {
  if (isTargetId(target)) return [];
  return [
    makeDiagnostic({
      severity: "error",
      code: "acf.target.unknown-id",
      message: `unknown target id: ${target}`,
      targetId: target,
    }),
  ];
}

/** Selects existing scopes in user-before-project order, using core's project discovery rule. */
export async function selectedScopeRoots(opts: NormalizedGetOptions): Promise<ScopeRoot[]> {
  const roots: ScopeRoot[] = [];
  if (opts.scope === "user" || opts.scope === "all") {
    const userDir = path.join(opts.home, ".agents");
    if (await isDirectory(userDir)) roots.push(scopeRoot("user", userDir));
  }
  if (opts.scope === "project" || opts.scope === "all") {
    const discovered = await discoverScopes(opts.cwd, opts.home);
    const project = discovered.find((root) => root.scope === "project");
    if (project !== undefined) roots.push(project);
  }
  return roots;
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}
