export type NumberedSelection =
  | { kind: "selected"; indices: number[] }
  | { kind: "cancelled" }
  | { kind: "invalid"; message: string };

export type PickerIo = {
  lines: AsyncIterable<string>;
  write: (value: string) => void;
};

export async function selectCapabilities(
  candidates: readonly string[],
  io: PickerIo = { lines: console, write: (value) => process.stdout.write(value) },
): Promise<string[] | null> {
  if (candidates.length === 0) return null;
  io.write("Select capabilities:\n");
  for (const [index, candidate] of candidates.entries()) {
    io.write(`  ${index + 1}. ${candidate}\n`);
  }
  const iterator = io.lines[Symbol.asyncIterator]();
  while (true) {
    io.write("Choose numbers, ranges, a for all, or q to cancel [all]: ");
    const next = await iterator.next();
    if (next.done === true) return null;
    const parsed = parseNumberedSelection(next.value, candidates.length);
    if (parsed.kind === "cancelled") return null;
    if (parsed.kind === "invalid") {
      io.write(`${parsed.message}\n`);
      continue;
    }
    return parsed.indices.map((index) => candidates[index]).filter((item) => item !== undefined);
  }
}

export function parseNumberedSelection(input: string, count: number): NumberedSelection {
  if (count < 1) return { kind: "invalid", message: "no capabilities are available" };
  const value = input.trim().toLowerCase();
  if (value === "q" || value === "quit") return { kind: "cancelled" };
  if (value === "" || value === "a" || value === "all") {
    return { kind: "selected", indices: Array.from({ length: count }, (_, index) => index) };
  }

  const selected = new Set<number>();
  for (const token of value.split(",").map((part) => part.trim())) {
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range !== null) {
      const first = Number(range[1]);
      const last = Number(range[2]);
      if (!validChoice(first, count) || !validChoice(last, count) || first > last) {
        return invalidSelection(count);
      }
      for (let choice = first; choice <= last; choice += 1) selected.add(choice - 1);
      continue;
    }
    if (!/^\d+$/.test(token)) return invalidSelection(count);
    const choice = Number(token);
    if (!validChoice(choice, count)) return invalidSelection(count);
    selected.add(choice - 1);
  }
  return { kind: "selected", indices: [...selected].sort((a, b) => a - b) };
}

function validChoice(choice: number, count: number): boolean {
  return Number.isInteger(choice) && choice >= 1 && choice <= count;
}

function invalidSelection(count: number): NumberedSelection {
  return {
    kind: "invalid",
    message: `enter numbers from 1-${count}, ranges, a for all, or q to cancel`,
  };
}
