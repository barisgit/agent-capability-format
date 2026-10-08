import { expect, test } from "bun:test";
import path from "node:path";
import { pluginPackageDir } from "@caplet/core";
import { claudeAdapter, codexAdapter } from "../src";
import { CAP_ROOT, capabilityModel, emitModel, PROJECT, skillFacet } from "./util/model";

const INSTALL_ROOT = path.join(PROJECT, ".claude");

test("an ACF capability with a skill and a server becomes one Claude plugin", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review a change" })],
    servers: [{ name: "tools", transport: "stdio", command: "node", args: ["server.js"] }],
  });
  capability.manifest = { ...capability.manifest, name: "review", version: "1.2.0" };
  const result = await emitModel(
    claudeAdapter,
    capability,
    INSTALL_ROOT,
    {},
    {
      [path.join(CAP_ROOT, "server.js")]: "console.log('hi')\n",
    },
  );
  const dir = pluginPackageDir(INSTALL_ROOT, "review");
  expect(result.plugins).toHaveLength(1);
  expect(result.plugins?.[0]?.dir).toBe(dir);
  expect(result.plugins?.[0]?.version).toMatch(/^1\.2\.0\+acf\.[0-9a-f]{12}$/);
  const paths = result.diffs.map((diff) => path.relative(dir, diff.path)).sort();
  expect(paths).toEqual([
    ".claude-plugin/plugin.json",
    ".mcp.json",
    "server.js",
    "skills/review/SKILL.md",
  ]);
});

test("a loose target reports package-level Claude keys and native/claude/ files as dropped", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review" })],
  });
  capability.manifest = {
    ...capability.manifest,
    targets: { claude: { native: { dependencies: ["helper-plugin"] } } },
  };
  capability.nativeFiles = [
    { target: "claude", path: "output-styles/terse.md", executable: false },
  ];
  const result = await emitModel(codexAdapter, capability, path.join(PROJECT, ".codex"));
  const dropped = result.diagnostics.filter((d) => d.code === "acf.extras.dropped");
  expect(dropped.map((d) => d.message)).toEqual([
    expect.stringContaining("dependencies"),
    expect.stringContaining("native/claude/"),
  ]);
});
