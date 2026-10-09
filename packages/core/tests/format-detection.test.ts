import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { marketplaceDiagnostic, recognizedFormats, selectSourceFormat } from "../src";
import { cleanup, makeCapability, tempDir } from "./helpers";

const AP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const dirs: string[] = [];

async function source(files: Record<string, string>): Promise<string> {
  const dir = await tempDir();
  dirs.push(dir);
  await makeCapability(dir, files);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await cleanup(dir);
});

const polyglot = {
  "acf.yml": "acf: 1\nname: poly\nversion: 1.0.0\n",
  "plugin.json": JSON.stringify({ $schema: AP_SCHEMA, name: "poly" }),
  ".claude-plugin/plugin.json": JSON.stringify({ name: "poly" }),
};

describe("source format detection", () => {
  test("a polyglot source is read as ACF and names the ignored manifests", async () => {
    const root = await source(polyglot);
    const selection = await selectSourceFormat(root);
    expect(selection.format).toBe("acf");
    expect(selection.diagnostics).toHaveLength(1);
    const [info] = selection.diagnostics;
    expect(info?.severity).toBe("info");
    expect(info?.code).toBe("acf.source.format-selected");
    expect(info?.message).toContain("plugin.json");
    expect(info?.message).toContain(".claude-plugin/plugin.json");
  });

  test("Agent Plugins outranks a Claude plugin manifest", async () => {
    const { "acf.yml": _acf, ...rest } = polyglot;
    const selection = await selectSourceFormat(await source(rest));
    expect(selection.format).toBe("agent-plugins");
    expect(selection.diagnostics.map((item) => item.code)).toEqual(["acf.source.format-selected"]);
  });

  test("format: overrides precedence without a selection notice", async () => {
    const selection = await selectSourceFormat(await source(polyglot), "claude-plugin");
    expect(selection).toEqual({ format: "claude-plugin", diagnostics: [] });
  });

  test("format: naming an absent format is an error", async () => {
    const root = await source({ ".claude-plugin/plugin.json": JSON.stringify({ name: "x" }) });
    const selection = await selectSourceFormat(root, "agent-plugins");
    expect(selection.format).toBeUndefined();
    expect(selection.diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["error", "acf.source.format-not-found"],
    ]);
  });

  test("a root plugin.json without the Agent Plugins schema is not recognized", async () => {
    const root = await source({ "plugin.json": JSON.stringify({ name: "copilot-thing" }) });
    expect(await recognizedFormats(root)).toEqual([]);
    expect((await selectSourceFormat(root)).format).toBe("skills");
  });

  test("an Agent Plugins manifest of another version is still recognized", async () => {
    const root = await source({
      "plugin.json": JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json",
        name: "next",
      }),
    });
    expect((await selectSourceFormat(root)).format).toBe("agent-plugins");
  });

  test("a broken Claude manifest is still recognized so it can fail", async () => {
    const root = await source({
      ".claude-plugin/plugin.json": "{ not json",
      "skills/one/SKILL.md": "---\nname: one\ndescription: One\n---\n",
    });
    expect((await selectSourceFormat(root)).format).toBe("claude-plugin");
  });
});

describe("marketplaces", () => {
  test("a Claude marketplace suggests one path: entry per local plugin", async () => {
    const root = await source({
      ".claude-plugin/marketplace.json": JSON.stringify({
        name: "market",
        owner: { name: "Acme" },
        metadata: { pluginRoot: "./plugins" },
        plugins: [
          { name: "review", source: "./plugins/review" },
          { name: "lint", source: "lint" },
          { name: "remote", source: { source: "github", repo: "acme/remote" } },
        ],
      }),
    });
    const diagnostic = await marketplaceDiagnostic(root);
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.code).toBe("acf.source.marketplace-unsupported");
    expect(diagnostic?.path).toBe(path.join(root, ".claude-plugin/marketplace.json"));
    expect(diagnostic?.data).toEqual({ suggestedPaths: ["plugins/lint", "plugins/review"] });
    expect(diagnostic?.message).toContain("path: plugins/review");
  });

  test("a source without a marketplace file has no marketplace diagnostic", async () => {
    expect(await marketplaceDiagnostic(await source({ "README.md": "hi\n" }))).toBeUndefined();
  });
});

test("a marketplace plugin directory whose name starts with two dots is suggested", async () => {
  const root = await source({
    ".claude-plugin/marketplace.json": JSON.stringify({
      name: "market",
      owner: { name: "Acme" },
      plugins: [{ name: "dots", source: "./..dots" }],
    }),
  });
  expect((await marketplaceDiagnostic(root))?.data).toEqual({ suggestedPaths: ["..dots"] });
});
