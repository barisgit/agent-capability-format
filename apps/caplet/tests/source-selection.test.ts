import { describe, expect, test } from "bun:test";
import { parseAddSource } from "../src/internal/manifest";

describe("parseAddSource", () => {
  test("extracts an exact capability from GitHub shorthand", () => {
    expect(parseAddSource("github:vercel-labs/skills@find-skills")).toEqual({
      source: "github:vercel-labs/skills",
      spec: { kind: "github", repo: "vercel-labs/skills" },
      selector: "find-skills",
    });
  });

  test("keeps canonical GitHub sources unselected", () => {
    expect(parseAddSource("github:owner/repo")).toEqual({
      source: "github:owner/repo",
      spec: { kind: "github", repo: "owner/repo" },
    });
  });

  test("does not interpret native at signs in Git and path sources", () => {
    expect(parseAddSource("git:ssh://git@github.com/owner/repo.git")).toEqual({
      source: "git:ssh://git@github.com/owner/repo.git",
      spec: { kind: "git", url: "ssh://git@github.com/owner/repo.git" },
    });
    expect(parseAddSource("path:/tmp/skills@work")).toEqual({
      source: "path:/tmp/skills@work",
      spec: { kind: "path", location: "/tmp/skills@work" },
    });
  });

  test("rejects an empty or malformed GitHub selector", () => {
    expect(() => parseAddSource("github:owner/repo@")).toThrow(
      "capability name after @ must not be empty",
    );
    expect(() => parseAddSource("github:owner/repo@bad/name")).toThrow(
      "invalid capability selector",
    );
  });
});
