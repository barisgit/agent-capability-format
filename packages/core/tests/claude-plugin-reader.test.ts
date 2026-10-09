import { afterEach, describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import path from "node:path";
import {
  type ForeignReadResult,
  nativeExtras,
  packageValues,
  readClaudePluginPackage,
} from "../src";
import { cleanup, makeCapability, tempDir } from "./helpers";

const DOLLAR = "$";
const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await cleanup(dir);
});

async function read(
  files: Record<string, string>,
  options: { executables?: string[]; revision?: string | null } = {},
): Promise<ForeignReadResult & { root: string }> {
  const root = await tempDir();
  dirs.push(root);
  await makeCapability(root, files);
  for (const file of options.executables ?? []) await chmod(path.join(root, file), 0o755);
  const result = await readClaudePluginPackage(root, {
    scope: "project",
    origin: { kind: "local", directory: root },
    revision: options.revision ?? null,
  });
  return { ...result, root };
}

const fullPlugin = {
  ".claude-plugin/plugin.json": JSON.stringify({
    name: "review-kit",
    displayName: "Review Kit",
    version: "1.0.0",
    description: "Code review helpers",
    author: { name: "Ada", url: "https://ada.example" },
    homepage: "https://example.com",
    skills: "./extra-skills",
    mcpServers: { inline: { command: `${DOLLAR}{CLAUDE_PLUGIN_ROOT}/bin/inline`, timeout: 30000 } },
    userConfig: { token: { type: "string", sensitive: true } },
  }),
  "skills/review/SKILL.md":
    "---\nname: review\ndescription: Review code\ndisable-model-invocation: true\nallowed-tools: Read\n---\n\nBody\n",
  "skills/review/checklist.md": "- one\n",
  "extra-skills/triage/SKILL.md": "---\ndescription: Triage issues\n---\n\nBody\n",
  ".mcp.json": JSON.stringify({
    mcpServers: {
      files: { command: "npx", args: ["files-mcp", `${DOLLAR}{CLAUDE_PLUGIN_DATA}`] },
      github: { type: "http", url: "https://api.example.com/mcp" },
      secret: { command: "tool", env: { TOKEN: `${DOLLAR}{GITHUB_TOKEN}` } },
    },
  }),
  "agents/reviewer.md": "---\nname: reviewer\n---\n",
  "commands/review.md": "Review\n",
  "hooks/hooks.json": "{}\n",
  "bin/inline": "#!/bin/sh\n",
  "settings.json": "{}\n",
};

describe("Claude plugin reader", () => {
  test("records the package as projected, before rename, so writers can tell it unchanged", async () => {
    const root = await tempDir();
    dirs.push(root);
    await makeCapability(root, fullPlugin);
    const { capability } = await readClaudePluginPackage(root, {
      scope: "project",
      origin: { kind: "local", directory: root },
      revision: null,
      rename: "kit",
    });

    expect(capability?.manifest.name).toBe("kit");
    expect(capability?.source?.renamedFrom).toBe("review-kit");
    expect(capability?.source?.projected).toEqual({
      skills: ["review", "triage"],
      skillDirs: ["extra-skills/triage", "skills/review"],
      servers: capability?.mcp?.servers.map((server) => server.name) ?? [],
      remainder: capability?.remainder ?? [],
    });
    expect(capability?.source?.projected?.servers.length).toBeGreaterThan(0);
  });

  test("projects metadata, skills and MCP and keeps the rest as remainder", async () => {
    const { capability, diagnostics } = await read(fullPlugin, { executables: ["bin/inline"] });
    expect(diagnostics).toEqual([]);
    expect(capability?.source).toMatchObject({ format: "claude-plugin" });
    expect(capability?.manifest).toEqual({
      acf: 1,
      name: "review-kit",
      version: "1.0.0",
      description: "Code review helpers",
      homepage: "https://example.com",
      authors: [{ name: "Ada", url: "https://ada.example" }],
    });

    expect(capability?.skills.map((item) => item.name)).toEqual(["review", "triage"]);
    const review = capability?.skills.find((item) => item.name === "review");
    expect(review?.frontmatter.invocation).toEqual({ model: false });
    expect(nativeExtras(review?.frontmatter.targets, "claude")).toEqual({
      "allowed-tools": "Read",
    });
    const triage = capability?.skills.find((item) => item.name === "triage");
    expect(triage?.frontmatter.description).toBe("Triage issues");
    expect(capability?.assets.map((item) => item.path)).toEqual(["skills/review/checklist.md"]);

    expect(capability?.mcp?.servers).toEqual([
      {
        name: "files",
        transport: "stdio",
        command: "npx",
        args: ["files-mcp", `${DOLLAR}{ACF_DATA_DIR}`],
      },
      { name: "github", transport: "http", url: "https://api.example.com/mcp" },
      {
        name: "inline",
        transport: "stdio",
        command: `${DOLLAR}{ACF_CAPABILITY_DIR}/bin/inline`,
        targets: { claude: { native: { timeout: 30000 } } },
      },
    ]);

    const remainder = (capability?.remainder ?? []).map((item) => [
      item.kind,
      item.name,
      item.paths,
      item.class,
      item.executable,
    ]);
    expect(remainder).toEqual([
      ["mcp-server", "secret", [".mcp.json"], "functional", true],
      ["agent", "reviewer", ["agents/reviewer.md"], "functional", false],
      ["command", "review", ["commands/review.md"], "functional", false],
      ["hook", "hooks", ["hooks/hooks.json"], "restricting", true],
      ["settings", "settings", ["settings.json"], "functional", false],
      ["bin", "inline", ["bin/inline"], "functional", true],
      ["user-config", "userConfig", [], "functional", false],
      ["listing-metadata", "listing", [], "descriptive", false],
    ]);
  });

  test("manifest mcpServers paths and maps merge with .mcp.json, later names winning", async () => {
    const { capability, diagnostics } = await read({
      ".claude-plugin/plugin.json": JSON.stringify({
        name: "servers",
        mcpServers: ["./config/servers.json", { shared: { command: "inline-shared" } }],
      }),
      ".mcp.json": JSON.stringify({
        mcpServers: { shared: { command: "default-shared" }, base: { command: "base" } },
      }),
      "config/servers.json": JSON.stringify({ extra: { command: "extra" } }),
    });
    expect(diagnostics).toEqual([]);
    expect(
      capability?.mcp?.servers.map((server) => [
        server.name,
        "command" in server ? server.command : undefined,
      ]),
    ).toEqual([
      ["base", "base"],
      ["extra", "extra"],
      ["shared", "inline-shared"],
    ]);
  });

  test("a manifest commands map makes each command a remainder component", async () => {
    const { capability, diagnostics } = await read({
      ".claude-plugin/plugin.json": JSON.stringify({
        name: "cmds",
        commands: {
          danger: { content: "Delete everything", allowedTools: ["Bash"] },
          safe: { source: "./cmds/safe.md", description: "Safe" },
        },
      }),
      "cmds/safe.md": "Safe\n",
    });
    expect(diagnostics).toEqual([]);
    expect(
      (capability?.remainder ?? []).map((item) => [
        item.kind,
        item.name,
        item.paths,
        item.manifestKeys,
      ]),
    ).toEqual([
      ["command", "danger", [], ["commands"]],
      ["command", "safe", ["cmds/safe.md"], ["commands"]],
    ]);
  });

  test("a non-SemVer version falls back and is kept as a Claude package value", async () => {
    const { capability } = await read({
      ".claude-plugin/plugin.json": JSON.stringify({ name: "loose", version: "v2" }),
    });
    expect(capability?.manifest.version).toBe("0.0.0-unversioned+local");
    expect(packageValues(capability?.manifest ?? {}, "claude")).toEqual({
      version: "v2",
    });
  });

  test("an author with keys beyond name, email and url is also kept as a Claude package value", async () => {
    const author = { name: "Ada", email: "ada@example.com", team: "docs" };
    const { capability } = await read({
      ".claude-plugin/plugin.json": JSON.stringify({ name: "loose", author }),
    });
    expect(capability?.manifest.authors).toEqual([{ name: "Ada", email: "ada@example.com" }]);
    expect(packageValues(capability?.manifest ?? {}, "claude")).toEqual({ author });
  });

  test("a malformed manifest fails without synthesizing from skills", async () => {
    const { capability, diagnostics } = await read({
      ".claude-plugin/plugin.json": "{ not json",
      "skills/one/SKILL.md": "---\nname: one\ndescription: One\n---\n",
    });
    expect(capability).toBeUndefined();
    expect(diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["error", "acf.source.manifest-invalid"],
    ]);
  });
});

test("a __proto__ key in plugin.json rejects the manifest instead of vanishing", async () => {
  const result = await read({
    ".claude-plugin/plugin.json":
      '{"name":"review-kit","mcpServers":{"__proto__":{"command":"node"}}}',
  });
  expect(result.capability).toBeUndefined();
  expect(result.diagnostics.map((d) => d.code)).toEqual(["acf.source.manifest-invalid"]);
});

test("a listing key's value decides the listing component's class", async () => {
  const listingClass = async (defaultEnabled: boolean) =>
    (
      await read({
        ".claude-plugin/plugin.json": JSON.stringify({
          name: "kit",
          displayName: "Kit",
          defaultEnabled,
        }),
      })
    ).capability?.remainder?.find((item) => item.kind === "listing-metadata")?.class;
  expect(await listingClass(true)).toBe("functional");
  expect(await listingClass(false)).toBe("restricting");
});

test("a skill or server with a native value its host rejects is left out with a warning", async () => {
  const { capability, diagnostics } = await read({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit" }),
    "skills/fast/SKILL.md": "---\nname: fast\ndescription: Fast\neffort: extreme\n---\n",
    "skills/fine/SKILL.md": "---\nname: fine\ndescription: Fine\neffort: low\n---\n",
    ".mcp.json": JSON.stringify({
      mcpServers: {
        quick: { command: "node", timeout: 500 },
        slow: { command: "node", timeout: 5000 },
      },
    }),
  });
  expect(capability?.skills.map((skill) => skill.name)).toEqual(["fine"]);
  expect(capability?.mcp?.servers.map((server) => server.name)).toEqual(["slow"]);
  expect(
    diagnostics.map((d) => [d.severity, d.code, d.message.includes("not a valid claude value")]),
  ).toEqual([
    ["warn", "acf.source.component-invalid", true],
    ["warn", "acf.source.component-invalid", true],
  ]);
});

test("a non-boolean invocation key leaves the skill out instead of becoming an extra", async () => {
  const { capability, diagnostics } = await read({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit" }),
    "skills/manual/SKILL.md":
      '---\nname: manual\ndescription: Manual\ndisable-model-invocation: "yes"\n---\n',
    "skills/hidden/SKILL.md": "---\nname: hidden\ndescription: Hidden\nuser-invocable: 0\n---\n",
    "skills/fine/SKILL.md": "---\nname: fine\ndescription: Fine\nuser-invocable: false\n---\n",
  });
  expect(capability?.skills.map((skill) => skill.name)).toEqual(["fine"]);
  expect(diagnostics.map((d) => [d.severity, d.code, d.message.split(":")[0]])).toEqual([
    ["warn", "acf.source.component-invalid", "skill hidden is not loaded"],
    ["warn", "acf.source.component-invalid", "skill manual is not loaded"],
  ]);
});

test("a placeholder named like an Object.prototype property keeps the server native", async () => {
  const { capability } = await read({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit" }),
    ".mcp.json": JSON.stringify({
      mcpServers: { files: { command: "npx", args: [`${DOLLAR}{constructor}`] } },
    }),
  });
  expect(capability?.mcp?.servers ?? []).toEqual([]);
  expect(capability?.remainder?.map((item) => [item.kind, item.name])).toEqual([
    ["mcp-server", "files"],
  ]);
});

test("a component path whose first name starts with two dots stays inside the plugin", async () => {
  const { capability, diagnostics } = await read({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit", skills: "./..skills" }),
    "..skills/triage/SKILL.md": "---\nname: triage\ndescription: Triage\n---\n",
  });
  expect(diagnostics).toEqual([]);
  expect(capability?.skills.map((skill) => skill.name)).toEqual(["triage"]);
});

test("a remainder file is executable only with the owner execute bit", async () => {
  const root = await tempDir();
  dirs.push(root);
  await makeCapability(root, {
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit" }),
    "agents/group.md": "---\nname: group\n---\n",
    "commands/owner.md": "Owner\n",
  });
  await chmod(path.join(root, "agents/group.md"), 0o654);
  await chmod(path.join(root, "commands/owner.md"), 0o744);
  const { capability } = await readClaudePluginPackage(root, {
    scope: "project",
    origin: { kind: "local", directory: root },
    revision: null,
  });
  expect(capability?.remainder?.map((item) => [item.kind, item.executable])).toEqual([
    ["agent", false],
    ["command", true],
  ]);
});

test("workflows are executing components, found by default or only at the manifest's paths", async () => {
  const byDefault = await read({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit" }),
    "workflows/release.js": "export default {}\n",
  });
  expect(byDefault.capability?.remainder).toEqual([
    {
      format: "claude-plugin",
      kind: "workflow",
      name: "release",
      paths: ["workflows/release.js"],
      class: "functional",
      executable: true,
    },
  ]);
  // A manifest `workflows` path replaces the default `workflows/` directory.
  const declared = await read({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "kit", workflows: "./flows" }),
    "workflows/ignored.js": "export default {}\n",
    "flows/ship.js": "export default {}\n",
  });
  expect(
    declared.capability?.remainder?.map((item) => [item.kind, item.name, item.executable]),
  ).toEqual([["workflow", "ship", true]]);
});
