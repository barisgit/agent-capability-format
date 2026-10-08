import { afterEach, expect, test } from "bun:test";
import { applicableTargets, applyEntrySelection, readClaudePluginPackage } from "../src";
import { baseManifest, cleanup, makeCapability, readTempCapability, tempDir } from "./helpers";

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await cleanup(dir);
});

const skill = (name: string) => `---\nname: ${name}\ndescription: ${name}\n---\nBody.\n`;

async function nativeCapability() {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skills/draft-a/SKILL.md": skill("draft-a"),
    "skills/draft-b/SKILL.md": skill("draft-b"),
    "skills/review/SKILL.md": skill("review"),
    "agents/helper.md": "---\nname: helper\ndescription: Helper\n---\nHelp.\n",
    "hooks/hooks.yml":
      "session_start:\n  - name: greet\n    run:\n      command: echo\n    effect: add_context\n  - name: warm\n    run:\n      command: echo\n    effect: add_context\n",
    "mcp/mcp.yml":
      "servers:\n  - name: files\n    transport: stdio\n    command: node\n  - name: search\n    transport: stdio\n    command: node\n",
  });
  dirs.push(dir);
  expect(cap.diagnostics).toEqual([]);
  return cap;
}

test("exclude removes matching components of each family, globs included", async () => {
  const cap = await nativeCapability();

  const { capability, diagnostics } = applyEntrySelection(cap, {
    exclude: { skills: ["draft-*"], agents: ["helper"], hooks: ["greet"], mcp: ["search"] },
  });

  expect(diagnostics).toEqual([]);
  expect(capability.skills.map((facet) => facet.name)).toEqual(["review"]);
  expect(capability.agents).toEqual([]);
  expect(capability.hooks?.buckets.session_start?.map((hook) => hook.name)).toEqual(["warm"]);
  expect(capability.mcp?.servers.map((server) => server.name)).toEqual(["files"]);
  expect(cap.skills).toHaveLength(3);
});

test("include keeps only matching names in the families it lists", async () => {
  const cap = await nativeCapability();

  const { capability } = applyEntrySelection(cap, {
    include: { skills: ["review", "draft-?"] },
    exclude: { skills: ["draft-b"] },
  });

  expect(capability.skills.map((facet) => facet.name)).toEqual(["draft-a", "review"]);
  expect(capability.agents.map((facet) => facet.name)).toEqual(["helper"]);
  expect(capability.mcp?.servers).toHaveLength(2);
});

test("a selector that matches nothing is reported", async () => {
  const cap = await nativeCapability();

  const { capability, diagnostics } = applyEntrySelection(cap, {
    exclude: { skills: ["backgroud"] },
  });

  expect(capability.skills).toHaveLength(3);
  expect(diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code])).toEqual([
    ["warn", "acf.selection.unmatched"],
  ]);
  expect(diagnostics[0]?.message).toContain("exclude.skills");
  expect(diagnostics[0]?.message).toContain("backgroud");
});

test("selection reaches a foreign package's native remainder and warns about references", async () => {
  const root = await tempDir();
  dirs.push(root);
  await makeCapability(root, {
    ".claude-plugin/plugin.json": JSON.stringify({ name: "review-kit", version: "1.0.0" }),
    "skills/review/SKILL.md": skill("review"),
    "skills/draft/SKILL.md": skill("draft"),
    "agents/reviewer.md": "---\nname: reviewer\n---\n",
    "agents/writer.md": "---\nname: writer\n---\n",
  });
  const read = await readClaudePluginPackage(root, {
    scope: "project",
    origin: { kind: "local", directory: root },
    revision: null,
  });
  if (read.capability === undefined) throw new Error("plugin did not load");

  const { capability, diagnostics } = applyEntrySelection(read.capability, {
    exclude: { skills: ["draft"], agents: ["writer"] },
  });

  expect(capability.skills.map((facet) => facet.name)).toEqual(["review"]);
  expect(
    capability.remainder?.filter((item) => item.kind === "agent").map((item) => item.name),
  ).toEqual(["reviewer"]);
  expect(diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code])).toEqual([
    ["lossy", "acf.selection.remainder-references"],
  ]);
});

test("entry only/except intersect with the capability's own applicability", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": `${baseManifest}except: [cursor]\n`,
    "skills/review/SKILL.md": skill("review"),
  });
  dirs.push(dir);

  const { capability } = applyEntrySelection(cap, { except: ["codex"] });

  const targets = applicableTargets(capability, {});
  expect(targets).not.toContain("codex");
  expect(targets).not.toContain("cursor");
  expect(targets).toContain("claude");
  expect(applicableTargets(cap, {})).toContain("codex");
});
