import { realpathSync } from "node:fs";
import path from "node:path";
import type { ArgsDef } from "citty";

export type ScopeSelection = "user" | "project" | "all";
export type FetchMode = "auto" | "never" | "force";
export type ExitCode = 0 | 1 | 2 | 3 | 4;

export const globalArgs = {
  scope: {
    type: "string",
    alias: "s",
    description: "limit to one scope: user or project (default: both)",
  },
  cwd: {
    type: "string",
    alias: "C",
    default: ".",
    description: "run as if caplet were started in this directory",
  },
  quiet: { type: "boolean", alias: "q", default: false, description: "errors only" },
  verbose: {
    type: "boolean",
    alias: "v",
    default: false,
    description: "expand file lists and show info diagnostics",
  },
  yes: { type: "boolean", alias: "y", default: false, description: "skip confirmation prompts" },
  json: {
    type: "boolean",
    default: false,
    description: "print a single machine-readable JSON object to stdout",
  },
  strict: {
    type: "boolean",
    default: false,
    description: "treat lossy adapter warnings as failures",
  },
  "fail-on-lossy": {
    type: "boolean",
    default: false,
    description: "deprecated alias for --strict",
  },
} as const satisfies ArgsDef;

export const targetArg = {
  target: { type: "string", alias: "t", description: "limit targets (claude, codex, ...)" },
} as const satisfies ArgsDef;

export function readScope(args: Record<string, unknown>): ScopeSelection {
  const value = args.scope;
  if (value === undefined) return "all";
  if (value === "user" || value === "project" || value === "all") return value;
  throw validationError(`invalid --scope: ${String(value)}`);
}

export function readExplicitScope(args: Record<string, unknown>): "user" | "project" | undefined {
  const value = args.scope;
  if (value === undefined) return undefined;
  if (value === "user" || value === "project") return value;
  throw validationError(`invalid --scope for this command: ${String(value)} (use user or project)`);
}

export function readCwd(args: Record<string, unknown>): string {
  const value = args.cwd;
  const raw = typeof value === "string" && value.length > 0 ? value : ".";
  const resolved = path.resolve(raw);
  // Canonicalize symlinks (e.g. macOS /var -> /private/var) so installRoot,
  // process.chdir(), and process.cwd()-relative diff paths all agree. Without
  // this, sidecar relative paths blow up into long ../../.. chains.
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function readStrict(args: Record<string, unknown>): boolean {
  return args.strict === true || args["fail-on-lossy"] === true;
}

export function readQuiet(args: Record<string, unknown>): boolean {
  return args.quiet === true;
}

export function readVerbose(args: Record<string, unknown>): boolean {
  return args.verbose === true;
}

export function readYes(args: Record<string, unknown>): boolean {
  return args.yes === true;
}

export function readFetchMode(args: Record<string, unknown>): FetchMode {
  if (args.offline === true) return "never";
  const value = args.mode;
  if (value === undefined || value === "auto" || value === "never" || value === "force") {
    return value ?? "auto";
  }
  throw validationError(`invalid --mode: ${String(value)}`);
}

export function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function validationError(message: string): Error & { exitCode: 2 } {
  const error = new Error(message) as Error & { exitCode: 2 };
  error.exitCode = 2;
  return error;
}
