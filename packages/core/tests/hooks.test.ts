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

test("an unknown key in a family-level target block is reported", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "hooks/hooks.yml": "targets:\n  claude:\n    hook: {}\n",
  });
  try {
    expect(codes(cap)).toEqual(["acf.target.extension.unknown-field"]);
  } finally {
    await cleanup(dir);
  }
});

const nativeEntry = (extra = "") =>
  `        - name: native\n          run:\n            command: ./native.sh\n          effect: observe\n${extra}`;

test("a family-level native hook entry gets the canonical entry checks", async () => {
  for (const [block, code] of [
    [`  nope:\n    hooks:\n      Event:\n${nativeEntry()}`, "acf.target.unknown-id"],
    [
      `  codex:\n    hooks:\n      Event:\n${nativeEntry("          only: [nope]\n")}`,
      "acf.target.unknown-id",
    ],
    [
      `  codex:\n    hooks:\n      Event:\n${nativeEntry("          targets:\n            codex:\n              bogus: 1\n")}`,
      "acf.target.extension.unknown-field",
    ],
    [
      "  codex:\n    hooks:\n      Event:\n        - name: native\n          run:\n            command: echo\n            args: ['x']\n            shell: bash\n          effect: observe\n",
      "acf.hook.run.args-and-shell",
    ],
  ] as const) {
    const { cap, dir } = await readTempCapability({
      "acf.yml": baseManifest,
      "hooks/hooks.yml": `targets:\n${block}`,
    });
    try {
      expect(codes(cap)).toEqual([code]);
    } finally {
      await cleanup(dir);
    }
  }
});

test("a family-level native hook entry applies to its own target only", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "hooks/hooks.yml": `targets:\n  codex:\n    hooks:\n      Event:\n${nativeEntry()}${nativeEntry("          only: [claude]\n")}${nativeEntry("          except: [pi]\n")}`,
  });
  try {
    expect(codes(cap)).toEqual([]);
    expect(cap.hooks?.native?.codex?.Event?.map((entry) => entry.only)).toEqual([
      ["codex"],
      [],
      ["codex"],
    ]);
  } finally {
    await cleanup(dir);
  }
});
