import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyDiffs, detectDrift, readSidecar, removeOwnedRegions, writeSidecar } from "../src";
import { cleanup, makeScope, readText, writeText } from "./helpers";

test("sidecar round-trips and detects drift", async () => {
  const scope = await makeScope();
  try {
    const sidecarPath = path.join(scope.cwd, ".claude", ".acf-managed.json");
    await applyDiffs(
      [
        {
          path: path.join(scope.cwd, ".claude", "CLAUDE.md"),
          before: null,
          after: "<!-- acf:begin alpha.note -->\nhello\n<!-- acf:end alpha.note -->\n",
          owns: [{ kind: "marker", name: "alpha.note" }],
        },
      ],
      { installRoot: path.join(scope.cwd, ".claude"), capabilityName: "alpha-cap", sidecarPath },
    );
    const sidecar = await readSidecar(sidecarPath);
    expect(sidecar.managed).toHaveLength(1);
    const installRoot = path.join(scope.cwd, ".claude");
    const fs = { readText: (file: string) => readFileSync(path.join(installRoot, file), "utf8") };
    const clean = detectDrift(sidecar, fs);
    expect(clean).toHaveLength(0);
    await writeText(path.join(scope.cwd, ".claude", "CLAUDE.md"), "changed\n");
    const drift = detectDrift(sidecar, fs);
    expect(drift[0]?.code).toBe("acf.emit.drift");
  } finally {
    await cleanup(scope);
  }
});

test("removeOwnedRegions refuses to recursively delete a managed directory", async () => {
  const scope = await makeScope();
  try {
    const installRoot = path.join(scope.cwd, ".claude");
    const managedDirectory = path.join(installRoot, "skills");
    const sentinel = path.join(managedDirectory, "keep.txt");
    await writeText(sentinel, "keep\n");
    const sidecar = {
      acf: 1 as const,
      managed: [
        {
          path: "skills",
          owns: [{ kind: "file" as const }],
          capability: "alpha-cap",
          hash: "sha256-stale",
        },
      ],
    };

    await expect(removeOwnedRegions(sidecar, installRoot, "alpha-cap")).rejects.toThrow();
    expect(await readText(sentinel)).toBe("keep\n");
  } finally {
    await cleanup(scope);
  }
});

test("removeOwnedRegions cleans owned regions and preserves neighbours", async () => {
  const scope = await makeScope();
  try {
    const installRoot = path.join(scope.cwd, ".claude");
    await mkdir(installRoot, { recursive: true });
    await writeText(
      path.join(installRoot, "CLAUDE.md"),
      "user before\n<!-- acf:begin alpha.note -->\nowned\n<!-- acf:end alpha.note -->\nuser after\n",
    );
    const sidecar = {
      acf: 1 as const,
      managed: [
        {
          path: "CLAUDE.md",
          owns: [{ kind: "marker" as const, name: "alpha.note" }],
          capability: "alpha-cap",
          hash: "sha256-stale",
        },
      ],
    };
    const sidecarPath = path.join(installRoot, ".acf-managed.json");
    await writeSidecar(sidecarPath, sidecar);
    const result = await removeOwnedRegions(sidecar, installRoot, "alpha-cap");
    await writeSidecar(sidecarPath, result.sidecar);
    expect(await readText(path.join(installRoot, "CLAUDE.md"))).toBe("user before\nuser after\n");
    expect((await readSidecar(sidecarPath)).managed).toHaveLength(0);
  } finally {
    await cleanup(scope);
  }
});

test("sidecar entries record target, carrier and mode, and old entries are upgraded", async () => {
  const scope = await makeScope();
  try {
    const installRoot = path.join(scope.cwd, ".claude");
    const sidecarPath = path.join(installRoot, ".acf-managed.json");
    await mkdir(installRoot, { recursive: true });
    const legacy = { path: "old.md", owns: [{ kind: "file" }], capability: "beta-cap", hash: "x" };
    await writeFile(sidecarPath, `${JSON.stringify({ acf: 1, managed: [legacy] })}\n`);
    await applyDiffs(
      [
        {
          path: path.join(installRoot, "tool.sh"),
          before: null,
          after: "echo\n",
          afterMode: 0o755,
          owns: [{ kind: "file" }],
        },
      ],
      {
        installRoot,
        capabilityName: "alpha-cap",
        sidecarPath,
        owner: { target: "claude", carrier: "loose" },
      },
    );
    const sidecar = await readSidecar(sidecarPath);
    expect(sidecar.managed).toEqual([
      expect.objectContaining({ path: "old.md", target: "claude", carrier: "loose" }),
      expect.objectContaining({
        path: "tool.sh",
        capability: "alpha-cap",
        target: "claude",
        carrier: "loose",
        mode: 0o755,
      }),
    ]);
  } finally {
    await cleanup(scope);
  }
});

test("sidecar entries and their regions sort by code units, not by locale", async () => {
  const scope = await makeScope();
  try {
    const sidecarPath = path.join(scope.cwd, ".claude", ".acf-managed.json");
    const entry = (file: string) => ({
      path: file,
      owns: [
        { kind: "marker" as const, name: "b" },
        { kind: "marker" as const, name: "B" },
      ],
      capability: "alpha-cap",
      hash: "sha256-x",
    });
    await writeSidecar(sidecarPath, { acf: 1, managed: [entry("a.md"), entry("B.md")] });
    const written = JSON.parse(await readText(sidecarPath)) as {
      managed: Array<{ path: string; owns: Array<{ name: string }> }>;
    };
    expect(written.managed.map((item) => item.path)).toEqual(["B.md", "a.md"]);
    expect(written.managed[0]?.owns.map((own) => own.name)).toEqual(["B", "b"]);
  } finally {
    await cleanup(scope);
  }
});
