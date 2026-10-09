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

/** The `acf:<capability>:<hook>` markers each native event of the target's settings file holds. */
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
    InstructionsLoaded: ["acf:demo:claude-extra"],
    SessionStart: ["acf:demo:greet"],
  });
  expect((await emittedHooks(capability, "codex")).markers).toEqual({
    PreToolUse: ["acf:demo:codex-guard"],
    SessionStart: ["acf:demo:greet"],
  });
  expect((await emittedHooks(capability, "opencode")).markers).toEqual({
    "session.start": ["acf:demo:greet"],
  });
  expect((await emittedHooks(capability, "pi")).markers).toEqual({
    session_start: ["acf:demo:greet"],
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
    InstructionsLoaded: ["acf:demo:claude-extra"],
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
