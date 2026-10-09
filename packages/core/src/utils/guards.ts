/** Shape predicates shared by every core module that inspects untrusted parsed documents. */

/** An ACF slug: lowercase ASCII letters and digits in hyphen-separated runs. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for a plain JSON object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value` is an ACF slug ({@link SLUG_PATTERN}). */
export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
