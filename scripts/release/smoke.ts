/** Node-only consumer journey against the exact archives prepared for publication. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isolatedHomeEnv } from "../isolated-home.js";
import { fail, run } from "./process.js";
import { publishOrder, REPOSITORY_ROOT, tarballName } from "./workspaces.js";

const SMOKE_SCRIPT = `import { getSkills } from "@caplet/sdk";
import { provisionalOperations } from "@caplet/runtime-taxonomy";
import type { Diagnostic } from "@caplet/core";
import { ACF_DIAGNOSTIC_CODES } from "@caplet/core/diagnostics";
const skills = await getSkills({ target: "claude", scope: "project", cwd: process.cwd(), fetch: "never" });
const sample: Diagnostic = { severity: "info", code: "acf.smoke", message: "ok" };
console.log(skills.length, provisionalOperations.length, ACF_DIAGNOSTIC_CODES.length > 0, sample.code);
`;

/**
 * Installs the packed tarballs with npm into a fresh directory and drives them
 * with Node only: the CLI bin, a type-checked library import, and the main
 * project journey (init, then a dry-run apply).
 */
export function smoke(outDir: string): void {
  const packages = publishOrder();
  const tarballs = packages.map(({ manifest }) => path.resolve(outDir, tarballName(manifest)));
  const version = packages[0]?.manifest.version;
  if (version === undefined) fail("no publishable packages");
  const home = mkdtempSync(path.join(tmpdir(), "caplet-smoke-"));
  const project = path.join(home, "project");
  const env = { ...process.env, ...isolatedHomeEnv(home) };
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
        typeRoots: [path.join(REPOSITORY_ROOT, "node_modules/@types")],
        types: ["node"],
      },
      files: ["smoke.ts"],
    }),
  );
  execute("node", [
    path.join(REPOSITORY_ROOT, "node_modules/typescript/bin/tsc"),
    "-p",
    "tsconfig.json",
  ]);
  const output = execute("node", ["out/smoke.js"]).trim();
  const node = execute("node", ["--version"]).trim();
  console.log(`node ${node}: caplet -V ${reported}; library import printed: ${output}`);
}
