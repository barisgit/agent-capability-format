/**
 * Classified native keys per target (capability-model-layers, Native key classification).
 *
 * Lists every skill frontmatter key, MCP server key and plugin-manifest key that the research
 * inventories record for Claude, Codex, Cursor, OpenCode and Pi. Readers and the extras
 * validator use the class of a key's value to decide whether an untranslated key may be
 * dropped (descriptive, granting, functional) or blocks the component (restricting), and the
 * key's value schema to validate authored extras. `generatedFrom` marks keys a writer derives
 * from a core field; `pending` names the future core field of a pending meaning (design D17).
 */
import { z } from "zod";
import type {
  InteropFamily,
  NativeKeyClass,
  NativeKeyInfo,
  SafetyClass,
} from "../types/interop.js";
import type { TargetId } from "../types/model.js";

/**
 * Future core fields for meanings that stay pending in this change (canonical-skills and
 * canonical-mcp, Pending core meanings; design D17), mapped to the meaning they stand for.
 * Names promised by `canonical-skill-mcp-extensions` are used where that change fixes them;
 * the rest are working names that `acf.core.pending` reports until a change promotes them.
 */
export const pendingCoreFields: Readonly<Record<string, string>> = {
  "skill.display-name": "skill display name",
  "skill.paths": "path-scoped activation",
  "skill.arguments": "declared arguments and body placeholders",
  "skill.context": "isolated execution",
  "skill.agent": "agent coupling",
  "skill.requires.mcp": "MCP requirements",
  "mcp.enabled": "server enablement",
  "mcp.tools.enabled": "tool allowlist",
  "mcp.tools.disabled": "tool denylist",
  "mcp.timeouts.startupMs": "startup timeout",
  "mcp.timeouts.toolMs": "tool timeout",
  "mcp.envFile": "environment file",
  "mcp.transport=socket": "Unix-socket transport",
  "mcp.headersHelper": "computed headers",
  "mcp.oauth": "OAuth settings",
  "mcp.tools.autoApprove": "tool auto-approval",
  "mcp.tools.loading": "deferred-loading and promotion hints",
  "mcp.watch": "watch-restart",
  "mcp.valueReferences": "references to host environment variables, files or user options",
  "package.display-name": "package display name",
  "package.dependencies": "package dependencies",
  "package.userConfig": "user configuration options",
};

/**
 * One registry entry. A key the writer generates from a core field (`generatedFrom`) has no value
 * schema: authoring it is `acf.extras.conflict` whatever the value. Every other key declares the
 * native value domain its host documents, which validation checks (`nativeValueProblem`).
 */
type KeySpec = {
  class: SafetyClass;
  valueClasses?: readonly { value: boolean; class: SafetyClass }[];
  pending?: string;
} & ({ generatedFrom: string; value?: never } | { generatedFrom?: never; value: z.ZodType });

// Value domains shared by many keys, as the research inventories record them.
const str = z.string();
const bool = z.boolean();
const num = z.number();
const strList = z.array(z.string());
const strOrList = z.union([str, strList]);
const object = z.record(z.string(), z.unknown());
const strMap = z.record(z.string(), z.string());
/** A manifest component: a path, an inline definition, or an array combining them. */
const component = z.union([str, object, z.array(z.union([str, object]))]);
const approvalMode = z.enum(["auto", "prompt", "writes", "approve"]);

const descriptive = (value: z.ZodType): KeySpec => ({ class: "descriptive", value });
const functional = (value: z.ZodType): KeySpec => ({ class: "functional", value });
const granting = (value: z.ZodType): KeySpec => ({ class: "granting", value });
const restricting = (value: z.ZodType): KeySpec => ({ class: "restricting", value });
const gen = (safety: SafetyClass, field: string): KeySpec => ({
  class: safety,
  generatedFrom: field,
});
const pend = (safety: SafetyClass, field: string, value: z.ZodType): KeySpec => ({
  class: safety,
  pending: field,
  value,
});
/** A switch whose `false` turns something off: dropping that value turns it back on. */
const offRestricts = (spec: KeySpec): KeySpec => ({
  ...spec,
  valueClasses: [{ value: false, class: "restricting" }],
});

/** Skill keys every Agent Skills reader shares, written from core fields. */
const AGENT_SKILLS_KEYS = {
  name: gen("functional", "skill.name"),
  description: gen("functional", "skill.description"),
  license: gen("descriptive", "skill.license"),
  compatibility: gen("descriptive", "skill.compatibility"),
  metadata: gen("descriptive", "skill.metadata"),
} satisfies Record<string, KeySpec>;

const skillKeys: Record<TargetId, Record<string, KeySpec>> = {
  // claude-code.md, Frontmatter inventory.
  claude: {
    ...AGENT_SKILLS_KEYS,
    when_to_use: descriptive(str),
    "argument-hint": gen("descriptive", "skill.argument-hint"),
    arguments: pend("functional", "skill.arguments", strOrList),
    "disable-model-invocation": gen("restricting", "skill.invocation.model=false"),
    "user-invocable": gen("restricting", "skill.invocation.user=false"),
    "allowed-tools": granting(strOrList),
    "disallowed-tools": restricting(strOrList),
    model: functional(str),
    effort: functional(z.enum(["low", "medium", "high", "xhigh", "max"])),
    context: pend("functional", "skill.context", z.literal("fork")),
    agent: pend("functional", "skill.agent", str),
    background: functional(bool),
    // Skill hooks can block tool calls, so dropping them could widen what the agent may do.
    hooks: restricting(object),
    paths: pend("restricting", "skill.paths", strOrList),
    shell: functional(z.enum(["bash", "powershell"])),
  },
  // codex.md, SKILL.md and agents/openai.yaml; openai.yaml keys are dotted paths.
  codex: {
    ...AGENT_SKILLS_KEYS,
    "allowed-tools": granting(strOrList),
    "interface.display_name": pend("descriptive", "skill.display-name", str),
    "interface.short_description": descriptive(str),
    "interface.icon_small": descriptive(str),
    "interface.icon_large": descriptive(str),
    "interface.brand_color": descriptive(str),
    "interface.default_prompt": descriptive(str),
    "policy.allow_implicit_invocation": gen("restricting", "skill.invocation.model=false"),
    "dependencies.tools": pend("functional", "skill.requires.mcp", z.array(object)),
  },
  // cursor.md, SKILL.md YAML frontmatter.
  cursor: {
    ...AGENT_SKILLS_KEYS,
    paths: pend("restricting", "skill.paths", strOrList),
    globs: pend("restricting", "skill.paths", strOrList),
    "disable-model-invocation": gen("restricting", "skill.invocation.model=false"),
    icon: descriptive(str),
    color: descriptive(
      z.enum([
        "default",
        "green",
        "cyan",
        "blue",
        "purple",
        "magenta",
        "orange",
        "yellow",
        "red",
        "brand",
      ]),
    ),
  },
  // opencode.md, Skills: other keys are ignored by the loader.
  opencode: { ...AGENT_SKILLS_KEYS },
  // pi.md, Skills.
  pi: {
    ...AGENT_SKILLS_KEYS,
    "allowed-tools": granting(strOrList),
    "disable-model-invocation": gen("restricting", "skill.invocation.model=false"),
  },
};

const MCP_PROCESS_KEYS = {
  command: gen("functional", "mcp.command"),
  args: gen("functional", "mcp.args"),
  env: gen("functional", "mcp.env"),
  url: gen("functional", "mcp.url"),
} satisfies Record<string, KeySpec>;

const mcpKeys: Record<TargetId, Record<string, KeySpec>> = {
  // claude-code.md, Server fields.
  claude: {
    ...MCP_PROCESS_KEYS,
    type: gen("functional", "mcp.transport"),
    headers: gen("functional", "mcp.headers"),
    headersHelper: pend("functional", "mcp.headersHelper", str),
    // Per-server tool timeout in milliseconds; Claude rejects values under 1000.
    timeout: pend("functional", "mcp.timeouts.startupMs", num.min(1000)),
    alwaysLoad: pend("descriptive", "mcp.tools.loading", bool),
    bareElicitationCapability: functional(bool),
    oauth: pend("functional", "mcp.oauth", object),
  },
  // codex.md, Native config.toml.
  codex: {
    ...MCP_PROCESS_KEYS,
    cwd: gen("functional", "mcp.cwd"),
    env_vars: pend(
      "functional",
      "mcp.valueReferences",
      z.array(
        z.union([
          str,
          z.looseObject({ name: str, source: z.enum(["local", "remote"]).optional() }),
        ]),
      ),
    ),
    experimental_environment: functional(z.enum(["local", "remote"])),
    auth: functional(z.enum(["oauth", "chatgpt"])),
    bearer_token_env_var: pend("functional", "mcp.valueReferences", str),
    http_headers: gen("functional", "mcp.headers"),
    env_http_headers: pend("functional", "mcp.valueReferences", strMap),
    http_headers_helper: pend("functional", "mcp.headersHelper", str),
    oauth_resource: pend("functional", "mcp.oauth", str),
    oauth: pend("functional", "mcp.oauth", object),
    scopes: pend("functional", "mcp.oauth", strList),
    startup_timeout_sec: pend("functional", "mcp.timeouts.startupMs", num.nonnegative()),
    startup_timeout_ms: pend("functional", "mcp.timeouts.startupMs", num.nonnegative()),
    tool_timeout_sec: pend("functional", "mcp.timeouts.toolMs", num.nonnegative()),
    enabled: offRestricts(pend("functional", "mcp.enabled", bool)),
    required: functional(bool),
    enabled_tools: pend("restricting", "mcp.tools.enabled", strList),
    disabled_tools: pend("restricting", "mcp.tools.disabled", strList),
    default_tools_approval_mode: pend("granting", "mcp.tools.autoApprove", approvalMode),
    tools: pend(
      "granting",
      "mcp.tools.autoApprove",
      z.record(
        z.string(),
        z.looseObject({
          approval_mode: approvalMode.optional(),
          output_token_limit: z.number().int().positive().optional(),
        }),
      ),
    ),
  },
  // cursor.md, Files and fields.
  cursor: {
    ...MCP_PROCESS_KEYS,
    type: gen("functional", "mcp.transport"),
    envFile: pend("functional", "mcp.envFile", str),
    // Not generated from core mcp.cwd: that cell is refused for loose Cursor output.
    cwd: functional(str),
    headers: gen("functional", "mcp.headers"),
    auth: pend("functional", "mcp.oauth", object),
  },
  // opencode.md, MCP servers: args travel in the command array, env is `environment`.
  opencode: {
    type: gen("functional", "mcp.transport"),
    command: gen("functional", "mcp.command"),
    cwd: gen("functional", "mcp.cwd"),
    environment: gen("functional", "mcp.env"),
    url: gen("functional", "mcp.url"),
    headers: gen("functional", "mcp.headers"),
    enabled: offRestricts(pend("functional", "mcp.enabled", bool)),
    timeout: pend("functional", "mcp.timeouts.startupMs", z.number().int().positive()),
    oauth: pend("functional", "mcp.oauth", z.union([object, z.literal(false)])),
  },
  // facets/mcp.md: Pi MCP is the pi-mcp-adapter extension (ServerEntry in its types.ts).
  pi: {
    ...MCP_PROCESS_KEYS,
    description: descriptive(str),
    cwd: gen("functional", "mcp.cwd"),
    headers: gen("functional", "mcp.headers"),
    oauth: pend("functional", "mcp.oauth", z.union([object, z.literal(false)])),
    auth: pend("functional", "mcp.oauth", z.union([z.enum(["oauth", "bearer"]), z.literal(false)])),
    bearerToken: functional(str),
    bearerTokenEnv: pend("functional", "mcp.valueReferences", str),
    excludeTools: pend("restricting", "mcp.tools.disabled", strList),
    directTools: pend("descriptive", "mcp.tools.loading", z.union([bool, strList])),
    promotedTools: pend("descriptive", "mcp.tools.loading", strList),
    lifecycle: functional(z.enum(["keep-alive", "lazy", "eager"])),
    idleTimeout: functional(num.nonnegative()),
    exposeResources: offRestricts(functional(bool)),
    toolOverrides: functional(z.record(z.string(), z.looseObject({ description: str }))),
    debug: descriptive(bool),
  },
};

/** Manifest metadata keys most plugin formats share; descriptive and not written from core. */
const LISTING_KEYS = {
  name: descriptive(str),
  version: descriptive(str),
  description: descriptive(str),
  author: descriptive(z.looseObject({ name: str.optional(), email: str.optional() })),
  homepage: descriptive(str),
  repository: descriptive(str),
  license: descriptive(str),
  keywords: descriptive(strList),
} satisfies Record<string, KeySpec>;

const packageKeys: Record<TargetId, Record<string, KeySpec>> = {
  // claude-code.md, Plugin layout and manifest.
  claude: {
    name: gen("descriptive", "package.name"),
    version: gen("descriptive", "package.version"),
    description: gen("descriptive", "package.description"),
    author: gen("descriptive", "package.authors"),
    homepage: gen("descriptive", "package.homepage"),
    repository: gen("descriptive", "package.repository"),
    license: gen("descriptive", "package.license"),
    keywords: gen("descriptive", "package.keywords"),
    $schema: descriptive(str),
    displayName: pend("descriptive", "package.display-name", str),
    metadata: descriptive(object),
    icon: descriptive(str),
    documentationUrl: descriptive(str),
    supportUrl: descriptive(str),
    privacyPolicyUrl: descriptive(str),
    termsOfServiceUrl: descriptive(str),
    defaultEnabled: offRestricts(functional(bool)),
    dependencies: pend(
      "functional",
      "package.dependencies",
      z.array(
        z.union([
          str,
          z.looseObject({ name: str, version: str.optional(), marketplace: str.optional() }),
        ]),
      ),
    ),
    settings: functional(object),
    userConfig: pend("functional", "package.userConfig", object),
    types: descriptive(str),
    channels: functional(z.array(object)),
    skills: functional(strOrList),
    commands: functional(z.union([strOrList, object])),
    agents: functional(strOrList),
    // Plugin hooks can block tool calls (guard hooks), so dropping them could widen behavior.
    hooks: restricting(component),
    mcpServers: functional(component),
    lspServers: functional(component),
    outputStyles: functional(strOrList),
    workflows: functional(strOrList),
    experimental: functional(object),
    themes: descriptive(strOrList),
    monitors: functional(component),
  },
  // codex.md, Portable manifest and OpenAI extension and compatibility manifest.
  codex: {
    ...LISTING_KEYS,
    $schema: descriptive(str),
    extensions: functional(z.record(z.string(), object)),
    interface: descriptive(object),
    id: descriptive(str),
    // A relative path in the docs; the exhaustive accepted shapes are unknown.
    apps: functional(z.union([str, object])),
    hooks: restricting(component),
    skills: functional(strOrList),
    mcpServers: functional(str),
  },
  // cursor.md, Cursor Plugin manifest: .cursor-plugin/plugin.json.
  cursor: {
    ...LISTING_KEYS,
    logo: descriptive(str),
    rules: functional(strOrList),
    agents: functional(strOrList),
    skills: functional(strOrList),
    commands: functional(strOrList),
    hooks: restricting(z.union([str, object])),
    mcpServers: functional(component),
    variables: functional(object),
  },
  // opencode.md: OpenCode plugins are code modules without a manifest.
  opencode: {},
  // pi.md, Packaging, install and scopes: package.json fields Pi reads.
  pi: {
    name: descriptive(str),
    version: descriptive(str),
    keywords: descriptive(strList),
    pi: functional(object),
    dependencies: pend("functional", "package.dependencies", strMap),
    peerDependencies: functional(strMap),
    bundledDependencies: functional(strList),
  },
};

const tables: Record<InteropFamily, Record<TargetId, Record<string, KeySpec>>> = {
  skill: skillKeys,
  mcp: mcpKeys,
  package: packageKeys,
};

const indexKey = (target: TargetId, family: InteropFamily, key: string): string =>
  `${target}\u0000${family}\u0000${key}`;

const entries = (Object.keys(tables) as InteropFamily[]).flatMap((family) =>
  Object.entries(tables[family]).flatMap(([target, keys]) =>
    Object.entries(keys).map(([key, spec]) => {
      const info: NativeKeyInfo = {
        target,
        family,
        key,
        class: spec.class,
        ...(spec.valueClasses === undefined ? {} : { valueClasses: spec.valueClasses }),
        ...(spec.generatedFrom === undefined ? {} : { generatedFrom: spec.generatedFrom }),
        ...(spec.pending === undefined ? {} : { pending: { coreField: spec.pending } }),
      };
      return { info, value: spec.value };
    }),
  ),
);

/** Every classified native key, grouped by family and then target. */
export const nativeKeys: readonly NativeKeyInfo[] = entries.map((entry) => entry.info);

const keyIndex = new Map(
  entries.map((entry) => [indexKey(entry.info.target, entry.info.family, entry.info.key), entry]),
);

/**
 * Classification of one native key. Returns undefined for a key the registry does not know;
 * callers treat that as `unclassified` (dropped with `acf.extras.dropped`, design D4).
 */
export function nativeKeyInfo(
  target: TargetId,
  family: InteropFamily,
  key: string,
): NativeKeyInfo | undefined {
  return keyIndex.get(indexKey(target, family, key))?.info;
}

/**
 * Why `value` is outside the native value domain of a known key, or undefined when it is inside
 * (capability-model-layers, Inline native extras). Unknown keys and keys a writer generates
 * from a core field have no domain here: the first are accepted as written, the second are
 * conflicts whatever their value.
 */
export function nativeValueProblem(
  target: TargetId,
  family: InteropFamily,
  key: string,
  value: unknown,
): string | undefined {
  const result = keyIndex.get(indexKey(target, family, key))?.value?.safeParse(value);
  if (result === undefined || result.success) return undefined;
  return result.error.issues[0]?.message ?? "invalid value";
}

const DROP_RANK: Record<SafetyClass, number> = {
  descriptive: 0,
  granting: 1,
  functional: 2,
  restricting: 3,
};

/**
 * Safety class of `value` for a classified key (capability-model-layers, Safety classes: each
 * value condition with a distinct effect has its own class); `unclassified` for an unknown key.
 * Without a value (`undefined`, which no authored YAML or JSON value is), the class whose loss
 * is most consequential among all values applies.
 */
export function nativeKeyClass(info: NativeKeyInfo | undefined, value?: unknown): NativeKeyClass {
  if (info === undefined) return "unclassified";
  const conditions = info.valueClasses ?? [];
  if (value !== undefined) {
    return conditions.find((condition) => condition.value === value)?.class ?? info.class;
  }
  return strictestClass([info.class, ...conditions.map((condition) => condition.class)]);
}

/** The class in `classes` whose loss is most consequential; `descriptive` for none. */
export function strictestClass(classes: readonly SafetyClass[]): SafetyClass {
  return classes.reduce<SafetyClass>(
    (worst, next) => (DROP_RANK[next] > DROP_RANK[worst] ? next : worst),
    "descriptive",
  );
}
