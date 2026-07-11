import { expect, test } from "bun:test";
import {
  columns,
  glyphs,
  stripAnsi,
  terminalWidth,
  truncateMiddle,
  width,
} from "../../src/internal/render";

test("stripAnsi removes color codes and width measures visible length", () => {
  const colored = "\u001b[32mcreate\u001b[0m";
  expect(stripAnsi(colored)).toBe("create");
  expect(width(colored)).toBe(6);
});

test("columns aligns cells with padding, gap, and right alignment", () => {
  const rows = columns(
    [
      ["NAME", "COUNT"],
      ["alpha", "3"],
      ["beta-long", "41"],
    ],
    { align: ["left", "right"], gap: 2 },
  );
  expect(rows).toEqual(["NAME       COUNT", "alpha          3", "beta-long     41"]);
});

test("columns measures ANSI-colored cells by visible width", () => {
  const rows = columns([
    ["\u001b[32malpha\u001b[0m", "x"],
    ["beta", "y"],
  ]);
  expect(stripAnsi(rows[0] ?? "")).toBe("alpha  x");
  expect(stripAnsi(rows[1] ?? "")).toBe("beta   y");
});

test("columns applies indent and trims trailing whitespace", () => {
  const rows = columns([["a", "b"]], { indent: "  " });
  expect(rows).toEqual(["  a  b"]);
});

test("truncateMiddle keeps head and tail within budget", () => {
  const value = "~/.agents/skills/deep-research/SKILL.md";
  const truncated = truncateMiddle(value, 20);
  expect(truncated.length).toBe(20);
  expect(truncated).toContain("\u2026");
  expect(truncateMiddle("short", 20)).toBe("short");
});

test("terminalWidth falls back to 80 when columns is undefined", () => {
  expect(terminalWidth()).toBe(process.stdout.columns ?? 80);
});

test("glyphs use unicode on TTY and ascii words when piped", () => {
  expect(glyphs(true)).toEqual({ ok: "\u2713", fail: "\u2717", warn: "!" });
  expect(glyphs(false)).toEqual({ ok: "ok", fail: "fail", warn: "warn" });
});
