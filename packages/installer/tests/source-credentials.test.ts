import { expect, test } from "bun:test";
import { sourceUrlCredentialProblem } from "../src";

const SECRET = "s3cretVALUE";

for (const url of [
  "https://github.com/owner/repo.git",
  "https://example.com/repo.git?ref=main",
  "git@github.com:owner/repo.git",
  "ssh://git@example.com/repo.git",
  "git+ssh://git@example.com:2222/repo.git",
  "file:///srv/repo.git",
]) {
  test(`accepts credential-free source URL ${url}`, () => {
    expect(sourceUrlCredentialProblem(url)).toBeNull();
  });
}

for (const url of [
  `https://x-access-token:${SECRET}@github.com/o/r`,
  `https://${SECRET}@github.com/o/r`,
  `ssh://git:${SECRET}@example.com/repo.git`,
  `git:${SECRET}@example.com:repo.git`,
  `https://example.com/repo.git?token=${SECRET}`,
  `https://example.com/repo.git?ref=main&access_token=${SECRET}`,
  `https://example.com/repo.git?private_token=${SECRET}`,
  `https://example.com/repo.git?X-Amz-Signature=${SECRET}`,
  `https://example.com/repo.git?q=ghp_${SECRET}`,
  `https://example.com/repo.git#token=${SECRET}`,
  `https://example.com/repo.git#ghp_${SECRET}`,
]) {
  test(`rejects ${url.replace(SECRET, "<secret>")} without echoing the secret`, () => {
    const problem = sourceUrlCredentialProblem(url);
    expect(problem).not.toBeNull();
    expect(problem).not.toContain(SECRET);
    expect(problem).toContain("SPEC.md §18");
  });
}
