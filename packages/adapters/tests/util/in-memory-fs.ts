import type { FileContent, ReadOnlyFs } from "@acf/core";

type InMemoryFile = FileContent | { content: FileContent; mode: number };

export function makeInMemoryFs(files: Record<string, InMemoryFile> = {}): ReadOnlyFs {
  const contentFor = (file: InMemoryFile | undefined): FileContent | undefined =>
    typeof file === "object" && file !== null && "content" in file ? file.content : file;
  return {
    async exists(absPath) {
      return files[absPath] !== undefined;
    },
    async readText(absPath) {
      const content = contentFor(files[absPath]);
      if (content === undefined) return null;
      return typeof content === "string" ? content : new TextDecoder().decode(content);
    },
    async readBytes(absPath) {
      const content = contentFor(files[absPath]);
      if (content === undefined) return null;
      return typeof content === "string" ? new TextEncoder().encode(content) : content;
    },
    async readMode(absPath) {
      const file = files[absPath];
      if (file === undefined) return null;
      return typeof file === "object" && file !== null && "content" in file ? file.mode : 0o644;
    },
    async listDir(absPath) {
      const prefix = absPath.endsWith("/") ? absPath : `${absPath}/`;
      const entries = new Set<string>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const first = rest.split("/")[0];
        if (first !== undefined && first.length > 0) entries.add(first);
      }
      return [...entries].sort();
    },
  };
}
