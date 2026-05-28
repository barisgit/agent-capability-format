import { afterEach, expect, test } from "bun:test";
import { getHooks } from "../src";
import { cleanupFixtureScope, type FixtureScope, makeFixtureScope } from "./helpers";

let scopes: FixtureScope[] = [];
afterEach(async () => {
  await Promise.all(scopes.map((scope) => cleanupFixtureScope(scope)));
  scopes = [];
});

test("getHooks filters by hookType", async () => {
  const scope = await makeFixtureScope({ project: ["cap-a", "cap-b"] });
  scopes.push(scope);

  const promptHooks = await getHooks({
    target: "pi",
    hookType: "user_prompt_submit",
    cwd: scope.cwd,
    home: scope.home,
  });

  expect(promptHooks.map((hook) => `${hook.capability}:${hook.name}`).sort()).toEqual([
    "cap-a:cap-a-prompt",
    "cap-b:cap-b-prompt",
  ]);
});

test("getHooks only returns hooks visible for the target", async () => {
  const scope = await makeFixtureScope({ project: ["cap-a", "cap-b"] });
  scopes.push(scope);

  const piHooks = await getHooks({ target: "pi", cwd: scope.cwd, home: scope.home });
  expect(piHooks.map((hook) => `${hook.hookType}:${hook.capability}:${hook.name}`).sort()).toEqual([
    "pre_tool:cap-a:cap-a-pre",
    "session_start:cap-b:cap-b-session",
    "user_prompt_submit:cap-a:cap-a-prompt",
    "user_prompt_submit:cap-b:cap-b-prompt",
  ]);

  const claudeHooks = await getHooks({ target: "claude", cwd: scope.cwd, home: scope.home });
  expect(
    claudeHooks.map((hook) => `${hook.hookType}:${hook.capability}:${hook.name}`).sort(),
  ).toEqual(["session_start:cap-b:cap-b-session", "user_prompt_submit:cap-a:cap-a-claude-prompt"]);
});
