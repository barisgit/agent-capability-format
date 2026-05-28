import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AcfCapability } from "../src";
import { readCapability } from "../src";

export async function tempDir(prefix = "acf-core-"): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

export async function makeCapability(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files))
    await writeText(path.join(root, rel), content);
}

export async function readTempCapability(
  files: Record<string, string>,
): Promise<{ dir: string; cap: AcfCapability }> {
  const dir = await tempDir();
  await makeCapability(dir, files);
  const cap = await readCapability(dir, "project", { kind: "local", directory: dir });
  return { dir, cap };
}

export function codes(cap: AcfCapability): string[] {
  return cap.diagnostics.map((diagnostic) => diagnostic.code);
}

export const baseManifest = "acf: 1\nname: test-cap\nversion: 1.0.0\n";

export async function addSymlink(target: string, linkPath: string): Promise<void> {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(target, linkPath);
}
