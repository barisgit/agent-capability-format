/**
 * Value rules for canonical MCP servers that the schema cannot express (canonical-mcp,
 * Canonical MCP server fields, Data directory placeholder and Pending MCP meanings): the stdio
 * working directory, the URL scheme and userinfo rule, where `${ACF_DATA_DIR}` may appear, and
 * that no value references anything but an ACF placeholder. Messages never echo a URL, so a
 * credential in it cannot reach plans or logs.
 */
import { findUrlCredentials } from "../credentials/index.js";
import { pendingCoreFields } from "../targets/native-keys.js";
import type { Diagnostic, McpServer } from "../types/index.js";
import {
  acfCapabilityDirPlaceholder,
  acfDataDirPlaceholder,
  acfPathPlaceholders,
} from "../types/index.js";

const CWD_BASES = [acfCapabilityDirPlaceholder, acfDataDirPlaceholder] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** The only `${...}` references a canonical MCP value may hold (SPEC.md §13a.4.1). */
const ACF_PLACEHOLDERS = new Set<string>([...acfPathPlaceholders, acfDataDirPlaceholder]);
const VALUE_REFERENCE = /\$\{[^}]*\}/g;
const VALUE_REFERENCES_MEANING = pendingCoreFields["mcp.valueReferences"];

/** Pushes an error for every rule `server` breaks; `file` is the mcp.yml path. */
export function validateMcpServerValues(
  server: McpServer,
  file: string | undefined,
  diagnostics: Diagnostic[],
): void {
  const push = (code: string, message: string): void => {
    diagnostics.push({
      severity: "error",
      code,
      message: `server ${server.name}: ${message}`,
      path: file,
      family: "mcp",
    });
  };
  for (const [field, value] of valueFields(server)) {
    for (const reference of new Set(value.match(VALUE_REFERENCE) ?? [])) {
      if (ACF_PLACEHOLDERS.has(reference)) continue;
      // Hosts such as Claude expand `${VAR}` in these fields, so writing it through would
      // smuggle a host environment reference past the rule that ACF expands none.
      push(
        "acf.mcp.placeholder.pending",
        `${field} references ${reference}, which is not an ACF placeholder; ${VALUE_REFERENCES_MEANING} are pending core and never expanded. Author the server natively: through targets.<target>.native on the server (for example targets.codex.native.env_vars), or for Claude as a native server under package-level targets.claude.native.mcpServers`,
      );
    }
  }
  if (server.transport === "stdio") {
    if (server.cwd !== undefined) {
      const problem = cwdProblem(server.cwd);
      if (problem !== undefined) push("acf.mcp.cwd.invalid", `cwd ${problem}`);
    }
    return;
  }
  // The schema parses cwd on every transport; only stdio gives it a meaning.
  if ((server as { cwd?: unknown }).cwd !== undefined) {
    push("acf.mcp.cwd.invalid", "cwd is only valid for transport: stdio");
  }
  const credentials = findUrlCredentials(server.url);
  if (credentials?.userinfo === true) {
    push(
      "acf.mcp.url.credential-in-url",
      `url must not contain userinfo credentials: ${credentials.redacted}. Send credentials in headers instead`,
    );
  } else if (!isAllowedUrl(server.url)) {
    push(
      "acf.mcp.url.insecure",
      "url must use https://, or http:// only for localhost, 127.0.0.1 or [::1]",
    );
  }
  for (const [field, value] of valueFields(server)) {
    if (!value.includes(acfDataDirPlaceholder)) continue;
    push(
      "acf.mcp.placeholder.unsupported",
      `${field} must not contain ${acfDataDirPlaceholder}; it is defined only for stdio command, args, env and cwd`,
    );
  }
}

/** Every string value a host may expand references in, labelled with its field path. */
function valueFields(server: McpServer): [string, string][] {
  const entries = (prefix: string, record: Record<string, string> | undefined) =>
    Object.entries(record ?? {}).map(([key, value]): [string, string] => [
      `${prefix}.${key}`,
      value,
    ]);
  if (server.transport !== "stdio") {
    return [["url", server.url], ...entries("headers", server.headers)];
  }
  return [
    ["command", server.command],
    ...(server.args ?? []).map((value, index): [string, string] => [`args[${index}]`, value]),
    ...entries("env", server.env),
    ...(server.cwd === undefined ? [] : [["cwd", server.cwd] as [string, string]]),
  ];
}

/**
 * Why `cwd` is invalid, or undefined. A working directory starts with `${ACF_CAPABILITY_DIR}`,
 * `${ACF_DATA_DIR}` or `./` and never leaves that base through `..`.
 */
function cwdProblem(cwd: string): string | undefined {
  const base = cwd.startsWith("./")
    ? "."
    : CWD_BASES.find((candidate) => cwd === candidate || cwd.startsWith(`${candidate}/`));
  if (base === undefined) {
    return `must start with ${acfCapabilityDirPlaceholder}, ${acfDataDirPlaceholder} or ./`;
  }
  const segments = cwd.slice(base.length).split(/[/\\]/);
  return segments.includes("..") ? `must not leave ${base} through ..` : undefined;
}

function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
}
