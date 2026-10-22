/**
 * Locates user and project scopes without crossing the selected project's directory.
 */
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Scope, ScopeRoot } from "../types/index.js";
import { exists } from "../utils/fs.js";
import { isErrno } from "../utils/guards.js";
import { leavesBase } from "../utils/paths.js";

/** The capabilities directory, manifest and lock paths of the scope rooted at `agentsDir`. */
export function scopeRoot(scope: Scope, agentsDir: string): ScopeRoot {
  return {
    scope,
    agentsDir,
    capabilitiesDir: path.join(agentsDir, "capabilities"),
    manifestPath: path.join(agentsDir, "capabilities.yml"),
    lockPath: path.join(agentsDir, "capabilities.lock"),
  };
}

/**
 * The user scope (`~/.agents`, when it exists) and then the local project scope.
 * Project discovery never searches ancestors or aliases the user scope.
 */
export async function discoverScopes(cwd: string, home: string = homedir()): Promise<ScopeRoot[]> {
  const scopes: ScopeRoot[] = [];
  const userDir = path.join(home, ".agents");
  if (await exists(userDir)) scopes.push(scopeRoot("user", userDir));
  const projectDir = await findProjectAgentsDir(cwd, { home });
  if (projectDir !== undefined && projectDir !== userDir)
    scopes.push(scopeRoot("project", projectDir));
  return scopes;
}

/**
 * The project's own `.agents` directory, never an ancestor or the user scope (including
 * symlink aliases) or a symlink outside the project. `allowMissing` lets init validate
 * the location before creating it; normal discovery requires a directory, but not the optional capabilities.yml.
 */
export async function findProjectAgentsDir(
  cwd: string,
  options: { allowMissing?: boolean; home?: string } = {},
): Promise<string | undefined> {
  const [projectRoot, home] = await Promise.all([
    canonicalPath(cwd),
    canonicalPath(options.home ?? homedir()),
  ]);
  const candidate = path.join(projectRoot, ".agents");
  const [canonicalCandidate, canonicalUserDir] = await Promise.all([
    canonicalPath(candidate),
    canonicalPath(path.join(home, ".agents")),
  ]);
  if (
    canonicalCandidate === canonicalUserDir ||
    leavesBase(path.relative(projectRoot, canonicalCandidate))
  )
    return undefined;
  try {
    return (await stat(candidate)).isDirectory() ? candidate : undefined;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return options.allowMissing === true ? candidate : undefined;
    throw error;
  }
}

/** Canonical identity when a path exists; otherwise its absolute, not-yet-created location. */
async function canonicalPath(candidate: string): Promise<string> {
  try {
    return await realpath(candidate);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return path.resolve(candidate);
    throw error;
  }
}
