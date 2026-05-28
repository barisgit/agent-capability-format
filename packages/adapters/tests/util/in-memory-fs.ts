import type { ReadOnlyFs } from "@acf/core";

export function makeInMemoryFs(files: Record<string, string> = {}): ReadOnlyFs {
  return {
    async exists(absPath) {
      return files[absPath] !== undefined;
    },
    async readText(absPath) {
      return files[absPath] ?? null;
    },
    async readBytes(absPath) {
      const text = files[absPath];
      return text === undefined ? null : new TextEncoder().encode(text);
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
