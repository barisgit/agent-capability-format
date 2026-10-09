import path from "node:path";

/**
 * Whether `relative`, a `path.relative` result or a normalized relative path, points outside its
 * base: it is absolute, `..`, or its first segment is `..`. A name that only begins with two dots,
 * such as `..skills`, stays inside.
 */
export function leavesBase(relative: string): boolean {
  return path.isAbsolute(relative) || relative.split(/[/\\]/, 1)[0] === "..";
}
