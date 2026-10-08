import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { type Scope, type ScopeRoot, scopeRoot } from "@caplet/core";
import type { ScopeSelection } from "./args";

export async function resolveScopeRoots(
  selection: ScopeSelection,
  cwd: string,
): Promise<ScopeRoot[]> {
  const absoluteCwd = path.resolve(cwd);
  const roots: ScopeRoot[] = [];
  if (selection === "user" || selection === "all") {
    roots.push(scopeRoot("user", path.join(homedir(), ".agents")));
  }
  if (selection === "project" || selection === "all") {
    const found = await findProjectAgentsDir(absoluteCwd);
    if (found !== undefined) roots.push(scopeRoot("project", found));
    else if (selection === "project")
      roots.push(scopeRoot("project", path.join(absoluteCwd, ".agents")));
  }
  return dedupeScopeRoots(roots);
}

export async function projectAgentsDir(cwd: string): Promise<string> {
  const found = await findProjectAgentsDir(path.resolve(cwd));
  return found ?? path.join(path.resolve(cwd), ".agents");
}

export function scopeLabel(root: ScopeRoot): string {
  return `${root.scope}:${root.agentsDir}`;
}

function dedupeScopeRoots(roots: ScopeRoot[]): ScopeRoot[] {
  const seen = new Set<string>();
  const out: ScopeRoot[] = [];
  for (const root of roots) {
    const key = `${root.scope}\0${root.agentsDir}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(root);
  }
  return out;
}

async function findProjectAgentsDir(cwd: string): Promise<string | undefined> {
  const userAgentsDir = path.join(homedir(), ".agents");
  const canonicalUserAgentsDir = await realpath(userAgentsDir).catch(() => userAgentsDir);
  let current = cwd;
  while (true) {
    const candidate = path.join(current, ".agents");
    if (await directoryExists(candidate)) {
      const canonicalCandidate = await realpath(candidate);
      if (canonicalCandidate === canonicalUserAgentsDir) return undefined;
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    await readdir(dir);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function isScope(value: string): value is Scope {
  return value === "user" || value === "project";
}

export async function inferScope(
  explicit: "user" | "project" | undefined,
  cwd: string,
): Promise<"user" | "project"> {
  if (explicit !== undefined) return explicit;
  const found = await findProjectAgentsDir(path.resolve(cwd));
  return found === undefined ? "user" : "project";
}
