/**
 * Value rules for canonical MCP servers that the schema cannot express (canonical-mcp,
 * Canonical MCP server fields and Data directory placeholder): the stdio working directory, the
 * URL scheme and userinfo rule, and where `${ACF_DATA_DIR}` may appear. Messages never echo a
 * URL, so a credential in it cannot reach plans or logs.
 */
import { findUrlCredentials } from "../credentials/index.js";
import type { Diagnostic, McpServer } from "../types/index.js";
import { acfCapabilityDirPlaceholder, acfDataDirPlaceholder } from "../types/index.js";

const CWD_BASES = [acfCapabilityDirPlaceholder, acfDataDirPlaceholder] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
  const dataDirFields = [
    ...(server.url.includes(acfDataDirPlaceholder) ? ["url"] : []),
    ...Object.entries(server.headers ?? {})
      .filter(([, value]) => value.includes(acfDataDirPlaceholder))
      .map(([name]) => `headers.${name}`),
  ];
  for (const field of dataDirFields) {
    push(
      "acf.mcp.placeholder.unsupported",
      `${field} must not contain ${acfDataDirPlaceholder}; it is defined only for stdio command, args, env and cwd`,
    );
  }
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
