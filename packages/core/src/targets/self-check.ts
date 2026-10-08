/**
 * Consistency check over the field-level support registry and the native key inventory
 * (capability-model-layers: Safety classes, Native key classification, Negative fixtures for
 * data-only restrictions). A unit test runs it on the shipped registry; later tasks extend it
 * (4.5 checks that negative fixtures exist, 4.7 that preserved data has an authoring form).
 */
import type { FieldSupport, NativeKeyInfo, SafetyClass } from "../types/interop.js";
import { targetCarriers } from "./field-support.js";
import { pendingCoreFields } from "./native-keys.js";

const SAFETY_CLASSES: ReadonlySet<string> = new Set<SafetyClass>([
  "restricting",
  "granting",
  "functional",
  "descriptive",
]);

/** Options for {@link checkSupportRegistry}. */
export type SupportRegistryCheckOptions = {
  /**
   * Require a cell for every built-in target and offered carrier on skill and MCP fields.
   * Package fields are exempt: they only have a destination in the Claude plugin manifest.
   */
  requireComplete?: boolean;
};

/**
 * Returns one human-readable problem per violation; an empty list means the registry is
 * consistent. Fails when a restricting or functional cell is degraded, a refusing
 * restricting cell lacks a `negativeFixture`, a skill or MCP field lacks a cell, a native key
 * lacks a safety class or is listed twice, or a key's `generatedFrom` or `pending` names a
 * field that does not exist (or, for `generatedFrom`, has no usable cell on the key's target).
 */
export function checkSupportRegistry(
  fields: readonly FieldSupport[],
  keys: readonly NativeKeyInfo[],
  options: SupportRegistryCheckOptions = {},
): string[] {
  return [...checkFields(fields, options.requireComplete ?? true), ...checkKeys(fields, keys)];
}

function checkFields(fields: readonly FieldSupport[], requireComplete: boolean): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of fields) {
    if (seen.has(entry.field)) problems.push(`field ${entry.field} is declared twice`);
    seen.add(entry.field);
    if (requireComplete && entry.family !== "package") {
      for (const [target, carriers] of Object.entries(targetCarriers)) {
        for (const carrier of carriers.available) {
          if (entry.cells[target]?.[carrier] === undefined) {
            problems.push(`${entry.field} has no cell for ${target}/${carrier}`);
          }
        }
      }
    }
    for (const [target, byCarrier] of Object.entries(entry.cells)) {
      for (const [carrier, cell] of Object.entries(byCarrier ?? {})) {
        const where = `${entry.field} (${entry.class}) on ${target}/${carrier}`;
        const strict = entry.class === "restricting" || entry.class === "functional";
        if (strict && cell.kind === "degraded") {
          problems.push(
            `${where} is degraded; ${entry.class} fields are native, translated or refused`,
          );
        }
        if (entry.class === "restricting" && cell.kind === "refused" && !cell.negativeFixture) {
          problems.push(`${where} is refused without a negativeFixture`);
        }
      }
    }
  }
  return problems;
}

/** Field id without its `=<value>` condition: `mcp.command=bare` -> `mcp.command`. */
function baseField(field: string): string {
  const index = field.indexOf("=");
  return index === -1 ? field : field.slice(0, index);
}

function checkKeys(fields: readonly FieldSupport[], keys: readonly NativeKeyInfo[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const info of keys) {
    const label = `${info.target} ${info.family} key ${info.key}`;
    const id = `${info.target}\u0000${info.family}\u0000${info.key}`;
    if (seen.has(id)) problems.push(`${label} is listed twice`);
    seen.add(id);
    if (!SAFETY_CLASSES.has(info.class)) problems.push(`${label} has no safety class`);
    if (info.generatedFrom !== undefined) {
      const source = info.generatedFrom;
      const matching = fields.filter(
        (entry) => entry.field === source || baseField(entry.field) === source,
      );
      if (matching.length === 0) {
        problems.push(`${label} is generatedFrom unknown field ${source}`);
      } else if (!matching.some((entry) => hasUsableCell(entry, info.target))) {
        problems.push(
          `${label} is generatedFrom ${source}, which has no non-refused cell for ${info.target}`,
        );
      }
    }
    if (info.pending !== undefined && !(info.pending.coreField in pendingCoreFields)) {
      problems.push(`${label} is pending unknown core field ${info.pending.coreField}`);
    }
  }
  return problems;
}

function hasUsableCell(entry: FieldSupport, target: string): boolean {
  return Object.values(entry.cells[target] ?? {}).some((cell) => cell.kind !== "refused");
}
