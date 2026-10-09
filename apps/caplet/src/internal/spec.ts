import { targetIds } from "@caplet/core";

export type FlagSpec = {
  name: string;
  short?: string;
  arg?: string;
  type: "boolean" | "string";
  default?: boolean | string;
  description: string;
  negativeDescription?: string;
  hidden?: boolean;
};

export type PositionalSpec = {
  name: string;
  description: string;
  required: boolean;
};

export type CommandGroup = "MANAGE" | "SYNC" | "INSPECT" | "SETUP";

export type CommandSpec = {
  name: string;
  group: CommandGroup;
  summary: string;
  usage: string;
  positionals?: PositionalSpec[];
  flags?: FlagSpec[];
  globals: boolean;
  target: boolean;
  examples?: string[];
};

export const GLOBAL_FLAGS: FlagSpec[] = [
  {
    name: "scope",
    short: "s",
    arg: "<project|user>",
    type: "string",
    description: "limit to one scope (default: both; mutations infer)",
  },
  {
    name: "cwd",
    short: "C",
    arg: "<dir>",
    type: "string",
    default: ".",
    description: "run as if caplet were started in <dir>",
  },
  { name: "quiet", short: "q", type: "boolean", default: false, description: "errors only" },
  {
    name: "verbose",
    short: "v",
    type: "boolean",
    default: false,
    description: "expand file lists and show info diagnostics",
  },
  {
    name: "yes",
    short: "y",
    type: "boolean",
    default: false,
    description: "skip confirmation prompts",
  },
  {
    name: "json",
    type: "boolean",
    default: false,
    description: "machine-readable output on stdout",
  },
  {
    name: "strict",
    type: "boolean",
    default: false,
    description: "treat lossy adapter warnings as failures",
  },
  {
    name: "fail-on-lossy",
    type: "boolean",
    default: false,
    description: "deprecated alias for --strict",
    hidden: true,
  },
];

export const TARGET_FLAG: FlagSpec = {
  name: "target",
  short: "t",
  arg: "<id>",
  type: "string",
  description: `limit targets: ${targetIds.join(", ")} (repeatable or comma-separated)`,
};

export const SCOPE_VALUES = ["user", "project"] as const;

export const COMMAND_SPECS: CommandSpec[] = [
  {
    name: "init",
    group: "MANAGE",
    summary: "create .agents/capabilities.yml for this project",
    usage: "caplet init",
    globals: true,
    target: false,
    examples: ["caplet init"],
  },
  {
    name: "add",
    group: "MANAGE",
    summary: "add capabilities from a source and apply them",
    usage: "caplet add <source>... [flags]",
    positionals: [
      {
        name: "source",
        description: "github:owner/repo, git:<url>, or a local path",
        required: true,
      },
    ],
    flags: [
      {
        name: "pin",
        arg: "<ref>",
        type: "string",
        description: "pin a git ref (branch, tag, or commit)",
      },
      {
        name: "ref",
        arg: "<ref>",
        type: "string",
        description: "deprecated alias for --pin",
        hidden: true,
      },
      {
        name: "path",
        arg: "<subdir>",
        type: "string",
        description: "capability directory inside the source",
      },
      {
        name: "as",
        arg: "<name>",
        type: "string",
        description: "install under a different capability name",
      },
      {
        name: "rename",
        arg: "<name>",
        type: "string",
        description: "deprecated alias for --as",
        hidden: true,
      },
      {
        name: "apply",
        type: "boolean",
        default: true,
        description: "apply after updating the manifest",
        negativeDescription: "edit the manifest only; skip resolve and apply",
      },
    ],
    globals: true,
    target: true,
    examples: [
      "caplet add github:vercel-labs/skills@find-skills --pin main",
      "caplet add github:acme/design-caps",
      "caplet add ../local-caps --scope user",
      "caplet add github:acme/caps --pin v2.1.0 --no-apply",
    ],
  },
  {
    name: "remove",
    group: "MANAGE",
    summary: "remove a capability and its managed output",
    usage: "caplet remove <name>... [flags]",
    positionals: [{ name: "name", description: "capability name", required: true }],
    globals: true,
    target: true,
    examples: ["caplet remove design-caps"],
  },
  {
    name: "update",
    group: "MANAGE",
    summary: "re-resolve sources to their latest refs and apply",
    usage: "caplet update [name] [flags]",
    positionals: [{ name: "name", description: "optional capability name", required: false }],
    flags: [
      {
        name: "apply",
        type: "boolean",
        default: true,
        description: "apply after updating the manifest",
        negativeDescription: "refresh the lockfile only",
      },
    ],
    globals: true,
    target: true,
    examples: ["caplet update", "caplet update design-caps --no-apply"],
  },
  {
    name: "apply",
    group: "SYNC",
    summary: "reconcile emitted files with your capability manifests",
    usage: "caplet apply [flags]",
    flags: [
      {
        name: "dry-run",
        short: "n",
        type: "boolean",
        default: false,
        description: "show the change plan without writing anything",
      },
      {
        name: "offline",
        type: "boolean",
        default: false,
        description: "never fetch; use the lockfile as-is",
      },
      {
        name: "frozen",
        type: "boolean",
        default: false,
        description: "fail (exit 3) if the lockfile is stale",
      },
      {
        name: "mode",
        arg: "<mode>",
        type: "string",
        description: "deprecated: use --offline (never) or caplet update (force)",
        hidden: true,
      },
    ],
    globals: true,
    target: true,
    examples: ["caplet apply", "caplet apply -n", "caplet apply -s user -t claude"],
  },
  {
    name: "status",
    group: "INSPECT",
    summary: "summarize scopes, capabilities, and pending changes",
    usage: "caplet status",
    globals: true,
    target: false,
    examples: ["caplet", "caplet status"],
  },
  {
    name: "list",
    group: "INSPECT",
    summary: "list installed capabilities (alias: ls)",
    usage: "caplet list",
    globals: true,
    target: false,
    examples: ["caplet list", "caplet list -s user"],
  },
  {
    name: "show",
    group: "INSPECT",
    summary: "show a capability's contents and target support",
    usage: "caplet show <name>",
    positionals: [{ name: "name", description: "capability name", required: true }],
    globals: true,
    target: false,
    examples: ["caplet show design-caps"],
  },
  {
    name: "check",
    group: "INSPECT",
    summary: "validate manifests and detect stale outputs (CI-friendly)",
    usage: "caplet check [flags]",
    flags: [
      {
        name: "frozen",
        type: "boolean",
        default: false,
        description: "also fail (exit 3) if the lockfile is stale",
      },
    ],
    globals: true,
    target: true,
    examples: ["caplet check --frozen --strict"],
  },
  {
    name: "doctor",
    group: "INSPECT",
    summary: "check caplet environment and setup",
    usage: "caplet doctor",
    globals: true,
    target: false,
    examples: ["caplet doctor"],
  },
  {
    name: "completion",
    group: "SETUP",
    summary: "print shell completions (bash, zsh, fish)",
    usage: "caplet completion <shell>",
    positionals: [{ name: "shell", description: "bash, zsh, or fish", required: true }],
    globals: false,
    target: false,
    examples: ["caplet completion zsh > ~/.zsh/completions/_caplet"],
  },
];

export function commandSpec(name: string): CommandSpec | undefined {
  return COMMAND_SPECS.find((spec) => spec.name === name);
}

export function commandNames(): string[] {
  return COMMAND_SPECS.map((spec) => spec.name);
}

export function specToCittyArgs(name: string): Record<string, unknown> {
  const spec = commandSpec(name);
  if (spec === undefined) throw new Error(`no command spec: ${name}`);
  const args: Record<string, unknown> = {};
  for (const positional of spec.positionals ?? []) {
    args[positional.name] = {
      type: "positional",
      required: positional.required,
      description: positional.description,
    };
  }
  const flags = [
    ...(spec.globals ? GLOBAL_FLAGS : []),
    ...(spec.target ? [TARGET_FLAG] : []),
    ...(spec.flags ?? []),
  ];
  for (const flag of flags) {
    const def: Record<string, unknown> = { type: flag.type, description: flag.description };
    if (flag.short !== undefined) def.alias = flag.short;
    if (flag.default !== undefined) def.default = flag.default;
    if (flag.negativeDescription !== undefined) def.negativeDescription = flag.negativeDescription;
    args[flag.name] = def;
  }
  return args;
}
undefined;

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function closest(input: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 2 ? best : undefined;
}

/** Validate flag tokens against a command's spec. Returns an error message for the first unknown flag. */
export function unknownFlagError(command: string | undefined, argv: string[]): string | undefined {
  const spec = command === undefined ? undefined : commandSpec(command);
  const flags = [
    ...GLOBAL_FLAGS,
    ...(spec?.target === true ? [TARGET_FLAG] : []),
    ...(spec?.flags ?? []),
  ];
  const known = new Set<string>(["--help", "--version"]);
  const booleanShorts = new Set<string>(["h", "V"]);
  for (const flag of flags) {
    known.add(`--${flag.name}`);
    if (flag.type === "boolean") known.add(`--no-${flag.name}`);
    if (flag.short !== undefined) {
      known.add(`-${flag.short}`);
      if (flag.type === "boolean") booleanShorts.add(flag.short);
    }
  }
  known.add("-h");
  known.add("-V");
  for (const token of argv) {
    if (token === "--") break;
    if (!token.startsWith("-") || token === "-") continue;
    const name = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (known.has(name)) continue;
    if (!name.startsWith("--") && name.length > 2) {
      // bundled shorts like -nv: accept only when every letter is a known boolean short
      const letters = name.slice(1).split("");
      if (letters.every((letter) => booleanShorts.has(letter))) continue;
    }
    const suggestion = closest(name, [...known]);
    const hint = suggestion === undefined ? "" : ` — did you mean ${suggestion}?`;
    return `unknown flag: ${name}${hint}`;
  }
  return undefined;
}
