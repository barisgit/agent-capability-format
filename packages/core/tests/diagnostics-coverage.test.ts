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

const coveredByFixtures = new Set([
  "acf.manifest.invalid-name",
  "acf.manifest.invalid-field",
  "acf.manifest.acf-version-unknown",
  "acf.manifest.only-and-except",
  "acf.manifest.duplicate-file",
  "acf.capability.shadowed",
  "acf.capability.name-collision",
  "acf.facet.name-mismatch",
  "acf.facet.primary-missing",
  "acf.facet.duplicate",
  "acf.layout.singular-facet-folder",
  "acf.skill.shape.not-directory",
  "acf.instruction.debounce.requires-repeat-always",
  "acf.instruction.invalid-regex",
  "acf.applicability.empty",
  "acf.markdown.unknown-frontmatter-field",
  "acf.markdown.invalid-frontmatter-field",
  "acf.hooks.duplicate-file",
  "acf.hooks.invalid-field",
  "acf.hook.match.required",
  "acf.hook.effect.not-allowed",
  "acf.hook.run.args-and-shell",
  "acf.mcp.transport.missing-url",
  "acf.mcp.transport.missing-command",
  "acf.mcp.invalid-field",
  "acf.mcp.cwd.invalid",
  "acf.mcp.url.insecure",
  "acf.mcp.url.credential-in-url",
  "acf.mcp.placeholder.unsupported",
  "acf.mcp.placeholder.pending",
  "acf.skill.paths-not-core",
  "acf.skill.native-key-not-core",
  "acf.core.pending",
  "acf.extras.conflict",
  "acf.extras.unclassified",
  "acf.extras.package-value-invalid",
  "acf.extras.native-value-invalid",
  "acf.native.unknown-target",
  "acf.native.unsupported-entry",
  "acf.native.collision",
  "acf.path.absolute",
  "acf.path.traversal",
  "acf.assets.missing",
  "acf.target.unknown-id",
  "acf.target.extension.unknown-field",
  "acf.runtime.unknown-operation",
  "acf.capabilities-yml.source.unknown-scheme",
  "acf.caplet-yml.invalid",
]);

const exportedOnly = new Set([
  "acf.selection.unmatched",
  "acf.selection.remainder-references",
  "acf.hook.target-native-event.unknown-schema",
  "acf.adapter.scope-unsupported",
  "acf.adapter.effect-degraded",
  "acf.adapter.hook-event-unsupported",
  "acf.adapter.trigger-unsupported",
  "acf.adapter.facet-unsupported",
  "acf.assets.unsupported",
  "acf.adapter.not-registered",
  "acf.adapter.superseded",
  "acf.scope.project-not-found",
  "acf.runtime.case-folding",
  "acf.runtime.turn-granularity",
  "acf.runtime.family-unsupported",
  "acf.runtime.trigger-unsupported",
  "acf.taxonomy.operation.unmapped",
  "acf.capabilities-yml.duplicate-entry",
  // Built by the installer from a capabilities.yml value that fails its schema.
  "acf.capabilities-yml.invalid",
  // Built from capabilities.yml schema issues; installer/tests/capabilities-yml.test.ts covers it.
  "acf.capabilities-yml.unknown-key",
  "acf.resolve.capability-selector-direct-source",
  "acf.resolve.capability-selector-unmatched",
  "acf.lock.digest-mismatch",
  "acf.lock.drift",
  "acf.lock.missing-entry",
  "acf.lock.unsupported-version",
  "acf.source.snapshot-rejected",
  "acf.source.format-selected",
  "acf.source.format-not-found",
  "acf.source.format-version-unsupported",
  "acf.source.marketplace-unsupported",
  "acf.source.manifest-invalid",
  "acf.source.manifest-key-unknown",
  "acf.source.component-invalid",
  "acf.source.credential-in-url",
  "acf.emit.drift",
  "acf.emit.managed-notice-reserved-path",
  "acf.emit.managed-notice-destination-collision",
  "acf.cli.partial-implementation",
  // Built by targets/support-diagnostics.ts; group-4 writer fixtures cover them end to end.
  "acf.support.refused",
  "acf.support.degraded",
  "acf.support.component-omitted",
  "acf.extras.dropped",
  // Built by the Claude plugin writer; packages/adapters/tests/claude-plugin.test.ts covers them.
  "acf.claude.legacy-carrier",
  "acf.claude.plugin-file-ignored",
  "acf.claude.skills-option-ignored",
  // Built by the Codex MCP writer; adapters/tests/native-mcp.test.ts covers it.
  "acf.mcp.config-conflict",
]);

test("VAL-DIAGNOSTIC-CODES exports every documented code", () => {
  const exported = [...ACF_DIAGNOSTIC_CODES] as string[];
  for (const code of [...coveredByFixtures, ...exportedOnly]) expect(exported).toContain(code);
  for (const code of exported)
    expect(coveredByFixtures.has(code) || exportedOnly.has(code)).toBe(true);
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
