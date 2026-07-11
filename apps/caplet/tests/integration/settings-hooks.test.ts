import { expect, test } from "bun:test";
import path from "node:path";
import { applyProject, cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

// Regression: a capability with a hook emits into the target settings.json via
// JSON-pointer ownership. A pre-existing user-authored settings.json must keep
// its own keys; only the ACF-owned /hooks/... region is touched. remove must
// strip the ACF hook entry while leaving user keys intact.
test("apply merges hooks into settings.json without clobbering user keys", async () => {
  const scope = await makeScope();
  try {
    // Give the alpha source a real hook facet.
    await writeText(
      path.join(scope.sourceRoot, "alpha", "hooks", "hooks.yml"),
      [
        "pre_tool:",
        "  - name: guard-bash",
        "    effect: observe",
        "    run:",
        '      command: "echo guard"',
        "    match:",
        '      operation: "Bash"',
        "",
      ].join("\n"),
    );

    // Pre-seed a user-authored project-scope settings.json.
    const settingsPath = path.join(scope.cwd, ".claude", "settings.json");
    await writeText(
      settingsPath,
      '{\n  "userKey": "KEEP-ME",\n  "permissions": { "allow": ["Bash(*)"] }\n}\n',
    );

    const apply = await applyProject(scope);
    expect(apply.exitCode).toBe(0);

    const merged = JSON.parse(await readText(settingsPath)) as {
      userKey?: string;
      permissions?: { allow?: string[] };
      hooks?: Record<string, unknown[]>;
    };
    expect(merged.userKey).toBe("KEEP-ME");
    expect(merged.permissions?.allow).toEqual(["Bash(*)"]);
    expect(merged.hooks?.PreToolUse?.length).toBe(1);

    const remove = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(remove.exitCode).toBe(0);

    const after = JSON.parse(await readText(settingsPath)) as {
      userKey?: string;
      permissions?: { allow?: string[] };
      hooks?: Record<string, unknown[]>;
    };
    expect(after.userKey).toBe("KEEP-ME");
    expect(after.permissions?.allow).toEqual(["Bash(*)"]);
    expect(after.hooks?.PreToolUse ?? []).toEqual([]);
  } finally {
    await cleanup(scope);
  }
});
