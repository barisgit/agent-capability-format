import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  type Diagnostic,
  discoverScopes,
  isErrno,
  isTargetId,
  makeDiagnostic,
  type Scope,
  type ScopeRoot,
  scopeRoot,
  type TargetId,
} from "@caplet/core";

export type GetOptions = {
  scope?: "user" | "project" | "all";
  cwd?: string;
  home?: string;
  fetch?: "auto" | "never" | "force";
  capabilities?: string[];
  includeDiagnostics?: boolean;
};

export type NormalizedGetOptions = {
  target: TargetId;
  scope: "user" | "project" | "all";
  cwd: string;
  home: string;
  fetch: "auto" | "never" | "force";
  includeDiagnostics: boolean;
  capabilities?: readonly string[] | undefined;
};

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

export async function selectedScopeRoots(opts: NormalizedGetOptions): Promise<ScopeRoot[]> {
  const roots: ScopeRoot[] = [];
  if (opts.scope === "user" || opts.scope === "all") {
    const userDir = path.join(opts.home, ".agents");
    if (await isDirectory(userDir)) roots.push(scopeRoot("user", userDir));
  }
  if (opts.scope === "project" || opts.scope === "all") {
    const project = await projectScopeRoot(opts.cwd, opts.home);
    if (project !== undefined) roots.push(project);
  }
  return roots;
}

async function projectScopeRoot(cwd: string, home: string): Promise<ScopeRoot | undefined> {
  const homeAgentsDir = path.join(home, ".agents");
  const discovered = await discoverScopes(cwd);
  const project = discovered.find((root) => root.scope === "project");
  if (project === undefined || project.agentsDir === homeAgentsDir) return undefined;
  return project;
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

export type ScopeBuckets = Record<Scope, ScopeRoot[]>;
