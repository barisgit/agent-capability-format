export function extractMarkedBlock(text: string, name: string): string | null {
  const { begin, end } = markerLines(name);
  const start = text.indexOf(begin);
  if (start === -1) return null;
  const bodyStart = start + begin.length;
  const finish = text.indexOf(end, bodyStart);
  if (finish === -1) return null;
  return trimOneLeadingNewline(text.slice(bodyStart, finish)).replace(/\n$/, "");
}

export function replaceMarkedBlock(text: string, name: string, body: string): string {
  const { begin, end } = markerLines(name);
  const block = `${begin}\n${body.trimEnd()}\n${end}`;
  const start = text.indexOf(begin);
  if (start === -1) return appendBlock(text, block);
  const finish = text.indexOf(end, start + begin.length);
  if (finish === -1) return appendBlock(text, block);
  return `${text.slice(0, start)}${block}${text.slice(finish + end.length)}`;
}

function markerLines(name: string): { begin: string; end: string } {
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
