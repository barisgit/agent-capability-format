import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClaudeCli } from "../../../src/hosts/claude/cli.js";
import { previewClaudeHost, reconcileClaudeHost } from "../../../src/hosts/claude/reconcile.js";
import { claudeMarketplaceName } from "../../../src/hosts/claude/scope.js";
import {
  commandLines,
  dir,
  home,
  host,
  useReconcileDirs,
  userDir,
  userFake,
  userScope,
} from "../../support/claude-reconcile";
import { fakeClaudeCli } from "../../support/fake-claude-cli";

useReconcileDirs();

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

  test("a marketplace of caplet's name in another directory is left alone, as an error", async () => {
    const fake = userFake([
      "list-json-installed",
      { fixture: "marketplace-list-json", replace: { "<MARKETPLACE_DIR>": "/srv/team" } },
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.bbb" }]),
    );
    expect(commandLines(fake.calls)).toEqual([
      "claude plugin list --json",
      "claude plugin marketplace list --json",
    ]);
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["acf.claude.marketplace-foreign", "error"],
    ]);
    expect(report.diagnostics[0]?.message).toContain("/srv/team");
    expect(report.scopes[0]?.plugins).toEqual([
      {
        name: "probe",
        id: "probe@acf-user",
        action: "blocked",
        state: "unknown",
        desiredVersion: "1.0.0+acf.bbb",
      },
    ]);
  });

  test("caplet's marketplace listed through a symlink to its directory is its own", async () => {
    await mkdir(userDir, { recursive: true });
    const link = path.join(dir, "link");
    await symlink(userDir, link);
    const fake = userFake([
      "list-json-installed",
      { fixture: "marketplace-list-json", replace: { "<MARKETPLACE_DIR>": link } },
      "marketplace-add-already-known",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(fake.unused()).toEqual([]);
    expect(report.diagnostics).toEqual([]);
    expect(report.scopes[0]?.plugins[0]).toMatchObject({
      action: "unchanged",
      state: "registered",
    });
  });

  test("a plugin disabled only in the user settings is not installed and stays disabled", async () => {
    await mkdir(path.join(home, ".claude"), { recursive: true });
    await writeFile(
      path.join(home, ".claude/settings.json"),
      JSON.stringify({ enabledPlugins: { "probe@acf-user": false } }),
    );
    const fake = userFake([
      "list-json-empty",
      "marketplace-list-json",
      "marketplace-add-already-known",
    ]);
    const report = await reconcileClaudeHost(
      host(fake.cli),
      userScope([{ name: "probe", version: "1.0.0+acf.aaa" }]),
    );
    expect(fake.unused()).toEqual([]);
    expect(report.diagnostics).toEqual([]);
    expect(report.scopes[0]?.plugins).toEqual([
      {
        name: "probe",
        id: "probe@acf-user",
        action: "disabled",
        state: "disabled by user",
        desiredVersion: "1.0.0+acf.aaa",
      },
    ]);
  });

  describe("a capability at both user and project scope", () => {
    const projectRoot = () => path.join(dir, "project");
    const projectScope = (plugins: { name: string; version: string }[]) => {
      const target = { scope: "project" as const, projectRoot: projectRoot() };
      const marketplaceDir = path.join(projectRoot(), ".claude/.acf/marketplace");
      return { target, marketplaceDir, plugins, recorded: true };
    };
    const probe = [{ name: "probe", version: "1.0.0+acf.aaa" }];
    const codes = (report: { diagnostics: { code: string; severity: string }[] }) =>
      report.diagnostics.map((d) => [d.code, d.severity]);

    test("apply warns that Claude shows it twice when the user plugin is installed", async () => {
      const projectMarketplace = claudeMarketplaceName(projectScope([]).target);
      const project = { "acf-project-spike": projectMarketplace, local1: "probe" };
      const fake = userFake([
        "list-json-installed",
        "marketplace-list-json",
        { fixture: "marketplace-add-local", replace: { ...project, "<PROJECT>": projectRoot() } },
        { fixture: "install-local", replace: project },
        "list-json-installed",
      ]);
      const report = await reconcileClaudeHost(host(fake.cli), [projectScope(probe)]);
      expect(fake.unused()).toEqual([]);
      expect(codes(report)).toEqual([["acf.claude.duplicate-scope", "warn"]]);
      expect(report.diagnostics[0]?.message).toContain("probe@acf-user");
      expect(report.diagnostics[0]?.message).toContain(`probe@${projectMarketplace}`);
    });

    test("a dry run warns once when the same run wants it at both scopes", async () => {
      const fake = userFake(["list-json-empty", "marketplace-list-json-empty"]);
      const report = await previewClaudeHost(host(fake.cli), [
        ...userScope(probe),
        projectScope(probe),
      ]);
      expect(codes(report)).toEqual([["acf.claude.duplicate-scope", "warn"]]);
    });

    test("no warning when the user disabled the user plugin", async () => {
      const fake = userFake(["list-json-disabled", "marketplace-list-json"]);
      const report = await previewClaudeHost(host(fake.cli), [projectScope(probe)]);
      expect(report.diagnostics).toEqual([]);
    });
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
