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

/**
 * Whether TOML `text` already defines the table `tablePath`: a `[tablePath]` header or one below
 * it, a dotted key that lands inside it, or a value at `tablePath` or one of its ancestors (an
 * inline table such as `mcp_servers = { ... }` cannot be extended by a later header). Appending
 * a `[tablePath]` table to such a document would make it invalid TOML.
 *
 * Line-based: it understands comments, bare, quoted and dotted keys, table and array-of-tables
 * headers, and skips multi-line strings and the continuation lines of multi-line values. A
 * malformed line is ignored, so callers err toward reporting a definition only when one is
 * spelled out.
 */
export function tomlDefinesTable(text: string, tablePath: readonly string[]): boolean {
  let current: readonly string[] = [];
  let openString: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (openString !== undefined) {
      if (line.includes(openString)) openString = undefined;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      const header = parseHeader(trimmed);
      if (header === undefined) continue;
      current = header.path;
      if (startsWithPath(header.path, tablePath)) return true;
      if (header.array && startsWithPath(tablePath, header.path)) return true;
      continue;
    }
    const equals = indexOutsideQuotes(trimmed, "=");
    if (equals === -1) continue;
    const key = parseKeyPath(trimmed.slice(0, equals));
    if (key === undefined) continue;
    const full = [...current, ...key];
    if (startsWithPath(full, tablePath) || startsWithPath(tablePath, full)) return true;
    const value = trimmed.slice(equals + 1).trim();
    for (const quote of ['"""', "'''"]) {
      if (value.startsWith(quote) && !value.slice(quote.length).includes(quote)) {
        openString = quote;
      }
    }
  }
  return false;
}

function startsWithPath(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function parseHeader(line: string): { path: string[]; array: boolean } | undefined {
  const array = line.startsWith("[[");
  const open = array ? 2 : 1;
  const close = indexOutsideQuotes(line.slice(open), array ? "]]" : "]");
  if (close === -1) return undefined;
  const path = parseKeyPath(line.slice(open, open + close));
  return path === undefined ? undefined : { path, array };
}

/** Segments of a bare, quoted or dotted key, or undefined when `source` is not a key. */
function parseKeyPath(source: string): string[] | undefined {
  const segments: string[] = [];
  let rest = source.trim();
  while (rest.length > 0) {
    let segment: string | undefined;
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const end = indexOutsideQuotes(rest, rest[0] as string, 1);
      if (end === -1) return undefined;
      segment = unquote(rest.slice(0, end + 1));
      rest = rest.slice(end + 1).trim();
    } else {
      const match = /^[A-Za-z0-9_-]+/.exec(rest);
      if (match === null) return undefined;
      segment = match[0];
      rest = rest.slice(segment.length).trim();
    }
    if (segment === undefined) return undefined;
    segments.push(segment);
    if (rest.length === 0) break;
    if (!rest.startsWith(".")) return undefined;
    rest = rest.slice(1).trim();
  }
  return segments.length === 0 ? undefined : segments;
}

function unquote(quoted: string): string | undefined {
  if (quoted.startsWith("'")) return quoted.slice(1, -1);
  try {
    return JSON.parse(quoted) as string;
  } catch {
    return undefined;
  }
}

/**
 * Index of `needle` in `text` at or after `from`, skipping basic and literal strings, or -1.
 * Starting inside a string (`from` past its opening quote) finds that string's closing quote.
 */
function indexOutsideQuotes(text: string, needle: string, from = 0): number {
  let quote: string | undefined = from > 0 ? text[from - 1] : undefined;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== undefined) {
      if (quote === '"' && char === "\\") index += 1;
      else if (char === quote) {
        if (needle === quote) return index;
        quote = undefined;
      }
      continue;
    }
    if (text.startsWith(needle, index)) return index;
    if (char === '"' || char === "'") quote = char;
    else if (char === "#") return -1;
  }
  return -1;
}
