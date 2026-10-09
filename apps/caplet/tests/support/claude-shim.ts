/**
 * The `claude` program subprocess tests put on `PATH` (see `claudeShim` in `claude-path.ts`).
 * It replays the transcripts of the scenario file named by `CAPLET_FAKE_CLAUDE` with the same
 * code as the in-process fake, and appends each call to `<scenario>.calls.jsonl` so that later
 * invocations skip transcripts already replayed and the test can read what ran.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { type FakeClaudeCliOptions, loadTranscripts, takeTranscript } from "./fake-claude-cli.js";

/** One line of the call log; `index` is absent for a call without a transcript. */
export type ShimCall = { argv: string[]; cwd: string; index?: number; error?: string };

const scenarioPath = process.env.CAPLET_FAKE_CLAUDE;
if (scenarioPath === undefined) {
  process.stderr.write("fake claude: CAPLET_FAKE_CLAUDE is not set\n");
  process.exit(99);
}
const logPath = `${scenarioPath}.calls.jsonl`;
const options = JSON.parse(readFileSync(scenarioPath, "utf8")) as FakeClaudeCliOptions;
const used = new Set(
  (existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean) : [])
    .map((line) => (JSON.parse(line) as ShimCall).index)
    .filter((index) => index !== undefined),
);
const pending = loadTranscripts(options).filter((entry) => !used.has(entry.index));
const argv = ["claude", ...process.argv.slice(2)];
try {
  const match = takeTranscript(pending, argv);
  appendFileSync(logPath, `${JSON.stringify({ argv, cwd: process.cwd(), index: match.index })}\n`);
  process.stdout.write(match.outcome.stdout);
  process.stderr.write(match.outcome.stderr);
  process.exitCode = match.outcome.exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  appendFileSync(logPath, `${JSON.stringify({ argv, cwd: process.cwd(), error: message })}\n`);
  process.stderr.write(`${message}\n`);
  process.exitCode = 99;
}
