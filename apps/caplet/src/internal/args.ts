import { realpathSync } from "node:fs";
import path from "node:path";
import type { ArgsDef } from "citty";

export type ScopeSelection = "user" | "project" | "all";
export type FetchMode = "auto" | "never" | "force";
export type ExitCode = 0 | 1 | 2 | 4;

export const globalArgs = {
  scope: {
    type: "string",
    default: "all",
    description: "scope to use: user, project, or all",
  },
  cwd: {
    type: "string",
    default: ".",
    description: "project working directory (default: current directory)",
  },
  quiet: { type: "boolean", default: false, description: "suppress non-error output" },
  verbose: {
    type: "boolean",
    default: false,
    description: "show info diagnostics and expand collapsed file lists",
  },
  "fail-on-lossy": {
    type: "boolean",
    default: false,
    description: "exit 4 when lossy diagnostics are emitted",
  },
} as const satisfies ArgsDef;

export function readScope(args: Record<string, unknown>): ScopeSelection {
  const value = args.scope;
  if (value === "user" || value === "project" || value === "all") return value;
  throw validationError(`invalid --scope: ${String(value)}`);
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

export function readFailOnLossy(args: Record<string, unknown>): boolean {
  return args["fail-on-lossy"] === true;
}

export function readQuiet(args: Record<string, unknown>): boolean {
  return args.quiet === true;
}

export function readVerbose(args: Record<string, unknown>): boolean {
  return args.verbose === true;
}

export function readFetchMode(args: Record<string, unknown>): FetchMode {
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
