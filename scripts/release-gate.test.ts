import "./test-home.js";
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { evaluateVersions, releaseTag } from "./release/version.js";
import { publishOrder, tarballName } from "./release/workspaces.js";

const versions = (version: string) => ({ root: version, core: version, cli: version });

test("unchanged shared versions do not release", () => {
  expect(evaluateVersions(versions("0.1.0"), versions("0.1.0"))).toEqual({
    changed: false,
    version: "0.1.0",
  });
});

test("versions must be canonical SemVer and agree across all manifests", () => {
  for (const version of ["v0.1.0", "01.1.0", "1.0", "1.0.0-01", "garbage"]) {
    expect(() => evaluateVersions(versions("0.1.0"), versions(version))).toThrow();
  }
  expect(() =>
    evaluateVersions(versions("0.1.0"), { ...versions("0.2.0"), core: "0.1.0" }),
  ).toThrow("agree");
  expect(() => evaluateVersions({ ...versions("0.1.0"), cli: "0.0.9" }, versions("0.2.0"))).toThrow(
    "agree",
  );
});

test("changed versions must increase by SemVer precedence", () => {
  for (const [previous, current] of [
    ["0.1.0", "0.2.0"],
    ["1.0.0-rc.2", "1.0.0-rc.10"],
    ["1.0.0-rc.10", "1.0.0"],
  ] as const) {
    expect(evaluateVersions(versions(previous), versions(current)).changed).toBe(true);
    expect(() => evaluateVersions(versions(current), versions(previous))).toThrow("newer");
  }
  expect(() => evaluateVersions(versions("1.0.0+one"), versions("1.0.0+two"))).toThrow("newer");
});

test("stable 0.x uses latest; prereleases use next", () => {
  expect(releaseTag("0.1.0")).toBe("latest");
  expect(releaseTag("0.1.0+build-with-dash")).toBe("latest");
  expect(releaseTag("0.2.0-beta.1")).toBe("next");
});

test("gate retains changed versions for archive verification even when every npm version exists", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "caplet-gate-test-"));
  const root = path.resolve(import.meta.dirname, "..");
  try {
    cpSync(path.join(root, "scripts"), path.join(directory, "scripts"), { recursive: true });
    symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"));
    const files = ["package.json", ...publishOrder().map(({ dir }) => `${dir}/package.json`)];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      const manifest = JSON.parse(readFileSync(path.join(root, file), "utf8"));
      writeFileSync(path.join(directory, file), JSON.stringify({ ...manifest, version: "0.1.1" }));
    }
    const bin = path.join(directory, "bin");
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, "git"),
      "#!/usr/bin/env node\nconsole.log(JSON.stringify({ version: process.env.BEFORE_VERSION }));\n",
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(bin, "npm"),
      `#!/usr/bin/env node
console.log(JSON.stringify("sha512-" + Buffer.alloc(64, 42).toString("base64")));
`,
      { mode: 0o755 },
    );
    for (const before of ["0.1.0", "0.1.1"]) {
      const output = path.join(directory, "output");
      writeFileSync(output, "");
      const result = spawnSync(
        process.execPath,
        [path.join(directory, "scripts/release-gate.ts"), "a".repeat(40)],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            BEFORE_VERSION: before,
            GITHUB_OUTPUT: output,
          },
        },
      );
      expect(result.status).toBe(0);
      const changed = before === "0.1.0";
      expect(JSON.parse(result.stdout)).toEqual({ changed, version: "0.1.1" });
      expect(readFileSync(output, "utf8")).toBe(`changed=${changed}\nversion=0.1.1\n`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("publish preflights all packages, fails closed, and preserves dependency order", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "caplet-release-test-"));
  const integrities: Record<string, string> = {};
  const log = path.join(directory, "calls.jsonl");
  const packages = publishOrder();
  try {
    for (const { manifest } of packages) {
      const spec = `${manifest.name}@${manifest.version}`;
      const bytes = `prepared archive bytes for ${spec}`;
      writeFileSync(path.join(directory, tarballName(manifest)), bytes);
      integrities[spec] = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    }
    // The child process can never reach the real npm executable or registry.
    writeFileSync(
      path.join(directory, "npm"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "whoami") {
  if (process.env.NPM_SESSION === "expired") {
    console.error("npm error code ENEEDAUTH");
    process.exit(1);
  }
  console.log("maintainer");
}
if (args[0] === "publish" && process.env.NPM_SESSION === "expired" && process.env.GITHUB_ACTIONS !== "true") {
  console.error("npm error E404 Not Found - PUT");
  process.exit(1);
}
if (args[0] === "view") {
  if (args[2] === "dist-tags") {
    console.log(JSON.stringify({ latest: process.env.REGISTRY === "superseded" ? "99.0.0" : "0.0.1" }));
    process.exit(0);
  }
  const integrities = JSON.parse(process.env.INTEGRITIES);
  const last = args[1] === Object.keys(integrities).at(-1);
  if (["absent", "superseded", "network"].includes(process.env.REGISTRY) || (process.env.REGISTRY === "mixed" && last)) {
    console.error("A diagnostic mentioning E404 must not mask network errors");
    console.log(JSON.stringify({ error: { code: process.env.REGISTRY !== "network" ? "E404" : "ENETUNREACH" } }));
    process.exit(1);
  }
  const matches = ["matching", "mixed"].includes(process.env.REGISTRY) || (process.env.REGISTRY === "different-last" && !last);
  console.log(JSON.stringify(matches ? integrities[args[1]] : "sha512-" + Buffer.alloc(64, 42).toString("base64")));
}
`,
      { mode: 0o755 },
    );
    for (const [registry, session, githubActions] of [
      ["absent", "expired", ""],
      ["absent", "valid", ""],
      ["matching", "valid", ""],
      ["mixed", "valid", ""],
      ["different", "valid", ""],
      ["different-last", "valid", ""],
      ["network", "valid", ""],
      ["superseded", "valid", ""],
      ["absent", "expired", "true"],
    ]) {
      writeFileSync(log, "");
      const result = spawnSync(
        process.execPath,
        [path.join(import.meta.dirname, "packages.ts"), "publish", directory],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            CALL_LOG: log,
            REGISTRY: registry,
            NPM_SESSION: session,
            GITHUB_ACTIONS: githubActions,
            INTEGRITIES: JSON.stringify(integrities),
          },
        },
      );
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
      const publishes = calls.filter((args) => args[0] === "publish");
      if (session === "expired" && githubActions !== "true") {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unable to verify npm authentication. Run `npm login`");
        expect(result.stderr).not.toContain("E404 Not Found - PUT");
        expect(publishes).toHaveLength(0);
        expect(calls[0]).toEqual(["whoami", "--registry=https://registry.npmjs.org"]);
      } else if (registry === "absent" || registry === "mixed") {
        expect(result.status).toBe(0);
        if (githubActions === "true") {
          expect(calls.some((args) => args[0] === "whoami")).toBe(false);
        } else {
          expect(calls[0]?.[0]).toBe("whoami");
        }
        const registryCalls = calls.filter((args) => args[0] !== "whoami");
        expect(registryCalls.slice(0, packages.length).every((args) => args[0] === "view")).toBe(
          true,
        );
        expect(publishes.map((args) => path.basename(args[1] ?? ""))).toEqual(
          (registry === "mixed" ? packages.slice(-1) : packages).map(({ manifest }) =>
            tarballName(manifest),
          ),
        );
        expect(publishes.every((args) => args.includes("latest"))).toBe(true);
      } else {
        expect(result.status).toBe(registry === "matching" ? 0 : 1);
        expect(publishes).toHaveLength(0);
        if (registry === "different" || registry === "different-last") {
          expect(result.stderr).toContain("published integrity differs from prepared tarball");
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
