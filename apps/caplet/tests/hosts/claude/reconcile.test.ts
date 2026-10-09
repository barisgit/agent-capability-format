import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ClaudeCli } from "../../../src/hosts/claude/cli.js";
import { createClaudeHost } from "../../../src/hosts/claude/host.js";
import { previewClaudeHost, reconcileClaudeHost } from "../../../src/hosts/claude/reconcile.js";
import { claudeMarketplaceName } from "../../../src/hosts/claude/scope.js";
import {
  type FakeTranscript,
  fakeClaudeCli,
  missingClaudeCli,
} from "../../support/fake-claude-cli";

let dir = "";
let home = "";
let userDir = "";

beforeEach(async () => {
  dir = await realpath(await mkdtemp(path.join(tmpdir(), "caplet-claude-host-")));
  home = path.join(dir, "home");
  userDir = path.join(home, ".claude/.acf/marketplace");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The host port over `cli`, with Claude resolving project and local scope from the test project. */
function host(cli: ClaudeCli) {
  return createClaudeHost(cli, {
    projectDir: path.join(dir, "project"),
    configDir: path.join(home, ".claude"),
  });
}

function userFake(transcripts: FakeTranscript[]) {
  return fakeClaudeCli({
    transcripts,
    replace: { "<HOME>": home, "<MARKETPLACE_DIR>": userDir, "spike-mkt": "acf-user" },
  });
}

function userScope(plugins: { name: string; version: string }[]) {
  return [{ target: { scope: "user" as const }, marketplaceDir: userDir, plugins }];
}

function commandLines(calls: string[][]): string[] {
  return calls.map((argv) => argv.join(" "));
}

describe("reconcileClaudeHost with the fake Claude CLI", () => {
  test("the fake fails loudly on a command it has no transcript for", async () => {
    const fake = userFake(["list-json-empty"]);
    await expect(fake.cli(["plugin", "enable", "probe@acf-user"])).rejects.toThrow(
      /no transcript for `claude plugin enable probe@acf-user`/,
    );
  });

  test("installs a new plugin after adding the marketplace", async () => {
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json-empty",
      "marketplace-add-user",
      "install-user",
      "list-json-installed",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(commandLines(fake.calls)).toEqual([
      "claude plugin list --json",
      "claude plugin marketplace list --json",
      `claude plugin marketplace add ${userDir} --scope user`,
      "claude plugin install probe@acf-user --scope user",
      "claude plugin list --json",
    ]);
    expect(fake.unused()).toEqual([]);
    expect(report.diagnostics).toEqual([]);
    const [scope] = report.scopes;
    expect(scope?.claudeScope).toBe("user");
    expect(scope?.plugins).toEqual([
      {
        name: "probe",
        id: "probe@acf-user",
        action: "install",
        state: "registered",
        version: "1.0.0+acf.aaa",
        desiredVersion: "1.0.0+acf.aaa",
      },
    ]);
    expect(scope?.commands.map((c) => c.status)).toEqual(["succeeded", "succeeded"]);
    expect(scope?.local).toBeUndefined();
  });

  test("updates a plugin whose version changed", async () => {
    const fake = userFake([
      "list-json-installed",
      "marketplace-list-json",
      "marketplace-add-already-known",
      "update-changed",
      "list-json-after-update",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.bbb" }]),
    );
    expect(commandLines(fake.calls)).toContain("claude plugin update probe@acf-user --scope user");
    expect(fake.unused()).toEqual([]);
    expect(report.diagnostics).toEqual([]);
    expect(report.scopes[0]?.plugins[0]).toMatchObject({
      action: "update",
      state: "registered",
      version: "1.0.0+acf.bbb",
    });
  });

  test("an update Claude does not pick up is reported, not taken as registered", async () => {
    // Claude keeps the old version when the marketplace directory still lists it.
    const fake = userFake([
      "list-json-installed",
      "marketplace-list-json",
      "marketplace-add-already-known",
      "update-unchanged-version",
      "list-json-installed",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.bbb" }]),
    );
    expect(fake.unused()).toEqual([]);
    expect(report.scopes[0]?.plugins[0]).toMatchObject({
      action: "update",
      state: "unknown",
      version: "1.0.0+acf.aaa",
    });
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.version-mismatch", "warn"],
    ]);
    expect(report.diagnostics[0]?.message).toContain("1.0.0+acf.bbb");
  });

  test("a failed update that leaves the old version is unknown, like one Claude ignores", async () => {
    // Synthetic: Claude fails the update and still lists the old version afterwards.
    const fake = userFake([
      "list-json-installed",
      "marketplace-list-json",
      "marketplace-add-already-known",
      "list-json-installed",
    ]);
    const cli: ClaudeCli = async (args) =>
      args[1] === "update"
        ? {
            kind: "exited",
            exitCode: 1,
            stdout: "",
            stderr: '✘ Failed to update plugin "probe@acf-user": disk full\n',
          }
        : await fake.cli(args);
    const report = await reconcileClaudeHost(
      host(cli),
      userScope([{ name: "probe", version: "1.0.0+acf.bbb" }]),
    );
    expect(fake.unused()).toEqual([]);
    expect(report.scopes[0]?.plugins[0]).toMatchObject({
      action: "update",
      state: "unknown",
      version: "1.0.0+acf.aaa",
      desiredVersion: "1.0.0+acf.bbb",
    });
    expect(report.scopes[0]?.plugins[0]?.message).toContain("disk full");
    // The failure explains the stale version; no second warning repeats it.
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.command-failed", "error"],
    ]);
  });

  test("an unchanged plugin gets only the idempotent marketplace add", async () => {
    const fake = userFake([
      "list-json-installed",
      "marketplace-list-json",
      "marketplace-add-already-known",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(commandLines(fake.calls)).toEqual([
      "claude plugin list --json",
      "claude plugin marketplace list --json",
      `claude plugin marketplace add ${userDir} --scope user`,
    ]);
    expect(report.scopes[0]?.plugins[0]).toMatchObject({
      action: "unchanged",
      state: "registered",
    });
  });

  test("uninstalls a removed plugin and then the empty marketplace", async () => {
    const fake = userFake([
      "list-json-installed",
      "marketplace-list-json",
      "uninstall-user",
      "marketplace-remove",
      "list-json-empty",
    ]);
    const report = await reconcileClaudeHost(host(fake.cli), userScope([]));
    expect(commandLines(fake.calls).slice(2, 4)).toEqual([
      "claude plugin uninstall probe@acf-user --scope user",
      "claude plugin marketplace remove acf-user",
    ]);
    expect(fake.unused()).toEqual([]);
    expect(report.diagnostics).toEqual([]);
    expect(report.scopes[0]?.plugins).toEqual([
      { name: "probe", id: "probe@acf-user", action: "uninstall", state: "not installed" },
    ]);
  });

  test("a plugin the user disabled is updated and stays disabled", async () => {
    const fake = userFake([
      "list-json-disabled",
      "marketplace-list-json",
      "marketplace-add-already-known",
      "update-while-disabled",
      "list-json-after-update-while-disabled",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.2" }]),
    );
    const lines = commandLines(fake.calls);
    expect(lines).toContain("claude plugin update probe@acf-user --scope user");
    expect(lines.some((line) => / plugin (install|enable) /.test(line))).toBe(false);
    expect(fake.unused()).toEqual([]);
    expect(report.scopes[0]?.plugins[0]).toMatchObject({
      action: "update",
      state: "disabled by user",
      version: "1.0.2",
    });
  });

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

  test("project scope registers at Claude local scope and reports the local registration", async () => {
    const projectRoot = path.join(dir, "project");
    const marketplace = claudeMarketplaceName({ scope: "project", projectRoot });
    const fake = fakeClaudeCli({
      transcripts: [
        "list-json-empty",
        "marketplace-list-json-empty",
        "marketplace-add-local",
        "install-local",
        "list-json-project-and-local",
      ],
      replace: { "<HOME>": home, "<PROJECT>": projectRoot, "acf-project-spike": marketplace },
    });
    const report = await reconcileClaudeHost(host(fake.cli), [
      {
        target: { scope: "project", projectRoot },
        marketplaceDir: path.join(projectRoot, ".claude/.acf/marketplace"),
        plugins: [{ name: "local1", version: "1.0.0+acf.aaa" }],
      },
    ]);
    expect(fake.unused()).toEqual([]);
    const [scope] = report.scopes;
    expect(scope?.claudeScope).toBe("local");
    expect(scope?.plugins[0]).toMatchObject({ id: `local1@${marketplace}`, state: "registered" });
    expect(scope?.local).toEqual({
      projectRoot,
      settingsFile: path.join(projectRoot, ".claude/settings.local.json"),
      plugins: [`local1@${marketplace}`],
    });
    // probe was installed at Claude project scope outside caplet: reported, left alone.
    expect(scope?.otherScopeInstalls).toEqual([
      { id: `probe@${marketplace}`, scope: "project", enabled: true, version: "1.0.0+acf.aaa" },
    ]);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.other-scope", "info"],
    ]);
  });

  test("a desired plugin installed only at another Claude scope is not installed at caplet's", async () => {
    const projectRoot = path.join(dir, "project");
    const marketplace = claudeMarketplaceName({ scope: "project", projectRoot });
    const fake = fakeClaudeCli({
      transcripts: [
        "list-json-project-and-local",
        "marketplace-list-json",
        "marketplace-add-local",
      ],
      replace: {
        "<HOME>": home,
        "<PROJECT>": projectRoot,
        "<MARKETPLACE_DIR>": path.join(projectRoot, ".claude/.acf/marketplace"),
        "acf-project-spike": marketplace,
        "spike-mkt": marketplace,
      },
    });
    const report = await reconcileClaudeHost(host(fake.cli), [
      {
        target: { scope: "project", projectRoot },
        marketplaceDir: path.join(projectRoot, ".claude/.acf/marketplace"),
        plugins: [
          { name: "local1", version: "1.0.0+acf.aaa" },
          { name: "probe", version: "1.0.0+acf.aaa" },
        ],
      },
    ]);
    expect(fake.unused()).toEqual([]);
    expect(report.scopes[0]?.plugins).toEqual([
      expect.objectContaining({ name: "local1", action: "unchanged", state: "registered" }),
      {
        name: "probe",
        id: `probe@${marketplace}`,
        action: "other-scope",
        state: "not installed",
        desiredVersion: "1.0.0+acf.aaa",
      },
    ]);
  });
});

describe("previewClaudeHost", () => {
  test("an outdated installed version is unknown with a mismatch warning, enabled or disabled", async () => {
    for (const [fixture, version] of [
      ["list-json-installed", "1.0.0+acf.aaa"],
      ["list-json-disabled", "banana"],
    ] as const) {
      const fake = userFake([fixture, "marketplace-list-json"]);
      const report = await previewClaudeHost(
        host(fake.cli),
        userScope([{ name: "probe", version: "1.0.0+acf.new" }]),
      );
      expect(fake.calls).toHaveLength(2);
      expect(report.scopes[0]?.plugins[0]).toMatchObject({
        action: "update",
        state: "unknown",
        version,
        desiredVersion: "1.0.0+acf.new",
      });
      expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
        ["acf.claude.version-mismatch", "warn"],
      ]);
      expect(report.diagnostics[0]?.message).toContain(
        "claude plugin update probe@acf-user --scope user",
      );
    }
  });
});
