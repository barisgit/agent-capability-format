import "./test-home.js";
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("publish preflights all packages, fails closed, and preserves dependency order", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "caplet-release-test-"));
  const bytes = "prepared archive bytes";
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const log = path.join(directory, "calls.jsonl");
  const packages = publishOrder();
  try {
    for (const { manifest } of packages) {
      writeFileSync(path.join(directory, tarballName(manifest)), bytes);
    }
    // The child process can never reach the real npm executable or registry.
    writeFileSync(
      path.join(directory, "npm"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "view") {
  if (args[2] === "dist-tags") {
    console.log(JSON.stringify({ latest: process.env.REGISTRY === "superseded" ? "99.0.0" : "0.0.1" }));
    process.exit(0);
  }
  if (["absent", "superseded", "network"].includes(process.env.REGISTRY)) {
    console.error("A diagnostic mentioning E404 must not mask network errors");
    console.log(JSON.stringify({ error: { code: process.env.REGISTRY !== "network" ? "E404" : "ENETUNREACH" } }));
    process.exit(1);
  }
  console.log(JSON.stringify(process.env.REGISTRY === "matching" ? process.env.INTEGRITY : "sha512-other"));
}
`,
      { mode: 0o755 },
    );
    for (const registry of ["absent", "matching", "different", "network", "superseded"]) {
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
            INTEGRITY: integrity,
          },
        },
      );
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
      const publishes = calls.filter((args) => args[0] === "publish");
      if (registry === "absent") {
        expect(result.status).toBe(0);
        expect(calls.slice(0, packages.length).every((args) => args[0] === "view")).toBe(true);
        expect(publishes.map((args) => path.basename(args[1] ?? ""))).toEqual(
          packages.map(({ manifest }) => tarballName(manifest)),
        );
        expect(publishes.every((args) => args.includes("latest"))).toBe(true);
      } else {
        expect(result.status).toBe(registry === "matching" ? 0 : 1);
        expect(publishes).toHaveLength(0);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
