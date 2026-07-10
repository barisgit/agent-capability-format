type JsonContainer = Record<string, unknown> | unknown[];

type ObjectProperty = { key: string; propStart: number; valueStart: number; valueEnd: number };
type ArrayElement = { index: number; valueStart: number; valueEnd: number };

export function mergeJson(currentText: string | null, pointer: string, newValue: unknown): string {
  if (currentText === null || currentText.trim() === "") {
    const root = {};
    setJsonPointer(root, pointer, newValue);
    return `${JSON.stringify(root, null, 2)}\n`;
  }
  JSON.parse(currentText);
  return mergeJsonText(currentText, pointer, newValue);
}

export function readJsonObject(currentText: string | null): Record<string, unknown> {
  return parseJsonObject(currentText);
}

export function jsonPointerEscape(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function mergeJsonText(text: string, pointer: string, newValue: unknown): string {
  const segments = decodePointer(pointer);
  const rootStart = skipWhitespace(text, 0);
  const rootEnd = trimEnd(text, text.length);
  if (text[rootStart] !== "{") throw new Error("JSON root must be an object");
  return mergeAt(text, { start: rootStart, end: rootEnd, kind: "object" }, segments, 0, newValue);
}

function mergeAt(
  text: string,
  container: { start: number; end: number; kind: "object" | "array" },
  segments: string[],
  index: number,
  newValue: unknown,
): string {
  const segment = segments[index];
  if (segment === undefined) throw new Error("JSON pointer ended before value");
  const isLast = index === segments.length - 1;
  if (container.kind === "object") {
    const property = findObjectProperty(text, container.start, container.end, segment);
    if (property === null) {
      return insertObjectProperty(text, container.start, container.end, segment, buildFromSegments(segments, index + 1, newValue));
    }
    if (isLast) return replaceRange(text, property.valueStart, property.valueEnd, formatValue(newValue, lineIndentAt(text, property.valueStart)));
    const child = containerAt(text, property.valueStart, property.valueEnd);
    if (child === null) {
      return replaceRange(text, property.valueStart, property.valueEnd, formatValue(buildFromSegments(segments, index + 1, newValue), lineIndentAt(text, property.valueStart)));
    }
    return mergeAt(text, child, segments, index + 1, newValue);
  }

  const element = findArrayElement(text, container.start, container.end, segment);
  if (element === null) {
    return appendArrayElement(text, container.start, container.end, buildFromSegments(segments, index + 1, newValue));
  }
  if (isLast) return replaceRange(text, element.valueStart, element.valueEnd, formatValue(newValue, lineIndentAt(text, element.valueStart)));
  const child = containerAt(text, element.valueStart, element.valueEnd);
  if (child === null) {
    return replaceRange(text, element.valueStart, element.valueEnd, formatValue(buildFromSegments(segments, index + 1, newValue), lineIndentAt(text, element.valueStart)));
  }
  return mergeAt(text, child, segments, index + 1, newValue);
}

function parseJsonObject(currentText: string | null): Record<string, unknown> {
  if (currentText === null || currentText.trim() === "") return {};
  const parsed: unknown = JSON.parse(currentText);
  if (isRecord(parsed)) return { ...parsed };
  return {};
}

function setJsonPointer(root: Record<string, unknown>, pointer: string, newValue: unknown): void {
  const segments = decodePointer(pointer);
  let cursor: JsonContainer = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) throw new Error("invalid JSON pointer segment");
    const isLast = index === segments.length - 1;
    if (isLast) {
      assign(cursor, segment, newValue);
      return;
    }
    const nextSegment = segments[index + 1];
    if (nextSegment === undefined) throw new Error("invalid JSON pointer segment");
    const existing = readChild(cursor, segment);
    if (isContainer(existing)) {
      cursor = existing;
      continue;
    }
    const created: JsonContainer = nextSegment === "-" || isArrayIndex(nextSegment) ? [] : {};
    assign(cursor, segment, created);
    cursor = created;
  }
}

function decodePointer(pointer: string): string[] {
  if (pointer === "") throw new Error("JSON pointer must not be empty");
  if (!pointer.startsWith("/")) throw new Error(`JSON pointer must start with /: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function buildFromSegments(segments: string[], index: number, value: unknown): unknown {
  const segment = segments[index];
  if (segment === undefined) return value;
  if (segment === "-" || isArrayIndex(segment)) {
    const out: unknown[] = [];
    const targetIndex = segment === "-" ? 0 : Number(segment);
    for (let fill = 0; fill < targetIndex; fill += 1) out.push(null);
    out[targetIndex] = buildFromSegments(segments, index + 1, value);
    return out;
  }
  return { [segment]: buildFromSegments(segments, index + 1, value) };
}

function findObjectProperty(text: string, start: number, end: number, key: string): ObjectProperty | null {
  let cursor = skipWhitespace(text, start + 1);
  while (cursor < end) {
    if (text[cursor] === "}") return null;
    const propStart = cursor;
    const parsedKey = readString(text, cursor);
    cursor = skipWhitespace(text, parsedKey.end);
    if (text[cursor] !== ":") throw new Error("invalid JSON object");
    const valueStart = skipWhitespace(text, cursor + 1);
    const valueEnd = skipValue(text, valueStart);
    if (parsedKey.value === key) return { key, propStart, valueStart, valueEnd };
    cursor = skipWhitespace(text, valueEnd);
    if (text[cursor] === ",") cursor = skipWhitespace(text, cursor + 1);
  }
  return null;
}

function findArrayElement(text: string, start: number, end: number, segment: string): ArrayElement | null {
  let cursor = skipWhitespace(text, start + 1);
  let index = 0;
  const wanted = segment === "-" ? -1 : Number(segment);
  if (segment !== "-" && (!Number.isInteger(wanted) || wanted < 0)) throw new Error(`invalid array index: ${segment}`);
  while (cursor < end) {
    if (text[cursor] === "]") return null;
    const valueStart = cursor;
    const valueEnd = skipValue(text, valueStart);
    if (index === wanted) return { index, valueStart, valueEnd };
    index += 1;
    cursor = skipWhitespace(text, valueEnd);
    if (text[cursor] === ",") cursor = skipWhitespace(text, cursor + 1);
  }
  return null;
}

function insertObjectProperty(text: string, start: number, end: number, key: string, value: unknown): string {
  const close = findContainerClose(text, start, end, "}");
  const empty = skipWhitespace(text, start + 1) === close;
  const closeIndent = lineIndentAt(text, close);
  const childIndent = `${closeIndent}  `;
  const property = `${childIndent}${JSON.stringify(key)}: ${formatValue(value, childIndent)}`;
  if (empty) return replaceRange(text, close, close, `\n${property}\n${closeIndent}`);
  const insertPos = trimEnd(text, close);
  return replaceRange(text, insertPos, insertPos, `,\n${property}`);
}

function appendArrayElement(text: string, start: number, end: number, value: unknown): string {
  const close = findContainerClose(text, start, end, "]");
  const empty = skipWhitespace(text, start + 1) === close;
  const closeIndent = lineIndentAt(text, close);
  const childIndent = `${closeIndent}  `;
  const rendered = `${childIndent}${formatValue(value, childIndent)}`;
  if (empty) return replaceRange(text, close, close, `\n${rendered}\n${closeIndent}`);
  const insertPos = trimEnd(text, close);
  return replaceRange(text, insertPos, insertPos, `,\n${rendered}`);
}

function containerAt(text: string, start: number, end: number): { start: number; end: number; kind: "object" | "array" } | null {
  const valueStart = skipWhitespace(text, start);
  const char = text[valueStart];
  if (char === "{") return { start: valueStart, end, kind: "object" };
  if (char === "[") return { start: valueStart, end, kind: "array" };
  return null;
}

function findContainerClose(text: string, start: number, end: number, closeChar: "}" | "]"): number {
  let cursor = trimEnd(text, end) - 1;
  while (cursor > start && text[cursor] !== closeChar) cursor -= 1;
  if (text[cursor] !== closeChar) throw new Error("invalid JSON container");
  return cursor;
}

function skipValue(text: string, start: number): number {
  const char = text[start];
  if (char === "\"") return readString(text, start).end;
  if (char === "{" || char === "[") return skipContainer(text, start);
  let cursor = start;
  while (cursor < text.length && !",]}\n\r\t ".includes(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function skipContainer(text: string, start: number): number {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let cursor = start;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "\"") {
      cursor = readString(text, cursor).end;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  throw new Error("unterminated JSON container");
}

function readString(text: string, start: number): { value: string; end: number } {
  let cursor = start + 1;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (char === "\"") {
      const raw = text.slice(start, cursor + 1);
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "string") throw new Error("invalid JSON string");
      return { value, end: cursor + 1 };
    }
    cursor += 1;
  }
  throw new Error("unterminated JSON string");
}

function readChild(container: JsonContainer, segment: string): unknown {
  if (Array.isArray(container)) {
    if (segment === "-") return undefined;
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) return undefined;
    return container[index];
  }
  return container[segment];
}

function assign(container: JsonContainer, segment: string, value: unknown): void {
  if (Array.isArray(container)) {
    if (segment === "-") {
      container.push(value);
      return;
    }
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) throw new Error(`invalid array index: ${segment}`);
    container[index] = value;
    return;
  }
  container[segment] = value;
}

function formatValue(value: unknown, indent: string): string {
  return JSON.stringify(value, null, 2).replaceAll("\n", `\n${indent}`);
}

function replaceRange(text: string, start: number, end: number, replacement: string): string {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function skipWhitespace(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && "\n\r\t ".includes(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function trimEnd(text: string, end: number): number {
  let cursor = end;
  while (cursor > 0 && "\n\r\t ".includes(text[cursor - 1] ?? "")) cursor -= 1;
  return cursor;
}

function lineIndentAt(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  let cursor = lineStart;
  while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) cursor += 1;
  return text.slice(lineStart, cursor);
}

function isContainer(value: unknown): value is JsonContainer {
  return isRecord(value) || Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayIndex(value: string): boolean {
  if (value === "") return false;
  return Number.isInteger(Number(value)) && Number(value) >= 0;
}
