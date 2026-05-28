import { afterEach, expect, test } from "bun:test";
import { getInstructions } from "../src";
import { cleanupFixtureScope, type FixtureScope, makeFixtureScope } from "./helpers";

let scopes: FixtureScope[] = [];
afterEach(async () => {
  await Promise.all(scopes.map((scope) => cleanupFixtureScope(scope)));
  scopes = [];
});

test("getInstructions filters by trigger and includes always activation", async () => {
  const scope = await makeFixtureScope({ project: ["cap-a", "cap-b"] });
  scopes.push(scope);

  const operationInstructions = await getInstructions({
    target: "pi",
    trigger: "operation_input",
    cwd: scope.cwd,
    home: scope.home,
  });
  expect(
    operationInstructions.map((instruction) => `${instruction.capability}:${instruction.name}`),
  ).toEqual(["cap-a:always", "cap-a:operation"]);

  const fileInstructions = await getInstructions({
    target: "pi",
    trigger: "file_context",
    cwd: scope.cwd,
    home: scope.home,
  });
  expect(
    fileInstructions.map((instruction) => `${instruction.capability}:${instruction.name}`),
  ).toEqual(["cap-a:always", "cap-b:file"]);
});

test("includeDiagnostics opt-in controls per-view diagnostics", async () => {
  const scope = await makeFixtureScope({ project: ["cap-a"] });
  scopes.push(scope);

  const withoutDiagnostics = await getInstructions({
    target: "pi",
    cwd: scope.cwd,
    home: scope.home,
  });
  expect(withoutDiagnostics.find((instruction) => instruction.name === "always")?.diagnostics).toBe(
    undefined,
  );

  const withDiagnostics = await getInstructions({
    target: "pi",
    cwd: scope.cwd,
    home: scope.home,
    includeDiagnostics: true,
  });
  expect(
    withDiagnostics
      .find((instruction) => instruction.name === "always")
      ?.diagnostics?.map((diagnostic) => diagnostic.code),
  ).toContain("acf.markdown.unknown-frontmatter-field");
});
