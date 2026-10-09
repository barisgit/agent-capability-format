/**
 * Capabilities shared by the executable-inventory tests. Each fixture lives in a temporary
 * directory that `cleanupFixtures` removes, so a test file registers it with `afterEach`.
 */
import { chmod } from "node:fs/promises";
import path from "node:path";
import {
  type AcfCapability,
  acfPathPlaceholders,
  executableChanges,
  executableComponents,
  readCapability,
  readClaudePluginPackage,
} from "../src";
import { cleanup, makeCapability, tempDir } from "./helpers";

const dirs: string[] = [];

/** Removes every directory the fixtures created so far. */
export async function cleanupFixtures(): Promise<void> {
  await Promise.all(dirs.splice(0).map(cleanup));
}

/** A fresh temporary directory that `cleanupFixtures` removes. */
export async function fixtureDir(): Promise<string> {
  const dir = await tempDir();
  dirs.push(dir);
  return dir;
}

/** The native ACF capability `files`, with the `executable` paths given the executable bit. */
export async function capability(
  files: Record<string, string>,
  executable: readonly string[] = [],
): Promise<AcfCapability> {
  const dir = await fixtureDir();
  await makeCapability(dir, files);
  for (const rel of executable) await chmod(path.join(dir, rel), 0o755);
  return await readCapability(dir, "project", { kind: "local", directory: dir });
}

/** The Claude plugin package `files` read as a foreign capability; `files` may replace its manifest. */
export async function foreignPlugin(files: Record<string, string>): Promise<AcfCapability> {
  const dir = await fixtureDir();
  await makeCapability(dir, {
    ".claude-plugin/plugin.json": '{"name":"test-cap","version":"1.0.0"}\n',
    ...files,
  });
  const { capability: cap } = await readClaudePluginPackage(dir, {
    scope: "project",
    origin: { kind: "local", directory: dir },
    revision: null,
  });
  if (cap === undefined) throw new Error("the plugin did not read as a capability");
  return cap;
}

/** `change kind name` for every component that differs between the two Claude inventories. */
export async function claudeChanges(
  before: AcfCapability,
  after: AcfCapability,
): Promise<string[]> {
  return executableChanges(
    await executableComponents(before, "claude"),
    await executableComponents(after, "claude"),
  ).map(({ change, kind, name }) => `${change} ${kind} ${name}`);
}

export const capabilityDir = acfPathPlaceholders[0];
export const pluginRoot = `${"$"}{CLAUDE_PLUGIN_ROOT}`;

/** An ACF `mcp/mcp.yml` with a stdio server `docs` that runs `server.js` and a remote server. */
export const stdioServer = `servers:\n  - name: docs\n    transport: stdio\n    command: node\n    args: ['${capabilityDir}/server.js', '--stdio']\n  - name: remote\n    transport: http\n    url: https://example.com/mcp\n`;
