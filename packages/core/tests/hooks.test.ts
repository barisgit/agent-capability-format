import { expect, test } from "bun:test";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("hooks require match for tool hooks, enforce effect matrix and args/shell", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "hooks/hooks.yml":
      "pre_tool:\n  - name: bad\n    run:\n      command: echo\n      args: ['x']\n      shell: bash\n    effect: add_context\n",
  });
  try {
    const got = codes(cap);
    expect(got).toContain("acf.hook.match.required");
    expect(got).toContain("acf.hook.effect.not-allowed");
    expect(got).toContain("acf.hook.run.args-and-shell");
  } finally {
    await cleanup(dir);
  }
});

test("duplicate hook family files are diagnosed", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "hooks/hooks.yml": "session_start: []\n",
    "hooks/hooks.yaml": "session_start: []\n",
  });
  try {
    expect(codes(cap)).toContain("acf.hooks.duplicate-file");
  } finally {
    await cleanup(dir);
  }
});
