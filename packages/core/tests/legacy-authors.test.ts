import { expect, test } from "bun:test";
import path from "node:path";
import { computeContentHash, readCapability } from "../src";
import { baseManifest, cleanup, readTempCapability } from "./helpers";

// canonical-package-metadata, Legacy author strings (task 4.6, validation side).

const fixture = path.join(import.meta.dir, "fixtures/legacy-authors");

test("an existing acf.yml with author strings reads and hashes as before this change", async () => {
  const cap = await readCapability(fixture, "project", { kind: "local", directory: fixture });
  // Both values were produced by the pre-change code (main at a5699cf) on this fixture.
  expect(cap.diagnostics).toEqual([]);
  expect(await computeContentHash(fixture)).toBe(
    "sha256-0a1052e2cf3436722fe0759d9b3da3ecd1aa176a0b755e9f07492e21d4a383f4",
  );
  expect(cap.manifest.authors).toEqual([
    "Ada Lovelace <ada@example.com>",
    "The Docs Team",
    "Grace Hopper <grace@example.com> (maintainer)",
  ]);
});

test("authors accept structured entries beside strings and reject unknown author keys", async () => {
  const authors = (body: string) => ({ "acf.yml": `${baseManifest}authors:\n${body}` });
  const mixed = await readTempCapability(
    authors(
      "  - The Docs Team\n  - name: Ada\n    email: ada@example.com\n    url: https://ada.dev\n",
    ),
  );
  try {
    expect(mixed.cap.diagnostics).toEqual([]);
    expect(mixed.cap.manifest.authors).toEqual([
      "The Docs Team",
      { name: "Ada", email: "ada@example.com", url: "https://ada.dev" },
    ]);
  } finally {
    await cleanup(mixed.dir);
  }
  for (const body of ["  - email: ada@example.com\n", "  - name: Ada\n    twitter: ada\n"]) {
    const { cap, dir } = await readTempCapability(authors(body));
    try {
      expect(cap.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
    } finally {
      await cleanup(dir);
    }
  }
});
