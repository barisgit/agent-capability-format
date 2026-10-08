import { expect, test } from "bun:test";
import type { McpServer, TargetAdapter } from "@caplet/core";
import { claudeAdapter, codexAdapter, cursorAdapter, opencodeAdapter, piAdapter } from "../src";
import { CAP_ROOT, capabilityModel, emitModel, fileText, withCode } from "./util/model";

// Built from parts: biome forbids `${...}` inside plain string literals.
const DOLLAR = "$";
const CAPABILITY_DIR = `${DOLLAR}{ACF_CAPABILITY_DIR}`;
const DATA_DIR = `${DOLLAR}{ACF_DATA_DIR}`;

const writers: Record<string, { adapter: TargetAdapter; root: string; file: string }> = {
  claude: { adapter: claudeAdapter, root: "/project/.claude", file: "/project/.mcp.json" },
  codex: { adapter: codexAdapter, root: "/project/.codex", file: "/project/.codex/config.toml" },
  cursor: { adapter: cursorAdapter, root: "/project/.cursor", file: "/project/.cursor/mcp.json" },
  opencode: {
    adapter: opencodeAdapter,
    root: "/project/.opencode",
    file: "/project/opencode.json",
  },
  pi: { adapter: piAdapter, root: "/project/.pi", file: "/project/.pi/mcp.json" },
};

async function emitServers(
  target: string,
  servers: McpServer[],
  files: Record<string, string> = {},
) {
  const writer = writers[target];
  if (writer === undefined) throw new Error(`unknown writer ${target}`);
  const result = await emitModel(
    writer.adapter,
    capabilityModel({ servers }),
    writer.root,
    {},
    files,
  );
  return { result, config: fileText(result, writer.file) };
}

function serverEntry(
  target: string,
  config: string | undefined,
  name: string,
): Record<string, unknown> | undefined {
  if (config === undefined) return undefined;
  if (target === "codex") {
    const parsed = Bun.TOML.parse(config) as {
      mcp_servers?: Record<string, Record<string, unknown>>;
    };
    return parsed.mcp_servers?.[name];
  }
  const parsed = JSON.parse(config) as Record<string, Record<string, Record<string, unknown>>>;
  return (target === "opencode" ? parsed.mcp : parsed.mcpServers)?.[name];
}

const stdio: McpServer = {
  name: "tools",
  transport: "stdio",
  command: `${CAPABILITY_DIR}/bin/server`,
  args: ["--root", CAPABILITY_DIR],
  env: { LOG: "info" },
};

test("each target receives stdio servers in its own spelling", async () => {
  const command = `${CAP_ROOT}/bin/server`;
  const expected: Record<string, Record<string, unknown>> = {
    claude: { command, args: ["--root", CAP_ROOT], env: { LOG: "info" } },
    codex: { command, args: ["--root", CAP_ROOT], env: { LOG: "info" } },
    cursor: { type: "stdio", command, args: ["--root", CAP_ROOT], env: { LOG: "info" } },
    opencode: {
      type: "local",
      command: [command, "--root", CAP_ROOT],
      environment: { LOG: "info" },
    },
    pi: { command, args: ["--root", CAP_ROOT], env: { LOG: "info" } },
  };
  for (const [target, entry] of Object.entries(expected)) {
    const { result, config } = await emitServers(target, [stdio]);
    expect(serverEntry(target, config, "tools")).toEqual(entry);
    expect(withCode(result, "acf.support.refused")).toEqual([]);
    expect(result.outcomes?.every((outcome) => outcome.outcome === "translated")).toBe(true);
  }
  const { result } = await emitServers("opencode", [stdio]);
  expect(result.outcomes?.map((outcome) => outcome.source)).toContain("mcp.transport=stdio");
});

test("Codex required extra reaches only the Codex entry", async () => {
  const server: McpServer = { ...stdio, targets: { codex: { native: { required: true } } } };
  const codex = await emitServers("codex", [server]);
  expect(serverEntry("codex", codex.config, "tools")?.required).toBe(true);
  expect(codex.config).toContain("required = true");
  for (const target of ["claude", "cursor", "opencode", "pi"]) {
    const { result, config } = await emitServers(target, [server]);
    expect(serverEntry(target, config, "tools")).toBeDefined();
    expect(config).not.toContain("required");
    expect(withCode(result, "acf.extras.dropped").map((d) => d.data?.dropped)).toEqual([
      "targets.codex.native.required",
    ]);
  }
});

test("Codex servers live in a marked config.toml table that keeps user settings", async () => {
  const user = 'model = "o4"\n\n[mcp_servers.mine]\ncommand = "mine"\n';
  const { result, config } = await emitServers("codex", [stdio], {
    "/project/.codex/config.toml": user,
  });
  expect(config?.startsWith(user)).toBe(true);
  expect(config).toContain("# acf:begin mcp_servers.tools\n[mcp_servers.tools]\n");
  const diff = result.diffs.find((item) => item.path.endsWith("config.toml"));
  expect(diff?.owns).toEqual([{ kind: "marker", name: "mcp_servers.tools" }]);
  expect(Object.keys(Bun.TOML.parse(config ?? "") as object)).toEqual(["model", "mcp_servers"]);
});

test("data directory placeholders become the caplet data dir, which apply creates", async () => {
  const server: McpServer = {
    name: "store",
    transport: "stdio",
    command: "store",
    env: { DATA: DATA_DIR },
  };
  const { result, config } = await emitServers("pi", [server]);
  expect(serverEntry("pi", config, "store")?.env).toEqual({ DATA: "/project/.pi/.acf/data/demo" });
  const keep = result.diffs.find((diff) => diff.path === "/project/.pi/.acf/data/demo/.keep");
  expect(keep?.after).toBe("");
  expect(result.outcomes?.map((outcome) => outcome.source)).toContain(`mcp.env=${DATA_DIR}`);
});

test("servers without a data dir reference create no data directory", async () => {
  const { result } = await emitServers("pi", [stdio]);
  expect(result.diffs.some((diff) => diff.path.includes(".acf/data"))).toBe(false);
});

test("Agent Plugins cwd is refused for Claude and absolute for Codex", async () => {
  const server: McpServer = {
    name: "plugin",
    transport: "stdio",
    command: "node",
    cwd: CAPABILITY_DIR,
  };
  const capability = capabilityModel({
    servers: [server],
    source: { format: "agent-plugins", formatVersion: "1.0", path: ".", snapshotRoot: CAP_ROOT },
  });
  const claude = await emitModel(claudeAdapter, capability, "/project/.claude");
  const refusals = withCode(claude, "acf.support.refused");
  expect(refusals).toHaveLength(1);
  expect(refusals[0]?.data?.source).toBe("mcp.cwd");
  expect(refusals[0]?.message).toContain("starts plugin stdio servers in the directory");
  expect(claude.diffs.some((diff) => diff.path.endsWith(".mcp.json"))).toBe(false);
  const codex = await emitModel(codexAdapter, capability, "/project/.codex");
  expect(serverEntry("codex", fileText(codex, "config.toml"), "plugin")?.cwd).toBe(CAP_ROOT);
});

test("refusals keep the server out of that target only", async () => {
  const sse: McpServer = { name: "events", transport: "sse", url: "https://example.com/sse" };
  const claude = await emitServers("claude", [sse]);
  expect(serverEntry("claude", claude.config, "events")).toEqual({
    type: "sse",
    url: "https://example.com/sse",
  });
  for (const target of ["codex", "cursor", "opencode", "pi"]) {
    const { result, config } = await emitServers(target, [sse]);
    expect(config).toBeUndefined();
    expect(withCode(result, "acf.support.refused")[0]?.data?.outcome).toBe("blocked");
  }
  const header: McpServer = {
    name: "remote",
    transport: "http",
    url: "https://example.com/mcp",
    headers: { "X-Root": CAPABILITY_DIR },
  };
  const { result, config } = await emitServers("codex", [header, stdio]);
  expect(serverEntry("codex", config, "remote")).toBeUndefined();
  expect(serverEntry("codex", config, "tools")).toBeDefined();
  expect(withCode(result, "acf.support.refused")).toHaveLength(1);
});

test("remote servers use each target's header key", async () => {
  const remote: McpServer = {
    name: "remote",
    transport: "http",
    url: "https://example.com/mcp",
    headers: { "X-Client": "caplet" },
  };
  const headers = { "X-Client": "caplet" };
  const url = "https://example.com/mcp";
  const expected: Record<string, Record<string, unknown>> = {
    claude: { type: "http", url, headers },
    codex: { url, http_headers: headers },
    cursor: { url, headers },
    opencode: { type: "remote", url, headers },
    pi: { url, headers },
  };
  for (const [target, entry] of Object.entries(expected)) {
    const { config } = await emitServers(target, [remote]);
    expect(serverEntry(target, config, "remote")).toEqual(entry);
  }
});

test("a Codex server the user already defines outside caplet's markers is a conflict, not a write", async () => {
  const userConfigs = [
    '[mcp_servers.tools]\ncommand = "mine"\n',
    '[mcp_servers."tools".env]\nLOG = "debug"\n',
    '[mcp_servers]\ntools.command = "mine"\n',
    'mcp_servers.tools = { command = "mine" }\n',
    'mcp_servers = { other = { command = "x" } }\n',
  ];
  for (const user of userConfigs) {
    const { result, config } = await emitServers("codex", [stdio], {
      "/project/.codex/config.toml": user,
    });
    expect(config).toBeUndefined();
    const [conflict] = withCode(result, "acf.mcp.config-conflict");
    expect(conflict?.severity).toBe("error");
    expect(conflict?.data?.server).toBe("tools");
    expect(conflict?.message).toContain("/project/.codex/config.toml");
  }
});

test("a Codex server's own marked table, or another user server, is no conflict", async () => {
  const owned =
    '[mcp_servers.mine]\ncommand = "mine"\n\n# acf:begin mcp_servers.tools\n[mcp_servers.tools]\ncommand = "old"\n# acf:end mcp_servers.tools\n';
  const { result, config } = await emitServers("codex", [stdio], {
    "/project/.codex/config.toml": owned,
  });
  expect(withCode(result, "acf.mcp.config-conflict")).toEqual([]);
  expect(serverEntry("codex", config, "tools")?.command).toBe(`${CAP_ROOT}/bin/server`);
  expect(serverEntry("codex", config, "mine")?.command).toBe("mine");
});
