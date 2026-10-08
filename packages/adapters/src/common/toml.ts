/**
 * Minimal TOML rendering for the tables caplet writes into host config files (Codex
 * `config.toml`). Values are strings, finite numbers, booleans, arrays and string-keyed
 * records; records nest as inline tables. TOML has no null, so null and undefined values are
 * omitted from tables and arrays.
 */

/** Renders `[<path>]` followed by one `key = value` line per entry, in insertion order. */
export function renderTomlTable(
  tablePath: readonly string[],
  entries: Record<string, unknown>,
): string {
  const lines = [`[${tablePath.map(tomlKey).join(".")}]`];
  for (const [key, value] of presentEntries(entries))
    lines.push(`${tomlKey(key)} = ${tomlValue(value)}`);
  return `${lines.join("\n")}\n`;
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

function tomlString(value: string): string {
  // JSON string escapes are valid TOML basic-string escapes; TOML also forbids a raw DEL.
  return JSON.stringify(value).replaceAll("\u007f", "\\u007F");
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "nan";
    if (!Number.isFinite(value)) return value > 0 ? "inf" : "-inf";
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined).map(tomlValue);
    return `[${items.join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const pairs = presentEntries(value as Record<string, unknown>).map(
      ([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`,
    );
    return pairs.length === 0 ? "{}" : `{ ${pairs.join(", ")} }`;
  }
  throw new TypeError(`TOML cannot represent a ${typeof value} value`);
}

function presentEntries(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record).filter(([, value]) => value !== null && value !== undefined);
}
