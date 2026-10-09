import { afterEach, describe, expect, test } from "bun:test";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { readLockfile, resolveCapabilities } from "../src";
import { cleanup, tempDir, testScopeRoot, writeText } from "./helpers";

const AP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await cleanup(dir);
});

function skill(name: string): string {
  return `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n`;
}

/** A project scope whose capabilities.yml has one path entry for `files` written to `pkg/`. */
async function scopeWith(files: Record<string, string>, entry = "") {
  const dir = await tempDir("acf-installer-formats-");
  dirs.push(dir);
  const agentsDir = path.join(dir, ".agents");
  const scopeRoot = testScopeRoot("project", agentsDir);
  for (const [relative, content] of Object.entries(files))
    await writeText(path.join(dir, "pkg", relative), content);
  await writeText(
    scopeRoot.manifestPath,
    `acf: 1\ncapabilities:\n  - source: path:../pkg\n${entry}`,
  );
  const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
  const lock = await readLockfile(scopeRoot.lockPath);
  return { scopeRoot, result, records: lock?.entries[0]?.resolvedCapabilities ?? [] };
}

function errors(result: { diagnostics: { severity: string; code: string }[] }): string[] {
  return result.diagnostics.filter((item) => item.severity === "error").map((item) => item.code);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const claudePlugin = {
  ".claude-plugin/plugin.json": JSON.stringify({ name: "review-kit", version: "1.0.0" }),
  "skills/review/SKILL.md": skill("review"),
  "agents/reviewer.md": "---\nname: reviewer\n---\n",
};

const polyglot = {
  "acf.yml": "acf: 1\nname: review-kit\nversion: 1.0.0\n",
  ...claudePlugin,
};

describe("foreign source formats", () => {
  test("a Claude plugin locks one claude-plugin capability with its whole snapshot", async () => {
    const { scopeRoot, result, records } = await scopeWith(claudePlugin);
    expect(errors(result)).toEqual([]);
    expect(records).toEqual([
      expect.objectContaining({ name: "review-kit", format: "claude-plugin", path: "." }),
    ]);
    const snapshot = path.join(scopeRoot.capabilitiesDir, "review-kit");
    expect(await exists(path.join(snapshot, ".claude-plugin/plugin.json"))).toBe(true);
    expect(await exists(path.join(snapshot, "agents/reviewer.md"))).toBe(true);
  });

  test("a three-skill Agent Plugins package locks one capability", async () => {
    const { result, records } = await scopeWith({
      "plugin.json": JSON.stringify({ $schema: AP_SCHEMA, name: "docs-kit", version: "1.0.0" }),
      "skills/a/SKILL.md": skill("a"),
      "skills/b/SKILL.md": skill("b"),
      "skills/c/SKILL.md": skill("c"),
    });
    expect(errors(result)).toEqual([]);
    expect(records).toEqual([
      expect.objectContaining({ name: "docs-kit", format: "agent-plugins", formatVersion: "1.0" }),
    ]);
  });

  test("a polyglot source is read as ACF and reports the ignored manifest", async () => {
    const { result, records } = await scopeWith(polyglot);
    expect(records.map((item) => item.format)).toEqual(["acf"]);
    expect(result.diagnostics.map((item) => item.code)).toContain("acf.source.format-selected");
  });

  test("format: overrides detection", async () => {
    const { result, records } = await scopeWith(polyglot, "    format: claude-plugin\n");
    expect(errors(result)).toEqual([]);
    expect(records.map((item) => item.format)).toEqual(["claude-plugin"]);
  });

  test("format: naming an absent format fails", async () => {
    const { result, records } = await scopeWith(claudePlugin, "    format: agent-plugins\n");
    expect(errors(result)).toEqual(["acf.source.format-not-found"]);
    expect(records).toEqual([]);
  });

  test("a malformed Claude manifest fails instead of falling back to bare skills", async () => {
    const { scopeRoot, result } = await scopeWith({
      ".claude-plugin/plugin.json": "{ not json",
      "skills/one/SKILL.md": skill("one"),
    });
    expect(errors(result)).toEqual(["acf.source.manifest-invalid"]);
    expect(result.capabilities).toEqual([]);
    expect(await exists(path.join(scopeRoot.capabilitiesDir, "one"))).toBe(false);
  });

  test("a marketplace-only source fails with path: suggestions", async () => {
    const { result } = await scopeWith({
      ".claude-plugin/marketplace.json": JSON.stringify({
        name: "market",
        plugins: [{ name: "review", source: "./plugins/review" }],
      }),
    });
    expect(errors(result)).toEqual(["acf.source.marketplace-unsupported"]);
    const diagnostic = result.diagnostics.find(
      (item) => item.code === "acf.source.marketplace-unsupported",
    );
    expect(diagnostic?.data).toEqual({ suggestedPaths: ["plugins/review"] });
  });

  test("an out-of-slug name fails until the entry renames it", async () => {
    const files = {
      "plugin.json": JSON.stringify({ $schema: AP_SCHEMA, name: "acme.docs" }),
      "skills/a/SKILL.md": skill("a"),
    };
    const failed = await scopeWith(files);
    expect(errors(failed.result)).toEqual(["acf.manifest.invalid-name"]);

    const renamed = await scopeWith(files, "    rename: acme-docs\n");
    expect(errors(renamed.result)).toEqual([]);
    expect(renamed.records).toEqual([
      expect.objectContaining({ name: "acme-docs", format: "agent-plugins" }),
    ]);
  });
  test("changing rename on a locked entry refetches under the new name", async () => {
    const first = await scopeWith(claudePlugin, "    rename: kit-one\n");
    expect(first.records.map((item) => item.name)).toEqual(["kit-one"]);

    const { scopeRoot } = first;
    await writeText(
      scopeRoot.manifestPath,
      "acf: 1\ncapabilities:\n  - source: path:../pkg\n    rename: kit-two\n",
    );
    const second = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    expect(errors(second)).toEqual([]);
    const lock = await readLockfile(scopeRoot.lockPath);
    expect(lock?.entries[0]?.rename).toBe("kit-two");
    expect(lock?.entries[0]?.resolvedCapabilities?.map((item) => item.name)).toEqual(["kit-two"]);
    expect(await exists(path.join(scopeRoot.capabilitiesDir, "kit-two"))).toBe(true);
  });

  test("the lock records the requested format apart from the detected one", async () => {
    const detected = await scopeWith(polyglot);
    expect(detected.records.map((item) => item.format)).toEqual(["acf"]);
    expect((await readLockfile(detected.scopeRoot.lockPath))?.entries[0]?.format).toBeUndefined();

    const requested = await scopeWith(polyglot, "    format: claude-plugin\n");
    expect((await readLockfile(requested.scopeRoot.lockPath))?.entries[0]?.format).toBe(
      "claude-plugin",
    );
  });

  test("removing format: restores detection", async () => {
    const { scopeRoot } = await scopeWith(polyglot, "    format: claude-plugin\n");
    await writeText(scopeRoot.manifestPath, "acf: 1\ncapabilities:\n  - source: path:../pkg\n");
    const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
    expect(errors(result)).toEqual([]);
    const entry = (await readLockfile(scopeRoot.lockPath))?.entries[0];
    expect(entry?.format).toBeUndefined();
    expect(entry?.resolvedCapabilities?.map((item) => item.format)).toEqual(["acf"]);
  });

  const intentChanges = [
    { label: "rename", before: "    rename: kit-one\n", after: "    rename: kit-two\n" },
    { label: "format", before: "    format: claude-plugin\n", after: "" },
  ];
  for (const { label, before, after } of intentChanges) {
    for (const [mode, frozen] of [
      ["auto", true],
      ["never", false],
    ] as const) {
      const resolution = frozen ? "a frozen" : "an offline";
      test(`a changed ${label} is lock drift for ${resolution} resolution, which changes nothing`, async () => {
        const { scopeRoot } = await scopeWith(polyglot, before);
        const lockBefore = await Bun.file(scopeRoot.lockPath).text();
        const installedBefore = await readdir(scopeRoot.capabilitiesDir);
        await writeText(
          scopeRoot.manifestPath,
          `acf: 1\ncapabilities:\n  - source: path:../pkg\n${after}`,
        );
        const result = await resolveCapabilities({ scope: "project", scopeRoot, mode, frozen });
        expect(errors(result)).toEqual(["acf.lock.drift"]);
        expect(await Bun.file(scopeRoot.lockPath).text()).toBe(lockBefore);
        expect(await readdir(scopeRoot.capabilitiesDir)).toEqual(installedBefore);
      });
    }
  }
});
