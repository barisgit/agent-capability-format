import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import type { Scope } from "@caplet/core";
import type { ClaudeScope } from "./commands.js";

/**
 * An ACF install scope as the Claude host sees it. `projectRoot` is the real path of the project
 * root; build values with `resolveClaudeScopeTarget` so a symlinked checkout gets the same name.
 */
export type ClaudeScopeTarget = { scope: "user" } | { scope: "project"; projectRoot: string };

/** Resolves `projectRoot` to its real path for project scope; user scope ignores it. */
export async function resolveClaudeScopeTarget(
  scope: Scope,
  projectRoot: string,
): Promise<ClaudeScopeTarget> {
  if (scope === "user") return { scope: "user" };
  return { scope: "project", projectRoot: await realpath(projectRoot) };
}

/**
 * Name of caplet's Claude marketplace for a scope: `acf-user`, or `acf-project-<h>` with `<h>` the
 * first 8 hex digits of the SHA-256 of the project root's real path. Claude keeps one marketplace
 * record per name for the whole user and silently repoints a known name at a new directory, so
 * every project needs its own name.
 */
export function claudeMarketplaceName(target: ClaudeScopeTarget): string {
  if (target.scope === "user") return "acf-user";
  const hash = createHash("sha256").update(target.projectRoot).digest("hex");
  return `acf-project-${hash.slice(0, 8)}`;
}

/**
 * Claude scope caplet registers at: ACF `user` is Claude `user`; ACF `project` is Claude `local`,
 * because Claude would write the marketplace's absolute path into the committed
 * `.claude/settings.json` at Claude `project` scope (D25).
 */
export function claudeScopeFor(scope: Scope): Extract<ClaudeScope, "user" | "local"> {
  return scope === "user" ? "user" : "local";
}
