import path from "node:path";

/** The canonical collection directory, accepting either its parent or `acf/` itself. */
export function collectionRoot(sourceRoot: string): string {
  const root = path.resolve(sourceRoot);
  return path.basename(root) === "acf" ? root : path.join(root, "acf");
}

/**
 * Whether `relative`, a `path.relative` result or a normalized relative path, points outside its
 * base: it is absolute, `..`, or its first segment is `..`. A name that only begins with two dots,
 * such as `..skills`, stays inside.
 */
export function leavesBase(relative: string): boolean {
  return path.isAbsolute(relative) || relative.split(/[/\\]/, 1)[0] === "..";
}
