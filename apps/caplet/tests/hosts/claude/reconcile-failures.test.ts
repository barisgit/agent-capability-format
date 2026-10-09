/** `reconcileClaudeHost` when the Claude CLI is missing, stops, rejects a command or is blocked. */
import { describe, expect, test } from "bun:test";
import type { ClaudeCli } from "../../../src/hosts/claude/cli.js";
import { reconcileClaudeHost } from "../../../src/hosts/claude/reconcile.js";
import {
  host,
  useReconcileDirs,
  userDir,
  userFake,
  userScope,
} from "../../support/claude-reconcile";
import { missingClaudeCli } from "../../support/fake-claude-cli";

useReconcileDirs();

describe("reconcileClaudeHost failures with the fake Claude CLI", () => {
  test("a missing CLI reports registration required with the exact commands, as a warning", async () => {
    const report = await reconcileClaudeHost(
      host(missingClaudeCli()),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    const [scope] = report.scopes;
    expect(scope?.plugins[0]).toMatchObject({ action: "install", state: "registration required" });
    expect(scope?.commands).toEqual([
      {
        op: "marketplace add",
        command: `claude plugin marketplace add ${userDir} --scope user`,
        status: "not run",
      },
      {
        op: "install",
        command: "claude plugin install probe@acf-user --scope user",
        plugin: "probe@acf-user",
        status: "not run",
      },
    ]);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.cli-unavailable", "warn"],
    ]);
    const message = report.diagnostics[0]?.message ?? "";
    expect(message).toContain(`claude plugin marketplace add ${userDir} --scope user`);
    expect(message).toContain("claude plugin install probe@acf-user --scope user");
  });

  test("a CLI that stops starting mid-run is a warning listing every command not run", async () => {
    // Synthetic: the binary disappears after the marketplace add (spawn fails with ENOENT).
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      "marketplace-add-user",
    ]);
    const missing = missingClaudeCli();
    const cli: ClaudeCli = async (args) =>
      args[1] === "install" ? await missing(args) : await fake.cli(args);
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([
        { name: "lint", version: "1.0.0+acf.aaa" },
        { name: "probe", version: "1.0.0+acf.aaa" },
      ]),
    );
    expect(fake.unused()).toEqual([]);
    const [scope] = report.scopes;
    expect(scope?.commands.map((c) => c.status)).toEqual(["succeeded", "not run", "not run"]);
    expect(scope?.plugins.map((p) => p.state)).toEqual([
      "registration required",
      "registration required",
    ]);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.cli-unavailable", "warn"],
    ]);
    expect(report.diagnostics[0]?.data).toEqual({
      commands: [
        "claude plugin install lint@acf-user --scope user",
        "claude plugin install probe@acf-user --scope user",
      ],
    });
  });

  test("a CLI that stops starting before the final state read is a warning", async () => {
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      "marketplace-add-user",
      "install-user",
    ]);
    const missing = missingClaudeCli();
    let lists = 0;
    const cli: ClaudeCli = async (args) =>
      args.join(" ") === "plugin list --json" && ++lists === 2
        ? await missing(args)
        : await fake.cli(args);
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(fake.unused()).toEqual([]);
    expect(report.scopes[0]?.stateRead).toBe(false);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.cli-unavailable", "warn"],
    ]);
  });

  test("an install that Claude rejects fails that plugin only", async () => {
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      "marketplace-add-user",
      {
        fixture: "install-unknown-marketplace",
        replace: { probe: "lint", "nope-mkt": "acf-user" },
      },
      "install-user",
      "list-json-installed",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([
        { name: "lint", version: "1.0.0+acf.aaa" },
        { name: "probe", version: "1.0.0+acf.aaa" },
      ]),
    );
    expect(fake.unused()).toEqual([]);
    const plugins = report.scopes[0]?.plugins ?? [];
    expect(plugins.map((p) => [p.name, p.state])).toEqual([
      ["lint", "registration required"],
      ["probe", "registered"],
    ]);
    expect(plugins[0]?.message).toContain('Plugin "lint" not found in marketplace "acf-user"');
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.command-failed", "error"],
    ]);
    expect(report.diagnostics[0]?.message).toContain(
      "claude plugin install lint@acf-user --scope user",
    );
  });

  test("a failed marketplace add skips the installs that need it", async () => {
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      {
        fixture: "marketplace-add-missing-dir",
        replace: { "<SPIKE_ROOT>/failures/nope": userDir },
      },
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(fake.unused()).toEqual([]);
    const [scope] = report.scopes;
    expect(scope?.commands.map((c) => c.status)).toEqual(["failed", "skipped"]);
    expect(scope?.plugins[0]).toMatchObject({ state: "registration required" });
    expect(scope?.plugins[0]?.message).toContain(`Path does not exist: ${userDir}`);
    const [diagnostic] = report.diagnostics;
    expect(diagnostic?.code).toBe("acf.claude.command-failed");
    expect(diagnostic?.message).toContain("claude plugin install probe@acf-user --scope user");
  });

  test("a failed state read is a command failure that changes nothing", async () => {
    // Synthetic: no transcript of a failing list command exists.
    const cli: ClaudeCli = async () => ({
      kind: "exited",
      exitCode: 1,
      stdout: "",
      stderr: "✘ Failed to read installed plugins: EACCES\n",
    });
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(report.scopes[0]?.plugins[0]?.state).toBe("unknown");
    expect(report.scopes[0]?.commands.map((c) => c.status)).toEqual(["not run", "not run"]);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.command-failed", "error"],
    ]);
    expect(report.diagnostics[0]?.message).toContain("claude plugin list --json");
    expect(report.diagnostics[0]?.message).toContain("Failed to read installed plugins: EACCES");
  });

  test("a failed state read after the commands ran is a command failure", async () => {
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      "marketplace-add-user",
      "install-user",
    ]);
    let lists = 0;
    const cli: ClaudeCli = async (args) =>
      args.join(" ") === "plugin list --json" && ++lists === 2
        ? { kind: "exited", exitCode: 1, stdout: "", stderr: "✘ EACCES\n" }
        : await fake.cli(args);
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(fake.unused()).toEqual([]);
    expect(report.scopes[0]?.stateRead).toBe(false);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.command-failed", "error"],
    ]);
  });

  test("state Claude prints but caplet cannot parse is unreadable, a warning", async () => {
    const cli: ClaudeCli = async () => ({ kind: "exited", exitCode: 0, stdout: "{}", stderr: "" });
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.state-unreadable", "warn"],
    ]);
  });

  test("a policy block is reported as blocked by host policy", async () => {
    // Synthetic: no policy-block transcript exists (it needs root-owned managed settings), so this
    // runner wraps the fake and answers the install with a message template from the binary.
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      "marketplace-add-user",
      "list-json-empty",
    ]);
    const cli: ClaudeCli = async (args) =>
      args[1] === "install"
        ? {
            kind: "exited",
            exitCode: 1,
            stdout: "",
            stderr: `✘ Failed to install plugin "probe@acf-user": Marketplace 'acf-user' is blocked by enterprise policy\n`,
          }
        : await fake.cli(args);
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(report.scopes[0]?.plugins[0]?.state).toBe("blocked by host policy");
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.policy-blocked", "warn"],
    ]);
  });
});
