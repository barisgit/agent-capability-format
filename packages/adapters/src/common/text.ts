import { stringifyYml } from "@caplet/core";

export function renderMarkdownFile(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYml(frontmatter).trimEnd()}\n---\n${body.trimStart()}`;
}

export function renderGeneratedMarkdown(title: string, body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 0 ? `# ${title}\n\n${trimmed}\n` : `# ${title}\n`;
}
