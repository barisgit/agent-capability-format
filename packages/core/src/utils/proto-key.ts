/**
 * Throws when parsed YAML or JSON `value` has a `__proto__` key at any depth. The parsers keep
 * such a key as an own property, but schema parsing and plain assignment treat it as the
 * prototype and drop it silently, so a document carrying one is rejected instead. Callers parse
 * inside the `try` that already reports their malformed-document diagnostic.
 */
export function assertNoProtoKey(value: unknown): void {
  const at = protoKeyPath(value, []);
  if (at !== undefined)
    throw new Error(`the key "__proto__" at ${at} is not supported; rename or remove it`);
}

function protoKeyPath(value: unknown, at: string[]): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  for (const [key, child] of Object.entries(value)) {
    const childAt = [...at, key];
    if (key === "__proto__") return childAt.join(".");
    const found = protoKeyPath(child, childAt);
    if (found !== undefined) return found;
  }
  return undefined;
}
