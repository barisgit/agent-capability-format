/**
 * Opt-in real-host test (task 5.9): `CAPLET_HOST_TESTS=claude bun run test real-host` in
 * `apps/caplet` drives the installed `claude` through caplet's install, update and uninstall of a
 * fixture plugin.
 *
 * Safety contract, as in `research/plugin-interop/tools/claude-spike.sh`: caplet and claude run
 * with an empty environment whose HOME and CLAUDE_CONFIG_DIR lie in a fresh `/tmp/claude-spike.*`
 * root, never under the real home; no credentials are copied and no model session starts. The
 * test fails if the real `~/.claude/plugins` tree or `~/.claude/settings.json` changes; the real
 * home is `CAPLET_REAL_HOME`, which `scripts/test-home.ts` sets because the test process itself
 * runs under a throwaway HOME. Invoking
 * the skill or calling the MCP tool through a model needs an authenticated session, so the test
 * stops at what the CLI shows without one: the installed copy and the MCP health check.
 */
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { writeText } from "../../helpers.js";

const enabled = (process.env.CAPLET_HOST_TESTS ?? "").split(",").includes("claude");
const CAPLET = path.resolve(import.meta.dir, "../../../src/bin.ts");
const NAME = "probe";
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** The executable `name` on PATH, resolved through symlinks. */
function which(name: string): string {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, name);
    if (dir !== "" && existsSync(candidate)) return realpathSync(candidate);
  }
  throw new Error(`${name} is not on PATH`);
}

/**
 * The user's real home, which `os.homedir()` is not: the test process runs under the throwaway
 * HOME of `scripts/test-home.ts`. Throws when that script did not name a distinct real home, so
 * the unchanged-state check can never compare a throwaway home with itself.
 */
function realHome(): string {
  const real = process.env.CAPLET_REAL_HOME;
  if (
    real === undefined ||
    !path.isAbsolute(real) ||
    path.resolve(real) === path.resolve(homedir())
  ) {
    throw new Error(
      `refusing: no real home distinct from the test home ${homedir()} (CAPLET_REAL_HOME=${real ?? "unset"}); run \`bun run test real-host\` in apps/caplet`,
    );
  }
  return real;
}

/** Fingerprint of the real Claude state that must not change. */
async function realState(): Promise<string> {
  const claude = path.join(realHome(), ".claude");
  const hash = createHash("sha256");
  const plugins = path.join(claude, "plugins");
  if (existsSync(plugins)) {
    const files = (await readdir(plugins, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
    for (const file of files) hash.update(file).update(await readFile(file));
  }
  const settings = path.join(claude, "settings.json");
  if (existsSync(settings)) hash.update(await readFile(settings));
  return hash.digest("hex");
}

type Sandbox = { root: string; home: string; project: string; env: Record<string, string> };

/** A throwaway HOME and project whose PATH holds only claude, node and the system tools. */
async function sandbox(): Promise<Sandbox> {
  const root = await mkdtemp("/tmp/claude-spike.");
  roots.push(root);
  const home = path.join(root, "home");
  if (!root.startsWith("/tmp/claude-spike.") || !home.startsWith(`${root}/`)) {
    throw new Error(`refusing: HOME ${home} is not under a /tmp/claude-spike.* root`);
  }
  for (const forbidden of [realHome(), homedir()]) {
    if (home === forbidden || home.startsWith(`${forbidden}/`)) {
      throw new Error(`refusing: HOME inside ${forbidden}`);
    }
  }
  const bin = path.join(root, "bin");
  await writeText(path.join(bin, ".keep"), "");
  await symlink(which("claude"), path.join(bin, "claude"));
  const env = {
    HOME: home,
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    PATH: [bin, path.dirname(which("node")), "/usr/bin", "/bin"].join(path.delimiter),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_STATE_HOME: path.join(home, ".local/state"),
    DISABLE_AUTOUPDATER: "1",
    DISABLE_TELEMETRY: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    TERM: "dumb",
    NO_COLOR: "1",
  };
  return { root, home, project: path.join(root, "project"), env };
}

type Run = { exitCode: number; stdout: string; stderr: string };

async function run(box: Sandbox, argv: string[]): Promise<Run> {
  const proc = Bun.spawn(argv, {
    cwd: box.project,
    env: box.env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const timer = setTimeout(() => proc.kill(), 120_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { exitCode, stdout, stderr };
}

async function caplet(box: Sandbox, args: string[]): Promise<Run> {
  return await run(box, [process.execPath, CAPLET, ...args]);
}

async function claude(box: Sandbox, args: string[]): Promise<Run> {
  return await run(box, ["claude", ...args]);
}

type Listed = { id: string; version: string; scope: string; enabled: boolean; installPath: string };

async function installed(box: Sandbox): Promise<Listed[]> {
  const result = await claude(box, ["plugin", "list", "--json"]);
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as Listed[];
}

/** A stdio MCP server with one `ping` tool that logs its working directory. */
const SERVER = `const fs = require("node:fs");
fs.appendFileSync(process.argv[2], process.cwd() + "\\n");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line.trim() === "") continue;
    const request = JSON.parse(line);
    if (request.id === undefined) continue;
    const result =
      request.method === "initialize"
        ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "probe", version: "1" } }
        : request.method === "tools/list"
          ? { tools: [{ name: "ping", description: "Ping", inputSchema: { type: "object" } }] }
          : { content: [{ type: "text", text: "pong" }] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
  }
});
`;

async function writeSource(box: Sandbox, body: string): Promise<string> {
  const source = path.join(box.root, "sources", NAME);
  await writeText(
    path.join(source, "acf.yml"),
    `acf: 1\nname: ${NAME}\nversion: 1.0.0\ndescription: Real host probe\n`,
  );
  await writeText(
    path.join(source, "skills", NAME, "SKILL.md"),
    `---\nname: ${NAME}\ndescription: Probe skill\n---\n${body}\n`,
  );
  await writeText(path.join(source, "server.js"), SERVER);
  await writeText(
    path.join(source, "mcp", "mcp.yml"),
    `servers:\n  - name: files\n    transport: stdio\n    command: node\n    args: ['${"$"}{ACF_CAPABILITY_DIR}/server.js', '${path.join(box.root, "spawn.log")}']\n`,
  );
  return source;
}

/** A second capability with one skill, so removing `probe` leaves the marketplace in use. */
async function writeHelper(box: Sandbox): Promise<string> {
  const source = path.join(box.root, "sources", "helper");
  await writeText(
    path.join(source, "acf.yml"),
    "acf: 1\nname: helper\nversion: 1.0.0\ndescription: Stays installed\n",
  );
  await writeText(
    path.join(source, "skills", "helper", "SKILL.md"),
    "---\nname: helper\ndescription: Helper skill\n---\nHelp.\n",
  );
  return source;
}

async function select(box: Sandbox, sources: readonly string[]): Promise<void> {
  const entries =
    sources.length === 0 ? " []" : sources.map((source) => `\n  - source: path:${source}`).join("");
  await writeText(
    path.join(box.home, ".agents", "capabilities.yml"),
    `acf: 1\ncapabilities:${entries}\n`,
  );
}

const USER = (box: Sandbox) => ["--cwd", box.project, "--scope", "user", "--target", "claude"];

test.skipIf(!enabled)(
  "caplet installs, updates and uninstalls a plugin through the real claude",
  async () => {
    const before = await realState();
    const box = await sandbox();
    await writeText(path.join(box.project, ".keep"), "");
    const source = await writeSource(box, "First body.");
    const helper = await writeHelper(box);
    await select(box, [source, helper]);

    const install = await caplet(box, ["apply", ...USER(box), "--json"]);
    expect({ exit: install.exitCode, stderr: install.stderr }).toEqual({ exit: 0, stderr: "" });
    const probe = async () => (await installed(box)).find((item) => item.id === `${NAME}@acf-user`);
    expect((await installed(box)).map((item) => item.id).sort()).toEqual([
      "helper@acf-user",
      `${NAME}@acf-user`,
    ]);
    const first = await probe();
    expect(first).toMatchObject({ scope: "user", enabled: true });
    if (first === undefined) throw new Error("nothing installed");
    const firstSkill = path.join(first.installPath, "skills", NAME, "SKILL.md");
    expect(await readFile(firstSkill, "utf8")).toContain("First body.");

    // The health check starts the plugin's server from the installed copy and lists it connected.
    const health = await claude(box, ["mcp", "list"]);
    expect(health.stdout).toContain("files");
    expect(health.stdout).toMatch(/Connected/i);

    await writeSource(box, "Second body.");
    const update = await caplet(box, ["update", ...USER(box), "--json"]);
    expect(update.exitCode).toBe(0);
    const second = await probe();
    expect(second?.version).not.toBe(first.version);
    if (second === undefined) throw new Error("update lost the plugin");
    expect(
      await readFile(path.join(second.installPath, "skills", NAME, "SKILL.md"), "utf8"),
    ).toContain("Second body.");

    // marketplace.json no longer lists probe when caplet uninstalls it.
    await select(box, [helper]);
    const removeOne = await caplet(box, ["apply", ...USER(box), "--json"]);
    expect({ exit: removeOne.exitCode, stderr: removeOne.stderr }).toEqual({ exit: 0, stderr: "" });
    expect((await installed(box)).map((item) => item.id)).toEqual(["helper@acf-user"]);

    await select(box, []);
    const uninstall = await caplet(box, ["apply", ...USER(box), "--json"]);
    expect({ exit: uninstall.exitCode, stderr: uninstall.stderr }).toEqual({
      exit: 0,
      stderr: "",
    });
    expect(await installed(box)).toEqual([]);
    const marketplaces = await claude(box, ["plugin", "marketplace", "list", "--json"]);
    expect(JSON.parse(marketplaces.stdout)).toEqual([]);
    expect(existsSync(path.join(box.home, ".claude", ".acf", "marketplace"))).toBe(false);

    expect(await realState()).toBe(before);
    console.info(
      JSON.stringify({
        claude: (await claude(box, ["--version"])).stdout.trim(),
        versions: [first.version, second.version],
        health: health.stdout.trim(),
        spawnCwds: (await readFile(path.join(box.root, "spawn.log"), "utf8")).trim().split("\n"),
      }),
    );
  },
  300_000,
);
