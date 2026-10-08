import { expect, test } from "bun:test";
import { ACF_DIAGNOSTIC_CODES } from "../src";

const coveredByFixtures = new Set([
  "acf.manifest.invalid-name",
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
  "acf.hooks.duplicate-file",
  "acf.hook.match.required",
  "acf.hook.effect.not-allowed",
  "acf.hook.run.args-and-shell",
  "acf.mcp.transport.missing-url",
  "acf.mcp.transport.missing-command",
  "acf.path.absolute",
  "acf.path.traversal",
  "acf.assets.missing",
  "acf.target.unknown-id",
  "acf.target.extension.unknown-field",
  "acf.runtime.unknown-operation",
  "acf.capabilities-yml.source.unknown-scheme",
]);

const exportedOnly = new Set([
  "acf.hook.target-native-event.unknown-schema",
  "acf.adapter.scope-unsupported",
  "acf.adapter.effect-degraded",
  "acf.adapter.hook-event-unsupported",
  "acf.adapter.trigger-unsupported",
  "acf.adapter.mcp-unsupported",
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
  "acf.resolve.capability-selector-direct-source",
  "acf.resolve.capability-selector-unmatched",
  "acf.lock.drift",
  "acf.lock.missing-entry",
  "acf.lock.unsupported-version",
  "acf.source.snapshot-rejected",
  "acf.emit.drift",
  "acf.emit.managed-notice-reserved-path",
  "acf.emit.managed-notice-destination-collision",
  "acf.cli.partial-implementation",
]);

test("VAL-DIAGNOSTIC-CODES exports every documented code", () => {
  const exported = [...ACF_DIAGNOSTIC_CODES] as string[];
  for (const code of [...coveredByFixtures, ...exportedOnly]) expect(exported).toContain(code);
  for (const code of exported)
    expect(coveredByFixtures.has(code) || exportedOnly.has(code)).toBe(true);
});
