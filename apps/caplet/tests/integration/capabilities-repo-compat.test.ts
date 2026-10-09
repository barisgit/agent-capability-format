/**
 * Compatibility with a published capability collection shaped like github:barisgit/capabilities:
 * an `acf/` collection whose skills use the Agent Skills `allowed-tools` field and carry assets,
 * a manifest with several plain-string authors, and MCP servers. Such a collection must keep
 * applying to Claude (plugin carrier), Codex and Pi without error diagnostics.
 */
import { afterEach, expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, type TestScope, writeText } from "../helpers.js";

const scopes: TestScope[] = [];

afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

/** Writes the collection under the scope's sources and selects it for the project. */
async function writeCollection(scope: TestScope): Promise<void> {
  const root = path.join(scope.sourceRoot, "capabilities", "acf");
  const files: Record<string, string> = {
    "workflows/acf.yml":
      "acf: 1\nname: workflows\nversion: 3.0.0\ndescription: Engineering workflows\n" +
      "authors:\n  - Blaz\n  - Matt Pocock (upstream skills)\n  - Cursor (upstream skills)\n",
    "workflows/skills/plan/SKILL.md":
      "---\nname: plan\ndescription: Plan a change\n" +
      "allowed-tools: Bash(git status:*) Bash(git diff:*) Read\n" +
      "assets:\n  - .mcp.json\n  - agents/openai.yaml\n  - references/guide.md\n" +
      "---\nRead references/guide.md first.\n",
    "workflows/skills/plan/.mcp.json": '{"mcpServers":{}}\n',
    "workflows/skills/plan/agents/openai.yaml": "interface:\n  display_name: Plan\n",
    "workflows/skills/plan/references/guide.md": "# Guide\n",
    "ops/acf.yml": "acf: 1\nname: ops\nversion: 1.2.0\ndescription: Knowledge operations\n",
    "ops/skills/search/SKILL.md":
      "---\nname: search\ndescription: Search the workspace\n" +
      "allowed-tools:\n  - Bash(superset mcp:*)\n  - Read\n---\nSearch.\n",
    "ops/mcp/mcp.yml":
      "servers:\n  - name: docs\n    transport: http\n    url: https://mcp.example.com/docs\n" +
      "  - name: local\n    transport: stdio\n    command: npx\n    args: [-y, example-mcp]\n",
  };
  for (const [file, text] of Object.entries(files)) await writeText(path.join(root, file), text);
  await writeText(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${path.dirname(root)}\n`,
  );
}

type Envelope = { diagnostics: Array<{ severity: string; code: string; message: string }> };

test("a collection shaped like barisgit/capabilities applies to Claude, Codex and Pi without errors", async () => {
  const scope = await makeScope();
  scopes.push(scope);
  await writeCollection(scope);
  const args = [
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "-t",
    "claude",
    "-t",
    "codex",
    "-t",
    "pi",
  ];
  expect(
    (await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"])).exitCode,
  ).toBe(0);

  const planned = await runCaplet(scope, ["apply", "--dry-run", "--json", ...args]);
  const envelope = JSON.parse(planned.stdout) as Envelope;
  expect(envelope.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(planned.exitCode).toBe(0);
  // allowed-tools has no Codex or Pi equivalent; dropping it is reported, not refused.
  expect(
    envelope.diagnostics
      .filter((d) => d.code === "acf.support.degraded")
      .map((d) => d.message)
      .sort(),
  ).toEqual([
    "claude: authors after the first are dropped; plugin.json has a single author (package.authors.additional on capability workflows)",
    ...["codex", "pi"].flatMap((target) =>
      ["plan", "search"].map(
        (skill) =>
          `${target}: allowed-tools is not written, so the host asks before the tools run (skill.allowed-tools on skill ${skill})`,
      ),
    ),
  ]);

  // Without a `claude` executable the plugin files are written and registration is left to the user.
  expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
  const plugin = path.join(scope.cwd, ".claude", ".acf", "marketplace", "plugins", "workflows");
  const shared = path.join(scope.cwd, ".agents", "skills", "plan");
  expect(await readText(path.join(plugin, "skills", "plan", "SKILL.md"))).toContain(
    "allowed-tools: Bash(git status:*) Bash(git diff:*) Read",
  );
  expect(await readText(path.join(shared, "SKILL.md"))).not.toContain("allowed-tools");
  for (const asset of ["agents/openai.yaml", "references/guide.md", ".mcp.json"]) {
    expect(await readText(path.join(plugin, "skills", "plan", asset))).toBeString();
    expect(await readText(path.join(shared, asset))).toBeString();
  }
});
