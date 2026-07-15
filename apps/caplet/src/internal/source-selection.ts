import { validationError } from "./args";
import { selectCapabilities } from "./picker";

export type SourceSelectionOptions = {
  requested?: string;
  interactive: boolean;
  yes?: boolean;
  picker?: (candidates: readonly string[]) => Promise<string[] | null>;
};

export async function chooseSourceCapabilities(
  candidates: readonly string[],
  options: SourceSelectionOptions,
): Promise<string[] | null> {
  const duplicate = firstDuplicate(candidates);
  if (duplicate !== undefined) {
    throw validationError(`duplicate capability name in source: ${duplicate}`);
  }
  if (candidates.length === 0) throw validationError("source contains no capabilities");
  if (options.requested !== undefined) {
    if (!candidates.includes(options.requested)) {
      throw validationError(
        `capability not found in source: ${options.requested}. Available: ${candidates.join(", ")}`,
      );
    }
    return [options.requested];
  }
  if (candidates.length === 1 || !options.interactive || options.yes === true) {
    return [...candidates];
  }
  return await (options.picker ?? selectCapabilities)(candidates);
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}
