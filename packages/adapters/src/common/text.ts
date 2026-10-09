import { stringifyYml } from "@caplet/core";

/** Markdown with a YAML frontmatter block. */
export function renderMarkdownFile(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYml(frontmatter).trimEnd()}\n---\n${body.trimStart()}`;
}

/** Markdown with `title` as its heading and the trimmed `body` beneath it. */
export function renderGeneratedMarkdown(title: string, body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 0 ? `# ${title}\n\n${trimmed}\n` : `# ${title}\n`;
}
