import { isRecord } from "@caplet/core";

type JsonRecord = Record<string, unknown>;
type JsonContainer = JsonRecord | unknown[];

type ContainerLocation = { start: number; end: number; kind: "object" | "array" };
type ObjectProperty = { valueStart: number; valueEnd: number; propStart: number };
type ArrayElement = { valueStart: number; valueEnd: number };

/** The unescaped reference tokens of an RFC 6901 pointer; `""` is the whole document. */
function decodeJsonPointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`JSON pointer must start with /: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** The value `pointer` names in `root`, or `undefined` when it names nothing. */
export function getJsonPointer(root: unknown, pointer: string): unknown {
  let cursor = root;
  for (const segment of decodeJsonPointer(pointer)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/** Whether `pointer` names a value in `root`. */
export function hasJsonPointer(root: unknown, pointer: string): boolean {
  if (pointer === "") return true;
  let cursor = root;
  for (const segment of decodeJsonPointer(pointer)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return false;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !(segment in cursor)) return false;
    cursor = cursor[segment];
  }
  return true;
}

/**
 * Deletes the value `pointer` names from JSON text, editing the text in place so the rest of the
 * document keeps its formatting. Blank text, the root pointer and a missing value leave it as is;
 * text that is not JSON throws.
 */
export function deleteJsonPointerText(text: string, pointer: string): string {
  if (text.trim() === "") return text;
  JSON.parse(text);
  const segments = decodeJsonPointer(pointer);
  if (segments.length === 0) return text;
  const rootStart = skipWhitespace(text, 0);
  const rootEnd = trimEnd(text, text.length);
  const root = containerAt(text, rootStart, rootEnd);
  if (root === null) return text;
  return deleteAt(text, root, segments, 0);
}

function deleteAt(
  text: string,
  container: ContainerLocation,
  segments: string[],
  index: number,
): string {
  const segment = segments[index];
  if (segment === undefined) return text;
  const last = index === segments.length - 1;
  if (container.kind === "object") {
    const property = findObjectProperty(text, container.start, container.end, segment);
    if (property === null) return text;
    if (last) return removeMember(text, container, property.propStart, property.valueEnd);
    const child = containerAt(text, property.valueStart, property.valueEnd);
    return child === null ? text : deleteAt(text, child, segments, index + 1);
  }

  const element = findArrayElement(text, container.start, container.end, segment);
  if (element === null) return text;
  if (last) return removeMember(text, container, element.valueStart, element.valueEnd);
  const child = containerAt(text, element.valueStart, element.valueEnd);
  return child === null ? text : deleteAt(text, child, segments, index + 1);
}

/**
 * Removes one member of `container`, a property from its key or an element from its value
 * (`start`) through `valueEnd`, with exactly one separating comma, and leaves every other member
 * in place. A member alone on its line takes the whole line with it; a member that shares its line
 * with other content takes only its own text and the inline space that separated it.
 */
function removeMember(
  text: string,
  container: ContainerLocation,
  start: number,
  valueEnd: number,
): string {
  const afterValue = skipWhitespace(text, valueEnd);
  if (text[afterValue] === ",") {
    const afterComma = skipInlineSpace(text, afterValue + 1);
    const lineStart = lineStartAt(text, start);
    const endsLine = atLineEnd(text, afterComma);
    if (endsLine && isInlineSpace(text, lineStart, start)) {
      return replaceRange(text, lineStart, consumeOneLineBreak(text, afterComma), "");
    }
    const from = endsLine ? skipInlineSpaceBack(text, start, lineStart) : start;
    return replaceRange(text, from, afterComma, "");
  }

  const previous = previousNonWhitespace(text, start, container.start);
  if (previous !== null && text[previous] === ",") {
    return replaceRange(text, previous, valueEnd, "");
  }

  const close = findContainerClose(
    text,
    container.start,
    container.end,
    container.kind === "object" ? "}" : "]",
  );
  return replaceRange(text, container.start + 1, close, "");
}

function findObjectProperty(
  text: string,
  start: number,
  end: number,
  key: string,
): ObjectProperty | null {
  let cursor = skipWhitespace(text, start + 1);
  while (cursor < end) {
    if (text[cursor] === "}") return null;
    const propStart = cursor;
    const parsedKey = readString(text, cursor);
    cursor = skipWhitespace(text, parsedKey.end);
    if (text[cursor] !== ":") throw new Error("invalid JSON object");
    const valueStart = skipWhitespace(text, cursor + 1);
    const valueEnd = skipValue(text, valueStart);
    if (parsedKey.value === key) return { propStart, valueStart, valueEnd };
    cursor = skipWhitespace(text, valueEnd);
    if (text[cursor] === ",") cursor = skipWhitespace(text, cursor + 1);
  }
  return null;
}

function findArrayElement(
  text: string,
  start: number,
  end: number,
  segment: string,
): ArrayElement | null {
  const wanted = Number(segment);
  if (!Number.isInteger(wanted) || wanted < 0) throw new Error(`invalid array index: ${segment}`);
  let cursor = skipWhitespace(text, start + 1);
  let index = 0;
  while (cursor < end) {
    if (text[cursor] === "]") return null;
    const valueStart = cursor;
    const valueEnd = skipValue(text, valueStart);
    if (index === wanted) return { valueStart, valueEnd };
    index += 1;
    cursor = skipWhitespace(text, valueEnd);
    if (text[cursor] === ",") cursor = skipWhitespace(text, cursor + 1);
  }
  return null;
}

function containerAt(text: string, start: number, end: number): ContainerLocation | null {
  const valueStart = skipWhitespace(text, start);
  const char = text[valueStart];
  if (char === "{") return { start: valueStart, end, kind: "object" };
  if (char === "[") return { start: valueStart, end, kind: "array" };
  return null;
}

function findContainerClose(
  text: string,
  start: number,
  end: number,
  closeChar: "}" | "]",
): number {
  let cursor = trimEnd(text, end) - 1;
  while (cursor > start && text[cursor] !== closeChar) cursor -= 1;
  if (text[cursor] !== closeChar) throw new Error("invalid JSON container");
  return cursor;
}

function skipValue(text: string, start: number): number {
  const char = text[start];
  if (char === '"') return readString(text, start).end;
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
    if (char === '"') {
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
    if (char === '"') {
      const value: unknown = JSON.parse(text.slice(start, cursor + 1));
      if (typeof value !== "string") throw new Error("invalid JSON string");
      return { value, end: cursor + 1 };
    }
    cursor += 1;
  }
  throw new Error("unterminated JSON string");
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

function previousNonWhitespace(text: string, start: number, floor: number): number | null {
  let cursor = start - 1;
  while (cursor > floor && "\n\r\t ".includes(text[cursor] ?? "")) cursor -= 1;
  return cursor > floor ? cursor : null;
}

function skipInlineSpace(text: string, start: number): number {
  let cursor = start;
  while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
  return cursor;
}

function skipInlineSpaceBack(text: string, end: number, floor: number): number {
  let cursor = end;
  while (cursor > floor && (text[cursor - 1] === " " || text[cursor - 1] === "\t")) cursor -= 1;
  return cursor;
}

function isInlineSpace(text: string, start: number, end: number): boolean {
  return skipInlineSpace(text, start) >= end;
}

function atLineEnd(text: string, index: number): boolean {
  return index >= text.length || text[index] === "\n" || text[index] === "\r";
}

function lineStartAt(text: string, index: number): number {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function consumeOneLineBreak(text: string, index: number): number {
  if (text[index] === "\r" && text[index + 1] === "\n") return index + 2;
  if (text[index] === "\n") return index + 1;
  return index;
}
