import { expect, test } from "bun:test";
import packageJson from "../../package.json" with { type: "json" };
import { cleanup, fetchProject, makeScope, runCaplet } from "../helpers";

function parseEnvelope(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

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
