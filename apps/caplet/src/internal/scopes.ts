import { homedir } from "node:os";
import path from "node:path";
import { type Diagnostic, findProjectAgentsDir, type ScopeRoot, scopeRoot } from "@caplet/core";
import { type ScopeSelection, validationError } from "./args.js";

/**
 * User is `~/.agents`; project is only `cwd/.agents`, never an ancestor or the user scope.
 * Explicit project selection fails rather than silently writing to another scope.
 */
export async function resolveScopeRoots(
  selection: ScopeSelection,
  cwd: string,
  diagnostics?: Diagnostic[],
): Promise<ScopeRoot[]> {
  const roots: ScopeRoot[] = [];
  if (selection === "user" || selection === "all") {
    roots.push(scopeRoot("user", path.join(homedir(), ".agents")));
  }
  if (selection === "project" || selection === "all") {
    const found = await findProjectAgentsDir(cwd);
    if (found !== undefined) roots.push(scopeRoot("project", found));
    else if (selection === "project")
      throw validationError(
        "no project scope here; run caplet init in a directory other than the user home, or use --cwd to select a project",
        "acf.scope.project-not-found",
      );
    else
      diagnostics?.push({
        severity: "info",
        code: "acf.scope.project-not-found",
        message:
          "no project scope here; using user scope only (run from the project root or select it with --cwd)",
        path: path.join(cwd, ".agents"),
      });
  }
  return roots;
}

/** The explicit scope, else project only when cwd has its own non-user `.agents` directory. */
export async function inferScope(
  explicit: "user" | "project" | undefined,
  cwd: string,
): Promise<"user" | "project"> {
  if (explicit !== undefined) return explicit;
  return (await findProjectAgentsDir(cwd)) === undefined ? "user" : "project";
}
