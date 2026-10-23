import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

function parseEnvelope(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

test("init --json reports creation and repeated initialization in the standard envelope", async () => {
  const scope = await makeScope();
  try {
    const cwd = path.join(scope.dir, "new-project");
    await mkdir(cwd);
    for (const created of [true, false]) {
      const result = await runCaplet(scope, ["init", "--json", "--cwd", cwd]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(parseEnvelope(result.stdout)).toEqual({
        caplet: packageJson.version,
        command: "init",
        ok: true,
        diagnostics: [],
        created,
        manifest: path.join(cwd, ".agents", "capabilities.yml"),
      });
    }
  } finally {
    await cleanup(scope);
  }
});

test("completion --json wraps scripts and unsupported-shell errors", async () => {
  const scope = await makeScope();
  try {
    for (const shell of ["bash", "zsh", "fish"]) {
      const result = await runCaplet(scope, ["completion", shell, "--json"]);
      expect(result.exitCode).toBe(0);
      expect(parseEnvelope(result.stdout)).toMatchObject({
        caplet: packageJson.version,
        command: "completion",
        ok: true,
        diagnostics: [],
        shell,
      });
      const plain = await runCaplet(scope, ["completion", shell]);
      expect(parseEnvelope(result.stdout).script).toBe(plain.stdout);
    }
    const invalid = await runCaplet(scope, ["completion", "unknown", "--json"]);
    expect(invalid.exitCode).toBe(2);
    expect(parseEnvelope(invalid.stdout)).toMatchObject({
      command: "completion",
      ok: false,
      diagnostics: [expect.objectContaining({ severity: "error", code: "acf.cli.usage" })],
    });
  } finally {
    await cleanup(scope);
  }
});

test("caplet apply --dry-run --json prints a single JSON envelope on stdout", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "apply",
      "--dry-run",
      "--json",
      "--scope",
      "project",
      "--target",
      "claude",
      "--cwd",
      scope.cwd,
    ]);
    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.caplet).toBe(packageJson.version);
    expect(envelope.command).toBe("apply");
    expect(envelope.ok).toBe(true);
    expect(Array.isArray(envelope.diagnostics)).toBe(true);
    const plan = envelope.plan as { changes: unknown[]; fileCount: number; totals: unknown[] };
    expect(plan.fileCount).toBeGreaterThan(0);
    expect(plan.changes.length).toBeGreaterThan(0);
    expect(envelope.applied).toBeNull();
  } finally {
    await cleanup(scope);
  }
});

test("caplet apply --json applies and reports counts", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "apply",
      "--json",
      "--offline",
      "--scope",
      "project",
      "--target",
      "claude",
      "--cwd",
      scope.cwd,
    ]);
    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.ok).toBe(true);
    const applied = envelope.applied as { files: number; writes: number; deletes: number };
    expect(applied.files).toBeGreaterThan(0);
    expect(applied.writes).toBeGreaterThan(0);
    expect(applied.deletes).toBe(0);
  } finally {
    await cleanup(scope);
  }
});

test("caplet list --json prints scopes and capabilities", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["list", "--json", "--cwd", scope.cwd]);
    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.command).toBe("list");
    const scopes = envelope.scopes as Array<{ scope: string; capabilities: { name: string }[] }>;
    const project = scopes.find((entry) => entry.scope === "project");
    expect(project?.capabilities.map((c) => c.name).sort()).toEqual(["alpha-cap", "beta-cap"]);
  } finally {
    await cleanup(scope);
  }
});

test("caplet check --json reports stale outputs with exit 1", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, [
      "check",
      "--json",
      "--scope",
      "project",
      "--target",
      "claude",
      "--cwd",
      scope.cwd,
    ]);
    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.command).toBe("check");
    expect(envelope.ok).toBe(false);
    expect(envelope.result).toBe("stale");
    expect(envelope.pending as number).toBeGreaterThan(0);
  } finally {
    await cleanup(scope);
  }
});

test("caplet doctor --json lists checks", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["doctor", "--json", "--cwd", scope.cwd]);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.command).toBe("doctor");
    const checks = envelope.checks as Array<{ section: string; status: string; message: string }>;
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((check) => ["pass", "warn", "fail"].includes(check.status))).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("caplet show --json wraps capability details in the envelope", async () => {
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
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.command).toBe("show");
    const capabilities = envelope.capabilities as Array<{ name: string; scope: string }>;
    expect(capabilities[0]?.name).toBe("alpha-cap");
    expect(capabilities[0]?.scope).toBe("project");
  } finally {
    await cleanup(scope);
  }
});

test("caplet status --json is not ok and exits 2 with an error diagnostic", async () => {
  const scope = await makeScope();
  try {
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: nope\n");
    const result = await runCaplet(scope, [
      "status",
      "--json",
      "--scope",
      "project",
      "--cwd",
      scope.cwd,
    ]);
    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.diagnostics).toContainEqual(
      expect.objectContaining({ code: "acf.capabilities-yml.invalid" }),
    );
  } finally {
    await cleanup(scope);
  }
});

test("usage errors under --json print the command's envelope with an error diagnostic", async () => {
  const scope = await makeScope();
  try {
    const cases: Array<{ args: string[]; command: string; message: string }> = [
      { args: ["apply", "--target", "bogus"], command: "apply", message: "bogus" },
      { args: ["show"], command: "show", message: "NAME" },
      { args: ["apply", "--bogus"], command: "apply", message: "--bogus" },
    ];
    for (const item of cases.flatMap((entry) =>
      ["--json", "--json=true"].map((json) => ({ ...entry, json })),
    )) {
      const result = await runCaplet(scope, [...item.args, item.json, "--cwd", scope.cwd]);

      expect(result.exitCode).toBe(2);
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.command).toBe(item.command);
      expect(envelope.ok).toBe(false);
      const diagnostics = envelope.diagnostics as Array<{
        severity: string;
        code: string;
        message: string;
      }>;
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ severity: "error", code: "acf.cli.usage" });
      expect(diagnostics[0]?.message).toContain(item.message);
    }
  } finally {
    await cleanup(scope);
  }
});

test("an unexpected failure under --json still prints the envelope and exits 1", async () => {
  const scope = await makeScope();
  try {
    // A directory where the lockfile belongs makes the lockfile read throw EISDIR, which no
    // command handles.
    await mkdir(path.join(scope.agentsDir, "capabilities.lock"));
    for (const json of ["--json", "--json=true"]) {
      const result = await runCaplet(scope, ["status", json, "--cwd", scope.cwd]);

      expect(result.exitCode).toBe(1);
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.command).toBe("status");
      expect(envelope.ok).toBe(false);
      expect(envelope.diagnostics).toEqual([
        expect.objectContaining({ severity: "error", code: "acf.cli.internal" }),
      ]);
      expect(result.stderr).toContain("EISDIR");
    }
    // The last of a flag and its negation wins, as the command reads it.
    const plain = await runCaplet(scope, ["status", "--json", "--no-json", "--cwd", scope.cwd]);
    expect(plain.exitCode).toBe(1);
    expect(plain.stdout).toBe("");
  } finally {
    await cleanup(scope);
  }
});

test("a missing required positional argument is a usage error that exits 2", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["show", "--cwd", scope.cwd]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("NAME");
    expect(result.stderr).toContain("caplet show --help");
  } finally {
    await cleanup(scope);
  }
});
