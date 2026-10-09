/**
 * Plain records parsed from input data. Plain lookup and assignment follow the prototype chain,
 * so a key such as `__proto__` would read `Object.prototype` or replace the record's prototype
 * instead of naming an entry; `ownValue` and `setOwn` treat every key as an entry.
 */

/** True for a plain object value: not null and not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value `record` itself holds under `key`; inherited properties read as undefined. */
export function ownValue(record: object, key: string): unknown {
  return Object.hasOwn(record, key) ? (record as Record<string, unknown>)[key] : undefined;
}

/** Defines `key` as an ordinary own entry of `record`, whatever the key's name. */
export function setOwn(record: object, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
