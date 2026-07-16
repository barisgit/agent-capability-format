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
