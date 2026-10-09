import { afterEach, describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import path from "node:path";
import {
  type AcfCapability,
  executableChanges,
  executableComponents,
  readClaudePluginPackage,
} from "../src";
import {
  capability,
  capabilityDir,
  claudeChanges,
  cleanupFixtures,
  fixtureDir,
  foreignPlugin,
  pluginRoot,
  stdioServer,
} from "./executables-fixtures";
import { baseManifest, makeCapability } from "./helpers";

afterEach(cleanupFixtures);

describe("native ACF executable configuration", () => {
  const hooksJson = (script: string): string =>
    `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"${pluginRoot}/${script}"}]}]}}\n`;
  const lspServers = { ts: { command: "tsls" } };

  /** A native ACF capability whose Claude plugin package carries hooks, an LSP server and a bin entry. */
  async function nativeCapability(script = "start.sh", lsp: unknown = lspServers) {
    return await capability(
      {
        "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      lspServers: ${JSON.stringify(lsp)}\n`,
        "native/claude/hooks/hooks.json": hooksJson(script),
        "native/claude/bin/tool": "#!/bin/sh\n",
        "native/codex/run.sh": "#!/bin/sh\n",
      },
      ["native/claude/bin/tool", "native/codex/run.sh"],
    );
  }

  test("matches the inventory of the same Claude plugin read as a foreign package", async () => {
    const dir = await fixtureDir();
    await makeCapability(dir, {
      ".claude-plugin/plugin.json": JSON.stringify({
        name: "test-cap",
        version: "1.0.0",
        lspServers,
      }),
      "hooks/hooks.json": hooksJson("start.sh"),
      "bin/tool": "#!/bin/sh\n",
    });
    await chmod(path.join(dir, "bin/tool"), 0o755);
    const { capability: foreign } = await readClaudePluginPackage(dir, {
      scope: "project",
      origin: { kind: "local", directory: dir },
      revision: null,
    });
    if (foreign === undefined) throw new Error("the plugin did not read as a capability");
    const inventory = async (cap: AcfCapability) =>
      (await executableComponents(cap, "claude")).map(({ kind, name, fingerprint }) => ({
        kind,
        name,
        fingerprint,
      }));
    const expected = await inventory(foreign);
    expect(expected.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "hook hooks",
      "lsp-server lsp-servers",
      "bin tool",
    ]);
    expect(await inventory(await nativeCapability())).toEqual(expected);
  });

  test("bin entries are identified by their path under bin/", async () => {
    const before = await foreignPlugin({
      "bin/tool": "#!/bin/sh\n",
      "bin/lib/tool": "#!/bin/sh\n",
    });
    const inventory = async (cap: AcfCapability) =>
      (await executableComponents(cap, "claude")).map(({ kind, name, fingerprint }) => ({
        kind,
        name,
        fingerprint,
      }));
    expect((await inventory(before)).map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "bin lib/tool",
      "bin tool",
    ]);
    const native = await capability({
      "acf.yml": baseManifest,
      "native/claude/bin/tool": "#!/bin/sh\n",
      "native/claude/bin/lib/tool": "#!/bin/sh\n",
    });
    expect(await inventory(native)).toEqual(await inventory(before));
    const changes = async (after: AcfCapability) =>
      executableChanges(
        await executableComponents(before, "claude"),
        await executableComponents(after, "claude"),
      ).map(({ change, kind, name }) => `${change} ${kind} ${name}`);
    expect(
      await changes(
        await foreignPlugin({ "bin/tool": "#!/bin/sh\n", "bin/lib/tool": "#!/bin/sh\nx\n" }),
      ),
    ).toEqual(["changed bin lib/tool"]);
    expect(await changes(await foreignPlugin({ "bin/tool": "#!/bin/sh\n" }))).toEqual([
      "removed bin lib/tool",
    ]);
  });

  test("reports changed native hooks and manifest keys only where the plugin carries them", async () => {
    const before = await nativeCapability();
    const changes = async (after: AcfCapability) =>
      executableChanges(
        await executableComponents(before, "claude"),
        await executableComponents(after, "claude"),
      ).map(({ change, kind, name }) => `${change} ${kind} ${name}`);
    expect(await changes(await nativeCapability("other.sh"))).toEqual(["changed hook hooks"]);
    expect(await changes(await nativeCapability("start.sh", { ts: { command: "evil" } }))).toEqual([
      "changed lsp-server lsp-servers",
    ]);
    const detail = (await executableComponents(before, "claude")).map((item) => item.detail);
    expect(detail).toEqual([
      "native/claude/hooks/hooks.json",
      "targets.claude.native.lspServers",
      "native/claude/bin/tool",
    ]);
    // Loose writers drop native/<target>/ files and package extras, so nothing of them runs there.
    expect(await executableComponents(before, "claude", "loose")).toEqual([]);
    expect(await executableComponents(before, "codex")).toEqual([]);
  });
});

describe("Claude plugin workflows", () => {
  const workflow = (step: string): string => `export default { steps: ["${step}"] }\n`;

  /** A Claude plugin whose `files` default to one workflow running `step`, with `manifest` keys added. */
  async function workflowPlugin(
    step: string,
    files: Record<string, string> = { "workflows/release.js": workflow(step) },
    manifest: Record<string, unknown> = {},
  ): Promise<AcfCapability> {
    return await foreignPlugin({
      ".claude-plugin/plugin.json": JSON.stringify({
        name: "test-cap",
        version: "1.0.0",
        ...manifest,
      }),
      ...files,
    });
  }

  const inventory = async (cap: AcfCapability) =>
    (await executableComponents(cap, "claude")).map(({ kind, name, fingerprint }) => ({
      kind,
      name,
      fingerprint,
    }));

  test("a workflow module without the executable bit is an executing component", async () => {
    const before = await workflowPlugin("build");
    expect((await inventory(before)).map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "workflow workflows/release.js",
    ]);
    const changes = executableChanges(
      await executableComponents(before, "claude"),
      await executableComponents(await workflowPlugin("deploy"), "claude"),
    );
    expect(changes.map(({ change, kind, name }) => `${change} ${kind} ${name}`)).toEqual([
      "changed workflow workflows/release.js",
    ]);
  });

  const changeLines = async (before: AcfCapability, after: AcfCapability) =>
    executableChanges(
      await executableComponents(before, "claude"),
      await executableComponents(after, "claude"),
    ).map(({ change, kind, name }) => `${change} ${kind} ${name}`);

  test("workflows are identified by package path, so equal file names do not collide", async () => {
    const files = (ship: string, release?: string) => ({
      "workflows/release.js": workflow("build"),
      "workflows/ops/release.js": workflow(ship),
      ...(release === undefined ? {} : { "workflows/ci/release.js": workflow(release) }),
    });
    const before = await workflowPlugin("", files("ship", "test"));
    expect((await inventory(before)).map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "workflow workflows/ci/release.js",
      "workflow workflows/ops/release.js",
      "workflow workflows/release.js",
    ]);
    expect(await changeLines(before, await workflowPlugin("", files("ship", "test")))).toEqual([]);
    expect(await changeLines(before, await workflowPlugin("", files("deploy", "test")))).toEqual([
      "changed workflow workflows/ops/release.js",
    ]);
    expect(await changeLines(before, await workflowPlugin("", files("ship")))).toEqual([
      "removed workflow workflows/ci/release.js",
    ]);
  });

  test("a workflow the manifest names twice is one component", async () => {
    const workflows = ["./workflows", "./workflows/release.js", "workflows/release.js"];
    const foreign = await workflowPlugin("build", undefined, { workflows });
    expect((await inventory(foreign)).map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "workflow workflows/release.js",
    ]);
    const native = await capability({
      "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      workflows: [${workflows.join(", ")}]\n`,
      "native/claude/workflows/release.js": workflow("build"),
    });
    expect(await inventory(native)).toEqual(await inventory(foreign));
  });

  test("a native workflow is listed as the same foreign plugin lists it", async () => {
    const native = await capability({
      "acf.yml": baseManifest,
      "native/claude/workflows/release.js": workflow("build"),
    });
    expect(await inventory(native)).toEqual(await inventory(await workflowPlugin("build")));
    const declared = await capability({
      "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      workflows: ./flows\n`,
      "native/claude/workflows/ignored.js": workflow("x"),
      "native/claude/flows/ship.js": workflow("y"),
    });
    expect(
      (await executableComponents(declared, "claude")).map((item) => `${item.kind} ${item.name}`),
    ).toEqual(["workflow flows/ship.js"]);
    expect(await executableComponents(native, "claude", "loose")).toEqual([]);
  });
});

describe("native Claude MCP servers", () => {
  const mcpJson = `{"mcpServers":{"files":{"command":"node","args":["${pluginRoot}/server.js"]},"web":{"type":"http","url":"https://example.com/mcp"}}}\n`;
  const inventory = async (cap: AcfCapability) =>
    (await executableComponents(cap, "claude")).map(({ kind, name, detail, fingerprint }) => ({
      kind,
      name,
      detail,
      fingerprint,
    }));

  test("a native .mcp.json stdio server is listed as the same foreign plugin lists it", async () => {
    const native = async (code: string) =>
      await capability({
        "acf.yml": baseManifest,
        "native/claude/.mcp.json": mcpJson,
        "native/claude/server.js": code,
      });
    const foreign = await foreignPlugin({ ".mcp.json": mcpJson, "server.js": "one()\n" });
    const expected = await inventory(foreign);
    expect(expected.map(({ kind, name, detail }) => `${kind} ${name} ${detail}`)).toEqual([
      `mcp-server files node ${capabilityDir}/server.js`,
    ]);
    const before = await native("one()\n");
    expect(await inventory(before)).toEqual(expected);
    expect(await claudeChanges(before, await native("two()\n"))).toEqual([
      "changed mcp-server files",
    ]);
    expect(await executableComponents(before, "claude", "loose")).toEqual([]);
  });

  test("a native mcpServers key is classified per server like a foreign manifest key", async () => {
    const servers = {
      files: { command: "node", args: ["--stdio"] },
      auth: { command: "x", oauth: {} },
    };
    const native = await capability({
      "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      mcpServers: ${JSON.stringify(servers)}\n`,
    });
    const foreign = await foreignPlugin({
      ".claude-plugin/plugin.json": JSON.stringify({
        name: "test-cap",
        version: "1.0.0",
        mcpServers: servers,
      }),
    });
    const expected = await inventory(foreign);
    expect(expected.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "mcp-server auth",
      "mcp-server files",
    ]);
    const listed = await inventory(native);
    // The server kept whole is declared in acf.yml, not in a package manifest file.
    expect(listed.map(({ kind, name, detail }) => `${kind} ${name} ${detail}`)).toEqual([
      "mcp-server auth targets.claude.native.mcpServers",
      "mcp-server files node --stdio",
    ]);
    expect(listed[1]?.fingerprint).toBe(expected[1]?.fingerprint);
  });

  test("a config a native key names comes from the capability's own files when native/claude lacks it", async () => {
    const native = async (code: string) =>
      await capability({
        "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      mcpServers: ./configs/mcp.json\n      hooks: ./configs/hooks.json\n`,
        "configs/mcp.json": mcpJson,
        "configs/hooks.json": `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"${pluginRoot}/hook.js"}]}]}}\n`,
        "server.js": code,
        "hook.js": code,
      });
    const before = await native("one()\n");
    expect(
      (await inventory(before)).map(({ kind, name, detail }) => `${kind} ${name} ${detail}`),
    ).toEqual([
      `mcp-server files node ${capabilityDir}/server.js`,
      "hook hooks configs/hooks.json, targets.claude.native.hooks",
    ]);
    expect(await claudeChanges(before, await native("two()\n"))).toEqual([
      "changed mcp-server files",
      "changed hook hooks",
    ]);
  });
});

test("a native mcpServers server replaces the capability's server of the same name", async () => {
  const cap = await capability({
    "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      mcpServers: {"docs":{"type":"http","url":"https://example.com/mcp"}}\n`,
    "mcp/mcp.yml": stdioServer,
  });
  expect(await executableComponents(cap, "claude")).toEqual([]);
  expect((await executableComponents(cap, "claude", "loose")).map((item) => item.name)).toEqual([
    "docs",
  ]);
});

describe("files a plugin configuration runs through CLAUDE_PLUGIN_ROOT", () => {
  const hookValue = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: "command", command: `node ${pluginRoot}/scripts/start.js` }] },
      ],
    },
  };
  const hooks = `${JSON.stringify(hookValue)}\n`;

  test("a changed script a foreign plugin hook runs changes the hook", async () => {
    const plugin = async (code: string) =>
      await foreignPlugin({ "hooks/hooks.json": hooks, "scripts/start.js": code });
    expect(await claudeChanges(await plugin("one()\n"), await plugin("two()\n"))).toEqual([
      "changed hook hooks",
    ]);
  });

  test("a changed script a native hook runs changes the hook, wherever the plugin takes it from", async () => {
    for (const script of ["native/claude/scripts/start.js", "scripts/start.js"]) {
      const native = async (code: string) =>
        await capability({
          "acf.yml": baseManifest,
          "native/claude/hooks/hooks.json": hooks,
          [script]: code,
        });
      expect(await claudeChanges(await native("one()\n"), await native("two()\n"))).toEqual([
        "changed hook hooks",
      ]);
    }
    const foreign = await foreignPlugin({
      "hooks/hooks.json": hooks,
      "scripts/start.js": "one()\n",
    });
    const native = await capability({
      "acf.yml": baseManifest,
      "native/claude/hooks/hooks.json": hooks,
      "scripts/start.js": "one()\n",
    });
    const fingerprints = async (cap: AcfCapability) =>
      (await executableComponents(cap, "claude")).map((item) => item.fingerprint);
    expect(await fingerprints(native)).toEqual(await fingerprints(foreign));
  });

  test("a script a native manifest-key hook runs counts toward the hook", async () => {
    const native = async (code: string) =>
      await capability({
        "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      hooks: ${JSON.stringify(hookValue)}\n`,
        "native/claude/scripts/start.js": code,
      });
    expect(await claudeChanges(await native("one()\n"), await native("two()\n"))).toEqual([
      "changed hook hooks",
    ]);
  });
});

test("a native manifest-key path that normalizes to .. names no package file", async () => {
  const cap = await capability({
    "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      hooks: 'a/../..'\n`,
  });
  expect((await executableComponents(cap, "claude")).map((item) => item.detail)).toEqual([
    "targets.claude.native.hooks",
  ]);
});
