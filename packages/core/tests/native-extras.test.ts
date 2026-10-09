import { expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import path from "node:path";
import type { AcfCapability, Diagnostic } from "../src";
import { nativeFiles, nativeFileTargets, readCapability, validateCapability } from "../src";
import {
  addSymlink,
  baseManifest,
  cleanup,
  makeCapability,
  readTempCapability,
  tempDir,
} from "./helpers";

// capability-model-layers, Inline native extras and File-level native extras;
// canonical-package-metadata, Per-target package values (task 4.2, validation side).

async function withCapability(
  files: Record<string, string>,
  check: (cap: AcfCapability) => void,
): Promise<void> {
  const { cap, dir } = await readTempCapability({ "acf.yml": baseManifest, ...files });
  try {
    check(cap);
  } finally {
    await cleanup(dir);
  }
}

const only = (cap: AcfCapability, code: string): Diagnostic[] =>
  cap.diagnostics.filter((d) => d.code === code);
const errorCodes = (cap: AcfCapability): string[] =>
  cap.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

const skill = (extra: string): Record<string, string> => ({
  "skills/review/SKILL.md": `---\nname: review\ndescription: Review code\n${extra}---\nBody\n`,
});
const server = (extra: string): Record<string, string> => ({
  "mcp/mcp.yml": `servers:\n  - name: docs\n    transport: stdio\n    command: node\n${extra}`,
});

test("inline native extras are accepted at package, skill and server level", async () => {
  await withCapability(
    {
      "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      displayName: Docs Kit\n`,
      ...skill("targets:\n  claude:\n    native:\n      when_to_use: Reviews\n"),
      ...server("    targets:\n      codex:\n        native:\n          required: true\n"),
    },
    (cap) => {
      expect(errorCodes(cap)).toEqual([]);
      // displayName is a pending package meaning; the other two keys are classified and silent.
      expect(cap.diagnostics.map((d) => d.code)).toEqual(["acf.core.pending"]);
    },
  );
});

test("an unknown native key is accepted with an info diagnostic", async () => {
  await withCapability(skill("targets:\n  pi:\n    native:\n      shiny: true\n"), (cap) => {
    const [diagnostic] = only(cap, "acf.extras.unclassified");
    expect(diagnostic?.severity).toBe("info");
    expect(diagnostic?.message).toContain("shiny");
    expect(errorCodes(cap)).toEqual([]);
  });
});

test("a native key the writer generates from a core field is acf.extras.conflict", async () => {
  await withCapability(
    skill("targets:\n  claude:\n    native:\n      description: Other\n"),
    (cap) => {
      expect(errorCodes(cap)).toEqual(["acf.extras.conflict"]);
      expect(only(cap, "acf.extras.conflict")[0]?.message).toContain("skill.description");
    },
  );
  await withCapability(
    skill("targets:\n  claude:\n    native:\n      disable-model-invocation: true\n"),
    (cap) => expect(errorCodes(cap)).toEqual(["acf.extras.conflict"]),
  );
  await withCapability(
    server("    targets:\n      codex:\n        native:\n          command: other\n"),
    (cap) => expect(errorCodes(cap)).toEqual(["acf.extras.conflict"]),
  );
  await withCapability(
    { "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      version: "2024.10"\n` },
    (cap) => {
      expect(errorCodes(cap)).toEqual(["acf.extras.conflict"]);
      expect(only(cap, "acf.extras.conflict")[0]?.message).toContain(
        "targets.claude.package.version",
      );
    },
  );
});

test("a known native key outside its native value domain is acf.extras.native-value-invalid", async () => {
  for (const files of [
    skill("targets:\n  claude:\n    native:\n      paths: 42\n"),
    skill("targets:\n  claude:\n    native:\n      effort: extreme\n"),
    server('    targets:\n      codex:\n        native:\n          enabled: "no"\n'),
    {
      "acf.yml": `${baseManifest}targets:\n  claude:\n    native:\n      defaultEnabled: yes please\n`,
    },
  ]) {
    await withCapability(files, (cap) => {
      expect(errorCodes(cap)).toEqual(["acf.extras.native-value-invalid"]);
      expect(only(cap, "acf.core.pending")).toEqual([]);
    });
  }
  await withCapability(skill("targets:\n  claude:\n    native:\n      paths: 42\n"), (cap) =>
    expect(only(cap, "acf.extras.native-value-invalid")[0]?.message).toContain(
      "targets.claude.native.paths",
    ),
  );
});

test("a pending meaning authored as an extra reports acf.core.pending naming the future field", async () => {
  await withCapability(
    skill(
      'targets:\n  claude:\n    native:\n      allowed-tools: "Bash(git status *)"\n      paths: ["src/**"]\n',
    ),
    (cap) => {
      const pending = only(cap, "acf.core.pending");
      expect(pending.map((d) => d.severity)).toEqual(["info", "info"]);
      expect(pending.map((d) => d.message).join("\n")).toContain("skill.allowed-tools");
      expect(pending.map((d) => d.message).join("\n")).toContain("skill.paths");
      expect(errorCodes(cap)).toEqual([]);
    },
  );
  await withCapability(
    server("    targets:\n      claude:\n        native:\n          timeout: 30000\n"),
    (cap) => expect(only(cap, "acf.core.pending")).toHaveLength(1),
  );
});

test("per-target package values accept generated manifest keys in the target's own domain", async () => {
  const manifest = (body: string): Record<string, string> => ({
    "acf.yml": `${baseManifest}targets:\n  ${body}`,
  });
  await withCapability(
    manifest(
      'claude:\n    package:\n      version: "2024.10"\n      author:\n        name: Ada\n        email: ada@example.com\n      keywords: [docs]\n',
    ),
    (cap) => expect(cap.diagnostics).toEqual([]),
  );
  for (const body of [
    "claude:\n    package:\n      name: other\n",
    "claude:\n    package:\n      icon: x.png\n",
    "claude:\n    package:\n      keywords: docs\n",
    "claude:\n    package:\n      author: Ada\n",
    "codex:\n    package:\n      version: 1.0.0\n",
  ]) {
    await withCapability(manifest(body), (cap) =>
      expect(errorCodes(cap)).toEqual(["acf.extras.package-value-invalid"]),
    );
  }
  await withCapability(skill("targets:\n  claude:\n    package:\n      version: x\n"), (cap) =>
    expect(errorCodes(cap)).toEqual(["acf.target.extension.unknown-field"]),
  );
});

test("native ACF may not author the agent-plugins dialect; reader output may", async () => {
  const files = skill("targets:\n  agent-plugins:\n    native:\n      x-key: 1\n");
  const { cap, dir } = await readTempCapability({ "acf.yml": baseManifest, ...files });
  try {
    const [error] = only(cap, "acf.target.unknown-id");
    expect(error?.message).toContain("format readers");
    cap.source = { format: "agent-plugins", formatVersion: "1.0", path: ".", snapshotRoot: dir };
    cap.diagnostics = [];
    validateCapability(cap);
    expect(cap.diagnostics).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});

test("native/<target>/ files are recorded per target with their executable bit", async () => {
  const dir = await tempDir();
  try {
    await makeCapability(dir, {
      "acf.yml": baseManifest,
      "native/claude/output-styles/terse.md": "Terse.\n",
      "native/claude/bin/tool": "#!/bin/sh\n",
      "native/claude/.lsp.json": "{}\n",
      "native/codex/notes.md": "Codex only.\n",
      "native/claude/skills/extra/SKILL.md": "---\nname: extra\ndescription: Extra\n---\n",
    });
    await chmod(path.join(dir, "native/claude/bin/tool"), 0o755);
    const cap = await readCapability(dir, "project", { kind: "local", directory: dir });
    expect(cap.diagnostics).toEqual([]);
    expect(nativeFileTargets(cap)).toEqual(["claude", "codex"]);
    expect(nativeFiles(cap, "claude")).toEqual([
      { target: "claude", path: ".lsp.json", executable: false },
      { target: "claude", path: "bin/tool", executable: true },
      { target: "claude", path: "output-styles/terse.md", executable: false },
      { target: "claude", path: "skills/extra/SKILL.md", executable: false },
    ]);
    expect(nativeFiles(cap, "pi")).toEqual([]);
    // Files under native/ are never read as ACF facets.
    expect(cap.skills).toEqual([]);
  } finally {
    await cleanup(dir);
  }
});

test("a native/<target>/ file that collides with generated plugin output is an error", async () => {
  await withCapability({ "native/claude/.claude-plugin/plugin.json": "{}\n" }, (cap) => {
    const [error] = only(cap, "acf.native.collision");
    expect(error?.severity).toBe("error");
    expect(error?.message).toContain("native/claude/.claude-plugin/plugin.json");
  });
  await withCapability({ ...skill(""), "native/claude/skills/review/notes.md": "x\n" }, (cap) =>
    expect(errorCodes(cap)).toEqual(["acf.native.collision"]),
  );
  await withCapability(
    { ...skill("except: [claude]\n"), "native/claude/skills/review/SKILL.md": "x\n" },
    (cap) => expect(errorCodes(cap)).toEqual([]),
  );
  await withCapability({ ...server(""), "native/claude/.mcp.json": "{}\n" }, (cap) =>
    expect(errorCodes(cap)).toEqual(["acf.native.collision"]),
  );
  await withCapability({ "native/claude/.mcp.json": "{}\n" }, (cap) =>
    expect(errorCodes(cap)).toEqual([]),
  );
});

test("native/ holds only target directories of regular files that stay inside the package", async () => {
  const dir = await tempDir();
  const outside = await tempDir();
  try {
    await makeCapability(dir, {
      "acf.yml": baseManifest,
      "native/README.md": "x\n",
      "native/nope/a.md": "x\n",
      "native/agent-plugins/a.md": "x\n",
      "native/claude/ok.md": "x\n",
    });
    await makeCapability(outside, { "secret.md": "x\n" });
    await addSymlink(path.join(outside, "secret.md"), path.join(dir, "native/claude/link.md"));
    const cap = await readCapability(dir, "project", { kind: "local", directory: dir });
    expect(errorCodes(cap).sort()).toEqual([
      "acf.native.unknown-target",
      "acf.native.unknown-target",
      "acf.native.unknown-target",
      "acf.native.unsupported-entry",
    ]);
    expect(nativeFiles(cap, "claude").map((file) => file.path)).toEqual(["ok.md"]);
  } finally {
    await cleanup(dir);
    await cleanup(outside);
  }
});

test("a linked native/ directory or target directory is rejected without reading through it", async () => {
  const outside = await tempDir();
  const linkedRoot = await tempDir();
  const linkedTarget = await tempDir();
  try {
    await makeCapability(outside, { "claude/secret.md": "x\n" });
    await makeCapability(linkedRoot, { "acf.yml": baseManifest });
    await addSymlink(outside, path.join(linkedRoot, "native"));
    await makeCapability(linkedTarget, { "acf.yml": baseManifest, "native/codex/a.md": "x\n" });
    await addSymlink(path.join(outside, "claude"), path.join(linkedTarget, "native/claude"));
    for (const dir of [linkedRoot, linkedTarget]) {
      const cap = await readCapability(dir, "project", { kind: "local", directory: dir });
      expect(errorCodes(cap)).toEqual(["acf.native.unsupported-entry"]);
      expect(nativeFiles(cap, "claude")).toEqual([]);
    }
  } finally {
    for (const dir of [outside, linkedRoot, linkedTarget]) await cleanup(dir);
  }
});

test("a __proto__ key is reported instead of silently dropped", async () => {
  const cases: Record<string, string>[] = [
    { "hooks/hooks.yml": "targets:\n  claude:\n    hooks:\n      __proto__: []\n" },
    server("    env:\n      __proto__: x\n"),
    skill("targets:\n  claude:\n    native:\n      __proto__: { a: 1 }\n"),
  ];
  for (const files of cases)
    await withCapability(files, (cap) =>
      expect(only(cap, "acf.schema.invalid-yaml").map((d) => d.message)).toEqual([
        expect.stringContaining("__proto__"),
      ]),
    );
});

test("a native/<target>/ file at or above a generated directory or file collides", async () => {
  for (const file of ["skills/review", "skills", ".claude-plugin", "Skills/Review"]) {
    await withCapability({ ...skill(""), [`native/claude/${file}`]: "x\n" }, (cap) =>
      expect([file, errorCodes(cap)]).toEqual([file, ["acf.native.collision"]]),
    );
  }
});

test("a native file is executable only with the owner execute bit, as the payload digest counts it", async () => {
  const dir = await tempDir();
  try {
    await makeCapability(dir, {
      "acf.yml": baseManifest,
      "native/claude/group.sh": "#!/bin/sh\n",
      "native/claude/owner.sh": "#!/bin/sh\n",
    });
    await chmod(path.join(dir, "native/claude/group.sh"), 0o654);
    await chmod(path.join(dir, "native/claude/owner.sh"), 0o744);
    const cap = await readCapability(dir, "project", { kind: "local", directory: dir });
    expect(nativeFiles(cap, "claude").map((file) => [file.path, file.executable])).toEqual([
      ["group.sh", false],
      ["owner.sh", true],
    ]);
  } finally {
    await cleanup(dir);
  }
});
