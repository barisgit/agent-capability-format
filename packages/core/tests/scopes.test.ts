import { expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { discoverScopes } from "../src";
import { cleanup, tempDir } from "./helpers";

test("scope discovery is local, accepts an optional manifest, and excludes user aliases", async () => {
  const dir = await tempDir("acf-scopes-");
  try {
    const home = path.join(dir, "home");
    const project = path.join(dir, "project");
    const nested = path.join(project, "nested");
    const alias = path.join(dir, "alias");
    await mkdir(path.join(home, ".agents"), { recursive: true });
    await mkdir(path.join(project, ".agents", "capabilities"), { recursive: true });
    await mkdir(nested);
    await mkdir(alias);
    await symlink(path.join(home, ".agents"), path.join(alias, ".agents"));
    const scopes = async (cwd: string) =>
      (await discoverScopes(cwd, home)).map((root) => root.scope);
    expect(await scopes(project)).toEqual(["user", "project"]);
    expect(await scopes(nested)).toEqual(["user"]);
    expect(await scopes(home)).toEqual(["user"]);
    expect(await scopes(alias)).toEqual(["user"]);
  } finally {
    await cleanup(dir);
  }
});
