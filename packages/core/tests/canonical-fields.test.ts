import { expect, test } from "bun:test";
import type { AcfCapability } from "../src";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

// canonical-skills, Canonical skill fields; canonical-mcp, Canonical MCP server fields and
// Data directory placeholder (task 4.1).

const DOLLAR = "$";
const CAPABILITY_DIR = `${DOLLAR}{ACF_CAPABILITY_DIR}`;
const DATA_DIR = `${DOLLAR}{ACF_DATA_DIR}`;

async function withCapability(
  files: Record<string, string>,
  check: (cap: AcfCapability) => void,
): Promise<void> {
  const { cap, dir } = await readTempCapability({ "acf.yml": baseManifest, ...files });
  try {
    check(cap);
  } finally {
    await cleanup(dir);
  }
}

function errors(cap: AcfCapability): string[] {
  return cap.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

function mcpFile(server: string): Record<string, string> {
  return { "mcp/mcp.yml": `servers:\n  - name: srv\n${server}` };
}

test("full skill frontmatter validates and the canonical skill holds each field once", async () => {
  const skill = [
    "---",
    "name: review",
    "description: Review code",
    "license: MIT",
    "compatibility: Requires git",
    "metadata:",
    "  owner: docs",
    "  tier: '2'",
    "argument-hint: '[file]'",
    "invocation:",
    "  model: false",
    "---",
    "Body",
  ].join("\n");
  await withCapability({ "skills/review/SKILL.md": skill }, (cap) => {
    expect(cap.diagnostics).toEqual([]);
    expect(cap.skills[0]?.frontmatter).toMatchObject({
      license: "MIT",
      compatibility: "Requires git",
      metadata: { owner: "docs", tier: "2" },
      "argument-hint": "[file]",
      invocation: { model: false },
    });
  });
});

test("skill compatibility is at most 500 characters and metadata is a string map", async () => {
  const long = "x".repeat(501);
  await withCapability(
    {
      "skills/a/SKILL.md": `---\nname: a\ndescription: A\ncompatibility: ${long}\n---\n`,
      "skills/b/SKILL.md": "---\nname: b\ndescription: B\nmetadata:\n  n: 1\n---\n",
      "skills/c/SKILL.md": `---\nname: c\ndescription: C\ncompatibility: ${"y".repeat(500)}\n---\n`,
    },
    (cap) => {
      const files = cap.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.path?.split("/skills/")[1]);
      expect(files.sort()).toEqual(["a/SKILL.md", "b/SKILL.md"]);
      expect(cap.skills.map((s) => s.name)).toEqual(["c"]);
    },
  );
});

test("top-level paths in a native ACF skill fails and names the extras authoring forms", async () => {
  await withCapability(
    { "skills/s/SKILL.md": '---\nname: s\ndescription: S\npaths: ["src/**"]\n---\n' },
    (cap) => {
      const error = cap.diagnostics.find((d) => d.code === "acf.skill.paths-not-core");
      expect(error?.severity).toBe("error");
      expect(error?.message).toContain("targets.claude.native.paths");
      expect(error?.message).toContain("targets.cursor.native.paths");
      expect(codes(cap)).not.toContain("acf.markdown.unknown-frontmatter-field");
    },
  );
});

test("a target's skill key in a native ACF skill fails and names its ACF spelling", async () => {
  const skill = [
    "---",
    "name: s",
    "description: S",
    "disable-model-invocation: true",
    "user-invocable: false",
    "model: opus",
    "when_to_use: Before a release",
    "version: 1.0.0",
    "---",
    "",
  ].join("\n");
  await withCapability({ "skills/s/SKILL.md": skill }, (cap) => {
    const about = (field: string) =>
      cap.diagnostics.filter((d) => d.data?.field === field).map((d) => [d.severity, d.code]);
    const message = (field: string) =>
      cap.diagnostics.find((d) => d.data?.field === field)?.message ?? "";
    const notCore = "acf.skill.native-key-not-core";
    expect(about("disable-model-invocation")).toEqual([["error", notCore]]);
    expect(message("disable-model-invocation")).toContain("invocation.model: false");
    expect(about("user-invocable")).toEqual([["error", notCore]]);
    expect(message("user-invocable")).toContain("invocation.user: false");
    expect(about("model")).toEqual([["error", notCore]]);
    expect(message("model")).toContain("targets.claude.native.model");
    // Dropping a descriptive key changes no behavior, so it only warns.
    expect(about("when_to_use")).toEqual([["warn", notCore]]);
    expect(message("when_to_use")).toContain("targets.claude.native.when_to_use");
    // No target knows the key, so it is an ordinary unknown field.
    expect(about("version")).toEqual([["info", "acf.markdown.unknown-frontmatter-field"]]);
  });
});

test("top-level allowed-tools is the Agent Skills field, not a native key", async () => {
  for (const value of ['"Read Grep"', "[Read, Grep]"]) {
    const skill = `---\nname: s\ndescription: S\nallowed-tools: ${value}\n---\n`;
    await withCapability({ "skills/s/SKILL.md": skill }, (cap) => {
      expect(cap.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
      expect(cap.skills[0]?.frontmatter["allowed-tools"]).toBeDefined();
    });
  }
  await withCapability(
    { "skills/s/SKILL.md": "---\nname: s\ndescription: S\nallowed-tools: 3\n---\n" },
    (cap) => expect(errors(cap)).toEqual(["acf.markdown.invalid-frontmatter-field"]),
  );
});

test("stdio server cwd starts with a capability or data directory placeholder or ./", async () => {
  for (const cwd of ["./server", CAPABILITY_DIR, `${CAPABILITY_DIR}/srv`, `${DATA_DIR}/work`]) {
    await withCapability(
      mcpFile(`    transport: stdio\n    command: node\n    cwd: "${cwd}"\n`),
      (cap) => {
        expect(errors(cap)).toEqual([]);
        const server = cap.mcp?.servers[0];
        expect(server?.transport === "stdio" ? server.cwd : undefined).toBe(cwd);
      },
    );
  }
  for (const cwd of ["/srv/app", "server", "../up", `${CAPABILITY_DIR}/../up`, "./a/../../b"]) {
    await withCapability(
      mcpFile(`    transport: stdio\n    command: node\n    cwd: "${cwd}"\n`),
      (cap) => expect(errors(cap)).toEqual(["acf.mcp.cwd.invalid"]),
    );
  }
  await withCapability(
    mcpFile(`    transport: stdio\n    command: node\n    cwd: "${DOLLAR}{HOME}/x"\n`),
    (cap) => expect(errors(cap)).toEqual(["acf.mcp.cwd.invalid", "acf.mcp.placeholder.pending"]),
  );
  await withCapability(
    mcpFile("    transport: http\n    url: https://example.com/mcp\n    cwd: ./x\n"),
    (cap) => expect(errors(cap)).toEqual(["acf.mcp.cwd.invalid"]),
  );
});

test("server url is https, or http only for loopback hosts", async () => {
  for (const url of [
    "https://example.com/mcp",
    "http://localhost:3000/mcp",
    "http://127.0.0.1/mcp",
    "http://[::1]:8080/mcp",
  ]) {
    await withCapability(mcpFile(`    transport: http\n    url: "${url}"\n`), (cap) =>
      expect(errors(cap)).toEqual([]),
    );
  }
  for (const url of [
    "http://example.com/mcp",
    "http://localhost.example.com/",
    "ftp://example.com/x",
  ]) {
    await withCapability(mcpFile(`    transport: sse\n    url: "${url}"\n`), (cap) =>
      expect(errors(cap)).toEqual(["acf.mcp.url.insecure"]),
    );
  }
});

test("a credential in a server url fails without echoing the credential", async () => {
  const secret = "s3cretVALUE";
  await withCapability(
    mcpFile(`    transport: http\n    url: "https://user:${secret}@example.com/mcp"\n`),
    (cap) => {
      expect(errors(cap)).toEqual(["acf.mcp.url.credential-in-url"]);
      const serialized = JSON.stringify(cap.diagnostics);
      expect(serialized).not.toContain(secret);
      expect(cap.diagnostics[0]?.message).toContain("https://***@example.com/mcp");
    },
  );
});

test("the data directory placeholder is valid in stdio fields and invalid in url and headers", async () => {
  await withCapability(
    mcpFile(
      `    transport: stdio\n    command: "${DATA_DIR}/bin/srv"\n    args: ["--db", "${DATA_DIR}/x.db"]\n    env:\n      STATE: "${DATA_DIR}"\n`,
    ),
    (cap) => expect(errors(cap)).toEqual([]),
  );
  await withCapability(
    mcpFile(
      `    transport: http\n    url: "https://example.com/${DATA_DIR}"\n    headers:\n      X-State: "${DATA_DIR}/s"\n`,
    ),
    (cap) =>
      expect(errors(cap)).toEqual([
        "acf.mcp.placeholder.unsupported",
        "acf.mcp.placeholder.unsupported",
      ]),
  );
});

test("a host environment reference in a canonical MCP field is an error naming its native route", async () => {
  await withCapability(
    mcpFile(
      `    transport: stdio\n    command: "${CAPABILITY_DIR}/bin/srv"\n    args: ["--token=${DOLLAR}{TOKEN:-none}", "${DOLLAR}{ACF_PACKAGE_DIR}/x", "${DOLLAR}{ACF_HOOK_DIR}/y"]\n    env:\n      API_KEY: "${DOLLAR}{API_KEY}"\n      STATE: "${DATA_DIR}"\n`,
    ),
    (cap) => {
      expect(errors(cap)).toEqual(["acf.mcp.placeholder.pending", "acf.mcp.placeholder.pending"]);
      const [args, env] = cap.diagnostics.map((d) => d.message);
      expect(args).toContain("args[0]");
      expect(env).toContain("env.API_KEY");
      expect(env).toContain(`${DOLLAR}{API_KEY}`);
      expect(env).toContain("references to host environment variables, files or user options");
      expect(env).toContain("targets.<target>.native");
      expect(env).toContain("targets.claude.native.mcpServers");
    },
  );
  await withCapability(
    mcpFile(
      `    transport: http\n    url: "https://example.com/${DOLLAR}{env:REGION}"\n    headers:\n      Authorization: "Bearer ${DOLLAR}{API_KEY}"\n`,
    ),
    (cap) =>
      expect(cap.diagnostics.map((d) => d.message.split(" references ")[0])).toEqual([
        "server srv: url",
        "server srv: headers.Authorization",
      ]),
  );
});

test("a reference another target's host expands is an error in every canonical MCP field", async () => {
  // OpenCode substitutes {env:...} and {file:...} anywhere in opencode.json; pi-mcp-adapter
  // expands $env:NAME. Each would turn a literal canonical value into a host reference.
  await withCapability(
    mcpFile(
      `    transport: stdio\n    command: node\n    args: ["--key={env:API_KEY}", "{file:./secret}"]\n    env:\n      TOKEN: "$env:TOKEN"\n      PLAIN: "{env}"\n`,
    ),
    (cap) =>
      expect(cap.diagnostics.map((d) => [d.code, d.message.split(", which ")[0]])).toEqual([
        ["acf.mcp.placeholder.pending", "server srv: args[0] references {env:API_KEY}"],
        ["acf.mcp.placeholder.pending", "server srv: args[1] references {file:./secret}"],
        ["acf.mcp.placeholder.pending", "server srv: env.TOKEN references $env:TOKEN"],
      ]),
  );
  await withCapability(
    mcpFile(
      `    transport: http\n    url: "https://example.com/{env:REGION}"\n    headers:\n      Authorization: "Bearer {file:~/.token}"\n`,
    ),
    (cap) =>
      expect(errors(cap)).toEqual(["acf.mcp.placeholder.pending", "acf.mcp.placeholder.pending"]),
  );
});

test("a server's target extension holds only native extras", async () => {
  for (const key of ["localDev: true", "scope: project", "servers: []"]) {
    await withCapability(
      mcpFile(
        `    transport: stdio\n    command: srv\n    targets:\n      claude:\n        ${key}\n`,
      ),
      (cap) => expect(errors(cap)).toEqual(["acf.target.extension.unknown-field"]),
    );
  }
});

test("a family-level native server gets the canonical server checks", async () => {
  const native = (target: string, server: string) => ({
    "mcp/mcp.yml": `targets:\n  ${target}:\n    servers:\n      - name: native\n${server}`,
  });
  const stdio = "        transport: stdio\n        command: srv\n";
  for (const [file, code] of [
    [
      native("codex", '        transport: http\n        url: "http://example.com/mcp"\n'),
      "acf.mcp.url.insecure",
    ],
    [
      native("codex", `${stdio}        env:\n          KEY: "\${HOST_KEY}"\n`),
      "acf.mcp.placeholder.pending",
    ],
    [
      native("codex", `${stdio}        targets:\n          codex:\n            bogus: 1\n`),
      "acf.target.extension.unknown-field",
    ],
    [native("nope", stdio), "acf.target.unknown-id"],
  ] as const) {
    await withCapability(file, (cap) => expect(errors(cap)).toEqual([code]));
  }
});

test("a family-level native server joins the server list for its own target only", async () => {
  const file = {
    "mcp/mcp.yml": [
      "servers:",
      "  - name: shared",
      "    transport: stdio",
      "    command: srv",
      "targets:",
      "  codex:",
      "    servers:",
      "      - name: codex-only",
      "        transport: stdio",
      "        command: srv",
      "      - name: narrowed",
      "        transport: stdio",
      "        command: srv",
      "        only: [claude]",
      "  claude:",
      "    servers:",
      "      - name: codex-only",
      "        transport: stdio",
      "        command: srv",
      "",
    ].join("\n"),
  };
  await withCapability(file, (cap) => {
    expect(errors(cap)).toEqual([]);
    expect(cap.mcp?.servers.map(({ name, only }) => [name, only])).toEqual([
      ["shared", undefined],
      ["codex-only", ["codex"]],
      ["narrowed", []],
      ["codex-only", ["claude"]],
    ]);
  });
});

test("a server may not reuse a name its target already receives", async () => {
  const stdio = "        transport: stdio\n        command: srv\n";
  const canonical = "servers:\n  - name: tools\n    transport: stdio\n    command: srv\n";
  for (const body of [
    `${canonical}  - name: tools\n    transport: http\n    url: https://example.com/mcp\n`,
    `${canonical}targets:\n  codex:\n    servers:\n      - name: tools\n${stdio}`,
    `targets:\n  codex:\n    servers:\n      - name: tools\n${stdio}      - name: tools\n${stdio}`,
  ]) {
    await withCapability({ "mcp/mcp.yml": body }, (cap) => {
      expect(errors(cap)).toEqual(["acf.facet.duplicate"]);
      expect(cap.mcp?.servers.map((server) => server.name)).toEqual(["tools"]);
    });
  }
  await withCapability(
    {
      "mcp/mcp.yml": `targets:\n  codex:\n    servers:\n      - name: tools\n${stdio}        except: [nope]\n`,
    },
    (cap) => expect(errors(cap)).toEqual(["acf.target.unknown-id"]),
  );
});

test("an unknown key in a family-level target block is reported", async () => {
  await withCapability({ "mcp/mcp.yml": "targets:\n  codex:\n    server: []\n" }, (cap) =>
    expect(errors(cap)).toEqual(["acf.target.extension.unknown-field"]),
  );
});
