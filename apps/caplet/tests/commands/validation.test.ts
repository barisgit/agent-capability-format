import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, runCaplet, writeText } from "../helpers";

for (const [label, body, code, message] of [
  [
    "unknown manifest key",
    "unknownFutureField: typo\n",
    "acf.manifest.invalid-field",
    "unknownFutureField",
  ],
  ["invalid SemVer", "", "acf.manifest.invalid-field", "SemVer"],
  [
    "unknown applicability target",
    "only: [cluade]\n",
    "acf.target.unknown-id",
    'did you mean "claude"?',
  ],
] as const) {
  test(`add and check reject ${label}`, async () => {
    const scope = await makeScope();
    try {
      const manifest = `acf: 1\nname: invalid-cap\nversion: ${label === "invalid SemVer" ? "01.0.0" : "1.0.0"}\n${body}`;
      const source = path.join(scope.sourceRoot, "invalid");
      await writeText(path.join(source, "acf.yml"), manifest);
      await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
      const args = ["--json", "--cwd", scope.cwd, "--scope", "project", "--target", "codex"];
      const preview = await runCaplet(scope, ["add", `path:${source}`, "--no-apply", ...args]);
      expect(preview.exitCode).toBe(2);
      const added = await runCaplet(scope, ["add", `path:${source}`, ...args]);
      expect(added.exitCode).toBe(2);
      expect(JSON.parse(added.stdout)).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            code,
            message: expect.stringContaining(message),
          }),
        ]),
      });
      await writeText(
        path.join(scope.agentsDir, "capabilities", "invalid-cap", "acf.yml"),
        manifest,
      );
      const checked = await runCaplet(scope, ["check", ...args]);
      expect(checked.exitCode).toBe(2);
      expect(JSON.parse(checked.stdout)).toMatchObject({
        ok: false,
        result: "invalid",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            code,
            message: expect.stringContaining(message),
          }),
        ]),
      });
    } finally {
      await cleanup(scope);
    }
  });
}

test("check rejects capabilities.yml target typos with a suggestion", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      "acf: 1\ncapabilities:\n  - source: path:./example\n    except: [cluade]\n",
    );
    const result = await runCaplet(scope, [
      "check",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "acf.target.unknown-id",
          message: expect.stringContaining('did you mean "claude"?'),
        }),
      ]),
    });
  } finally {
    await cleanup(scope);
  }
});
