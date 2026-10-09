import { acfPathPlaceholders } from "@caplet/core";

/** Values of the ACF path placeholders (`acfPathPlaceholders`). */
export type PlaceholderValues = {
  capabilityDir: string;
  hookDir: string;
  /** Defaults to `capabilityDir` for a capability that is its own package. */
  packageDir?: string | undefined;
};

/** `value` with every ACF path placeholder replaced. */
export function substitutePlaceholders(value: string, values: PlaceholderValues): string {
  const packageDir = values.packageDir ?? values.capabilityDir;
  return value
    .replaceAll(acfPathPlaceholders[0], values.capabilityDir)
    .replaceAll(acfPathPlaceholders[1], packageDir)
    .replaceAll(acfPathPlaceholders[2], values.hookDir);
}

/** `substitutePlaceholders` over each item; undefined stays undefined. */
export function substituteStringArray(
  values: string[] | undefined,
  placeholders: PlaceholderValues,
): string[] | undefined {
  if (values === undefined) return undefined;
  return values.map((value) => substitutePlaceholders(value, placeholders));
}

/** `substitutePlaceholders` over each value; undefined stays undefined. */
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
