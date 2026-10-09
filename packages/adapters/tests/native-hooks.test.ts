import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type AcfCapability,
  applyApplicability,
  capabilityCarrier,
  readCapability,
  type TargetAdapter,
} from "@caplet/core";
import { claudeAdapter, codexAdapter, cursorAdapter, opencodeAdapter, piAdapter } from "../src";
import { emitModel, fileText, withCode } from "./util/model";

const writers: Record<string, { adapter: TargetAdapter; root: string }> = {
  claude: { adapter: claudeAdapter, root: "/project/.claude" },
  codex: { adapter: codexAdapter, root: "/project/.codex" },
  cursor: { adapter: cursorAdapter, root: "/project/.cursor" },
  opencode: { adapter: opencodeAdapter, root: "/project/.opencode" },
  pi: { adapter: piAdapter, root: "/project/.pi" },
};

const dirs: string[] = [];

async function readHooksCapability(hooksYml: string): Promise<AcfCapability> {
  const root = await mkdtemp(path.join(tmpdir(), "acf-native-hooks-"));
  dirs.push(root);
  await mkdir(path.join(root, "hooks"));
  await writeFile(path.join(root, "acf.yml"), "acf: 1\nname: demo\nversion: 1.0.0\n");
  await writeFile(path.join(root, "hooks", "hooks.yml"), hooksYml);
  const capability = await readCapability(root, "project", { kind: "local", directory: root });
  expect(capability.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return capability;
}

/** The `acf:<capability>:<type or native:event>:<hook>` markers each native event of the target's settings file holds. */
async function emittedHooks(
  capability: AcfCapability,
  target: string,
): Promise<{ markers: Record<string, string[]>; diagnostics: string[] }> {
  const writer = writers[target];
  const applicable = applyApplicability(capability, target as "claude");
  if (writer === undefined || applicable === null) throw new Error(`no writer for ${target}`);
  // As caplet's workflow does, the writer receives what applies to its target.
  const result = await emitModel(writer.adapter, applicable, writer.root);
  const settings = fileText(result, `${writer.root}/settings.json`);
  const hooks =
    settings === undefined
      ? {}
      : (JSON.parse(settings) as { hooks: Record<string, Array<{ acfMarker: string }>> }).hooks;
  const markers = Object.fromEntries(
    Object.entries(hooks).map(([event, entries]) => [
      event,
      entries.map((entry) => entry.acfMarker),
    ]),
  );
  return {
    markers,
    diagnostics: withCode(result, "acf.adapter.facet-unsupported").map((d) => d.code),
  };
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

const run = (command: string) => `          run:\n            command: ${command}\n`;

test("family-level native hooks reach the hook writer of their own target only", async () => {
  const capability = await readHooksCapability(
    [
      "session_start:",
      "  - name: greet",
      "    run:",
      "      command: ./greet.sh",
      "    effect: observe",
      "targets:",
      "  claude:",
      "    hooks:",
      "      InstructionsLoaded:",
      "        - name: claude-extra",
      `${run("./claude.sh")}          effect: add_context`,
      "        - name: not-for-claude",
      "          except: [claude]",
      `${run("./never.sh")}          effect: observe`,
      "  codex:",
      "    hooks:",
      "      PreToolUse:",
      "        - name: codex-guard",
      `${run("./guard.sh")}          effect: observe`,
      "",
    ].join("\n"),
  );
  expect((await emittedHooks(capability, "claude")).markers).toEqual({
    InstructionsLoaded: ["acf:demo:native:InstructionsLoaded:claude-extra"],
    SessionStart: ["acf:demo:session_start:greet"],
  });
  expect((await emittedHooks(capability, "codex")).markers).toEqual({
    PreToolUse: ["acf:demo:native:PreToolUse:codex-guard"],
    SessionStart: ["acf:demo:session_start:greet"],
  });
  expect((await emittedHooks(capability, "opencode")).markers).toEqual({
    "session.start": ["acf:demo:session_start:greet"],
  });
  expect((await emittedHooks(capability, "pi")).markers).toEqual({
    session_start: ["acf:demo:session_start:greet"],
  });
});

test("native hooks alone keep a capability on loose Claude files, where they are written", async () => {
  const capability = await readHooksCapability(
    [
      "targets:",
      "  claude:",
      "    hooks:",
      "      InstructionsLoaded:",
      "        - name: claude-extra",
      `${run("./claude.sh")}          effect: add_context`,
      "",
    ].join("\n"),
  );
  const claude = applyApplicability(capability, "claude");
  if (claude === null) throw new Error("demo does not apply to claude");
  expect(capabilityCarrier(claude, "claude")).toBe("loose");
  expect((await emittedHooks(capability, "claude")).markers).toEqual({
    InstructionsLoaded: ["acf:demo:native:InstructionsLoaded:claude-extra"],
  });
  // Other targets receive nothing from a block that names Claude.
  const codex = applyApplicability(capability, "codex");
  expect(codex?.hooks?.native).toBeUndefined();
});

test("a target without hooks reports native hooks for it as unsupported", async () => {
  const capability = await readHooksCapability(
    [
      "targets:",
      "  cursor:",
      "    hooks:",
      "      afterFileEdit:",
      "        - name: cursor-edit",
      `${run("./edit.sh")}          effect: observe`,
      "",
    ].join("\n"),
  );
  const cursor = await emittedHooks(capability, "cursor");
  expect(cursor.markers).toEqual({});
  expect(cursor.diagnostics).toEqual(["acf.adapter.facet-unsupported"]);
  expect((await emittedHooks(capability, "claude")).diagnostics).toEqual([]);
});

test("hooks sharing a name across hook types and native events keep their own script and entry", async () => {
  const capability = await readHooksCapability(
    [
      "session_start:",
      "  - name: greet",
      "    run:",
      "      command: ./start.sh",
      "    effect: observe",
      "stop:",
      "  - name: greet",
      "    run:",
      "      command: ./stop.sh",
      "    effect: observe",
      "targets:",
      "  codex:",
      "    hooks:",
      "      SessionStart:",
      "        - name: greet",
      `${run("./native.sh")}          effect: observe`,
      "",
    ].join("\n"),
  );
  const applicable = applyApplicability(capability, "codex");
  if (applicable === null) throw new Error("demo does not apply to codex");
  const result = await emitModel(codexAdapter, applicable, "/project/.codex");
  const scripts = result.diffs
    .filter((diff) => diff.path.startsWith("/project/.codex/hooks/"))
    .map((diff) => [path.basename(diff.path), diff.after]);
  expect(scripts).toEqual([
    ["demo__native-SessionStart__greet", "#!/usr/bin/env sh\nexec './native.sh' \"$@\"\n"],
    ["demo__session_start__greet", "#!/usr/bin/env sh\nexec './start.sh' \"$@\"\n"],
    ["demo__stop__greet", "#!/usr/bin/env sh\nexec './stop.sh' \"$@\"\n"],
  ]);
  expect((await emittedHooks(capability, "codex")).markers).toEqual({
    SessionStart: ["acf:demo:session_start:greet", "acf:demo:native:SessionStart:greet"],
    Stop: ["acf:demo:stop:greet"],
  });
});

test("a hook entry written under its earlier name-only marker is replaced in place", async () => {
  const capability = await readHooksCapability(
    [
      "session_start:",
      "  - name: greet",
      "    run:",
      "      command: ./greet.sh",
      "    effect: observe",
      "",
    ].join("\n"),
  );
  const applicable = applyApplicability(capability, "codex");
  if (applicable === null) throw new Error("demo does not apply to codex");
  const before = JSON.stringify({
    hooks: { SessionStart: [{ acfMarker: "acf:demo:greet" }, { acfMarker: "user" }] },
  });
  const result = await emitModel(
    codexAdapter,
    applicable,
    "/project/.codex",
    {},
    {
      "/project/.codex/settings.json": before,
    },
  );
  const settings = result.diffs.find((diff) => diff.path === "/project/.codex/settings.json");
  expect(settings?.owns).toEqual([{ kind: "json-pointer", pointer: "/hooks/SessionStart/0" }]);
  const after = JSON.parse(String(settings?.after)) as {
    hooks: { SessionStart: Array<{ acfMarker: string }> };
  };
  expect(after.hooks.SessionStart.map((entry) => entry.acfMarker)).toEqual([
    "acf:demo:session_start:greet",
    "user",
  ]);
});
