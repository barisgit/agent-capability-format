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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail, run } from "./release/process.js";
import { publish } from "./release/publish.js";
import { smoke } from "./release/smoke.js";
import { publishOrder, REPOSITORY_ROOT, tarballName } from "./release/workspaces.js";

/** Tarball entries must be dist output plus the manifest, README, and LICENSE. */
const ALLOWED_ENTRY = /^package\/(dist\/.+|package\.json|README\.md|LICENSE)$/;
const REQUIRED_ENTRIES = ["package/package.json", "package/README.md", "package/LICENSE"];

function pack(outDir: string | undefined): void {
  if (outDir === undefined) fail("usage: pack <outDir>");
  const destination = path.resolve(outDir);
  for (const { dir, manifest } of publishOrder()) {
    run(
      "bun",
      ["pm", "pack", "--quiet", "--destination", destination],
      path.join(REPOSITORY_ROOT, dir),
    );
    const tarball = path.join(destination, tarballName(manifest));
    const entries = run("tar", ["-tzf", tarball], REPOSITORY_ROOT).split("\n").filter(Boolean);
    const unexpected = entries.filter((entry) => !ALLOWED_ENTRY.test(entry));
    const missing = REQUIRED_ENTRIES.filter((entry) => !entries.includes(entry));
    if (!entries.some((entry) => entry.startsWith("package/dist/"))) missing.push("package/dist/");
    const packed = run("tar", ["-xOzf", tarball, "package/package.json"], REPOSITORY_ROOT);
    if (unexpected.length > 0) fail(`${tarball} has unexpected files: ${unexpected.join(", ")}`);
    if (missing.length > 0) fail(`${tarball} is missing: ${missing.join(", ")}`);
    if (packed.includes("workspace:")) fail(`${tarball} still has workspace: dependency ranges`);
    console.log(`${tarball} (${entries.length} files)`);
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
      if (arg === undefined) fail("usage: smoke <outDir>");
      smoke(arg);
      break;
    case "publish":
      if (arg === undefined) fail("usage: publish <outDir>");
      publish(arg);
      break;
    default:
      fail("usage: bun scripts/packages.ts <list|pack|smoke|publish> [arg]");
  }
}
