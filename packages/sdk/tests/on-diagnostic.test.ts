import { afterEach, expect, test } from "bun:test";
import { getInstructions, getSkills, onDiagnostic } from "../src";
import { cleanupFixtureScope, type FixtureScope, makeFixtureScope } from "./helpers";

let scopes: FixtureScope[] = [];
afterEach(async () => {
  await Promise.all(scopes.map((scope) => cleanupFixtureScope(scope)));
  scopes = [];
});

test("onDiagnostic receives diagnostics from helpers until unsubscribed", async () => {
  const scope = await makeFixtureScope({ user: ["cap-a"], project: ["cap-a"] });
  scopes.push(scope);
  const codes: string[] = [];
  const unsubscribe = onDiagnostic((diagnostic) => codes.push(diagnostic.code));

  await getSkills({ target: "pi", cwd: scope.cwd, home: scope.home });
  await getInstructions({ target: "pi", cwd: scope.cwd, home: scope.home });

  expect(codes).toContain("acf.capability.shadowed");
  expect(codes).toContain("acf.markdown.unknown-frontmatter-field");

  const deliveredBeforeUnsubscribe = codes.length;
  unsubscribe();
  await getInstructions({ target: "pi", cwd: scope.cwd, home: scope.home });

  expect(codes).toHaveLength(deliveredBeforeUnsubscribe);
});
