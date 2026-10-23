/**
 * Apply when a planned write is skipped because its file changed after planning: whatever depends
 * on that write (the host activating a plugin, the retirement of loose output, the release of an
 * earlier owner) waits for an apply in which the write lands.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveDiffPath } from "../../src/apply/apply-diffs";
import { applyEmitPlan } from "../../src/internal/apply-plan";
import { buildEmitPlan } from "../../src/internal/emit-plan";
import {
  applyProject,
  cleanup,
  makeScope,
  readText,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers";
import { pathWithoutClaude } from "../support/claude-path";
import { claudeScenarioShim, localPluginList } from "../support/claude-scenario";

let scope: TestScope;
const savedCwd = process.cwd();
const envKeys = [
  "HOME",
  "CLAUDE_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "PATH",
  "CAPLET_FAKE_CLAUDE",
] as const;
const savedEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

beforeEach(async () => {
  scope = await makeScope();
  // Processes the in-process apply spawns, such as the Claude shim, inherit these. In process only
  // CLAUDE_CONFIG_DIR takes effect; os.homedir() stays the run's throwaway HOME, fixed at start.
  process.env.HOME = scope.home;
  process.env.CLAUDE_CONFIG_DIR = path.join(scope.home, ".claude");
  for (const [key, dir] of [
    ["XDG_CONFIG_HOME", ".config"],
    ["XDG_DATA_HOME", ".local/share"],
    ["XDG_CACHE_HOME", ".cache"],
    ["XDG_STATE_HOME", ".local/state"],
  ] as const) {
    process.env[key] = path.join(scope.home, dir);
  }
  process.env.PATH = pathWithoutClaude();
  delete process.env.CAPLET_FAKE_CLAUDE;
});

afterEach(async () => {
  process.chdir(savedCwd);
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await cleanup(scope);
});

const planArgs = () => ({ cwd: scope.cwd, scope: "project", target: "claude" });

test("a skipped plugin package write holds back the install and the loose retirement", async () => {
  const source = path.join(scope.sourceRoot, "review");
  await writeText(
    path.join(source, "acf.yml"),
    "acf: 1\nname: review\nversion: 1.0.0\ndescription: Review changes\n",
  );
  await writeText(
    path.join(source, "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review a change\n---\nRead the diff first.\n",
  );
  await writeText(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${source}\n`,
  );
  const config = path.join(scope.agentsDir, "caplet.yml");
  await writeText(config, "targets:\n  claude:\n    carrier: loose\n");
  expect((await applyProject(scope)).exitCode).toBe(0);
  const looseSkill = path.join(scope.cwd, ".claude", "skills", "review", "SKILL.md");
  expect(existsSync(looseSkill)).toBe(true);
  await writeText(config, "acf: 1\n");

  const plan = await buildEmitPlan(planArgs());
  const version = plan.claude
    .flatMap((root) => root.plugins)
    .find((p) => p.name === "review")?.version;
  if (version === undefined) throw new Error("no review plugin planned");
  const packageSkill = plan.diffs.find(
    (item) =>
      item.carrier === "plugin" &&
      item.capabilityName === "review" &&
      item.diff.path.endsWith(path.join("skills", "review", "SKILL.md")),
  );
  if (packageSkill === undefined) throw new Error("no plugin skill planned");
  const host = await claudeScenarioShim(scope, "project", "review", [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-local",
    "install-local",
    localPluginList(version),
  ]);
  Object.assign(process.env, host.env);
  // Something else writes the package's skill between plan and apply.
  const packageSkillPath = resolveDiffPath(packageSkill.installRoot, packageSkill.diff.path);
  await writeText(packageSkillPath, "written by someone else\n");

  const summary = await applyEmitPlan(plan);

  expect(await readText(packageSkillPath)).toBe("written by someone else\n");
  expect(await host.calls()).toEqual([]);
  expect(existsSync(looseSkill)).toBe(true);
  expect(summary.diagnostics.map((item) => item.code)).toEqual(
    expect.arrayContaining(["acf.apply.unowned", "acf.claude.host-deferred"]),
  );
  const sidecar = await readText(path.join(scope.cwd, ".claude", ".acf-managed.json"));
  expect(sidecar).toContain('"skills/review/SKILL.md"');
});

test("a server handed to a capability whose write is skipped stays owned", async () => {
  await writeText(
    path.join(scope.agentsDir, "caplet.yml"),
    "targets:\n  claude:\n    carrier: loose\n",
  );
  const server = (name: string) =>
    `  - name: ${name}\n    transport: stdio\n    command: node\n    args: [server.js]\n`;
  const mcpYml = (capability: string) => path.join(scope.sourceRoot, capability, "mcp", "mcp.yml");
  await writeText(mcpYml("alpha"), `servers:\n${server("alpha-server")}${server("shared")}`);
  expect((await applyProject(scope)).exitCode).toBe(0);
  // The server moves from alpha-cap to beta-cap.
  await writeText(mcpYml("alpha"), `servers:\n${server("alpha-server")}`);
  await writeText(mcpYml("beta"), `servers:\n${server("beta-server")}${server("shared")}`);
  const update = ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project"];
  expect((await runCaplet(scope, update)).exitCode).toBe(0);
  const plan = await buildEmitPlan(planArgs());
  // The user edits the server between plan and apply, so beta-cap's write is skipped.
  const mcpFile = path.join(scope.cwd, ".mcp.json");
  const mcp = JSON.parse(await readText(mcpFile)) as {
    mcpServers: Record<string, { args: string[] }>;
  };
  const shared = mcp.mcpServers.shared;
  if (shared === undefined) throw new Error("shared server not written");
  shared.args = ["edited.js"];
  await writeText(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`);

  const summary = await applyEmitPlan(plan);

  expect(summary.diagnostics).toContainEqual(
    expect.objectContaining({ code: "acf.apply.drift", capability: { name: "beta-cap" } }),
  );
  expect(await sharedOwners()).toEqual(["alpha-cap"]);

  // The next apply hands the server over instead of treating it as the user's own.
  const again = await applyProject(scope);

  expect(again.exitCode).toBe(0);
  expect(`${again.stdout}${again.stderr}`).not.toContain("acf.mcp.config-conflict");
  expect(await sharedOwners()).toEqual(["beta-cap"]);
});

/** The capabilities whose Claude sidecar entries own the `shared` server. */
async function sharedOwners(): Promise<string[]> {
  const sidecar = JSON.parse(
    await readText(path.join(scope.cwd, ".claude", ".acf-managed.json")),
  ) as { managed: Array<{ capability: string; owns: Array<{ pointer?: string }> }> };
  return sidecar.managed
    .filter((entry) => entry.owns.some((own) => own.pointer === "/mcpServers/shared"))
    .map((entry) => entry.capability);
}
