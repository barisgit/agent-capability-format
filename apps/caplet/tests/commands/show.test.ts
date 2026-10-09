import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

test("caplet show prints a human capability view", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "show",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha-cap 1.0.0");
    expect(result.stdout).toContain("project scope");
    expect(result.stdout).toContain("instructions");
    expect(result.stdout).toContain("TARGET");
    expect(result.stdout).toContain("supported");
  } finally {
    await cleanup(scope);
  }
});

test("caplet show --json prints machine-readable details", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "show",
      "alpha-cap",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"name": "alpha-cap"');
    expect(result.stdout).toContain('"instructions"');
  } finally {
    await cleanup(scope);
  }
});

test("caplet show labels synthesized imports in human and JSON output", async () => {
  const scope = await makeScope();
  try {
    const root = path.join(scope.agentsDir, "capabilities", "imported");
    await writeText(
      path.join(root, "acf.yml"),
      "acf: 1\nname: imported\nversion: 0.0.0-unmanifested+local\n",
    );
    await writeText(path.join(root, ".acf-import.json"), '{"acf":1,"synthesized":true}\n');
    await writeText(
      path.join(root, "skills", "imported", "SKILL.md"),
      "---\nname: imported\ndescription: Imported\n---\nBody.\n",
    );

    const human = await runCaplet(scope, [
      "show",
      "imported",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("unmanifested import");

    const json = await runCaplet(scope, [
      "show",
      "imported",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(json.exitCode).toBe(0);
    expect(json.stdout).toContain('"synthesized": true');
  } finally {
    await cleanup(scope);
  }
});

test("caplet show reports no support on a target that carries none of the capability", async () => {
  const scope = await makeScope();
  try {
    const hooks = path.join(scope.sourceRoot, "hooks-only");
    await writeText(path.join(hooks, "acf.yml"), "acf: 1\nname: hooks-only\nversion: 1.0.0\n");
    await writeText(
      path.join(hooks, "hooks", "hooks.yml"),
      'pre_tool:\n  - name: guard\n    effect: observe\n    run:\n      command: "echo guard"\n',
    );
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${hooks}\n`,
    );
    await fetchProject(scope);
    const args = ["show", "hooks-only", "--cwd", scope.cwd, "--scope", "project"];

    const human = await runCaplet(scope, args);
    expect(human.exitCode).toBe(0);
    const [head, row] = human.stdout
      .split("\n")
      .filter((line) => line.includes("TARGET") || line.includes("supported"))
      .map((line) => line.trim().split(/\s+/));
    const cursor = head?.indexOf("cursor") ?? -1;
    expect(cursor).toBeGreaterThan(0);
    expect(row?.[cursor]).toBe("no");
    expect(row?.[head?.indexOf("claude") ?? -1]).toBe("yes");

    const json = JSON.parse((await runCaplet(scope, [...args, "--json"])).stdout) as {
      capabilities: Array<{ support: Record<string, string> }>;
    };
    expect(json.capabilities[0]?.support).toMatchObject({ claude: "yes", cursor: "no" });
  } finally {
    await cleanup(scope);
  }
});
