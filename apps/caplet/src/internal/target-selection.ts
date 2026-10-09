import { type CapletConfig, type TargetId, targetIds } from "@caplet/core";
import { validationError } from "./args.js";

/**
 * The targets named by `-t/--target`, which may repeat and take comma-separated ids, in the
 * order given and without duplicates; `undefined` when the flag is absent. An unknown id is a
 * usage error (exit 2).
 */
export function requestedTargets(args: Record<string, unknown>): TargetId[] | undefined {
  const raw = args.target;
  const values = (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) return undefined;
  const out: TargetId[] = [];
  for (const value of values) {
    const id = targetIds.find((candidate) => candidate === value);
    if (id === undefined) throw validationError(`unknown target: ${value}`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The targets a command plans for: the requested ones, else the configured defaults, minus disabled targets. */
export function targetSelection(args: Record<string, unknown>, config: CapletConfig): TargetId[] {
  const values = requestedTargets(args) ?? config.emit?.defaultTargets ?? [...targetIds];
  const out: TargetId[] = [];
  for (const value of values) {
    if (!targetIds.includes(value)) throw validationError(`unknown target: ${value}`);
    if (config.targets?.[value]?.disabled === true) continue;
    out.push(value);
  }
  return out;
}
