/** Main-push release eligibility: shared canonical SemVer, monotonic bumps, exact npm versions. */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishedIntegrity } from "./release/publish.js";
import { evaluateVersions } from "./release/version.js";
import { publishOrder } from "./release/workspaces.js";

function manifestVersion(text: string): string {
  const manifest: unknown = JSON.parse(text);
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  ) {
    throw new Error("Manifest must contain a string version");
  }
  return manifest.version;
}

function main(): void {
  const previous = process.argv[2];
  if (previous === undefined || !/^[a-f0-9]{40}$/.test(previous) || /^0+$/.test(previous)) {
    throw new Error(
      "usage: release-gate.ts <previous-commit-sha> (must be available in git history)",
    );
  }
  const packages = publishOrder();
  const files = ["package.json", ...packages.map(({ dir }) => `${dir}/package.json`)];
  const current = Object.fromEntries(
    files.map((file) => [file, manifestVersion(readFileSync(file, "utf8"))]),
  );
  const before = Object.fromEntries(
    files.map((file) => [
      file,
      manifestVersion(execFileSync("git", ["show", `${previous}:${file}`], { encoding: "utf8" })),
    ]),
  );
  const result = evaluateVersions(before, current);
  const missing = result.changed
    ? packages
        .filter(
          ({ manifest }) => publishedIntegrity(`${manifest.name}@${result.version}`) === undefined,
        )
        .map(({ manifest }) => manifest.name)
    : [];
  const publish = missing.length > 0;
  console.log(JSON.stringify({ ...result, publish, missing }, null, 2));
  if (process.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `publish=${publish}\nversion=${result.version}\nmissing=${JSON.stringify(missing)}\n`,
    );
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
