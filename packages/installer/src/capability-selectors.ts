import type { CapabilityEntry, Diagnostic } from "@caplet/core";
import type { SourceCapabilityCandidate, SourceInventory } from "./inventory.js";

/**
 * The candidates an entry's `capabilities:` selectors pick (SPEC.md §20.5): every candidate
 * when the entry has none, otherwise each candidate whose selector matches an exact or glob
 * selector, once. A selector that matches nothing is an error naming the candidates.
 */
export function matchCapabilitySelectors(
  entry: CapabilityEntry,
  sourceRoot: string,
  inventory: SourceInventory,
): { candidates: SourceCapabilityCandidate[]; diagnostics: Diagnostic[] } {
  if (entry.capabilities === undefined)
    return { candidates: inventory.candidates, diagnostics: [] };
  const selected = new Set<SourceCapabilityCandidate>();
  const diagnostics: Diagnostic[] = [];
  for (const selector of entry.capabilities) {
    const matches = inventory.candidates.filter((candidate) =>
      globMatches(selector, candidate.selector),
    );
    if (matches.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "acf.resolve.capability-selector-unmatched",
        message: `capability selector matched nothing: ${selector}`,
        path: sourceRoot,
        data: { selector, candidates: inventory.candidates.map((item) => item.selector).sort() },
      });
    }
    for (const match of matches) selected.add(match);
  }
  return { candidates: [...selected], diagnostics };
}

function globMatches(pattern: string, candidate: string): boolean {
  return matchSegments(pattern.split("/"), candidate.split("/"), 0, 0);
}

function matchSegments(
  pattern: string[],
  candidate: string[],
  patternIndex: number,
  candidateIndex: number,
): boolean {
  if (patternIndex === pattern.length) return candidateIndex === candidate.length;
  const segment = pattern[patternIndex];
  if (segment === "**") {
    if (matchSegments(pattern, candidate, patternIndex + 1, candidateIndex)) return true;
    return (
      candidateIndex < candidate.length &&
      matchSegments(pattern, candidate, patternIndex, candidateIndex + 1)
    );
  }
  if (candidateIndex >= candidate.length || segment === undefined) return false;
  return (
    matchSegment(segment, candidate[candidateIndex] ?? "") &&
    matchSegments(pattern, candidate, patternIndex + 1, candidateIndex + 1)
  );
}

function matchSegment(pattern: string, candidate: string): boolean {
  let expression = "^";
  for (const char of pattern) {
    if (char === "*") expression += ".*";
    else if (char === "?") expression += ".";
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${expression}$`).test(candidate);
}
