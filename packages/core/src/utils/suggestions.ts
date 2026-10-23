/** The closest case-insensitive candidate within two edits, or undefined for distant input. */
export function closestKey(key: string, candidates: readonly string[]): string | undefined {
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = levenshtein(key.toLowerCase(), candidate.toLowerCase());
    if (distance <= 2 && (best === undefined || distance < best.distance))
      best = { candidate, distance };
  }
  return best?.candidate;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      // These cells are initialized by the previous row or the preceding iteration.
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}
