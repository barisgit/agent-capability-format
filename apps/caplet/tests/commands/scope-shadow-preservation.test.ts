import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic } from "@caplet/core";
import type { ClaudeScopeStatus } from "../../src/internal/claude-host-flow.js";
import { cleanup, makeScope, readText, runCaplet, type TestScope, writeText } from "../helpers.js";
import { atVersion, claudeScenarioShim, plannedVersion } from "../support/claude-scenario.js";

/** Selects a capability with a shared skill in either scope, without fetching. */
async function select(scope: TestScope, acfScope: "user" | "project", name: string) {
  const agents = acfScope === "user" ? path.join(scope.home, ".agents") : scope.agentsDir;
  await writeText(path.join(agents, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
  const root = path.join(agents, "capabilities", name);
  await writeText(path.join(root, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
  await writeText(
    path.join(root, "skills", "shared", "SKILL.md"),
    `---\nname: shared\ndescription: Shared skill\n---\n${acfScope} guidance\n`,
  );
}

for (const savedConfig of [false, true]) {
  test(`project shadowing never uninstalls a selected user Claude plugin (saved config: ${savedConfig})`, async () => {
    const scope = await makeScope();
    try {
      await select(scope, "user", "shared-cap");
      const flags = ["--cwd", scope.cwd, "--target", "claude"];
      expect((await runCaplet(scope, ["apply", ...flags, "--scope", "user"])).exitCode).toBe(0);
      const version = await plannedVersion(scope, [...flags, "--scope", "user"], "shared-cap");
      await select(scope, "project", "shared-cap");
      if (savedConfig) {
        await writeText(
          path.join(scope.home, ".claude", "settings.json"),
          JSON.stringify({
            pluginConfigs: { "shared-cap@acf-user": { options: { region: "eu" } } },
          }),
        );
      }
      const host = await claudeScenarioShim(scope, "user", "shared-cap", [
        atVersion("list-json-installed", version),
        "marketplace-list-json",
      ]);
      const result = await runCaplet(scope, ["apply", ...flags, "--dry-run", "--json"], host.env);
      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout) as {
        claude: ClaudeScopeStatus[];
        diagnostics: Diagnostic[];
      };
      const user = json.claude.find((item) => item.claudeScope === "user");
      expect(user?.plugins).toContainEqual(
        expect.objectContaining({ id: "shared-cap@acf-user", action: "unchanged" }),
      );
      expect(user?.commands.some((item) => item.command.includes("uninstall"))).toBe(false);
      expect(json.diagnostics).toContainEqual(
        expect.objectContaining({ code: "acf.claude.duplicate-scope", severity: "warn" }),
      );
      const before = await homeFiles(scope.home);
      expect((await runCaplet(scope, ["apply", ...flags])).exitCode).toBe(0);
      expect(await homeFiles(scope.home)).toEqual(before);
    } finally {
      await cleanup(scope);
    }
  });
}

for (const projectName of ["shared-cap", "project-cap"]) {
  test(`project apply preserves global loose files and ownership when ${projectName} shadows user output`, async () => {
    const scope = await makeScope();
    try {
      await select(scope, "user", "shared-cap");
      const flags = ["--cwd", scope.cwd, "--target", "codex"];
      expect((await runCaplet(scope, ["apply", ...flags, "--scope", "user"])).exitCode).toBe(0);
      const before = await homeFiles(scope.home);
      expect(Object.keys(before)).toContain(".agents/skills/shared/SKILL.md");
      expect(Object.keys(before)).toContain(".agents/.acf-managed.json");
      await select(scope, "project", projectName);
      const result = await runCaplet(scope, ["apply", ...flags, "--json"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        projectName === "shared-cap" ? "acf.capability.shadowed" : "acf.facet.shadowed",
      );
      expect(await homeFiles(scope.home)).toEqual(before);
      expect(await readText(path.join(scope.agentsDir, "skills", "shared", "SKILL.md"))).toContain(
        "project guidance",
      );
    } finally {
      await cleanup(scope);
    }
  });
}

test("a project shadow cannot hide a collision in global user output", async () => {
  const scope = await makeScope();
  try {
    await select(scope, "user", "cap-a");
    await select(scope, "user", "cap-b");
    await select(scope, "project", "cap-a");
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--target",
      "codex",
      "--json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("acf.facet.name-collision");
    expect(result.stdout).toContain('"scope": "user"');
  } finally {
    await cleanup(scope);
  }
});

test("shadowing native remainder is lossless, but explicit user exclusion still fails strict apply", async () => {
  const scope = await makeScope();
  try {
    const source = path.join(scope.sourceRoot, "native-kit");
    await writeText(
      path.join(source, ".claude-plugin", "plugin.json"),
      '{"name":"native-kit","version":"1.0.0"}\n',
    );
    await writeText(
      path.join(source, "skills", "shared", "SKILL.md"),
      "---\nname: shared\ndescription: Shared skill\n---\nGuidance\n",
    );
    await writeText(
      path.join(source, "agents", "helper.md"),
      "---\nname: helper\ndescription: Native helper\n---\nUse shared.\n",
    );
    const manifest = path.join(scope.home, ".agents", "capabilities.yml");
    const selection = `acf: 1\ncapabilities:\n  - source: path:${source}\n`;
    await writeText(manifest, selection);
    const flags = ["--cwd", scope.cwd, "--target", "claude", "--strict", "--json"];
    expect((await runCaplet(scope, ["apply", ...flags, "--scope", "user"])).exitCode).toBe(0);
    await select(scope, "project", "project-cap");
    const shadowed = await runCaplet(scope, ["apply", ...flags]);
    expect(shadowed.stdout).not.toContain("acf.selection.remainder-references");
    expect(shadowed.exitCode).toBe(0);
    await writeText(manifest, `${selection}    exclude:\n      skills: [shared]\n`);
    const excluded = await runCaplet(scope, ["apply", ...flags]);
    expect(excluded.exitCode).toBe(4);
    expect(excluded.stdout).toContain("acf.selection.remainder-references");
  } finally {
    await cleanup(scope);
  }
});

/** Captures bytes and paths, including sidecars, so a deleted ownership record also fails. */
async function homeFiles(home: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(home, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(home, file)] = await readText(file);
  }
  return files;
}
