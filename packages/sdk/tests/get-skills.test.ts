import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { getSkills } from "../src";
import {
  cleanupFixtureScope,
  type FixtureScope,
  fixturePath,
  makeFixtureScope,
  writeText,
} from "./helpers";

let scopes: FixtureScope[] = [];
afterEach(async () => {
  await Promise.all(scopes.map((scope) => cleanupFixtureScope(scope)));
  scopes = [];
});

test("getSkills filters by target applicability", async () => {
  const scope = await makeFixtureScope({ project: ["cap-a", "cap-b"] });
  scopes.push(scope);

  const piSkills = await getSkills({ target: "pi", cwd: scope.cwd, home: scope.home });
  expect(piSkills.map((skill) => skill.name).sort()).toEqual(["pi-only", "shared", "shared"]);
  expect(piSkills.every((skill) => skill.scope === "project")).toBe(true);
  expect(
    piSkills.find((skill) => skill.capability === "cap-a" && skill.name === "shared")
      ?.targetExtensions,
  ).toEqual({ userInvocable: true });

  const claudeSkills = await getSkills({ target: "claude", cwd: scope.cwd, home: scope.home });
  expect(claudeSkills.map((skill) => `${skill.capability}:${skill.name}`)).toEqual([
    "cap-a:shared",
  ]);
});

test("scope all is default and project shadows user capabilities", async () => {
  const scope = await makeFixtureScope({ user: ["cap-a"], project: ["cap-a", "cap-b"] });
  scopes.push(scope);

  const skills = await getSkills({
    target: "pi",
    cwd: scope.cwd,
    home: scope.home,
    includeDiagnostics: true,
  });
  expect(
    skills
      .filter((skill) => skill.capability === "cap-a")
      .every((skill) => skill.scope === "project"),
  ).toBe(true);
  expect(skills.map((skill) => `${skill.scope}:${skill.capability}:${skill.name}`).sort()).toEqual([
    "project:cap-a:pi-only",
    "project:cap-a:shared",
    "project:cap-b:shared",
  ]);
});

test("scope can be limited to user or project", async () => {
  const scope = await makeFixtureScope({ user: ["cap-a"], project: ["cap-b"] });
  scopes.push(scope);

  const userSkills = await getSkills({
    target: "pi",
    scope: "user",
    cwd: scope.cwd,
    home: scope.home,
  });
  expect(
    userSkills.map((skill) => `${skill.scope}:${skill.capability}:${skill.name}`).sort(),
  ).toEqual(["user:cap-a:pi-only", "user:cap-a:shared"]);

  const projectSkills = await getSkills({
    target: "pi",
    scope: "project",
    cwd: scope.cwd,
    home: scope.home,
  });
  expect(projectSkills.map((skill) => `${skill.scope}:${skill.capability}:${skill.name}`)).toEqual([
    "project:cap-b:shared",
  ]);
});

test("fetch never is the default and only reads existing capability trees", async () => {
  const scope = await makeFixtureScope({ project: [] });
  scopes.push(scope);
  await writeText(
    `${scope.projectAgentsDir}/capabilities.yml`,
    `acf: 1\ncapabilities:\n  - source: path:${scope.userAgentsDir}/capabilities/cap-a\n`,
  );

  const skills = await getSkills({ target: "pi", cwd: scope.cwd, home: scope.home });

  expect(skills).toEqual([]);
});

test("fetch auto resolves capabilities.yml path sources and updates the lock", async () => {
  const scope = await makeFixtureScope({ project: [] });
  scopes.push(scope);
  await writeText(
    `${scope.projectAgentsDir}/capabilities.yml`,
    `acf: 1\ncapabilities:\n  - source: path:${fixturePath("cap-a")}\n`,
  );

  const skills = await getSkills({ target: "pi", fetch: "auto", cwd: scope.cwd, home: scope.home });

  expect(skills.map((skill) => `${skill.capability}:${skill.name}`).sort()).toEqual([
    "cap-a:pi-only",
    "cap-a:shared",
  ]);
  const lock = await readFile(`${scope.projectAgentsDir}/capabilities.lock`, "utf8");
  expect(lock).toContain("cap-a");
});

test("capabilities option filters by capability name", async () => {
  const scope = await makeFixtureScope({ project: ["cap-a", "cap-b"] });
  scopes.push(scope);

  const skills = await getSkills({
    target: "pi",
    cwd: scope.cwd,
    home: scope.home,
    capabilities: ["cap-b"],
  });

  expect(skills.map((skill) => `${skill.capability}:${skill.name}`)).toEqual(["cap-b:shared"]);
});
