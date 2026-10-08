import { acfPathPlaceholders } from "@caplet/core";

export type PlaceholderValues = {
  capabilityDir: string;
  hookDir: string;
  packageDir?: string | undefined;
};

export function substitutePlaceholders(value: string, values: PlaceholderValues): string {
  const packageDir = values.packageDir ?? values.capabilityDir;
  return value
    .replaceAll(acfPathPlaceholders[0], values.capabilityDir)
    .replaceAll(acfPathPlaceholders[1], packageDir)
    .replaceAll(acfPathPlaceholders[2], values.hookDir);
}

export function substituteStringArray(
  values: string[] | undefined,
  placeholders: PlaceholderValues,
): string[] | undefined {
  if (values === undefined) return undefined;
  return values.map((value) => substitutePlaceholders(value, placeholders));
}

export function substituteStringRecord(
  values: Record<string, string> | undefined,
  placeholders: PlaceholderValues,
): Record<string, string> | undefined {
  if (values === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      substitutePlaceholders(value, placeholders),
    ]),
  );
}
