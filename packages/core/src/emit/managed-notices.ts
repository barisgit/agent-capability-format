import type { AcfOwnership, FacetFamily } from "../types/index.js";

export const MANAGEMENT_NOTICE_FILENAME = "ACF-MANAGED.md";
export const ACF_SYSTEM_OWNER = "acf-system";

export type RootInventoryArtifact = {
  capability: string;
  path: string;
  kind: "directory" | "file" | "shared";
  ownership: AcfOwnership["kind"][];
  facet?: { family: FacetFamily; name: string } | undefined;
};

export function renderArtifactNotice(capability: string): string {
  return (
    "# Managed by ACF\n\n" +
    "This directory is generated. Do not edit it directly.\n\n" +
    `Owning capability: \`${capability}\`\n\n` +
    "To make changes:\n\n" +
    "1. Find this capability in `capabilities.yml`.\n" +
    "2. Edit its declared source.\n" +
    "3. Run `caplet apply`.\n"
  );
}

export function renderRootInventory(input: readonly RootInventoryArtifact[]): string {
  const artifacts = deduplicateArtifacts(input);
  const capabilities = [...new Set(artifacts.map((artifact) => artifact.capability))].sort();
  const lines = [
    "# Artifacts managed by ACF",
    "",
    "This install root is shared. Only the artifacts listed below are managed by ACF.",
    "Do not edit listed artifacts or managed sections directly.",
    "",
    "To make changes, find the capability in `capabilities.yml`, edit its declared source,",
    "and run `caplet apply`.",
  ];
  for (const capability of capabilities) {
    lines.push("", `## \`${capability}\``, "");
    for (const artifact of artifacts.filter((item) => item.capability === capability)) {
      lines.push(`- \`${artifact.path}\` (${artifactLabel(artifact)})`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function deduplicateArtifacts(input: readonly RootInventoryArtifact[]): RootInventoryArtifact[] {
  const unique = new Map<string, RootInventoryArtifact>();
  for (const artifact of input) {
    const ownership = [...new Set(artifact.ownership)].sort();
    const normalized = { ...artifact, ownership };
    const key = [
      artifact.capability,
      artifact.path,
      artifact.kind,
      artifact.facet?.family ?? "",
      artifact.facet?.name ?? "",
      ownership.join(","),
    ].join("\0");
    unique.set(key, normalized);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.capability}\0${left.path}\0${left.kind}`.localeCompare(
      `${right.capability}\0${right.path}\0${right.kind}`,
    ),
  );
}

function artifactLabel(artifact: RootInventoryArtifact): string {
  if (artifact.kind === "directory") {
    const family = artifact.facet?.family ?? "artifact";
    const name = artifact.facet?.name;
    return name === undefined ? `${family} directory` : `${family} \`${name}\` directory`;
  }
  if (artifact.kind === "file") return "whole file";
  return `shared: ${artifact.ownership.map(ownershipLabel).sort().join(", ")}`;
}

function ownershipLabel(kind: AcfOwnership["kind"]): string {
  switch (kind) {
    case "file":
      return "whole file";
    case "json-pointer":
      return "JSON pointer";
    case "yaml-pointer":
      return "YAML pointer";
    case "toml-pointer":
      return "TOML pointer";
    case "marker":
      return "marker block";
  }
}
