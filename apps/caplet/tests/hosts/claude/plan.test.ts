import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatClaudeCommand } from "../../../src/hosts/claude/commands.js";
import { type ClaudePluginAction, planClaudeScope } from "../../../src/hosts/claude/plan.js";
import {
  claudeMarketplaceName,
  resolveClaudeScopeTarget,
} from "../../../src/hosts/claude/scope.js";
import type { ClaudeInstalledPlugin, ClaudeSettingsFile } from "../../../src/hosts/claude/state.js";

const userDir = "/home/u/.claude/.acf/marketplace";
const projectRoot = "/home/u/proj";
const projectDir = `${projectRoot}/.claude/.acf/marketplace`;
// First 8 hex digits of sha256("/home/u/proj"), computed with sha256sum.
const projectMarketplace = "acf-project-9c09f805";

function installed(
  id: string,
  version: string,
  scope: ClaudeInstalledPlugin["scope"],
  enabled = true,
  projectPath: string | undefined = scope === "user" ? undefined : projectRoot,
): ClaudeInstalledPlugin {
  const [name = "", marketplace = ""] = id.split("@");
  const installPath = `/cache/${id}`;
  return { id, name, marketplace, version, scope, enabled, installPath, projectPath };
}

function settingsFile(
  scope: ClaudeSettingsFile["scope"],
  file: string,
  marketplaces: string[],
  configuredPlugins: string[] = [],
  enabledPlugins: Record<string, boolean> = {},
): ClaudeSettingsFile {
  return { scope, path: file, settings: { marketplaces, configuredPlugins, enabledPlugins } };
}

function commands(plan: ReturnType<typeof planClaudeScope>): string[] {
  return plan.steps.map((step) => formatClaudeCommand(step.command));
}

describe("Claude marketplace names", () => {
  test("user scope uses acf-user and project scope hashes the project root", () => {
    expect(claudeMarketplaceName({ scope: "user" })).toBe("acf-user");
    expect(claudeMarketplaceName({ scope: "project", projectRoot })).toBe(projectMarketplace);
  });

  test("the project root is resolved to its real path before hashing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "caplet-claude-scope-"));
    try {
      const real = path.join(dir, "real");
      const link = path.join(dir, "link");
      await mkdir(real);
      await symlink(real, link);
      const viaLink = await resolveClaudeScopeTarget("project", link);
      const direct = await resolveClaudeScopeTarget("project", real);
      expect(viaLink).toEqual(direct);
      expect(claudeMarketplaceName(viaLink)).toBe(claudeMarketplaceName(direct));
      expect(await resolveClaudeScopeTarget("user", link)).toEqual({ scope: "user" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("planClaudeScope", () => {
  test("first user install adds the marketplace then installs, both at user scope", () => {
    const plan = planClaudeScope(
      {
        target: { scope: "user" },
        marketplaceDir: userDir,
        plugins: [{ name: "review", version: "1.2.0+acf.aaa" }],
      },
      { plugins: [], marketplaces: [], projectDir: projectRoot, settings: [] },
    );
    expect(plan.claudeScope).toBe("user");
    expect(plan.marketplace).toBe("acf-user");
    expect(commands(plan)).toEqual([
      `claude plugin marketplace add ${userDir} --scope user`,
      "claude plugin install review@acf-user --scope user",
    ]);
    expect(plan.plugins.map((p) => [p.id, p.action])).toEqual([["review@acf-user", "install"]]);
  });

  test("project scope registers at Claude local scope under the hashed name", () => {
    const plan = planClaudeScope(
      {
        target: { scope: "project", projectRoot },
        marketplaceDir: projectDir,
        plugins: [{ name: "review", version: "1.0.0+acf.aaa" }],
      },
      { plugins: [], marketplaces: [], projectDir: projectRoot, settings: [] },
    );
    expect(plan.claudeScope).toBe("local");
    expect(commands(plan)).toEqual([
      `claude plugin marketplace add ${projectDir} --scope local`,
      `claude plugin install review@${projectMarketplace} --scope local`,
    ]);
  });

  test("adds the marketplace unconditionally, updates changed versions, leaves unchanged ones and uninstalls removed ones", () => {
    const plan = planClaudeScope(
      {
        target: { scope: "user" },
        marketplaceDir: userDir,
        plugins: [
          { name: "new", version: "1.0.0+acf.aaa" },
          { name: "changed", version: "1.0.0+acf.bbb" },
          { name: "same", version: "2.0.0+acf.ccc" },
        ],
      },
      {
        plugins: [
          installed("changed@acf-user", "1.0.0+acf.aaa", "user"),
          installed("same@acf-user", "2.0.0+acf.ccc", "user"),
          installed("gone@acf-user", "1.0.0+acf.ddd", "user"),
          installed("other@someone-else", "1.0.0", "user"),
        ],
        marketplaces: [{ name: "acf-user", source: "directory", path: userDir }],
        projectDir: projectRoot,
        settings: [],
      },
    );
    expect(commands(plan)).toEqual([
      `claude plugin marketplace add ${userDir} --scope user`,
      "claude plugin install new@acf-user --scope user",
      "claude plugin update changed@acf-user --scope user",
      "claude plugin uninstall gone@acf-user --scope user",
    ]);
    expect(Object.fromEntries(plan.plugins.map((p) => [p.name, p.action]))).toEqual({
      new: "install",
      changed: "update",
      same: "unchanged",
      gone: "uninstall",
    });
    // Installs and updates need the marketplace; an uninstall does not.
    expect(plan.steps.map((step) => step.after)).toEqual([[], [0], [0], []]);
  });

  test("a disabled plugin is updated, never installed, so it stays disabled", () => {
    const plan = planClaudeScope(
      {
        target: { scope: "user" },
        marketplaceDir: userDir,
        plugins: [
          { name: "off-changed", version: "1.0.2" },
          { name: "off-same", version: "1.0.0" },
        ],
      },
      {
        plugins: [
          installed("off-changed@acf-user", "banana", "user", false),
          installed("off-same@acf-user", "1.0.0", "user", false),
        ],
        marketplaces: [],
        projectDir: projectRoot,
        settings: [],
      },
    );
    expect(commands(plan)).toEqual([
      `claude plugin marketplace add ${userDir} --scope user`,
      "claude plugin update off-changed@acf-user --scope user",
    ]);
  });

  test("no desired plugins: uninstalls, then removes the known marketplace after them", () => {
    const plan = planClaudeScope(
      { target: { scope: "user" }, marketplaceDir: userDir, plugins: [], recorded: true },
      {
        plugins: [installed("gone@acf-user", "1.0.0", "user")],
        marketplaces: [{ name: "acf-user", source: "directory", path: userDir }],
        projectDir: projectRoot,
        settings: [],
      },
    );
    expect(commands(plan)).toEqual([
      "claude plugin uninstall gone@acf-user --scope user",
      "claude plugin marketplace remove acf-user",
    ]);
    expect(plan.steps.map((step) => step.after)).toEqual([[], [0]]);
  });

  test("no desired plugins and an unknown marketplace: nothing to run", () => {
    const plan = planClaudeScope(
      { target: { scope: "user" }, marketplaceDir: userDir, plugins: [] },
      { plugins: [], marketplaces: [], projectDir: projectRoot, settings: [] },
    );
    expect(plan.steps).toEqual([]);
  });

  test("installs of the marketplace at another Claude scope are reported and left alone", () => {
    const plan = planClaudeScope(
      {
        target: { scope: "project", projectRoot },
        marketplaceDir: projectDir,
        plugins: [{ name: "shared", version: "1.0.0" }],
      },
      {
        plugins: [
          installed(`shared@${projectMarketplace}`, "0.9.0", "project", false),
          installed(`manual@${projectMarketplace}`, "1.0.0", "project"),
        ],
        marketplaces: [{ name: projectMarketplace, source: "directory", path: projectDir }],
        projectDir: projectRoot,
        settings: [],
      },
    );
    // Installing at local scope would write enabledPlugins true over the user's disable.
    expect(commands(plan)).toEqual([`claude plugin marketplace add ${projectDir} --scope local`]);
    expect(plan.plugins.map((p) => [p.name, p.action])).toEqual([["shared", "other-scope"]]);
    expect(plan.otherScopeInstalls.map((p) => p.id)).toEqual([
      `shared@${projectMarketplace}`,
      `manual@${projectMarketplace}`,
    ]);
  });

  test("the marketplace is kept when another Claude scope still has plugins from it", () => {
    const plan = planClaudeScope(
      { target: { scope: "user" }, marketplaceDir: userDir, plugins: [] },
      {
        plugins: [installed("manual@acf-user", "1.0.0", "project")],
        marketplaces: [{ name: "acf-user", source: "directory", path: userDir }],
        projectDir: projectRoot,
        settings: [],
      },
    );
    expect(plan.steps).toEqual([]);
  });

  test("a local install of another project is neither caplet's nor reported", () => {
    const other = "/home/u/other";
    const plan = planClaudeScope(
      {
        target: { scope: "project", projectRoot },
        marketplaceDir: projectDir,
        plugins: [{ name: "review", version: "1.0.0" }],
      },
      {
        plugins: [installed(`review@${projectMarketplace}`, "1.0.0", "local", true, other)],
        marketplaces: [{ name: projectMarketplace, source: "directory", path: projectDir }],
        projectDir: projectRoot,
        settings: [],
      },
    );
    expect(commands(plan)).toEqual([
      `claude plugin marketplace add ${projectDir} --scope local`,
      `claude plugin install review@${projectMarketplace} --scope local`,
    ]);
    expect(plan.otherScopeInstalls).toEqual([]);
  });

  test("user scope ignores installs of other projects but keeps the marketplace they use", () => {
    const other = "/home/u/other";
    const elsewhere = installed("review@acf-user", "1.0.0", "local", true, other);
    const install = planClaudeScope(
      {
        target: { scope: "user" },
        marketplaceDir: userDir,
        plugins: [{ name: "review", version: "1.0.0" }],
      },
      { plugins: [elsewhere], marketplaces: [], projectDir: projectRoot, settings: [] },
    );
    expect(install.plugins.map((p) => p.action)).toEqual(["install"]);
    expect(install.otherScopeInstalls).toEqual([]);
    // `marketplace remove` would uninstall the other project's plugin too.
    const retire = planClaudeScope(
      { target: { scope: "user" }, marketplaceDir: userDir, plugins: [] },
      {
        plugins: [elsewhere],
        marketplaces: [{ name: "acf-user", source: "directory", path: userDir }],
        projectDir: projectRoot,
        settings: [],
      },
    );
    expect(retire.steps).toEqual([]);
  });

  test("formats commands with shell quoting for paths with spaces", () => {
    expect(
      formatClaudeCommand({ op: "marketplace add", dir: "/home/u/my proj/m", scope: "local" }),
    ).toBe("claude plugin marketplace add '/home/u/my proj/m' --scope local");
  });
});

describe("a marketplace of caplet's name that caplet did not register", () => {
  const desired = (plugins: { name: string; version: string }[], recorded = true) => ({
    target: { scope: "user" as const },
    marketplaceDir: userDir,
    plugins,
    recorded,
  });
  const observed = (marketplace: { source: string; path?: string }) => ({
    plugins: [installed("tool@acf-user", "1.0.0", "user")],
    marketplaces: [{ name: "acf-user", ...marketplace }],
    projectDir: projectRoot,
    settings: [],
  });

  test("runs nothing when it comes from another source or directory", () => {
    for (const marketplace of [{ source: "github" }, { source: "directory", path: "/srv/team" }]) {
      const install = planClaudeScope(
        desired([{ name: "review", version: "1.0.0" }]),
        observed(marketplace),
      );
      expect(commands(install)).toEqual([]);
      expect(install.foreign).toMatchObject(marketplace);
      expect(install.plugins.map((p) => [p.name, p.action])).toEqual([["review", "blocked"]]);
      expect(install.otherScopeInstalls).toEqual([]);
      // Retiring would uninstall tool@acf-user and remove the other marketplace.
      const retire = planClaudeScope(desired([]), observed(marketplace));
      expect(commands(retire)).toEqual([]);
      expect(retire.plugins).toEqual([]);
    }
  });

  test("is caplet's own when its directory is caplet's through a symlink", () => {
    const link = "/home/u/dotfiles/claude/.acf/marketplace";
    const plan = planClaudeScope(desired([{ name: "tool", version: "1.0.0" }]), {
      ...observed({ source: "directory", path: link }),
      realPaths: new Map([[link, userDir]]),
    });
    expect(plan.foreign).toBeUndefined();
    expect(commands(plan)).toEqual([`claude plugin marketplace add ${userDir} --scope user`]);
  });

  test("is not removed when the sidecar does not record caplet's registration", () => {
    const plan = planClaudeScope(desired([], false), {
      ...observed({ source: "directory", path: userDir }),
      plugins: [],
    });
    expect(commands(plan)).toEqual([]);
    expect(plan.keptBy).toEqual(["caplet's sidecar has no record of it"]);
  });
});

describe("a desired plugin the user disabled only in settings", () => {
  const plan = (
    target: Parameters<typeof claudeMarketplaceName>[0],
    settings: ClaudeSettingsFile[],
  ) =>
    planClaudeScope(
      {
        target,
        marketplaceDir: target.scope === "user" ? userDir : projectDir,
        plugins: [{ name: "review", version: "1.0.0" }],
      },
      { plugins: [], marketplaces: [], projectDir: projectRoot, settings },
    );
  const user = { scope: "user" as const };
  const project = { scope: "project" as const, projectRoot };
  const local = `review@${projectMarketplace}`;
  const file = (scope: ClaudeSettingsFile["scope"], enabled: boolean, id = local) =>
    settingsFile(scope, `/settings/${scope}.json`, [], [], { [id]: enabled });

  test("is not installed, because install would enable it again", () => {
    const disabled = plan(user, [file("user", false, "review@acf-user")]);
    expect(disabled.plugins.map((p) => [p.name, p.action])).toEqual([["review", "disabled"]]);
    expect(commands(disabled)).toEqual([`claude plugin marketplace add ${userDir} --scope user`]);
  });

  test("at local scope the most specific settings file that names it decides", () => {
    const cases: [ClaudeSettingsFile[], ClaudePluginAction][] = [
      [[file("user", false)], "disabled"],
      [[file("project", false)], "disabled"],
      [[file("local", false), file("user", true)], "disabled"],
      [[file("user", false), file("local", true)], "install"],
      [[file("project", false), file("local", true)], "install"],
    ];
    for (const [settings, action] of cases) {
      expect(plan(project, settings).plugins[0]?.action).toBe(action);
    }
  });

  test("at user scope only the user settings count, since project files still win there", () => {
    const installed = plan(user, [file("local", false, "review@acf-user")]);
    expect(installed.plugins[0]?.action).toBe("install");
  });
});

describe("uninstalling for a carrier change", () => {
  const userSettings = "/home/u/.claude/settings.json";

  function moveToLoose(
    declaresConfig: boolean,
    settings: ClaudeSettingsFile[],
    plugins: ClaudeInstalledPlugin[] = [installed("moved@acf-user", "1.0.0", "user")],
  ) {
    return planClaudeScope(
      {
        target: { scope: "user" },
        marketplaceDir: userDir,
        plugins: [],
        recorded: true,
        carrierChanged: [{ name: "moved", declaresConfig }],
      },
      {
        plugins,
        marketplaces: [{ name: "acf-user", source: "directory", path: userDir }],
        projectDir: projectRoot,
        settings,
      },
    );
  }

  test("keeps Claude's plugin data, unlike a removal", () => {
    const plan = moveToLoose(
      false,
      [settingsFile("user", userSettings, [])],
      [installed("moved@acf-user", "1.0.0", "user"), installed("gone@acf-user", "1.0.0", "user")],
    );
    expect(commands(plan)).toEqual([
      "claude plugin uninstall moved@acf-user --scope user --keep-data",
      "claude plugin uninstall gone@acf-user --scope user",
      "claude plugin marketplace remove acf-user",
    ]);
  });

  test("holds the last install when uninstalling would delete options Claude saved for it", () => {
    for (const plan of [
      moveToLoose(false, [settingsFile("user", userSettings, [], ["moved@acf-user"])]),
      moveToLoose(true, [settingsFile("user", userSettings, [])]),
      moveToLoose(false, [{ scope: "user", path: userSettings, settings: undefined }]),
    ]) {
      expect(commands(plan)).toEqual([]);
      expect(plan.plugins.map((p) => [p.id, p.action])).toEqual([["moved@acf-user", "kept"]]);
      expect(plan.keptBy).toEqual([]);
    }
  });

  test("uninstalls with --keep-data while another install keeps the saved options", () => {
    const plan = moveToLoose(
      true,
      [settingsFile("user", userSettings, [], ["moved@acf-user"])],
      [
        installed("moved@acf-user", "1.0.0", "user"),
        installed("moved@acf-user", "1.0.0", "local", true, "/home/u/other"),
      ],
    );
    expect(commands(plan)).toEqual([
      "claude plugin uninstall moved@acf-user --scope user --keep-data",
    ]);
  });
});

describe("removing caplet's marketplace", () => {
  const userSettings = "/home/u/.claude/settings.json";
  const projectSettings = `${projectRoot}/.claude/settings.json`;
  const localSettings = `${projectRoot}/.claude/settings.local.json`;

  function retire(
    target: { scope: "user" } | { scope: "project"; projectRoot: string },
    settings: ClaudeSettingsFile[],
  ) {
    const marketplace = claudeMarketplaceName(target);
    const marketplaceDir = target.scope === "user" ? userDir : projectDir;
    return planClaudeScope(
      { target, marketplaceDir, plugins: [], recorded: true },
      {
        plugins: [],
        marketplaces: [{ name: marketplace, source: "directory", path: marketplaceDir }],
        projectDir: projectRoot,
        settings,
      },
    );
  }

  test("runs when only caplet's own settings file declares it", () => {
    const plan = retire({ scope: "project", projectRoot }, [
      settingsFile("user", userSettings, ["acf-user"]),
      settingsFile("project", projectSettings, []),
      settingsFile("local", localSettings, [projectMarketplace]),
    ]);
    expect(commands(plan)).toEqual([`claude plugin marketplace remove ${projectMarketplace}`]);
    expect(plan.keptBy).toEqual([]);
  });

  test("is not run when another settings file it edits declares the marketplace", () => {
    const plan = retire({ scope: "user" }, [
      settingsFile("user", userSettings, ["acf-user"]),
      settingsFile("project", projectSettings, ["acf-user"]),
      settingsFile("local", localSettings, []),
    ]);
    expect(commands(plan)).toEqual([]);
    expect(plan.keptBy).toEqual([`${projectSettings} declares it`]);
  });

  test("is not run when a settings file it edits cannot be read", () => {
    const plan = retire({ scope: "project", projectRoot }, [
      { scope: "user", path: userSettings, settings: undefined },
      settingsFile("project", projectSettings, []),
      settingsFile("local", localSettings, [projectMarketplace]),
    ]);
    expect(commands(plan)).toEqual([]);
    expect(plan.keptBy).toEqual([`${userSettings} cannot be read`]);
  });
});
