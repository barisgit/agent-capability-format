/**
 * MCP server projection for the foreign format readers (canonical-mcp, MCP field mapping
 * and Placeholders). A server becomes a canonical server, stays whole as native remainder
 * when it relies on a meaning core cannot express, or is invalid under its format's rules.
 */
import { withNativeExtras } from "../extras/index.js";
import { hostReferences, urlProblem } from "../reader/mcp-rules.js";
import type { McpServer } from "../types/index.js";
import {
  CAPABILITY_DIR,
  DATA_DIR,
  isRecord,
  isSlug,
  mapPlaceholders,
  nativeValuesProblem,
  placeholder,
} from "./shared.js";

/**
 * How one foreign server maps into core: a canonical `server`, a whole-server native
 * `remainder` (pending meaning; `executable` when it launches a local process), or an
 * `invalid` server the reader skips with a warning.
 */
export type ServerProjection =
  | { kind: "server"; server: McpServer }
  | { kind: "remainder"; reason: string; executable: boolean }
  | { kind: "invalid"; reason: string };

const AGENT_PLUGINS_PLACEHOLDERS = { PLUGIN_ROOT: CAPABILITY_DIR, PLUGIN_DATA: DATA_DIR };
const CLAUDE_PLACEHOLDERS = { CLAUDE_PLUGIN_ROOT: CAPABILITY_DIR, CLAUDE_PLUGIN_DATA: DATA_DIR };

const invalid = (reason: string): ServerProjection => ({ kind: "invalid", reason });
const pending = (reason: string, executable: boolean): ServerProjection => ({
  kind: "remainder",
  reason,
  executable,
});

/**
 * An Agent Plugins 1.0 `mcp.json` server. Variants are closed; `args`, `env` values and
 * `cwd` expand `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`; a `./` command is package-relative; an
 * omitted `cwd` means the package root (D22).
 */
export function projectAgentPluginsServer(name: string, raw: unknown): ServerProjection {
  if (!isRecord(raw)) return invalid("server must be an object");
  if (raw.type === "stdio") return agentPluginsStdio(name, raw);
  if (raw.type === "streamable-http" || raw.type === "sse") return agentPluginsRemote(name, raw);
  return invalid("type must be stdio, streamable-http or sse");
}

function agentPluginsStdio(name: string, raw: Record<string, unknown>): ServerProjection {
  const unknown = unknownKey(raw, ["type", "command", "args", "env", "cwd"]);
  if (unknown !== undefined) return invalid(`unknown key ${unknown}`);
  const { command, args, env, cwd } = raw;
  if (typeof command !== "string" || command.length === 0) return invalid("command is required");
  if (!command.startsWith("./") && /[/\\]/.test(command))
    return invalid("command must be a bare name or a ./ path");
  if (args !== undefined && !isStringArray(args)) return invalid("args must be strings");
  if (env !== undefined && !isStringMap(env)) return invalid("env must map strings to strings");
  if (env !== undefined && ("PLUGIN_ROOT" in env || "PLUGIN_DATA" in env))
    return invalid("env must not set PLUGIN_ROOT or PLUGIN_DATA");
  if (cwd !== undefined && (typeof cwd !== "string" || !validAgentPluginsCwd(cwd)))
    return invalid("cwd must start with ./ or the PLUGIN_ROOT or PLUGIN_DATA placeholder");

  // Agent Plugins expands nothing in `command`, so a placeholder there is literal text
  // that a target could expand differently: keep the server whole.
  if (hasPlaceholder(command)) return pending("command contains a placeholder", true);
  const map = placeholderMapper(AGENT_PLUGINS_PLACEHOLDERS);
  const server: McpServer = {
    name,
    transport: "stdio",
    command: command.startsWith("./") ? `${CAPABILITY_DIR}/${command.slice(2)}` : command,
    cwd: cwd === undefined ? CAPABILITY_DIR : map.one(cwd),
  };
  if (args !== undefined) server.args = map.list(args);
  if (env !== undefined) server.env = map.record(env);
  if (!map.ok) return pending("uses a placeholder core cannot express", true);
  return named(name, server, true);
}

function agentPluginsRemote(name: string, raw: Record<string, unknown>): ServerProjection {
  const unknown = unknownKey(raw, ["type", "url", "headers"]);
  if (unknown !== undefined) return invalid(`unknown key ${unknown}`);
  const { url, headers } = raw;
  if (typeof url !== "string") return invalid("url is required");
  const problem = urlProblem(url, false);
  if (problem !== undefined) return invalid(`url ${problem}`);
  if (headers !== undefined && !isStringMap(headers))
    return invalid("headers must map strings to strings");
  if (headers !== undefined && hasCaseInsensitiveDuplicate(Object.keys(headers)))
    return invalid("headers repeat a name");
  if ([url, ...Object.values(headers ?? {})].some(hasPlaceholder))
    return pending("url or headers contain a placeholder", false);
  const server: McpServer = {
    name,
    transport: raw.type === "sse" ? "sse" : "http",
    url,
    ...(headers === undefined ? {} : { headers }),
  };
  return named(name, server, false);
}

const CLAUDE_CANONICAL_KEYS = ["type", "command", "args", "env", "url", "headers"];

/**
 * A Claude plugin server (`.mcp.json` or manifest `mcpServers`). Claude expands its
 * placeholders in command, args, env, url and headers; `headersHelper`, OAuth, `ws` and any
 * placeholder other than the plugin root and data directory keep the server whole. Other
 * keys (`timeout`, ...) become Claude extras on the server. `cwd` stays omitted.
 */
export function projectClaudeServer(name: string, raw: unknown): ServerProjection {
  if (!isRecord(raw)) return invalid("server must be an object");
  const extras = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !CLAUDE_CANONICAL_KEYS.includes(key)),
  );
  const valueProblem = nativeValuesProblem("claude", "mcp", extras);
  if (valueProblem !== undefined) return invalid(valueProblem);
  const stdio = raw.type === undefined || raw.type === "stdio";
  if (raw.headersHelper !== undefined) return pending("uses headersHelper", stdio);
  if (raw.oauth !== undefined) return pending("uses OAuth", stdio);

  let server: McpServer;
  if (stdio) {
    const { command, args, env } = raw;
    if (typeof command !== "string" || command.length === 0) return invalid("command is required");
    if (args !== undefined && !isStringArray(args)) return invalid("args must be strings");
    if (env !== undefined && !isStringMap(env)) return invalid("env must map strings to strings");
    const map = placeholderMapper(CLAUDE_PLACEHOLDERS);
    server = { name, transport: "stdio", command: map.one(command) };
    if (args !== undefined) server.args = map.list(args);
    if (env !== undefined) server.env = map.record(env);
    if (!map.ok) return pending("uses a placeholder core cannot express", true);
  } else if (raw.type === "http" || raw.type === "streamable-http" || raw.type === "sse") {
    const { url, headers } = raw;
    if (typeof url !== "string") return invalid("url is required");
    if (headers !== undefined && !isStringMap(headers))
      return invalid("headers must map strings to strings");
    const map = placeholderMapper(CLAUDE_PLACEHOLDERS);
    const mappedUrl = map.one(url);
    const mappedHeaders = headers === undefined ? undefined : map.record(headers);
    if (!map.ok) return pending("uses a placeholder core cannot express", false);
    const problem = urlProblem(mappedUrl, true);
    if (problem !== undefined) return pending(`url ${problem}`, false);
    server = {
      name,
      transport: raw.type === "sse" ? "sse" : "http",
      url: mappedUrl,
      ...(mappedHeaders === undefined ? {} : { headers: mappedHeaders }),
    };
  } else {
    return pending(`transport ${String(raw.type)} has no canonical form`, false);
  }
  if (Object.keys(extras).length > 0)
    server.targets = withNativeExtras(undefined, "claude", extras);
  return named(name, server, stdio);
}

function named(name: string, server: McpServer, executable: boolean): ServerProjection {
  if (!isSlug(name)) return pending("name is not an ACF slug", executable);
  // Literal text to the source host, such as `{env:X}` in a Claude server, would be expanded
  // by another target's host; only the source format keeps that meaning.
  const [reference] = hostReferences(server);
  if (reference !== undefined)
    return pending(`${reference[0]} holds ${reference[1]}, which another host expands`, executable);
  return { kind: "server", server };
}

/**
 * Maps placeholders field by field; `ok` turns false once any value uses a placeholder the
 * mapping does not cover, and the caller then keeps the whole server native.
 */
function placeholderMapper(mapping: Readonly<Record<string, string>>) {
  let ok = true;
  const one = (value: string): string => {
    const mapped = mapPlaceholders(value, mapping);
    if (mapped === undefined) ok = false;
    return mapped ?? value;
  };
  return {
    one,
    list: (values: string[]): string[] => values.map(one),
    record: (values: Record<string, string>): Record<string, string> =>
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, one(value)])),
    get ok(): boolean {
      return ok;
    },
  };
}

function validAgentPluginsCwd(cwd: string): boolean {
  if (cwd.startsWith("./")) return true;
  return [placeholder("PLUGIN_ROOT"), placeholder("PLUGIN_DATA")].some(
    (prefix) => cwd === prefix || cwd.startsWith(`${prefix}/`),
  );
}

function hasPlaceholder(value: string): boolean {
  return /\$\{[^}]*\}/.test(value);
}

function unknownKey(raw: Record<string, unknown>, known: readonly string[]): string | undefined {
  return Object.keys(raw).find((key) => !known.includes(key));
}

function hasCaseInsensitiveDuplicate(names: string[]): boolean {
  return new Set(names.map((name) => name.toLowerCase())).size !== names.length;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
