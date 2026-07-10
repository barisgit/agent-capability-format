import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type FixtureScope = {
  dir: string;
  home: string;
  cwd: string;
  userAgentsDir: string;
  projectAgentsDir: string;
};

const fixturesDir = path.join(import.meta.dir, "fixtures");

export function fixturePath(name: string): string {
  return path.join(fixturesDir, name);
}

export async function makeFixtureScope(opts: {
  user?: string[];
  project?: string[];
  link?: boolean;
}): Promise<FixtureScope> {
  const dir = await mkdtemp(path.join(tmpdir(), "acf-sdk-"));
  const home = path.join(dir, "home");
  const project = path.join(dir, "project");
  const userAgentsDir = path.join(home, ".agents");
  const projectAgentsDir = path.join(project, ".agents");
  await mkdir(project, { recursive: true });
  await installCapabilities(userAgentsDir, opts.user ?? [], opts.link ?? false);
  await installCapabilities(projectAgentsDir, opts.project ?? [], opts.link ?? false);
  return { dir, home, cwd: project, userAgentsDir, projectAgentsDir };
}

export async function cleanupFixtureScope(scope: FixtureScope): Promise<void> {
  await rm(scope.dir, { recursive: true, force: true });
}

export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function installCapabilities(
  agentsDir: string,
  names: readonly string[],
  link: boolean,
): Promise<void> {
  await mkdir(path.join(agentsDir, "capabilities"), { recursive: true });
  for (const name of names) {
    const source = path.join(fixturesDir, name);
    const destination = path.join(agentsDir, "capabilities", name);
    if (link) await symlink(source, destination, "dir");
    else await cp(source, destination, { recursive: true });
  }
}
