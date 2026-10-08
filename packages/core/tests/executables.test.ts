import { afterEach, describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import path from "node:path";
import {
  type AcfCapability,
  acfPathPlaceholders,
  executableChanges,
  executableComponents,
  type NativeRemainderComponent,
  readCapability,
} from "../src";
import { baseManifest, cleanup, makeCapability, tempDir } from "./helpers";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(cleanup));
});

async function capability(
  files: Record<string, string>,
  executable: readonly string[] = [],
): Promise<AcfCapability> {
  const dir = await tempDir();
  dirs.push(dir);
  await makeCapability(dir, files);
  for (const rel of executable) await chmod(path.join(dir, rel), 0o755);
  return await readCapability(dir, "project", { kind: "local", directory: dir });
}

const capabilityDir = acfPathPlaceholders[0];
const pluginRoot = `${"$"}{CLAUDE_PLUGIN_ROOT}`;

const stdioServer = `servers:\n  - name: docs\n    transport: stdio\n    command: node\n    args: ['${capabilityDir}/server.js', '--stdio']\n  - name: remote\n    transport: http\n    url: https://example.com/mcp\n`;

describe("executableComponents", () => {
  test("lists stdio servers with their command line and skips remote servers", async () => {
    const cap = await capability({
      "acf.yml": baseManifest,
      "mcp/mcp.yml": stdioServer,
      "server.js": "console.log(1)\n",
    });
    const components = await executableComponents(cap, "claude");
    expect(components.map(({ kind, name, detail }) => ({ kind, name, detail }))).toEqual([
      { kind: "mcp-server", name: "docs", detail: `node ${capabilityDir}/server.js --stdio` },
    ]);
  });

  test("lists files with the executable bit, following skill applicability", async () => {
    const cap = await capability(
      {
        "acf.yml": baseManifest,
        "skills/lint/SKILL.md":
          "---\nname: lint\ndescription: Lint\nonly: [claude]\n---\nRun scripts/run.sh\n",
        "skills/lint/scripts/run.sh": "#!/bin/sh\necho lint\n",
        "skills/lint/scripts/data.txt": "plain\n",
        "tools/setup.sh": "#!/bin/sh\n",
      },
      ["skills/lint/scripts/run.sh", "tools/setup.sh"],
    );
    const claude = await executableComponents(cap, "claude");
    expect(claude.map((item) => `${item.kind} ${item.name}`)).toEqual([
      "file skills/lint/scripts/run.sh",
      "file tools/setup.sh",
    ]);
    const codex = await executableComponents(cap, "codex");
    expect(codex.map((item) => `${item.kind} ${item.name}`)).toEqual(["file tools/setup.sh"]);
  });

  test("lists hooks only for targets that run hooks", async () => {
    const cap = await capability({
      "acf.yml": baseManifest,
      "hooks/hooks.yml":
        "session_start:\n  - name: greet\n    run:\n      command: ./greet.sh\n      args: ['--hello']\n    effect: observe\n",
    });
    const claude = await executableComponents(cap, "claude");
    expect(claude.map(({ kind, name, detail }) => ({ kind, name, detail }))).toEqual([
      { kind: "hook", name: "session_start/greet", detail: "./greet.sh --hello" },
    ]);
    expect(await executableComponents(cap, "cursor")).toEqual([]);
  });

  test("returns nothing for a target the capability does not apply to", async () => {
    const cap = await capability({
      "acf.yml": `${baseManifest}only: [claude]\n`,
      "mcp/mcp.yml": stdioServer,
    });
    expect(await executableComponents(cap, "codex")).toEqual([]);
  });
});

describe("executableChanges", () => {
  test("reports added, changed and removed components and nothing when unchanged", async () => {
    const files = {
      "acf.yml": baseManifest,
      "mcp/mcp.yml": stdioServer,
      "server.js": "console.log(1)\n",
      "bin/old.sh": "#!/bin/sh\n",
    };
    const before = await capability(files, ["bin/old.sh"]);
    const same = await capability(files, ["bin/old.sh"]);
    const after = await capability(
      {
        ...files,
        "server.js": "console.log(2)\n",
        "bin/new.sh": "#!/bin/sh\n",
      },
      ["bin/new.sh"],
    );
    const inventory = async (cap: AcfCapability) => await executableComponents(cap, "claude");
    expect(executableChanges(await inventory(before), await inventory(same))).toEqual([]);
    const changes = executableChanges(await inventory(before), await inventory(after));
    expect(changes.map((item) => `${item.change} ${item.kind} ${item.name}`)).toEqual([
      "changed mcp-server docs",
      "added file bin/new.sh",
      "removed file bin/old.sh",
    ]);
    expect(
      changes.every((item) => item.capability === "test-cap" && item.target === "claude"),
    ).toBe(true);
  });

  test("a changed command keeps the previous command line", async () => {
    const before = await capability({ "acf.yml": baseManifest, "mcp/mcp.yml": stdioServer });
    const after = await capability({
      "acf.yml": baseManifest,
      "mcp/mcp.yml": stdioServer.replace("command: node", "command: bun"),
    });
    const [change] = executableChanges(
      await executableComponents(before, "claude"),
      await executableComponents(after, "claude"),
    );
    expect(change).toMatchObject({
      change: "changed",
      detail: `bun ${capabilityDir}/server.js --stdio`,
      previous: `node ${capabilityDir}/server.js --stdio`,
    });
  });

  test("a changed Claude plugin hook in the native remainder is reported for Claude only", async () => {
    const pluginCapability = async (hookScript: string): Promise<AcfCapability> => {
      const cap = await capability(
        {
          "acf.yml": baseManifest,
          ".claude-plugin/plugin.json": '{"name":"test-cap","version":"1.0.0"}\n',
          "hooks/hooks.json": `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"${pluginRoot}/hooks/start.sh"}]}]}}\n`,
          "hooks/start.sh": hookScript,
        },
        ["hooks/start.sh"],
      );
      const hook: NativeRemainderComponent = {
        format: "claude-plugin",
        kind: "hook",
        name: "hooks",
        paths: ["hooks/"],
        class: "functional",
        executable: true,
      };
      cap.source = { format: "claude-plugin", path: ".", snapshotRoot: cap.root };
      cap.remainder = [hook];
      return cap;
    };
    const before = await pluginCapability("#!/bin/sh\necho one\n");
    const after = await pluginCapability("#!/bin/sh\necho two\n");
    const claude = executableChanges(
      await executableComponents(before, "claude"),
      await executableComponents(after, "claude"),
    );
    expect(
      claude.map(({ change, kind, name, detail }) => ({ change, kind, name, detail })),
    ).toEqual([{ change: "changed", kind: "hook", name: "hooks", detail: "hooks/" }]);
    expect(await executableComponents(after, "codex")).toEqual([]);
  });

  test("a remainder component's manifest keys count, other manifest keys do not", async () => {
    const pluginCapability = async (manifest: string): Promise<AcfCapability> => {
      const cap = await capability({
        "acf.yml": baseManifest,
        ".claude-plugin/plugin.json": manifest,
      });
      cap.source = { format: "claude-plugin", path: ".", snapshotRoot: cap.root };
      cap.remainder = [
        {
          format: "claude-plugin",
          kind: "lsp-server",
          name: "lspServers",
          paths: [],
          manifestKeys: ["lspServers"],
          class: "functional",
          executable: true,
        },
      ];
      return cap;
    };
    const v1 = await pluginCapability('{"version":"1.0.0","lspServers":{"ts":{"command":"tsls"}}}');
    const v2 = await pluginCapability('{"version":"2.0.0","lspServers":{"ts":{"command":"tsls"}}}');
    const v3 = await pluginCapability('{"version":"2.0.0","lspServers":{"ts":{"command":"evil"}}}');
    const inventory = async (cap: AcfCapability) => await executableComponents(cap, "claude");
    expect(executableChanges(await inventory(v1), await inventory(v2))).toEqual([]);
    expect(executableChanges(await inventory(v2), await inventory(v3))).toHaveLength(1);
  });

  test("ignores components that are not executable", async () => {
    const cap = await capability({ "acf.yml": baseManifest });
    cap.source = { format: "claude-plugin", path: ".", snapshotRoot: cap.root };
    cap.remainder = [
      {
        format: "claude-plugin",
        kind: "agent",
        name: "reviewer",
        paths: ["agents/reviewer.md"],
        class: "functional",
        executable: false,
      },
    ];
    expect(await executableComponents(cap, "claude")).toEqual([]);
  });
});
