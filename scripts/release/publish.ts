/** Fail-closed npm preflight and dependency-ordered publication of prepared archives. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compare } from "semver";
import { isRecord } from "../../packages/core/src/utils/guards.js";
import { releaseTag } from "./version.js";
import { type PackageManifest, publishOrder, REPOSITORY_ROOT, tarballName } from "./workspaces.js";

/**
 * Exact published archive integrity, or undefined only for npm E404.
 * Registry/network/auth failures and malformed metadata abort publication.
 */
export function publishedIntegrity(spec: string): string | undefined {
  const integrity = registryField(spec, "dist.integrity");
  if (integrity === undefined) return undefined;
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    throw new Error(`${spec}: npm did not return a SHA-512 integrity`);
  }
  return integrity;
}

function registryField(spec: string, field: string): unknown {
  try {
    const output = execFileSync(
      "npm",
      ["view", spec, field, "--json", "--registry=https://registry.npmjs.org"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    return JSON.parse(output) as unknown;
  } catch (error) {
    const stdout = isRecord(error) ? error.stdout : undefined;
    // npm --json exposes the error code separately from human-readable diagnostics.
    // Never mistake an E404 mentioned in another error's text for a missing version.
    if (typeof stdout === "string") {
      let response: unknown;
      try {
        response = JSON.parse(stdout);
      } catch {
        throw error;
      }
      if (isRecord(response) && isRecord(response.error) && response.error.code === "E404")
        return undefined;
    }
    throw error;
  }
}

function preflight(outDir: string): Set<string> {
  const existing = new Set<string>();
  for (const { manifest } of publishOrder()) {
    const spec = `${manifest.name}@${manifest.version}`;
    const bytes = readFileSync(path.resolve(outDir, tarballName(manifest)));
    const prepared = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const published = publishedIntegrity(spec);
    if (published !== undefined) {
      if (published !== prepared)
        throw new Error(`${spec}: published integrity differs from prepared tarball`);
      existing.add(spec);
    } else {
      assertTagNotSuperseded(manifest, spec);
    }
  }
  return existing;
}

/** Publishes only missing versions after every archive passes preflight; never overwrites npm bytes. */
export function publish(outDir: string): void {
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
        cwd: REPOSITORY_ROOT,
        stdio: "inherit",
      },
    );
    console.log(`published ${spec}`);
  }
}

/** A superseded retry may skip existing bytes but must never move a dist-tag backward. */
function assertTagNotSuperseded(manifest: PackageManifest, spec: string): void {
  const tags = registryField(manifest.name, "dist-tags");
  if (tags === undefined) return; // New package: npm returned E404.
  if (typeof tags !== "object" || tags === null) {
    throw new Error(`${spec}: npm did not return dist-tags`);
  }
  const tag = releaseTag(manifest.version);
  const destination = (tags as Record<string, unknown>)[tag];
  if (destination === undefined) return; // No destination tag exists yet.
  if (typeof destination !== "string" || compare(manifest.version, destination) < 0) {
    throw new Error(`${spec}: refusing to regress npm ${tag} from ${String(destination)}`);
  }
}
