import { expect, test } from "bun:test";
import path from "node:path";
import { z } from "zod";
import {
  ACF_DIAGNOSTIC_CODES,
  type AcfDiagnosticCode,
  type Diagnostic,
  pushZodIssues,
  readCapletConfig,
} from "../src";
import { baseManifest, cleanup, readTempCapability, tempDir, writeText } from "./helpers";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const registered = new Set<string>(ACF_DIAGNOSTIC_CODES);

/** Quoted `acf.<area>.<topic>` literals; two-segment names such as `acf.yml` are file names. */
const CODE_LITERAL = /["'`](acf\.[a-z0-9-]+\.[a-z0-9.-]*[a-z0-9])["'`]/g;

test("every diagnostic code the source emits is registered", async () => {
  const unregistered: string[] = [];
  for (const root of ["packages/*/src", "apps/caplet/src"]) {
    let found = 0;
    for await (const file of new Bun.Glob(`${root}/**/*.ts`).scan({ cwd: repoRoot })) {
      const text = await Bun.file(path.join(repoRoot, file)).text();
      for (const [, code] of text.matchAll(CODE_LITERAL)) {
        found += 1;
        if (code !== undefined && !registered.has(code)) unregistered.push(`${code} in ${file}`);
      }
    }
    // Guards against a glob that silently matches nothing.
    expect({ root, found: found > 0 }).toEqual({ root, found: true });
  }
  expect(unregistered).toEqual([]);
});

test("IMPLEMENTATION.md §11.2 documents exactly the registered codes", async () => {
  const doc = await Bun.file(path.join(repoRoot, "IMPLEMENTATION.md")).text();
  const section = doc.slice(doc.indexOf("### 11.2"), doc.indexOf("### 11.3"));
  const documented = [...section.matchAll(/^acf\.[a-z0-9.-]+/gm)].map(([code]) => code);
  expect(documented.sort()).toEqual([...registered].sort());
});

test("an unknown key takes the code of the file it was found in", () => {
  const unknownKey = (unknownKeyCode?: AcfDiagnosticCode): string[] => {
    const parsed = z.strictObject({ known: z.string().optional() }).safeParse({ extra: 1 });
    const diagnostics: Diagnostic[] = [];
    const options = { baseCode: "acf.mcp.invalid-field" as const };
    if (!parsed.success) {
      pushZodIssues(diagnostics, parsed.error, "file.yml", {
        ...options,
        ...(unknownKeyCode === undefined ? {} : { unknownKeyCode }),
      });
    }
    return diagnostics.map((diagnostic) => diagnostic.code);
  };
  expect(unknownKey("acf.target.extension.unknown-field")).toEqual([
    "acf.target.extension.unknown-field",
  ]);
  expect(unknownKey()).toEqual(["acf.mcp.invalid-field"]);
});

test("schema errors in every file take a registered code of that file", async () => {
  const registered = new Set<string>(ACF_DIAGNOSTIC_CODES);
  const cases: [string, string, string][] = [
    ["ACF.md", "---\nsections: nope\n---\nBody\n", "acf.markdown.invalid-frontmatter-field"],
    [
      "skills/review/SKILL.md",
      "---\nname: review\ndescription: 42\n---\nBody\n",
      "acf.markdown.invalid-frontmatter-field",
    ],
    [
      "skills/Bad_Name/SKILL.md",
      "---\nname: Bad_Name\ndescription: Review\n---\nBody\n",
      "acf.markdown.invalid-frontmatter-field",
    ],
    [
      "agents/reviewer.md",
      "---\nname: reviewer\ndescription: 42\n---\nBody\n",
      "acf.markdown.invalid-frontmatter-field",
    ],
    [
      "hooks/hooks.yml",
      "session_start:\n  - name: Bad Name\n    run: { command: x }\n    effect: observe\n",
      "acf.hooks.invalid-field",
    ],
    [
      "mcp/mcp.yml",
      "servers:\n  - name: Bad Name\n    transport: stdio\n    command: node\n",
      "acf.mcp.invalid-field",
    ],
  ];
  for (const [file, content, code] of cases) {
    const { dir, cap } = await readTempCapability({ "acf.yml": baseManifest, [file]: content });
    try {
      const errors = cap.diagnostics.filter((d) => d.severity === "error");
      expect({ file, codes: errors.map((d) => d.code) }).toEqual({ file, codes: [code] });
    } finally {
      await cleanup(dir);
    }
  }
  const dir = await tempDir();
  try {
    await writeText(path.join(dir, ".agents", "caplet.yml"), "emit:\n  scope: everywhere\n");
    const { diagnostics } = await readCapletConfig(dir);
    const codes = diagnostics.filter((d) => d.path?.startsWith(dir)).map((d) => d.code);
    expect(codes).toEqual(["acf.caplet-yml.invalid"]);
    for (const code of codes) expect(registered.has(code)).toBe(true);
  } finally {
    await cleanup(dir);
  }
});
