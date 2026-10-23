/**
 * Release tooling for the publishable workspace packages.
 *
 * The publish list and order are derived from the workspace manifests: every
 * non-private package under apps/ and packages/, sorted so each package follows
 * its internal dependencies. Nothing else lists the packages.
 *
 *   bun scripts/packages.ts list                 print package dirs in publish order
 *   bun scripts/packages.ts pack <outDir>        pack built packages into <outDir> and check their contents
 *   bun scripts/packages.ts smoke <outDir>       install the tarballs with npm and exercise them under Node
 *   bun scripts/packages.ts publish <outDir>     publish in order, accepting only identical published archives
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKSPACE_PARENTS = ["apps", "packages"];

type Manifest = {
  name: string;
  version: string;
  private?: boolean;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
};

type WorkspacePackage = { dir: string; manifest: Manifest };

function readManifest(file: string): Manifest {
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

/** Publishable workspace packages, each after the workspace packages it depends on. */
export function publishOrder(): WorkspacePackage[] {
  const byName = new Map<string, WorkspacePackage>();
  for (const parent of WORKSPACE_PARENTS) {
    for (const entry of readdirSync(path.join(ROOT, parent))) {
      const dir = path.join(parent, entry);
      const file = path.join(ROOT, dir, "package.json");
      if (!existsSync(file)) continue;
      const manifest = readManifest(file);
      if (manifest.private !== true) byName.set(manifest.name, { dir, manifest });
    }
  }
  const ordered: WorkspacePackage[] = [];
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    const pkg = byName.get(name);
    if (pkg === undefined || ordered.includes(pkg)) return;
    if (visiting.has(name)) throw new Error(`dependency cycle through ${name}`);
    visiting.add(name);
    for (const dep of Object.keys(pkg.manifest.dependencies ?? {}).sort()) visit(dep);
    visiting.delete(name);
    ordered.push(pkg);
  };
  for (const name of [...byName.keys()].sort()) visit(name);
  return ordered;
}

/** Stable archive filename shared by preparation and publication. */
export function tarballName(manifest: Manifest): string {
  return `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`;
}

function run(command: string, args: string[], cwd: string, env = process.env): string {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Tarball entries must be dist output plus the manifest, README, and LICENSE. */
const ALLOWED_ENTRY = /^package\/(dist\/.+|package\.json|README\.md|LICENSE)$/;
const REQUIRED_ENTRIES = ["package/package.json", "package/README.md", "package/LICENSE"];

function pack(outDir: string | undefined): void {
  if (outDir === undefined) fail("usage: pack <outDir>");
  const destination = path.resolve(outDir);
  for (const { dir, manifest } of publishOrder()) {
    run("bun", ["pm", "pack", "--quiet", "--destination", destination], path.join(ROOT, dir));
    const tarball = path.join(destination, tarballName(manifest));
    const entries = run("tar", ["-tzf", tarball], ROOT).split("\n").filter(Boolean);
    const unexpected = entries.filter((entry) => !ALLOWED_ENTRY.test(entry));
    const missing = REQUIRED_ENTRIES.filter((entry) => !entries.includes(entry));
    if (!entries.some((entry) => entry.startsWith("package/dist/"))) missing.push("package/dist/");
    const packed = run("tar", ["-xOzf", tarball, "package/package.json"], ROOT);
    if (unexpected.length > 0) fail(`${tarball} has unexpected files: ${unexpected.join(", ")}`);
    if (missing.length > 0) fail(`${tarball} is missing: ${missing.join(", ")}`);
    if (packed.includes("workspace:")) fail(`${tarball} still has workspace: dependency ranges`);
    console.log(`${tarball} (${entries.length} files)`);
  }
}

const SMOKE_SCRIPT = `import { getSkills } from "@caplet/sdk";
import { provisionalOperations } from "@caplet/runtime-taxonomy";
import type { Diagnostic } from "@caplet/core";
import { ACF_DIAGNOSTIC_CODES } from "@caplet/core/diagnostics";
const skills = await getSkills({ target: "claude", scope: "project", cwd: process.cwd(), fetch: "never" });
const sample: Diagnostic = { severity: "info", code: "acf.smoke", message: "ok" };
console.log(skills.length, provisionalOperations.length, ACF_DIAGNOSTIC_CODES.length > 0, sample.code);
`;

/**
 * Installs the packed tarballs from npm into a fresh directory and drives them
 * with Node only: the CLI bin, a type-checked library import, and the main
 * project journey (init, then a dry-run apply).
 */
function smoke(outDir: string | undefined): void {
  if (outDir === undefined) fail("usage: smoke <outDir>");
  const packages = publishOrder();
  const tarballs = packages.map(({ manifest }) => path.resolve(outDir, tarballName(manifest)));
  const version = packages[0]?.manifest.version ?? fail("no publishable packages");
  const home = mkdtempSync(path.join(tmpdir(), "caplet-smoke-"));
  const project = path.join(home, "project");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
  };
  const execute = (command: string, args: string[]): string => run(command, args, home, env);
  console.log(`smoke directory: ${home}`);
  writeFileSync(path.join(home, "package.json"), '{ "private": true, "type": "module" }\n');
  execute("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...tarballs]);

  const caplet = (...args: string[]): string => execute("npx", ["--no-install", "caplet", ...args]);
  const reported = caplet("-V").trim();
  if (reported !== version) fail(`caplet -V printed ${reported}, expected ${version}`);
  if (!caplet("--help").includes("USAGE")) fail("caplet --help did not print usage");
  mkdirSync(project);
  caplet("init", "-C", project);
  if (!existsSync(path.join(project, ".agents", "capabilities.yml")))
    fail("caplet init wrote nothing");
  caplet("apply", "--dry-run", "--scope", "project", "-C", project);

  writeFileSync(path.join(home, "smoke.ts"), SMOKE_SCRIPT);
  writeFileSync(
    path.join(home, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        target: "ES2022",
        strict: true,
        outDir: "out",
        typeRoots: [path.join(ROOT, "node_modules/@types")],
        types: ["node"],
      },
      files: ["smoke.ts"],
    }),
  );
  execute("node", [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);
  const output = execute("node", ["out/smoke.js"]).trim();
  const node = execute("node", ["--version"]).trim();
  console.log(`node ${node}: caplet -V ${reported}; library import printed: ${output}`);
}

/**
 * Exact published archive integrity, or undefined only for npm E404.
 * Registry/network/auth failures and malformed metadata abort publication.
 */
export function publishedIntegrity(spec: string): string | undefined {
  try {
    const output = execFileSync(
      "npm",
      ["view", spec, "dist.integrity", "--json", "--registry=https://registry.npmjs.org"],
      {
        cwd: ROOT,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    const integrity: unknown = JSON.parse(output);
    if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
      throw new Error(`${spec}: npm did not return a SHA-512 integrity`);
    }
    return integrity;
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    // npm --json exposes the error code separately from human-readable diagnostics.
    // Never mistake an E404 mentioned in another error's text for a missing version.
    if (typeof stdout === "string") {
      let response: unknown;
      try {
        response = JSON.parse(stdout);
      } catch {
        throw error;
      }
      if (
        typeof response === "object" &&
        response !== null &&
        "error" in response &&
        typeof response.error === "object" &&
        response.error !== null &&
        "code" in response.error &&
        response.error.code === "E404"
      )
        return undefined;
    }
    throw error;
  }
}

/** Stable releases, including 0.x, use latest; SemVer prereleases use next. */
export function releaseTag(version: string): "next" | "latest" {
  return version.split("+")[0]!.includes("-") ? "next" : "latest";
}

/** Existing versions are safe to skip only when npm has these exact bytes. */
export function assertIntegrity(spec: string, published: string, prepared: string): void {
  if (published !== prepared)
    throw new Error(`${spec}: published integrity differs from prepared tarball`);
}

function preflight(outDir: string): Set<string> {
  const existing = new Set<string>();
  for (const { manifest } of publishOrder()) {
    const spec = `${manifest.name}@${manifest.version}`;
    const bytes = readFileSync(path.resolve(outDir, tarballName(manifest)));
    const prepared = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const published = publishedIntegrity(spec);
    if (published !== undefined) {
      assertIntegrity(spec, published, prepared);
      existing.add(spec);
    }
  }
  return existing;
}

function publish(outDir: string | undefined): void {
  if (outDir === undefined) fail("usage: publish <outDir>");
  const existing = preflight(outDir);
  for (const { manifest } of publishOrder()) {
    const spec = `${manifest.name}@${manifest.version}`;
    if (existing.has(spec)) {
      console.log(`${spec} is already published; skipping`);
      continue;
    }
    // In the release workflow npm authenticates through trusted publishing (OIDC) and
    // attaches provenance itself. A local run uses the `npm login` session, so npm
    // gets the terminal to run its two-factor prompt or browser confirmation.
    execFileSync(
      "npm",
      [
        "publish",
        path.resolve(outDir, tarballName(manifest)),
        "--tag",
        releaseTag(manifest.version),
        "--registry=https://registry.npmjs.org",
      ],
      {
        cwd: ROOT,
        stdio: "inherit",
      },
    );
    console.log(`published ${spec}`);
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, arg] = process.argv.slice(2);
  switch (command) {
    case "list":
      for (const pkg of publishOrder()) console.log(pkg.dir);
      break;
    case "pack":
      pack(arg);
      break;
    case "smoke":
      smoke(arg);
      break;
    case "publish":
      publish(arg);
      break;
    default:
      fail("usage: bun scripts/packages.ts <list|pack|smoke|publish> [arg]");
  }
}
