import { expect, test } from "bun:test";
import { cleanup, makeScope, runCaplet } from "../helpers";

test("root help groups commands and lists global flags", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("MANAGE");
    expect(result.stdout).toContain("SYNC");
    expect(result.stdout).toContain("INSPECT");
    expect(result.stdout).toContain("GLOBAL FLAGS");
    expect(result.stdout).toContain("completion <shell>");
  } finally {
    await cleanup(scope);
  }
});

test("-V prints only the version", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["-V"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  } finally {
    await cleanup(scope);
  }
});

test("completion prints a script per shell and rejects unknown shells", async () => {
  const scope = await makeScope();
  try {
    for (const [shell, marker] of [
      ["bash", "complete -F _caplet_completions caplet"],
      ["zsh", "#compdef caplet"],
      ["fish", "complete -c caplet"],
    ] as const) {
      const result = await runCaplet(scope, ["completion", shell]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(marker);
    }
    const bad = await runCaplet(scope, ["completion", "powershell"]);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain("unsupported shell");
  } finally {
    await cleanup(scope);
  }
});

test("per-command help shares root help formatting", async () => {
  const scope = await makeScope();
  try {
    for (const command of ["add", "apply", "list", "completion"]) {
      const result = await runCaplet(scope, [command, "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`caplet ${command} \u2014 `);
      expect(result.stdout).toContain("USAGE");
      expect(result.stdout).toContain("EXAMPLES");
    }
    const add = await runCaplet(scope, ["add", "--help"]);
    expect(add.stdout).toContain("github:vercel-labs/skills@find-skills");
    const apply = await runCaplet(scope, ["apply", "--help"]);
    expect(apply.stdout).toContain("FLAGS");
    expect(apply.stdout).toContain("-n, --dry-run");
    expect(apply.stdout).not.toContain("--mode");
    expect(apply.stdout).toContain("GLOBAL FLAGS");
  } finally {
    await cleanup(scope);
  }
});

test("caplet help <command> works and unknown commands exit 2", async () => {
  const scope = await makeScope();
  try {
    const help = await runCaplet(scope, ["help", "show"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("caplet show \u2014 ");
    const bad = await runCaplet(scope, ["frobnicate"]);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain("unknown command: frobnicate");
  } finally {
    await cleanup(scope);
  }
});
