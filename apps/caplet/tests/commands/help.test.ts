import { expect, test } from "bun:test";
import { targetIds } from "@caplet/core";
import { commandNames } from "../../src/internal/spec";
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
      expect(result.stdout).not.toMatch(/\b(inspect|diff|emit|fetch)\b/);
      expect(result.stdout).not.toMatch(/--(ref|rename|fail-on-lossy|mode)\b/);
    }
    const bad = await runCaplet(scope, ["completion", "powershell"]);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain("Unsupported shell");
  } finally {
    await cleanup(scope);
  }
});

test("per-command help shares root help formatting", async () => {
  const scope = await makeScope();
  try {
    for (const command of commandNames()) {
      const result = await runCaplet(scope, [command, "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`caplet ${command} \u2014 `);
      expect(result.stdout).toContain("USAGE");
      expect(result.stdout).toContain("EXAMPLES");
      expect(result.stdout).not.toMatch(/--(ref|rename|fail-on-lossy|mode)\b/);
    }
    const add = await runCaplet(scope, ["add", "--help"]);
    expect(add.stdout).toContain("github:vercel-labs/skills@find-skills");
    expect(add.stdout).toContain("caplet add github:acme/design-caps --pin main");
    const apply = await runCaplet(scope, ["apply", "--help"]);
    expect(apply.stdout).toContain("FLAGS");
    expect(apply.stdout).toContain("-n, --dry-run");
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

test("help and completions offer every registry target", async () => {
  const scope = await makeScope();
  try {
    const help = await runCaplet(scope, ["apply", "--help"]);
    const completion = await runCaplet(scope, ["completion", "fish"]);
    const offered = completion.stdout.match(/-l target -x -a "([^"]*)"/)?.[1]?.split(" ");
    expect(offered).toEqual([...targetIds]);
    expect(help.stdout).toContain(`limit targets: ${targetIds.join(", ")} (`);
  } finally {
    await cleanup(scope);
  }
});
