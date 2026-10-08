import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMarketplaceList, parsePluginList } from "../../../src/hosts/claude/state.js";

function stdoutOf(fixture: string): string {
  const file = path.join(import.meta.dir, "../../fixtures/claude-cli", `${fixture}.json`);
  return (JSON.parse(readFileSync(file, "utf8")) as { stdout: string }).stdout;
}

describe("parsePluginList", () => {
  test("reads an installed user plugin", () => {
    expect(parsePluginList(stdoutOf("list-json-installed"))).toEqual([
      {
        id: "probe@spike-mkt",
        name: "probe",
        marketplace: "spike-mkt",
        version: "1.0.0+acf.aaa",
        scope: "user",
        enabled: true,
        installPath: "<HOME>/.claude/plugins/cache/spike-mkt/probe/1.0.0-acf.aaa",
        projectPath: undefined,
      },
    ]);
  });

  test("keeps a disabled plugin with enabled false", () => {
    const [plugin] = parsePluginList(stdoutOf("list-json-disabled"));
    expect(plugin).toMatchObject({ id: "probe@spike-mkt", version: "banana", enabled: false });
  });

  test("reads project and local entries with their project path", () => {
    const plugins = parsePluginList(stdoutOf("list-json-project-and-local"));
    expect(plugins.map((p) => [p.id, p.scope, p.enabled, p.projectPath])).toEqual([
      ["local1@acf-project-spike", "local", true, "<PROJECT>"],
      ["probe@acf-project-spike", "project", true, "<PROJECT>"],
    ]);
  });

  test("reads an empty list", () => {
    expect(parsePluginList(stdoutOf("list-json-empty"))).toEqual([]);
  });

  test("rejects output that is not the documented array shape", () => {
    expect(() => parsePluginList(stdoutOf("list-json-available"))).toThrow(/array/);
    expect(() => parsePluginList("not json")).toThrow(/JSON/);
    expect(() => parsePluginList('[{"id":"no-marketplace","version":"1"}]')).toThrow(/id/);
  });
});

describe("parseMarketplaceList", () => {
  test("reads known marketplaces", () => {
    expect(parseMarketplaceList(stdoutOf("marketplace-list-json"))).toEqual([
      { name: "spike-mkt", source: "directory", path: "<MARKETPLACE_DIR>" },
    ]);
    expect(parseMarketplaceList(stdoutOf("marketplace-list-json-empty"))).toEqual([]);
  });

  test("rejects entries without a name", () => {
    expect(() => parseMarketplaceList('[{"source":"directory"}]')).toThrow(/name/);
  });
});
