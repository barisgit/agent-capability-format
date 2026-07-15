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

import { chooseSourceCapabilities } from "../src/internal/source-selection";

describe("chooseSourceCapabilities", () => {
  test("validates exact requested names", async () => {
    expect(
      await chooseSourceCapabilities(["alpha", "beta"], { requested: "beta", interactive: false }),
    ).toEqual(["beta"]);
    await expect(
      chooseSourceCapabilities(["alpha", "beta"], { requested: "missing", interactive: false }),
    ).rejects.toThrow("Available: alpha, beta");
  });

  test("rejects duplicate candidate names as ambiguous", async () => {
    await expect(
      chooseSourceCapabilities(["alpha", "alpha"], { requested: "alpha", interactive: false }),
    ).rejects.toThrow("duplicate capability name");
  });

  test("keeps install-all behavior outside interactive selection", async () => {
    expect(await chooseSourceCapabilities(["alpha", "beta"], { interactive: false })).toEqual([
      "alpha",
      "beta",
    ]);
    expect(
      await chooseSourceCapabilities(["alpha", "beta"], { interactive: true, yes: true }),
    ).toEqual(["alpha", "beta"]);
  });

  test("invokes the picker only for interactive unqualified multi-capability sources", async () => {
    const calls: string[][] = [];
    const picker = async (items: readonly string[]) => {
      calls.push([...items]);
      return ["beta"];
    };
    expect(
      await chooseSourceCapabilities(["alpha", "beta"], { interactive: true, picker }),
    ).toEqual(["beta"]);
    expect(calls).toEqual([["alpha", "beta"]]);
    expect(await chooseSourceCapabilities(["alpha"], { interactive: true, picker })).toEqual([
      "alpha",
    ]);
    expect(calls).toHaveLength(1);
  });

  test("propagates picker cancellation without selection", async () => {
    expect(
      await chooseSourceCapabilities(["alpha", "beta"], {
        interactive: true,
        picker: async () => null,
      }),
    ).toBeNull();
  });
});
