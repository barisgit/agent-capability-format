import { isRecord } from "./guards.js";

/**
 * JSON text of a JSON data value with object keys sorted by UTF-16 code unit at every depth, so
 * two values that differ only in key order serialize alike. Callers hash this text, so the
 * ordering is part of the contract: changing it changes every recorded hash. Keys are emitted in
 * that order even when they look like array indices, which a plain object would reorder.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    const parts = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}
