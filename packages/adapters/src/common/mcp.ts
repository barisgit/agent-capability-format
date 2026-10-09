/**
 * Native MCP server serialization (canonical-mcp, per-target MCP support table).
 *
 * Each server is rendered for one target and carrier in that host's own config spelling,
 * from its canonical fields plus the target's own native extras. Support cells decide whether
 * each present field and placeholder is written, translated or refuses the server; extras of
 * every other dialect are reported as dropped (or refuse the server when they restrict).
 */
import path from "node:path";
import {
  type AcfCapability,
  type AcfOwnership,
  acfPathPlaceholders,
  type Carrier,
  componentOmitted,
  type Diagnostic,
  type EmitInput,
  type FileDiff,
  type McpServer,
  nativeExtras,
  nativeKeyInfo,
  type ReadOnlyFs,
  recoveryFor,
  type Scope,
  type SupportSubject,
  type TargetId,
} from "@caplet/core";
import { makeFileDiff } from "./diff.js";
import { jsonPointerEscape, mergeJson } from "./json-merge.js";
import { removeMarkedBlock, replaceMarkedBlock } from "./markers.js";
import { substitutePlaceholders } from "./placeholders.js";
import {
  type ComponentReport,
  considerField,
  type EmitReport,
  emptyReport,
  reportForeignExtras,
} from "./support-report.js";
import { renderTomlTable, tomlDefinesTable } from "./toml.js";

// Built from parts so the source holds no `${...}` string literal (biome noTemplateCurlyInString).
const PLACEHOLDER_OPEN = "$";
const CAPABILITY_DIR = acfPathPlaceholders[0];
const DATA_DIR = `${PLACEHOLDER_OPEN}{ACF_DATA_DIR}`;

/** Values the server's path placeholders become in the written config. */
export type McpPlaceholderValues = {
  /** Replaces `${ACF_CAPABILITY_DIR}` and `${ACF_PACKAGE_DIR}`; `./` cwd values resolve against it. */
  capabilityDir: string;
  /** Replaces `${ACF_HOOK_DIR}` (the directory of the capability's MCP file). */
  hookDir: string;
  /** Replaces `${ACF_DATA_DIR}`. */
  dataDir: string;
};

/** An MCP server rendered for one target and carrier. */
export type NativeMcpServer = ComponentReport & {
  /** The server entry in the target's spelling; null when the server is refused. */
  entry: Record<string, unknown> | null;
  /** True when the written entry references the capability data directory. */
  usesDataDir: boolean;
};

/** Placeholders that have their own support row per field (`mcp.<field>=<placeholder>`). */
const placeholderRows = {
  args: [CAPABILITY_DIR, DATA_DIR],
  env: [CAPABILITY_DIR, DATA_DIR],
  cwd: [CAPABILITY_DIR, DATA_DIR],
  url: [CAPABILITY_DIR],
  headers: [CAPABILITY_DIR],
} as const;

/**
 * Renders `server` for `target` on `carrier` (default `loose`), substituting placeholders with
 * `values`. Reusable by every MCP writer, including the Claude plugin carrier, which passes its
 * own plugin variables as `values`.
 */
export function renderNativeMcpServer(
  capability: AcfCapability,
  server: McpServer,
  target: TargetId,
  values: McpPlaceholderValues,
  carrier: Carrier = "loose",
): NativeMcpServer {
  const subject: SupportSubject & { family: "mcp" } = {
    capability: capability.manifest.name,
    target,
    carrier,
    family: "mcp",
    component: server.name,
  };
  const report = emptyReport();
  const carried = (field: string): boolean => {
    const kind = considerField(report, subject, field)?.kind;
    return kind === "native" || kind === "translated";
  };
  const substitute = (value: string): string =>
    substitutePlaceholders(value, values).replaceAll(DATA_DIR, values.dataDir);
  // Placeholder rows refine a carried field; a refused placeholder refuses the whole server.
  const placeholders = (field: keyof typeof placeholderRows, present: readonly string[]): void => {
    for (const placeholder of placeholderRows[field]) {
      if (present.some((value) => value.includes(placeholder)))
        carried(`mcp.${field}=${placeholder}`);
    }
  };

  carried(`mcp.transport=${server.transport}`);
  const fields: Fields = {};
  if (server.transport === "stdio") {
    if (carried(commandField(server.command))) fields.command = substitute(server.command);
    if (server.args !== undefined && carried("mcp.args")) {
      placeholders("args", server.args);
      fields.args = server.args.map(substitute);
    }
    if (server.env !== undefined && carried("mcp.env")) {
      placeholders("env", Object.values(server.env));
      fields.env = mapValues(server.env, substitute);
    }
    if (server.cwd !== undefined && carried("mcp.cwd")) {
      placeholders("cwd", [server.cwd]);
      fields.cwd = resolveCwd(server.cwd, values.capabilityDir, substitute);
    }
  } else {
    if (carried("mcp.url")) {
      placeholders("url", [server.url]);
      fields.url = substitute(server.url);
    }
    if (server.headers !== undefined && carried("mcp.headers")) {
      placeholders("headers", Object.values(server.headers));
      fields.headers = mapValues(server.headers, substitute);
    }
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nativeExtras(server.targets, target))) {
    // Core fields own their generated keys; validation reports an extra that repeats one.
    if (nativeKeyInfo(target, "mcp", key)?.generatedFrom !== undefined) continue;
    extras[key] = value;
  }
  reportForeignExtras(report, subject, server.targets);

  const usesDataDir = [
    fields.command,
    fields.cwd,
    ...(fields.args ?? []),
    ...Object.values(fields.env ?? {}),
  ].some((value) => value?.includes(values.dataDir) === true);
  const entry = report.refused
    ? null
    : { ...dialectEntry(target, server.transport, fields), ...extras };
  return { ...report, entry, usesDataDir: entry !== null && usesDataDir };
}

/**
 * Writes the capability's MCP servers into `target`'s own config file for `input.scope` and
 * accumulates support decisions in `report`. Creates the capability data directory
 * (`<install-root>/.acf/data/<capability>/`) when a written server uses `${ACF_DATA_DIR}`.
 */
export async function emitMcp(
  input: EmitInput,
  fs: ReadOnlyFs,
  target: TargetId,
  report: EmitReport,
): Promise<FileDiff[]> {
  const capability = input.capability;
  const mcp = capability.mcp;
  if (mcp === undefined || mcp.servers.length === 0) return [];
  const values: McpPlaceholderValues = {
    capabilityDir: capability.root,
    hookDir: path.dirname(mcp.path),
    dataDir: capabilityDataDir(input.installRoot, capability.manifest.name),
  };
  const file = mcpPathFor(target, input.installRoot, input.scope);
  if (file === undefined) {
    for (const server of mcp.servers)
      report.diagnostics.push(unwritableServer(input, target, server));
    return [];
  }
  const before = await fs.readText(file);
  let after = before ?? "";
  const owns: AcfOwnership[] = [];
  let usesDataDir = false;
  for (const server of [...mcp.servers].sort((a, b) => a.name.localeCompare(b.name))) {
    const rendered = renderNativeMcpServer(capability, server, target, values);
    report.diagnostics.push(...rendered.diagnostics);
    report.outcomes.push(...rendered.outcomes);
    if (rendered.entry === null) continue;
    usesDataDir ||= rendered.usesDataDir;
    if (target === "codex") {
      const name = `mcp_servers.${server.name}`;
      // A second [mcp_servers.<name>] table, or one inside an inline mcp_servers value, makes
      // config.toml invalid; the user's own definition wins and the server is not written.
      if (tomlDefinesTable(removeMarkedBlock(after, name), ["mcp_servers", server.name])) {
        report.diagnostics.push(
          mcpConfigConflict({
            file,
            server: server.name,
            target,
            capability,
            owners: "user-defined",
          }),
        );
        continue;
      }
      const table = renderTomlTable(["mcp_servers", server.name], rendered.entry);
      after = replaceMarkedBlock(after, name, table, "hash");
      owns.push({ kind: "marker", name });
    } else {
      const pointer = mcpServerPointer(target, server.name);
      after = mergeJson(after, pointer, rendered.entry);
      owns.push({ kind: "json-pointer", pointer });
    }
  }
  if (owns.length === 0) return [];
  const diffs = [makeFileDiff(file, before, after, owns)];
  if (usesDataDir) {
    const keep = path.join(values.dataDir, ".keep");
    diffs.push(makeFileDiff(keep, await fs.readText(keep), "", [{ kind: "file" }]));
  }
  return diffs;
}

/** The JSON pointer of MCP server `name` in a JSON-config target's MCP file. */
export function mcpServerPointer(target: TargetId, name: string): string {
  return `/${target === "opencode" ? "mcp" : "mcpServers"}/${jsonPointerEscape(name)}`;
}

/** Who else claims an MCP server name in one target's MCP file. */
export type McpConflict = {
  file: string;
  server: string;
  target: TargetId;
  capability: AcfCapability;
  /** The user's own definition, or the other capabilities declaring the same name. */
  owners: "user-defined" | readonly string[];
};

/**
 * `acf.mcp.config-conflict` (error): writing `capability`'s server would overwrite one caplet
 * does not own for it, so caplet writes nothing for that server on that target.
 */
export function mcpConfigConflict(conflict: McpConflict): Diagnostic {
  const { file, server, target, capability, owners } = conflict;
  const name = capability.manifest.name;
  const recovery = `exclude: { mcp: [${server}] }`;
  const message =
    owners === "user-defined"
      ? `${file} already defines MCP server ${server} (user-defined), so caplet does not write ${name}'s server over it; rename or remove that definition, or use ${recovery}`
      : `MCP server ${server} of ${name} is also declared by ${owners.join(", ")} for ${target}, so caplet writes it for none of them; keep it in one capability with ${recovery} on the others`;
  return {
    severity: "error",
    code: "acf.mcp.config-conflict",
    message,
    targetId: target,
    family: "mcp",
    capability: { name, version: capability.manifest.version },
    path: file,
    data: { server, owners: owners === "user-defined" ? [owners] : [...owners] },
  };
}

/** The capability's persistent data directory on loose carriers (`${ACF_DATA_DIR}`). */
export function capabilityDataDir(installRoot: string, capabilityName: string): string {
  return path.resolve(installRoot, ".acf", "data", capabilityName);
}

/**
 * The config file a target reads MCP servers from at `scope`: Claude's project `.mcp.json`,
 * Codex `config.toml`, OpenCode's `opencode.json` (project root or user config directory), and
 * `mcp.json` in the install root otherwise. Undefined when no file caplet may write carries
 * servers for that scope: Claude reads user servers only from `~/.claude.json`, a state file
 * Claude itself rewrites, so the loose carrier has no safe place for them.
 */
export function mcpPathFor(
  targetId: TargetId,
  installRoot: string,
  scope: Scope,
): string | undefined {
  const projectRoot = path.dirname(installRoot);
  switch (targetId) {
    case "claude":
      return scope === "project" ? path.join(projectRoot, ".mcp.json") : undefined;
    case "codex":
      return path.join(installRoot, "config.toml");
    case "opencode":
      return path.join(scope === "project" ? projectRoot : installRoot, "opencode.json");
    default:
      return path.join(installRoot, "mcp.json");
  }
}

/**
 * `acf.support.component-omitted` for a server whose target has no writable MCP file at the
 * scope; the Claude plugin carrier installs user-scope servers through the plugin instead.
 */
function unwritableServer(input: EmitInput, target: TargetId, server: McpServer) {
  const subject = {
    capability: input.capability.manifest.name,
    target,
    carrier: "loose" as const,
    family: "mcp" as const,
    component: server.name,
  };
  return componentOmitted(
    subject,
    `${target} reads ${input.scope}-scope MCP servers only from ~/.claude.json, which caplet does not edit`,
    { recovery: `targets.${target}.carrier: plugin or ${recoveryFor(subject)}` },
  );
}

type Fields = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
};

function commandField(command: string): string {
  if (command.startsWith(CAPABILITY_DIR)) return `mcp.command=${CAPABILITY_DIR}`;
  if (command.startsWith(DATA_DIR)) return `mcp.command=${DATA_DIR}`;
  return path.isAbsolute(command) ? "mcp.command=absolute" : "mcp.command=bare";
}

function resolveCwd(
  cwd: string,
  capabilityDir: string,
  substitute: (value: string) => string,
): string {
  return cwd === "." || cwd.startsWith("./") ? path.join(capabilityDir, cwd) : substitute(cwd);
}

/** The entry in each target's spelling (claude-code.md, codex.md, cursor.md, opencode.md, facets/mcp.md). */
function dialectEntry(
  target: TargetId,
  transport: McpServer["transport"],
  fields: Fields,
): Record<string, unknown> {
  const { command, args, env, cwd, url, headers } = fields;
  if (transport === "stdio") {
    switch (target) {
      case "claude":
        return defined({ command, args, env });
      case "cursor":
        return defined({ type: "stdio", command, args, env });
      case "opencode":
        return defined({
          type: "local",
          command: command === undefined ? undefined : [command, ...(args ?? [])],
          environment: env,
          cwd,
        });
      default:
        return defined({ command, args, env, cwd });
    }
  }
  switch (target) {
    case "claude":
      return defined({ type: transport, url, headers });
    case "codex":
      return defined({ url, http_headers: headers });
    case "opencode":
      return defined({ type: "remote", url, headers });
    default:
      return defined({ url, headers });
  }
}

function defined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function mapValues(
  record: Record<string, string>,
  map: (value: string) => string,
): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value)]));
}
