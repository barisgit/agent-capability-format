import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execClaudeCli } from "../../../src/hosts/claude/cli.js";
import { classifyClaudeFailure, createClaudeHost } from "../../../src/hosts/claude/host.js";
import { missingClaudeCli } from "../../support/fake-claude-cli.js";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "caplet-claude-cli-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function script(name: string, body: string): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`, "utf8");
  await chmod(file, 0o755);
  return file;
}

describe("execClaudeCli", () => {
  test("passes arguments as a vector in the given cwd and captures exit code and output", async () => {
    const binary = await script("echo-args", 'pwd; printf "<%s>\\n" "$@"; echo oops >&2; exit 3');
    const cli = execClaudeCli({ binary, cwd: dir });
    expect(await cli(["plugin", "marketplace", "add", "/a b/$HOME;x"])).toEqual({
      kind: "exited",
      exitCode: 3,
      stdout: `${dir}\n<plugin>\n<marketplace>\n<add>\n</a b/$HOME;x>\n`,
      stderr: "oops\n",
    });
  });

  test("a missing binary is reported as unavailable, not thrown", async () => {
    const cli = execClaudeCli({ binary: path.join(dir, "no-such-claude"), cwd: dir });
    expect(await cli(["plugin", "list", "--json"])).toMatchObject({
      kind: "unavailable",
      reason: "missing",
    });
  });

  test("a binary that cannot start is reported as unavailable", async () => {
    const binary = path.join(dir, "not-executable");
    await writeFile(binary, "#!/bin/sh\n", "utf8");
    const cli = execClaudeCli({ binary, cwd: dir });
    expect(await cli(["plugin", "list", "--json"])).toMatchObject({
      kind: "unavailable",
      reason: "failed-to-start",
    });
  });

  test("a hung command is killed after the timeout and reported as terminated", async () => {
    const binary = await script("hang", "exec sleep 5");
    const cli = execClaudeCli({ binary, cwd: dir, timeoutMs: 100 });
    expect(await cli(["plugin", "install", "x@y", "--scope", "user"])).toMatchObject({
      kind: "terminated",
    });
  });
});

describe("createClaudeHost over the real runner", () => {
  test("maps a missing CLI to an unavailable failure", async () => {
    const host = createClaudeHost(
      execClaudeCli({ binary: path.join(dir, "no-such-claude"), cwd: dir }),
      { projectDir: dir, configDir: dir },
    );
    expect(await host.listPlugins()).toMatchObject({
      ok: false,
      failure: { kind: "unavailable", reason: "missing" },
    });
  });
});

describe("classifyClaudeFailure", () => {
  // Message templates found in the claude 2.1.97 binary; no runtime transcript exists, because a
  // policy block needs root-owned managed settings (research/plugin-interop/tools/claude-code.md).
  test.each([
    "✘ Failed to add marketplace: Marketplace source '/m' is blocked by enterprise policy.",
    "✘ Failed to install plugin \"p@m\": Marketplace 'm' is blocked by enterprise policy",
    "✘ Failed to add marketplace: Marketplace 'm' is not in the allowed marketplace list",
    `✘ Failed to install plugin "p@m": Plugin "p" is blocked by your organization's policy and cannot be installed`,
  ])("recognizes the policy template in %p", (message) => {
    expect(classifyClaudeFailure(message)).toBe("policy-blocked");
  });

  test("other failures are plain failures", () => {
    expect(
      classifyClaudeFailure(
        '✘ Failed to install plugin "probe@nope-mkt": Plugin "probe" not found in marketplace "nope-mkt"',
      ),
    ).toBe("failed");
  });
});

describe("createClaudeHost settings", () => {
  test("reads the settings files marketplace remove edits; a missing file declares nothing", async () => {
    const configDir = path.join(dir, "config");
    const projectDir = path.join(dir, "settings-project");
    await mkdir(configDir, { recursive: true });
    await mkdir(path.join(projectDir, ".claude"), { recursive: true });
    await writeFile(
      path.join(configDir, "settings.json"),
      JSON.stringify({
        extraKnownMarketplaces: { "acf-user": {} },
        enabledPlugins: { "review@team-mkt": true },
      }),
    );
    await writeFile(path.join(projectDir, ".claude", "settings.json"), "{ not json");
    const host = createClaudeHost(missingClaudeCli(), { projectDir, configDir });
    expect(await host.readSettings()).toEqual([
      {
        scope: "user",
        path: path.join(configDir, "settings.json"),
        marketplaces: ["acf-user", "team-mkt"],
      },
      {
        scope: "project",
        path: path.join(projectDir, ".claude", "settings.json"),
        marketplaces: undefined,
      },
      {
        scope: "local",
        path: path.join(projectDir, ".claude", "settings.local.json"),
        marketplaces: [],
      },
    ]);
  });
});
