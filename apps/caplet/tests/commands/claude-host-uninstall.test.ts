/**
 * Claude host uninstall end to end: `caplet apply` of a deselected plugin and `caplet remove`
 * uninstall it and drop caplet's marketplace through the `claude` CLI before deleting files, and
 * without the CLI keep the files and list the commands. A shim on `PATH` replays the transcripts
 * recorded in task 5.1.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { readText, runCaplet, writeText } from "../helpers.js";
import {
  type ApplyJson,
  applyJson,
  applyWithoutCli,
  cleanupReviewScopes,
  NAME,
  pluginDir,
  READ,
  reviewScope,
  selectReview,
  userArgs,
  userHost,
} from "../support/claude-review.js";
import { atVersion, claudeMarketplaceDir } from "../support/claude-scenario.js";

afterEach(cleanupReviewScopes);

test("apply uninstalls a deselected plugin and removes the marketplace before deleting files", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  await selectReview(scope, path.join(scope.home, ".agents"), false);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "marketplace-remove",
    "list-json-empty",
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin marketplace remove acf-user",
    "claude plugin list --json",
  ]);
  expect(json.diagnostics).toEqual([]);
  expect(existsSync(claudeMarketplaceDir(scope, "user"))).toBe(false);
  const sidecar = JSON.parse(await readText(path.join(scope.home, ".claude", ".acf-managed.json")));
  expect(sidecar.marketplace).toBeUndefined();
});

test("without the CLI a deselected plugin keeps its files and the warning lists the uninstall", async () => {
  const scope = await reviewScope("user");
  await applyWithoutCli(scope);
  await selectReview(scope, path.join(scope.home, ".agents"), false);

  const { exitCode, json } = await applyJson(scope);

  expect(exitCode).toBe(0);
  expect(existsSync(pluginDir(scope))).toBe(true);
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.message).toContain(`claude plugin uninstall ${NAME}@acf-user --scope user`);
  expect(warning?.message).toContain("claude plugin marketplace remove acf-user");
});

test("remove uninstalls the plugin and removes the marketplace before deleting files", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "marketplace-remove",
    "list-json-empty",
  ]);

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"], host.env);

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin marketplace remove acf-user",
    "claude plugin list --json",
  ]);
  const json = JSON.parse(result.stdout) as ApplyJson;
  expect(json.diagnostics).toEqual([]);
  expect(existsSync(claudeMarketplaceDir(scope, "user"))).toBe(false);
  const sidecar = JSON.parse(await readText(path.join(scope.home, ".claude", ".acf-managed.json")));
  expect(sidecar.marketplace).toBeUndefined();
  expect(sidecar.managed.map((entry: { capability: string }) => entry.capability)).not.toContain(
    NAME,
  );
});

test("remove run from the home directory removes the marketplace only caplet's registration declares", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  // What `marketplace add --scope user` wrote. From the home directory the project settings file
  // is the user settings file, so it is caplet's own declaration, not another file's.
  await writeText(
    path.join(scope.home, ".claude", "settings.json"),
    JSON.stringify({
      extraKnownMarketplaces: {
        "acf-user": {
          source: { source: "directory", path: claudeMarketplaceDir(scope, "user") },
        },
      },
    }),
  );
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "marketplace-remove",
    "list-json-empty",
  ]);

  const result = await runCaplet(
    scope,
    ["remove", NAME, "--cwd", scope.home, "--scope", "user", "--target", "claude", "--json"],
    host.env,
  );

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin marketplace remove acf-user",
    "claude plugin list --json",
  ]);
  expect((JSON.parse(result.stdout) as ApplyJson).diagnostics).toEqual([]);
  expect(existsSync(claudeMarketplaceDir(scope, "user"))).toBe(false);
});

test("remove keeps a marketplace another Claude settings file declares, with an empty catalog", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  // `marketplace remove` run from the working directory would also drop this declaration.
  const projectSettings = path.join(scope.cwd, ".claude", "settings.json");
  await writeText(
    projectSettings,
    JSON.stringify({ extraKnownMarketplaces: { "acf-user": { source: { source: "directory" } } } }),
  );
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "list-json-empty",
  ]);

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"], host.env);

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin list --json",
  ]);
  const json = JSON.parse(result.stdout) as ApplyJson;
  const kept = json.diagnostics.find((d) => d.code === "acf.claude.marketplace-kept");
  expect(kept?.severity).toBe("warn");
  expect(kept?.message).toContain(projectSettings);
  expect(kept?.message).toContain("claude plugin marketplace remove acf-user");
  expect(existsSync(pluginDir(scope))).toBe(false);
  const catalog = JSON.parse(
    await readText(
      path.join(claudeMarketplaceDir(scope, "user"), ".claude-plugin", "marketplace.json"),
    ),
  );
  expect(catalog).toMatchObject({ name: "acf-user", plugins: [] });
  const sidecar = JSON.parse(await readText(path.join(scope.home, ".claude", ".acf-managed.json")));
  expect(sidecar.marketplace).toEqual({ name: "acf-user", scope: "user" });
});

test("without the CLI remove keeps the plugin files and the warning lists the uninstall", async () => {
  const scope = await reviewScope("user");
  await applyWithoutCli(scope);

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"]);

  expect(result.exitCode).toBe(0);
  expect(existsSync(pluginDir(scope))).toBe(true);
  const json = JSON.parse(result.stdout) as ApplyJson;
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.message).toContain(`claude plugin uninstall ${NAME}@acf-user --scope user`);
  expect(warning?.message).toContain("claude plugin marketplace remove acf-user");
});

test("without the CLI remove names what keeps the marketplace registered", async () => {
  const scope = await reviewScope("user");
  await applyWithoutCli(scope);
  const projectSettings = path.join(scope.cwd, ".claude", "settings.json");
  await writeText(
    projectSettings,
    JSON.stringify({ extraKnownMarketplaces: { "acf-user": { source: { source: "directory" } } } }),
  );

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"]);

  expect(result.exitCode).toBe(0);
  const json = JSON.parse(result.stdout) as ApplyJson;
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.message).toContain(`claude plugin uninstall ${NAME}@acf-user --scope user`);
  expect(warning?.message).not.toContain("marketplace remove");
  const kept = json.diagnostics.find((d) => d.code === "acf.claude.marketplace-kept");
  expect(kept?.message).toContain(projectSettings);
  expect(kept?.message).toContain("claude plugin marketplace remove acf-user");
  // The plugin is still installed, so its catalog entry stays.
  expect(kept?.message).not.toContain("empty catalog");
});
