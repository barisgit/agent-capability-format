/**
 * Named, caplet-owned text regions inside files shared with the user. A region is delimited by
 * begin/end marker comments in the host file's comment syntax: HTML comments in Markdown, hash
 * comments in TOML. Readers accept either syntax; writers keep the syntax a region already
 * uses and otherwise use the one requested.
 */

/** Comment syntax of a marked region. */
export type MarkerSyntax = "html" | "hash";

const markerSyntaxes: readonly MarkerSyntax[] = ["html", "hash"];

/** Body of the region `name` in `text`, without its markers, or null when absent. */
export function extractMarkedBlock(text: string, name: string): string | null {
  const found = locate(text, name);
  if (found === null) return null;
  const body = text.slice(found.start + found.begin.length, found.finish);
  return trimOneLeadingNewline(body).replace(/\n$/, "");
}

/** The marker syntax `text` uses for region `name`, or undefined when it has none. */
export function markerSyntaxOf(text: string, name: string): MarkerSyntax | undefined {
  return locate(text, name)?.syntax;
}

/**
 * Replaces the region `name` in `text` with `body`, appending the region when absent. An
 * existing region keeps its syntax; a new one uses `syntax` (default HTML comments).
 */
export function replaceMarkedBlock(
  text: string,
  name: string,
  body: string,
  syntax: MarkerSyntax = "html",
): string {
  const found = locate(text, name);
  const { begin, end } = markerLines(name, found?.syntax ?? syntax);
  const block = `${begin}\n${body.trimEnd()}\n${end}`;
  if (found === null) return appendBlock(text, block);
  return `${text.slice(0, found.start)}${block}${text.slice(found.finish + found.end.length)}`;
}

/** Removes the region `name` and the line break after it; returns `text` when absent. */
export function removeMarkedBlock(text: string, name: string): string {
  const found = locate(text, name);
  if (found === null) return text;
  let removeEnd = found.finish + found.end.length;
  if (text.startsWith("\r\n", removeEnd)) removeEnd += 2;
  else if (text.startsWith("\n", removeEnd)) removeEnd += 1;
  return `${text.slice(0, found.start)}${text.slice(removeEnd)}`;
}

type Located = { syntax: MarkerSyntax; begin: string; end: string; start: number; finish: number };

function locate(text: string, name: string): Located | null {
  for (const syntax of markerSyntaxes) {
    const { begin, end } = markerLines(name, syntax);
    const start = text.indexOf(begin);
    if (start === -1) continue;
    const finish = text.indexOf(end, start + begin.length);
    if (finish === -1) continue;
    return { syntax, begin, end, start, finish };
  }
  return null;
}

function markerLines(name: string, syntax: MarkerSyntax): { begin: string; end: string } {
  if (syntax === "hash") return { begin: `# acf:begin ${name}`, end: `# acf:end ${name}` };
  return { begin: `<!-- acf:begin ${name} -->`, end: `<!-- acf:end ${name} -->` };
}

function appendBlock(text: string, block: string): string {
  if (text.length === 0) return `${block}\n`;
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${block}\n`;
}

function trimOneLeadingNewline(value: string): string {
  return value.startsWith("\n") ? value.slice(1) : value;
}
