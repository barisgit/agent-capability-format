import { expect, test } from "bun:test";
import { type RootInventoryArtifact, renderArtifactNotice, renderRootInventory } from "@acf/core";

const artifacts: RootInventoryArtifact[] = [
  {
    capability: "engineering-workflows",
    kind: "shared",
    path: "settings.json",
    ownership: ["json-pointer"],
  },
  {
    capability: "engineering-workflows",
    facet: { family: "skill", name: "diagnose" },
    kind: "directory",
    path: "skills/diagnose/",
    ownership: ["file"],
  },
  {
    capability: "alpha-tools",
    kind: "file",
    path: "agents/reviewer.md",
    ownership: ["file"],
  },
];

test("artifact notice is fixed, actionable, and source-agnostic", () => {
  const notice = renderArtifactNotice("engineering-workflows");
  expect(notice).toBe(
    "# Managed by ACF\n\n" +
      "This directory is generated. Do not edit it directly.\n\n" +
      "Owning capability: `engineering-workflows`\n\n" +
      "To make changes:\n\n" +
      "1. Find this capability in `capabilities.yml`.\n" +
      "2. Edit its declared source.\n" +
      "3. Run `caplet apply`.\n",
  );
  expect(notice).not.toContain("/Users/");
  expect(notice).not.toContain("http");
});

test("root inventory is deterministic, concise, and explicit about shared ownership", () => {
  const forward = renderRootInventory(artifacts);
  const reversed = renderRootInventory([...artifacts].reverse());
  expect(reversed).toBe(forward);
  expect(forward).toContain(
    "This install root is shared. Only the artifacts listed below are managed by ACF.",
  );
  expect(forward).toContain("## `alpha-tools`");
  expect(forward).toContain("- `agents/reviewer.md` (whole file)");
  expect(forward).toContain("## `engineering-workflows`");
  expect(forward).toContain("- `skills/diagnose/` (skill `diagnose` directory)");
  expect(forward).toContain("- `settings.json` (shared: JSON pointer)");
  expect(forward.match(/skills\/diagnose/g)).toHaveLength(1);
  expect(forward).not.toContain(".acf-managed.json");
});
