import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readCapability } from "@caplet/core";
import { emissionSources } from "../../src/internal/emission-sources";
import { diskReadOnlyFs } from "../../src/internal/fs";
import { writeText } from "../helpers";

test("logical preview sources read disposable bytes and modes, not installed files or siblings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "caplet-emission-sources-"));
  try {
    const storage = path.join(root, "preview");
    const installed = path.join(root, "capabilities");
    const source = path.join(storage, "demo");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: demo\nversion: 1.0.0\n");
    await writeText(
      path.join(source, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Demo\n---\nRead guide.md.\n",
    );
    await writeText(path.join(source, "skills", "demo", "guide.md"), "preview bytes\n");
    await chmod(path.join(source, "skills", "demo", "guide.md"), 0o755);
    const logicalGuide = path.join(installed, "demo", "skills", "demo", "guide.md");
    await writeText(logicalGuide, "stale installed bytes\n");
    const output = path.join(root, "capabilities-sibling", "output.md");
    await writeText(output, "existing output\n");
    const capability = await readCapability(source, "project", {
      kind: "local",
      directory: source,
    });
    const preview = emissionSources(capability, diskReadOnlyFs(), storage, installed);
    const skill = preview.capability.skills[0];
    expect(skill?.dir).toBe(path.join(installed, "demo", "skills", "demo"));
    expect(await preview.fs.readText(logicalGuide)).toBe("preview bytes\n");
    expect(await preview.fs.readBytes(logicalGuide)).toEqual(
      new TextEncoder().encode("preview bytes\n"),
    );
    expect(await preview.fs.readMode(logicalGuide)).toBe(0o755);
    expect(await preview.fs.exists(logicalGuide)).toBe(true);
    expect((await preview.fs.listDir(path.dirname(logicalGuide))).sort()).toEqual([
      "SKILL.md",
      "guide.md",
    ]);
    expect(await preview.fs.readText(output)).toBe("existing output\n");
    expect(await diskReadOnlyFs().readText(logicalGuide)).toBe("stale installed bytes\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
