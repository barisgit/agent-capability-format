/**
 * Field-level support registry for skills, MCP servers, ACF hooks and package metadata
 * (capability-model-layers, Field-level support registry).
 *
 * Each {@link FieldSupport} entry is one row of a canonical field support table, split so
 * every field and every value condition has its own row. Writers look up the target/carrier with
 * {@link supportCell}; diagnostics take their code, severity and text from the cell.
 */
import type {
  Carrier,
  CellEvidence,
  FieldSupport,
  InteropFamily,
  SafetyClass,
  SupportCell,
} from "../types/interop.js";
import {
  acfCapabilityDirPlaceholder,
  acfDataDirPlaceholder,
  type TargetId,
} from "../types/model.js";
import { placeholder } from "../utils/placeholder.js";

/** Carriers a target offers and the one used when the configuration names none. */
export type TargetCarriers = { available: readonly Carrier[]; default: Carrier };

const LOOSE_ONLY: TargetCarriers = { available: ["loose"], default: "loose" };

/**
 * Per-target carriers. Claude receives a real plugin by default and loose files on request;
 * every other built-in target receives loose files.
 */
export const targetCarriers: Readonly<Record<TargetId, TargetCarriers>> = {
  claude: { available: ["plugin", "loose"], default: "plugin" },
  codex: LOOSE_ONLY,
  cursor: LOOSE_ONLY,
  opencode: LOOSE_ONLY,
  pi: LOOSE_ONLY,
};

/** Carriers of `target`; targets registered outside this table receive loose files. */
export function carriersOf(target: TargetId): TargetCarriers {
  return targetCarriers[target] ?? LOOSE_ONLY;
}

// Research citations: `<inventory path>#<section heading>`.
const RESEARCH = "research/plugin-interop";
const SRC = {
  claudeSkill: `${RESEARCH}/tools/claude-code.md#Frontmatter inventory`,
  claudeSkillBody: `${RESEARCH}/tools/claude-code.md#Body, resources and invocation`,
  codexSkill: `${RESEARCH}/tools/codex.md#SKILL.md`,
  codexOpenaiYaml: `${RESEARCH}/tools/codex.md#agents/openai.yaml`,
  codexSkillInvocation: `${RESEARCH}/tools/codex.md#Discovery and invocation`,
  cursorSkill: `${RESEARCH}/tools/cursor.md#SKILL.md YAML frontmatter`,
  opencodeSkill: `${RESEARCH}/tools/opencode.md#Skills`,
  piSkill: `${RESEARCH}/tools/pi.md#Skills`,
  bundledFiles: `${RESEARCH}/facets/skills.md#2.5 Bundled-file contract`,
  claudeMcp: `${RESEARCH}/tools/claude-code.md#Server fields`,
  claudeMcpExpansion: `${RESEARCH}/tools/claude-code.md#Expansion, trust and runtime controls`,
  codexMcp: `${RESEARCH}/tools/codex.md#Native config.toml`,
  cursorMcp: `${RESEARCH}/tools/cursor.md#Files and fields`,
  opencodeMcp: `${RESEARCH}/tools/opencode.md#MCP servers`,
  mcpTable: `${RESEARCH}/facets/mcp.md#3.1 Table A - current and planned writer targets`,
  claudeManifest: `${RESEARCH}/tools/claude-code.md#Plugin layout and manifest`,
} as const;

/** Table columns: Claude splits by carrier, every other target has only `loose`. */
type Row = {
  claudePlugin: SupportCell;
  claudeLoose: SupportCell;
  codex: SupportCell;
  cursor: SupportCell;
  opencode: SupportCell;
  pi: SupportCell;
};

function documented(source: string): CellEvidence {
  return { level: "documented", source };
}

function native(
  spelling: string,
  source: string,
  extra: { location?: string; condition?: string } = {},
): SupportCell {
  return { kind: "native", spelling, ...extra, evidence: documented(source) };
}

function translated(rule: string, source: string): SupportCell {
  return { kind: "translated", rule, evidence: documented(source) };
}

function degraded(loss: string, source: string): SupportCell {
  return { kind: "degraded", loss, severity: "lossy", evidence: documented(source) };
}

function refused(reason: string, source: string, negativeFixture?: string): SupportCell {
  return {
    kind: "refused",
    reason,
    evidence: documented(source),
    ...(negativeFixture === undefined ? {} : { negativeFixture }),
  };
}

function claude(cell: SupportCell): Pick<Row, "claudePlugin" | "claudeLoose"> {
  return { claudePlugin: cell, claudeLoose: cell };
}

function field(family: InteropFamily, id: string, safety: SafetyClass, row: Row): FieldSupport {
  return {
    family,
    field: id,
    class: safety,
    cells: {
      claude: { plugin: row.claudePlugin, loose: row.claudeLoose },
      codex: { loose: row.codex },
      cursor: { loose: row.cursor },
      opencode: { loose: row.opencode },
      pi: { loose: row.pi },
    },
  };
}

/** A row whose every target writes the field under the same native key. */
function sameKey(
  family: InteropFamily,
  id: string,
  safety: SafetyClass,
  key: string,
  overrides: Partial<Row> = {},
): FieldSupport {
  return field(family, id, safety, {
    ...claude(native(key, family === "skill" ? SRC.claudeSkill : SRC.claudeMcp)),
    codex: native(key, family === "skill" ? SRC.codexSkill : SRC.codexMcp),
    cursor: native(key, family === "skill" ? SRC.cursorSkill : SRC.cursorMcp),
    opencode: native(key, family === "skill" ? SRC.opencodeSkill : SRC.opencodeMcp),
    pi: native(key, family === "skill" ? SRC.piSkill : SRC.mcpTable),
    ...overrides,
  });
}

const NOT_PRE_APPROVED = "allowed-tools is not written, so the host asks before the tools run";

const OPENCODE_IGNORES = { condition: "OpenCode accepts the key and ignores it" };
const CURSOR_UNINTERPRETED = { condition: "Cursor documents no interpretation of the key" };

function descriptiveSkillKey(key: string, cursorDocumented: boolean): FieldSupport {
  return sameKey("skill", `skill.${key}`, "descriptive", key, {
    cursor: native(key, SRC.cursorSkill, cursorDocumented ? {} : CURSOR_UNINTERPRETED),
    opencode: native(key, SRC.opencodeSkill, OPENCODE_IGNORES),
  });
}

const skillFields: FieldSupport[] = [
  sameKey("skill", "skill.name", "functional", "name"),
  sameKey("skill", "skill.description", "functional", "description"),
  descriptiveSkillKey("license", false),
  descriptiveSkillKey("compatibility", false),
  descriptiveSkillKey("metadata", true),
  field("skill", "skill.invocation.model=false", "restricting", {
    ...claude(native("disable-model-invocation: true", SRC.claudeSkill)),
    codex: native("policy.allow_implicit_invocation: false", SRC.codexOpenaiYaml, {
      location: "agents/openai.yaml",
    }),
    cursor: native("disable-model-invocation: true", SRC.cursorSkill),
    opencode: refused(
      "OpenCode has no invocation control, so the model could load a manual-only skill on its own",
      SRC.opencodeSkill,
      "skill-manual-only-opencode",
    ),
    pi: native("disable-model-invocation: true", SRC.piSkill),
  }),
  field("skill", "skill.invocation.user=false", "restricting", {
    ...claude(native("user-invocable: false", SRC.claudeSkillBody)),
    codex: refused(
      "Codex has no switch that refuses explicit $skill invocation",
      SRC.codexSkillInvocation,
      "skill-user-only-codex",
    ),
    cursor: refused(
      "Cursor documents no key that refuses explicit invocation",
      SRC.cursorSkill,
      "skill-user-only-cursor",
    ),
    opencode: refused(
      "OpenCode has no invocation control",
      SRC.opencodeSkill,
      "skill-user-only-opencode",
    ),
    pi: refused(
      "Pi always allows /skill:name and has no switch to refuse it",
      SRC.piSkill,
      "skill-user-only-pi",
    ),
  }),
  field("skill", "skill.argument-hint", "descriptive", {
    ...claude(native("argument-hint", SRC.claudeSkill)),
    codex: degraded("the argument hint is not shown", SRC.codexSkill),
    cursor: degraded("the argument hint is not shown", SRC.cursorSkill),
    opencode: degraded("the argument hint is not shown", SRC.opencodeSkill),
    pi: degraded("the argument hint is not shown", SRC.piSkill),
  }),
  // Agent Skills field (design D26): only Claude reads it as a grant. Dropping it narrows what
  // runs without asking; the other hosts do not enforce it (Codex and Pi document it as
  // experimental metadata, Cursor and OpenCode do not read it).
  field("skill", "skill.allowed-tools", "granting", {
    ...claude(native("allowed-tools", SRC.claudeSkill)),
    codex: degraded(NOT_PRE_APPROVED, SRC.codexSkill),
    cursor: degraded(NOT_PRE_APPROVED, SRC.cursorSkill),
    opencode: degraded(NOT_PRE_APPROVED, SRC.opencodeSkill),
    pi: degraded(NOT_PRE_APPROVED, SRC.piSkill),
  }),
  sameKeyCells(
    "skill",
    "skill.files",
    "functional",
    native("files beside SKILL.md", SRC.bundledFiles),
  ),
  sameKeyCells(
    "skill",
    "skill.files.executable",
    "functional",
    native("executable bit of the copied file", SRC.bundledFiles),
  ),
];

/** A row with one identical cell for every target and carrier. */
function sameKeyCells(
  family: InteropFamily,
  id: string,
  safety: SafetyClass,
  cell: SupportCell,
): FieldSupport {
  return field(family, id, safety, {
    ...claude(cell),
    codex: cell,
    cursor: cell,
    opencode: cell,
    pi: cell,
  });
}

const CLAUDE_PLUGIN_ROOT = placeholder("CLAUDE_PLUGIN_ROOT");
const CLAUDE_PLUGIN_DATA = placeholder("CLAUDE_PLUGIN_DATA");

/**
 * The path placeholders of SPEC.md §13.6.3, each with its Claude plugin spelling and the
 * directory a loose carrier writes for it. `${ACF_PACKAGE_DIR}` is an alias of the capability
 * directory; in an MCP value `${ACF_HOOK_DIR}` names the directory of the capability's MCP file.
 */
const PATH_PLACEHOLDERS = [
  {
    name: acfCapabilityDirPlaceholder,
    plugin: CLAUDE_PLUGIN_ROOT,
    directory: "the installed capability directory",
  },
  {
    name: placeholder("ACF_PACKAGE_DIR"),
    plugin: CLAUDE_PLUGIN_ROOT,
    directory: "the installed capability directory",
  },
  {
    name: placeholder("ACF_HOOK_DIR"),
    plugin: `${CLAUDE_PLUGIN_ROOT}/<directory of mcp.yml>`,
    directory: "the installed directory of mcp.yml",
  },
] as const;
type PathPlaceholder = (typeof PATH_PLACEHOLDERS)[number];

const absoluteDir = (placeholder: PathPlaceholder) => (source: string) =>
  translated(`${placeholder.name} becomes the absolute path of ${placeholder.directory}`, source);
const capletDataDir = (source: string) =>
  translated(
    `${acfDataDirPlaceholder} becomes <install-root>/.acf/data/<capability>/, which caplet creates`,
    source,
  );

const CLAUDE_CWD_REASON =
  "Claude ignores a server cwd key and starts plugin stdio servers in the directory claude was launched from, so the server would run elsewhere than declared";

const CLAUDE_CWD_EVIDENCE: CellEvidence = {
  level: "verified",
  source: `${RESEARCH}/tools/claude-code.md#Runtime verification (claude 2.1.97, 2026-10-08)`,
  hostVersion: "claude 2.1.97",
};
/** The opt-in real-host test: caplet's plugin ran its stdio server from Claude's install copy. */
const CLAUDE_END_TO_END_EVIDENCE: CellEvidence = {
  level: "verified",
  source: `${RESEARCH}/tools/claude-code.md#Caplet end to end (claude 2.1.97, task 5.9)`,
  hostVersion: "claude 2.1.97",
};

/** The `cwd` refusal on both Claude carriers, each proven by its own negative fixture. */
const claudeCwdRefusal: Pick<Row, "claudePlugin" | "claudeLoose"> = {
  claudePlugin: {
    kind: "refused",
    reason: CLAUDE_CWD_REASON,
    evidence: CLAUDE_CWD_EVIDENCE,
    negativeFixture: "mcp-agent-plugins-cwd-claude",
  },
  claudeLoose: {
    kind: "refused",
    reason: CLAUDE_CWD_REASON,
    evidence: CLAUDE_CWD_EVIDENCE,
    negativeFixture: "mcp-agent-plugins-cwd-claude-loose",
  },
};

/** Placeholder rows: Claude's plugin carrier has its own variable, every loose carrier an absolute path. */
function placeholderRow(
  id: string,
  claudePluginRule: string,
  loose: (source: string) => SupportCell,
  claudePluginEvidence: CellEvidence = documented(SRC.claudeMcpExpansion),
): FieldSupport {
  return field("mcp", id, "functional", {
    claudePlugin: { kind: "translated", rule: claudePluginRule, evidence: claudePluginEvidence },
    claudeLoose: loose(SRC.claudeMcpExpansion),
    codex: loose(SRC.codexMcp),
    cursor: loose(SRC.cursorMcp),
    opencode: loose(SRC.opencodeMcp),
    pi: loose(SRC.mcpTable),
  });
}

/**
 * Cursor documents `cwd` only for plugin MCP servers; its behavior for the loose
 * `.cursor/mcp.json` that caplet writes is unknown, so the functional field is refused
 * until a verified test exists (capability-model-layers, Recorded equivalence evidence).
 */
const cursorCwdRefusal: SupportCell = refused(
  "Cursor documents cwd only for plugin MCP servers; loose .cursor/mcp.json behavior is unknown",
  SRC.cursorMcp,
);

/** Placeholder rows for `cwd`: Claude refuses `cwd` itself, so the placeholder is refused too. */
function cwdPlaceholderRow(id: string, loose: (source: string) => SupportCell): FieldSupport {
  return field("mcp", id, "functional", {
    ...claudeCwdRefusal,
    codex: loose(SRC.codexMcp),
    cursor: cursorCwdRefusal,
    opencode: loose(SRC.opencodeMcp),
    pi: loose(SRC.mcpTable),
  });
}

function remotePlaceholderRow(id: string, placeholder: PathPlaceholder): FieldSupport {
  return sameKeyCells(
    "mcp",
    id,
    "functional",
    refused(
      `${placeholder.name} names a local directory, which has no meaning in a URL or header sent to a remote server`,
      SRC.mcpTable,
    ),
  );
}

const mcpFields: FieldSupport[] = [
  field("mcp", "mcp.transport=stdio", "functional", {
    ...claude(native("command", SRC.claudeMcp)),
    codex: native("command", SRC.codexMcp),
    cursor: native("command", SRC.cursorMcp),
    opencode: translated(
      "type: local with command as an array of the command and its args",
      SRC.opencodeMcp,
    ),
    pi: native("command", SRC.mcpTable),
  }),
  field("mcp", "mcp.transport=http", "functional", {
    ...claude(native("type: http", SRC.claudeMcp)),
    codex: native("url", SRC.codexMcp),
    cursor: native("url", SRC.cursorMcp),
    opencode: native("type: remote", SRC.opencodeMcp),
    pi: native("url", SRC.mcpTable),
  }),
  field("mcp", "mcp.transport=sse", "functional", {
    ...claude(native("type: sse", SRC.claudeMcp)),
    codex: refused("Codex documents no SSE transport", SRC.codexMcp),
    cursor: refused("Cursor's SSE selector is unverified", SRC.cursorMcp),
    opencode: refused("OpenCode's SSE support is untraced", SRC.opencodeMcp),
    pi: refused("pi-mcp-adapter has no SSE selector and tries Streamable HTTP first", SRC.mcpTable),
  }),
  sameKey("mcp", "mcp.command=bare", "functional", "command", {
    opencode: native("command[0]", SRC.opencodeMcp),
  }),
  ...PATH_PLACEHOLDERS.map((path) =>
    placeholderRow(
      `mcp.command=${path.name}`,
      `${path.name}/x becomes ${path.plugin}/x`,
      absoluteDir(path),
    ),
  ),
  placeholderRow(
    `mcp.command=${acfDataDirPlaceholder}`,
    `${acfDataDirPlaceholder}/x becomes ${CLAUDE_PLUGIN_DATA}/x`,
    capletDataDir,
  ),
  sameKey("mcp", "mcp.command=absolute", "functional", "command", {
    opencode: native("command[0]", SRC.opencodeMcp),
  }),
  sameKey("mcp", "mcp.args", "functional", "args", {
    opencode: translated("args follow the command in the command array", SRC.opencodeMcp),
  }),
  sameKey("mcp", "mcp.env", "functional", "env", {
    opencode: translated("env becomes environment", SRC.opencodeMcp),
  }),
  sameKey("mcp", "mcp.cwd", "functional", "cwd", {
    ...claudeCwdRefusal,
    cursor: cursorCwdRefusal,
  }),
  sameKey("mcp", "mcp.url", "functional", "url"),
  sameKey("mcp", "mcp.headers", "functional", "headers", {
    codex: native("http_headers", SRC.codexMcp),
  }),
  ...PATH_PLACEHOLDERS.map((path) =>
    placeholderRow(
      `mcp.args=${path.name}`,
      `${path.name} becomes ${path.plugin}`,
      absoluteDir(path),
      // Only the capability directory in args ran on a real Claude host.
      path.name === acfCapabilityDirPlaceholder ? CLAUDE_END_TO_END_EVIDENCE : undefined,
    ),
  ),
  ...PATH_PLACEHOLDERS.map((path) =>
    placeholderRow(
      `mcp.env=${path.name}`,
      `${path.name} becomes ${path.plugin}`,
      absoluteDir(path),
    ),
  ),
  ...PATH_PLACEHOLDERS.map((path) => cwdPlaceholderRow(`mcp.cwd=${path.name}`, absoluteDir(path))),
  ...PATH_PLACEHOLDERS.map((path) => remotePlaceholderRow(`mcp.url=${path.name}`, path)),
  ...PATH_PLACEHOLDERS.map((path) => remotePlaceholderRow(`mcp.headers=${path.name}`, path)),
  placeholderRow(
    `mcp.args=${acfDataDirPlaceholder}`,
    `${acfDataDirPlaceholder} becomes ${CLAUDE_PLUGIN_DATA}`,
    capletDataDir,
  ),
  placeholderRow(
    `mcp.env=${acfDataDirPlaceholder}`,
    `${acfDataDirPlaceholder} becomes ${CLAUDE_PLUGIN_DATA}`,
    capletDataDir,
  ),
  cwdPlaceholderRow(`mcp.cwd=${acfDataDirPlaceholder}`, capletDataDir),
];

/** Package metadata has one destination in this change: the Claude plugin manifest. */
function packageField(id: string, cell: SupportCell): FieldSupport {
  return {
    family: "package",
    field: id,
    class: "descriptive",
    cells: { claude: { plugin: cell } },
  };
}

const packageFields: FieldSupport[] = [
  packageField("package.name", native("name", SRC.claudeManifest)),
  packageField(
    "package.version",
    native("version", SRC.claudeManifest, { condition: "with the +acf.<digest> build suffix" }),
  ),
  packageField("package.description", native("description", SRC.claudeManifest)),
  packageField("package.authors", translated("the first entry becomes author", SRC.claudeManifest)),
  packageField(
    "package.authors=Name <email>",
    translated('a legacy "Name <email>" string is decoded into name and email', SRC.claudeManifest),
  ),
  packageField(
    "package.authors.additional",
    degraded(
      "authors after the first are dropped; plugin.json has a single author",
      SRC.claudeManifest,
    ),
  ),
  packageField("package.license", native("license", SRC.claudeManifest)),
  packageField("package.homepage", native("homepage", SRC.claudeManifest)),
  packageField(
    "package.repository",
    native("repository", SRC.claudeManifest, { condition: "as a string" }),
  ),
  packageField("package.keywords", native("keywords", SRC.claudeManifest)),
];

/**
 * ACF hook records are not host-native handlers. Refuse the functional run field until a
 * native writer exists; foreign plugin hooks are native remainder, not this core field.
 */
const hookFields: FieldSupport[] = [
  field("hook", "hook.run", "functional", {
    ...claude(
      refused(
        "caplet has no native ACF hook writer; Claude requires nested hooks.<Event>[].hooks[] handlers",
        `${RESEARCH}/tools/claude-code.md#Hooks`,
      ),
    ),
    codex: refused(
      "Codex requires nested handlers in hooks.json or config.toml, not caplet settings.json records",
      `${RESEARCH}/tools/codex.md#Hooks`,
    ),
    cursor: refused(
      "caplet has no writer for Cursor's native hooks.json handlers",
      `${RESEARCH}/tools/cursor.md#Hooks`,
    ),
    opencode: refused(
      "OpenCode requires executable JS/TS plugin functions, not declarative hook records",
      `${RESEARCH}/tools/opencode.md#Hooks: every lifecycle event and its meaning, matchers, handler types (command, http, prompt, script module), input payload, output contract, exit codes and decisions (allow/deny/ask/modify/inject context), timeouts, env vars, ordering, scope`,
    ),
    pi: refused(
      "Pi requires executable JS/TS extension subscriptions, not declarative hook records",
      `${RESEARCH}/tools/pi.md#Hooks`,
    ),
  }),
];

/** Every field-level support declaration, in table order: skills, MCP, hooks, package metadata. */
export const fieldSupport: readonly FieldSupport[] = [
  ...skillFields,
  ...mcpFields,
  ...hookFields,
  ...packageFields,
];

const fieldsById = new Map(fieldSupport.map((entry) => [entry.field, entry]));

/** The declaration for `field`, or undefined when the registry has no such field id. */
export function findFieldSupport(field: string): FieldSupport | undefined {
  return fieldsById.get(field);
}

/**
 * The support cell for one field id on one target and carrier.
 *
 * Returns undefined when the field has no destination there (package metadata outside the
 * Claude plugin manifest). Throws for an unknown field id or a carrier the target does not
 * offer, because both are writer bugs rather than support facts.
 */
export function supportCell(
  field: string,
  target: TargetId,
  carrier: Carrier,
): SupportCell | undefined {
  const entry = fieldsById.get(field);
  if (entry === undefined) throw new Error(`unknown support field ${field}`);
  if (!carriersOf(target).available.includes(carrier)) {
    throw new Error(`${target} has no ${carrier} carrier`);
  }
  return entry.cells[target]?.[carrier];
}
