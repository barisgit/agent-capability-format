# Facet: subagents and custom agents (snapshot 2026-10-01)

Scope: agent definition files and their fields (identity, description, instructions, model, tools, permissions, color, and the rest), invocation and delegation, and definition scopes. Inputs: every inventory in [`../tools/`](../tools/), the advisor note [`../advice-core-vs-extras.md`](../advice-core-vs-extras.md), `SPEC.md` sections 5, 6, 7, 10, 11.4, 14, 15, 17.6, 22 and 24, `packages/core/src/types/model.ts`, `packages/core/src/schemas/index.ts`, `packages/core/src/reader/index.ts`, `packages/core/src/targets/{registry,extensions}.ts`, and `packages/adapters/src/**`.

Two official pages were re-checked on 2026-10-01 because the design leans on them: [Claude subagents](https://code.claude.com/docs/en/sub-agents) (field table, scope priority, plugin-ignored fields, `tools`/`disallowedTools` evaluation, `Agent(type)` syntax, permission-mode interaction with the parent) and [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) (TOML schema, model/effort resolution, inheritance of the parent's live sandbox overrides). Everything else relies on the cited inventories; section 7 lists what remains unverified.

Terminology used below:

- **Agent definition**: a named, file- or config-backed persona with instructions that a host can run either as the session's main agent (*primary role*) or as an isolated child that another agent delegates to (*subagent role*).
- **Availability** (a tool list) decides which tools exist for the agent. **Approval** (a permission rule) decides whether an available call runs, asks, or is refused. The two are never merged (conflict C6).
- **Security restriction**: `readonly`, `tools.deny`, the allowlist part of `tools.allow`, `permissions` deny rules, and blocking agent-scoped hooks. **Focus restriction**: `availableSkills`, `delegates`, `maxTurns`, `mcpServers`, and `hidden`. The two classes degrade differently (section 4, rule R2).

## 1. Concept map

### 1.1 Who has agent definitions at all

| Tool | Native concept | Definition files | Format | Plugin channel for agents |
|---|---|---|---|---|
| Claude Code | subagent (also usable as main agent through `--agent` or the `agent` setting) | `.claude/agents/**/*.md`, `~/.claude/agents/`, managed, `--agents` JSON, plugin `agents/` | Markdown + YAML | Claude plugin `agents/`, namespaced `<plugin>:<name>`; plugin agents ignore `permissionMode`, `hooks`, `mcpServers`, `initialPrompt` |
| Codex | custom agent (spawnable subagent; built-ins `default`, `worker`, `explorer`) | `.codex/agents/*.toml`, `~/.codex/agents/*.toml` | TOML config layer | None documented: agents are not a plugin component |
| GitHub Copilot (CLI, cloud) | custom agent | `.github/agents/*.agent.md`, `~/.copilot/agents/`, also reads `.claude/agents/` | Markdown + YAML | Agent Plugins `com.github.copilot/agents/`; legacy manifest `agents` |
| VS Code (Local) | custom agent (former chat mode) | `.github/agents/*.agent.md`, `.claude/agents/*.md`, `~/.copilot/agents`, `~/.claude/agents` | Markdown + YAML | Agent Plugins `com.github.copilot/agents/` |
| Cursor | subagent | `.cursor/agents/`, `.claude/agents/`, `.codex/agents/` and user equivalents | Markdown + YAML | `.cursor-plugin` manifest `agents`; the Agent Plugins root manifest documents only skills and MCP for Cursor |
| Gemini CLI | subagent, local or remote (A2A) | `.gemini/agents/*.md`, `~/.gemini/agents/`, extension `agents/` | Markdown + YAML | Gemini extension `agents/` |
| OpenCode | agent with `mode` primary, subagent, or all | `.opencode/agents/<name>.md`, `~/.config/opencode/agents/`, `opencode.json` `agent.<name>` | Markdown + YAML or JSON | None (OpenCode plugins are code modules) |
| Amp | code-defined agent and agent mode; declarative `defineAgent` directory | Plugin JS/TS; declarative directory discovery unknown | TypeScript | Amp plugin code |
| Devin Local (Windsurf) | subagent profile (preview, custom profiles experimental) | `.devin/agents/<name>.md` or `<name>/AGENT.md`, `.agents/agents/`, `~/.config/devin/agents/` | Markdown + YAML | Devin plugin `agents/`, namespaced `<plugin>:<name>` |
| Windsurf Cascade | none | none | none | none |
| Cline | configured agent (source-only, CLI/SDK) | `.cline/agents/*.yaml`, `~/.cline/agents/` | YAML frontmatter + body despite `.yaml` | none |
| Roo Code | custom mode | `.roomodes`, global `custom_modes.yaml` | YAML or JSON list | none |
| Goose | custom agent (load into conversation, or delegate) | `.agents/agents/<name>.md`, `~/.agents/agents/`, `.goose/agents/`, `.claude/agents/` | Markdown + YAML | not established |
| Kiro | custom agent (primary and subagent) | `.kiro/agents/<name>.json` or `.md`, `~/.kiro/agents/` | JSON, or Markdown + YAML with the same fields | not established (Agent Plugins adoption documented, agent component not) |
| Pi | none natively; extensions such as `pi-subagents` may add one | none | none | none |
| Lume | role (plus presets in settings) | `<config>/roles/<name>.md`, `<workspace>/.lume/roles/<name>.md` | Markdown + YAML | none (extensions are code) |
| Agent Plugins 1.0 | none (only skills and MCP are portable) | none | none | client namespace only |
| Agent Skills / AGENTS.md / MCPB | none | none | none | none |

Two layout coincidences matter for writers. ACF's `agents/<name>/AGENT.md` directory form is exactly Devin Local's directory form. `.agents/agents/<name>.md` is read by both Goose and Devin Local, which makes it a candidate shared loose-file root analogous to `.agents/skills/` (open question Q9).

### 1.2 Shared meanings and their spellings

A row exists when at least two tools express the same meaning. "Same meaning" is judged by behavior, not by key name; rows that look alike but behave differently are listed in section 4 instead.

| Meaning | Spellings (tool: key) | Count |
|---|---|---|
| Stable identity used for lookup, references and dedup | Claude `name` (filename may differ); Codex `name` (authoritative); Gemini `name`; Cline `name` (case-insensitive); Goose `name`; Devin `name` (overrides path); Kiro `name` (else path); OpenCode filename or config key; Lume filename; Copilot relative-path ID (`team/reviewer.agent.md` becomes `team--reviewer`); Roo `slug`; Amp mode `key` or directory name; VS Code `name` (defaults to filename); Cursor `name` (defaults to filename) | 14 |
| Human display label distinct from identity | Copilot `name` (display/selection alias); Roo `name`; Amp `display.label` / declarative `label` / mode `label` | 3 |
| Selection and delegation guidance | `description` almost everywhere; Roo splits UI `description` from delegation `whenToUse` | 15 |
| Agent instructions | Markdown body (Claude, Copilot, VS Code, Cursor, Gemini, OpenCode file, Devin, Cline, Goose, Kiro `.md`, Lume); Codex `developer_instructions`; OpenCode JSON `prompt`; Kiro `prompt` (inline or `file://`); Roo `roleDefinition` (+ `customInstructions`); Amp `instructions` / `instructions.md` | 16 |
| Role admission (primary-selectable vs model-delegatable) | OpenCode `mode: primary, subagent, all`; Lume `mode: root, subagent, all`; Copilot and VS Code `user-invocable` + `disable-model-invocation` (legacy `infer`); Amp `registerAgentMode` vs `createAgent` | 5 |
| Hidden from user pickers but still invocable | OpenCode `hidden`; Amp `draft` | 2 |
| Background (non-blocking) execution by default | Claude `background`; Cursor `is_background` | 2 |
| Model selection | `model` (Claude, Codex, Copilot, VS Code, Cursor, Gemini, OpenCode, Amp, Devin, Goose, Kiro, Lume); Cline `providerId` + `modelId` | 13 |
| Explicit "same model as parent" | Claude `model: inherit`; Cursor `model: inherit` (default); Gemini `model: inherit` (default) | 3 |
| Ordered model fallback list | Copilot CLI `models`; VS Code `model: [..]`; Lume `model: [..]` | 3 |
| Reasoning effort | Claude `effort`; Codex `model_reasoning_effort`; Copilot `reasoningEffort`; Amp `reasoningEffort`; Cursor model parameter `[effort=..]`; Lume `:<thinking>` model suffix; OpenCode `variant` (provider-defined) | 7 |
| Sampling temperature | Gemini `temperature`; OpenCode `temperature` | 2 |
| Agentic iteration bound | Claude `maxTurns`; Gemini `max_turns`; OpenCode `steps` (legacy `maxSteps`); Cline `maxIterations` | 4 |
| Load or omit ambient project instructions (CLAUDE.md, copilot-instructions) | Claude `omitClaudeMd` (inverse); Copilot CLI `include-custom-instructions` | 2 |
| Skill admission (which skills the agent may see/invoke) | Lume `skills` selector; Kiro `resources: skill://..`; Codex `skills.config` (per-skill enable); OpenCode `permission.skill` patterns | 4 |
| Tool availability allowlist | Claude `tools`; Copilot `tools`; VS Code `tools`; Gemini `tools`; Kiro `tools`; Devin `allowed-tools` / `tools`; Cline `tools`; Amp `tools.include`; Lume `tools` selector; Roo `groups` (coarse); OpenCode `permission` deny entries (and deprecated `tools` map) | 11 |
| Tool availability denylist | Claude `disallowedTools`; Kiro `excludedTools`; Amp `tools.exclude`; Lume `!token`; VS Code Claude-compat `disallowedTools` | 5 |
| MCP tool selectors inside tool lists | Claude `mcp__<server>`, `mcp__<server>__<tool>`; Copilot `server/tool`, `server/*`; VS Code `<server>/*`; Gemini `mcp_<server>_*`; Kiro `@server`, `@server/tool`; Amp `mcp__*`; Lume `mcp` selector | 7 |
| Read-only agent (no workspace mutation) | Cursor `readonly`; Codex `sandbox_mode = "read-only"`; Roo `groups` without `edit`/`command`; OpenCode `permission: {edit: deny, bash: deny}`; Kiro `permissions.rules` deny `fs_write` | 5 |
| Per-agent approval rules (allow, ask, deny per operation and pattern) | OpenCode `permission`; Kiro `permissions.rules` and `allowedTools`; Gemini policy TOML rules with `subagent = <name>` (package policy files, not frontmatter) | 3 |
| Which agents this agent may delegate to | VS Code `agents`; Lume `agents.delegates`; Kiro `toolsSettings.subagent.availableAgents`; OpenCode `permission.task`; Claude `tools: Agent(a, b)` (main-thread only) | 5 |
| Agent-scoped MCP servers | Claude `mcpServers`; Gemini `mcpServers`; Copilot `mcp-servers`; VS Code `mcp-servers` (only for `target: github-copilot`); Kiro `mcpServers`; Codex `mcp_servers` | 6 |
| Agent-lifetime hooks | Claude `hooks`; VS Code `hooks` (preview); Kiro `hooks` | 3 |
| UI color | Claude `color` (8 names); OpenCode `color` (hex or theme token); Amp `display.color` / `color` (hex); Lume `color` (9 names) | 4 |
| Surface applicability within one product family | Copilot/VS Code `target: vscode, github-copilot`; ACF `only`/`except` | 2 |

Meanings present in only one tool (and therefore extras): Claude `permissionMode`, `memory`, `isolation`, `initialPrompt`, `skills` (preload), `experimental.cacheTtl`; Copilot `modelPolicy`, `metadata`; VS Code `argument-hint`, `handoffs`; Gemini `kind: remote` and A2A card/auth, `timeout_mins`; OpenCode `top_p`, `options`, `disable`, theme-token colors; Amp `extends`, `oracle`, `subagents`, `compactionThresholdTokens`, `features`, `serverOnly`, mention-only `mcpServers`; Devin `max-nesting`; Kiro `toolAliases`, `includeMcpJson`, `includePowers`, `resources: file://` and knowledge bases, `keyboardShortcut`, `welcomeMessage`, `trustedAgents`; Roo `customInstructions`, edit `fileRegex` beyond the canonical mapping, `rulesFiles`; Lume extension-owned keys. Kiro `welcomeMessage` (displayed greeting) and Claude `initialPrompt` (auto-submitted first user turn) look alike but do not share a meaning.

### 1.3 Invocation and delegation

| Tool | Model delegation | Explicit user invocation | Run as main agent | Nesting |
|---|---|---|---|---|
| Claude | `Agent` tool, by description | `@agent-<name>`, `@agent-<plugin>:<name>` | `claude --agent`, `agent` setting (plugin settings may set `agent`) | up to 3 levels; `Agent` withheld at the limit |
| Codex | model spawns, steers, waits, closes children | explicit request; `/agent` switches threads | no (custom agents are children) | `[agents]` thread limits |
| Copilot | inference unless disabled | `/agent` picker, `copilot --agent ID --prompt` | yes (picker selection) | not documented |
| VS Code | subagent tool, gated by the parent's `agents` list | picker | yes (picker) | needs `chat.subagents.allowInvocationsFromSubagents` |
| Cursor | Task tool | `/name`, natural language | no | main and direct children may spawn; grandchildren cannot |
| Gemini | automatic | `@name` nudges delegation | no | agents cannot invoke agents |
| OpenCode | Task tool, gated by `permission.task` | `@name` (allowed even when Task permission denies) | primary agents are user-switchable | `subagent_depth` (global), default 1 |
| Amp | `agent.run`, `createThread`, registered tools | mode picker | `registerAgentMode` | API-controlled |
| Devin Local | model-selected profile | user names a profile | not documented | default none; `max-nesting` per profile |
| Cline | `spawn_agent` | not documented for configured agents | not documented | nested spawning allowed |
| Roo | `new_task` with mode, `switch_mode` | mode picker | yes (modes are primary) | via `new_task` |
| Goose | `summon` `delegate` (isolated) | `@name`; `load` adds instructions to the current conversation | `load` approximates it | nested spawning blocked; only in `auto` permission mode |
| Kiro | automatic or explicit, parallel | explicit | yes (IDE/CLI) | parent rules constrain descendants |
| Lume | `agent` tool from `builtin:agents` (1-8 runs per call) | `/role`, `--role` | `/role`, presets | depth 3, 4 concurrent |

Invocation syntax is host behavior, not a definition field. ACF models it only through `mode`, `hidden`, `delegates`, and structured references such as command `agent:` (SPEC 11.4). Prose references inside bodies (for example "use @reviewer") are not rewritten (section 4, C2).

### 1.4 Scopes and precedence

| Tool | Precedence, highest first |
|---|---|
| Claude | managed > `--agents` CLI > project `.claude/agents` > user `~/.claude/agents` > plugin |
| Copilot CLI | user `~/.copilot/agents` > project `.github/agents` (deepest first) > project `.claude/agents` > added roots > plugins > organization/enterprise |
| VS Code | not documented across sources |
| Cursor | project > user; `.cursor/` > `.claude/` and `.codex/`; plugin position unknown |
| Codex | custom beats same-named built-in; project vs personal unknown |
| Gemini | unknown |
| OpenCode | project over global (config merge); not stated per agent file |
| Kiro | workspace > user |
| Cline | project > global; first case-insensitive name wins |
| Roo | project modes > global |
| Lume | config (user) role > repository role |
| Devin, Goose | unknown |
| ACF (SPEC 17.6) | project shadows user per `(family, name)`; same-scope collision is an error |

Copilot and Lume invert ACF's user/project order (conflict C3).

## 2. Proposed canonical core schema (`agents/<name>.md` frontmatter)

The core is the union of the meanings in 1.2 that at least two tools share, with one canonical spelling each. Every field is optional except `name` and `description`. "Unset" always means "host default"; no unset field may be emitted as a value that broadens the host default.

| Canonical field | Type and enum | Meaning | Unset means | Origin tools (spelling) |
|---|---|---|---|---|
| `name` | slug (SPEC 5.1) | Stable identity; equals the file or directory basename. Used by references (`delegates`, command `agent:`, hook matchers). | required | all (see 1.2 row 1) |
| `displayName` | string, 1-64 chars | Human label shown in pickers; never used for lookup. | host shows `name` | Copilot `name`, Roo `name`, Amp `label` / `display.label` |
| `description` | string, non-empty | When to select or delegate to this agent. | required | all; Roo `whenToUse` |
| body | CommonMark | Agent instructions. Placement (system prompt, developer message, appended, prepended to the user prompt) is host-defined (C9). | empty body allowed | all |
| `mode` | `all`, `primary`, `subagent` | Role admission: `primary` = may be selected as the main agent and not auto-delegated; `subagent` = may be delegated to and not selected as main; `all` = both. Explicit user `@mention` delegation is not governed by `mode`. | `all` (unchanged from SPEC 10.3) | OpenCode `mode`, Lume `mode` (`root`), Copilot/VS Code invocation booleans, Amp mode vs agent |
| `hidden` | boolean | Omit from user pickers and autocomplete; still invocable by delegation or explicit id. Visibility only, never security. | `false` | OpenCode `hidden`, Amp `draft` |
| `background` | boolean | Run as a non-blocking background child by default. | host default | Claude `background`, Cursor `is_background` |
| `model` | `inherit`, `default`, ModelRef, or non-empty list of ModelRef | `inherit` = the delegating (or current) agent's resolved model. `default` = the host's configured default for agents of this role (Codex `[agents].default_subagent_model`, Devin `agent.subagent_model`, Claude `CLAUDE_CODE_SUBAGENT_MODEL`). ModelRef = `<provider>/<model-id>` (OpenCode, Amp, Lume spelling). A list is an ordered preference; the first candidate the target can use wins. | `inherit` (keeps acf: 1 semantics; see 6.2) | all 13 model-bearing tools; lists from Copilot `models`, VS Code, Lume |
| `effort` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` (total order) | Reasoning effort for this agent. | host/parent resolution | Claude `effort`, Codex `model_reasoning_effort`, Copilot `reasoningEffort`, Amp `reasoningEffort`, Cursor `[effort=]`, Lume `:<thinking>`, OpenCode `variant` |
| `temperature` | number, 0-2 | Sampling temperature. | host default | Gemini, OpenCode |
| `maxTurns` | positive integer | Upper bound on agentic iterations (model call plus tool round). Behavior at the bound is host-defined (C14). | host default | Claude `maxTurns`, Gemini `max_turns`, OpenCode `steps`, Cline `maxIterations` |
| `ambientInstructions` | boolean | Whether ambient project instruction files (CLAUDE.md, AGENTS.md, copilot-instructions) load into this agent. | host default (Claude includes; Copilot subagents exclude) | Claude `omitClaudeMd` (inverse), Copilot `include-custom-instructions` |
| `availableSkills` | list of skill names or `*` | Skill admission: the agent may list and invoke only these skills. Not preloading (C10). | all skills the host offers | Lume `skills`, Kiro `skill://` resources, Codex `skills.config`, OpenCode `permission.skill` |
| `tools.allow` | list of ToolSelector | Availability allowlist. `[]` = no tools. | inherit the parent/session tool pool | 11 tools (1.2) |
| `tools.deny` | list of ToolSelector | Availability denylist; deny wins over allow regardless of order. | nothing denied | Claude, Kiro, Amp, Lume, VS Code compat |
| `readonly` | boolean | `true` = the agent MUST NOT create, edit or delete workspace files and MUST NOT run state-changing commands. `false` = no restriction from this field; never a grant. | `false` | Cursor, Codex, Roo, OpenCode, Kiro |
| `permissions` | list of `{operation: OperationId, pattern?: string, decision: allow, ask, deny}` | Per-agent approval rules. Evaluation is order-independent: the most restrictive matching decision wins (`deny` > `ask` > `allow`). Rules can only narrow the parent/session policy, except that `allow` may suppress prompts where the host permits it (C8). | host/parent policy | OpenCode `permission`, Kiro `permissions.rules` / `allowedTools`, Gemini policy `subagent` |
| `delegates` | list of agent names or `*` | Agents this agent may delegate to. `[]` = may not delegate. | host default | VS Code `agents`, Lume `agents.delegates`, Kiro `availableAgents`, OpenCode `permission.task`, Claude `Agent(a, b)` |
| `mcpServers` | list of (server name string, or inline server object using the SPEC 13a.3 server schema) | MCP servers attached for this agent's lifetime. A string references a server from the same capability's `mcp/mcp.yml`, else a host-configured server. | inherit the parent's MCP availability | Claude, Gemini, Copilot, VS Code, Kiro, Codex |
| `hooks` | mapping of canonical hook type to hook entries (SPEC 13.2-13.7 schema) | Hooks active only while this agent runs. Event set and effect contracts are owned by the hooks facet (C13). | none | Claude, VS Code, Kiro |
| `color` | `red`, `orange`, `yellow`, `green`, `cyan`, `sky`, `blue`, `purple`, `magenta`, `pink`, or `#rrggbb` | UI color. The named set is the union of Claude's and Lume's palettes. | host default | Claude, OpenCode, Amp, Lume |
| `assets`, `only`, `except`, `targets` | unchanged (SPEC 16, 6, 7) | Asset references, applicability, per-target extras. `targets` changes meaning slightly (section 5). | | ACF |

**ToolSelector grammar.** A selector is one of: an operation id; `mcp` (every MCP tool); `mcp:<server>`; `mcp:<server>/<tool>`; or `any`. Native tool names are never canonical (SPEC 14.5). For reading to be lossless the operation set must be at least as fine-grained as the finest host, so this facet needs the provisional set in SPEC 24 refined (Q1):

| Proposed operation | Replaces / refines | Claude | Copilot alias | OpenCode permission key | Kiro tag | Gemini (unverified names) |
|---|---|---|---|---|---|---|
| `file_read` | same | `Read` | `read` | `read` | `read` | `read_file`, `read_many_files` |
| `file_list` | part of `code_search` | `Glob` (no separate list tool) | `search` | `list` | `read` | `list_directory` |
| `file_search` (by name/glob) | part of `code_search` | `Glob` | `search` | `glob` | `read` | `glob` |
| `content_search` (grep) | part of `code_search` | `Grep` | `search` | `grep` | `read` | `search_file_content` |
| `file_write` | same | `Write` | `edit` | `edit` | `write` | `write_file` |
| `file_edit` | same | `Edit` | `edit` | `edit` | `write` | `replace` |
| `notebook_edit` | new | `NotebookEdit` | `edit` | `edit` | `write` | none |
| `shell` | same | `Bash`, `PowerShell` | `execute` | `bash` | `shell` | `run_shell_command` |
| `web_fetch` | same | `WebFetch` | `web` | `webfetch` | `web` | `web_fetch` |
| `web_search` | same | `WebSearch` | `web` | `websearch` | `web` | `google_web_search` |
| `agent_delegate` | same | `Agent` | `agent` | `task` | `subagent` | none (agents cannot delegate) |
| `task_management` | same | `TodoWrite` (current Claude task tool names unverified) | `todo` | `todowrite` | `todo_list` | `write_todos` |
| `skill_invoke` | new | `Skill` | none | `skill` | `skill` (permission capability) | none |
| `user_question` | new | `AskUserQuestion` | none | `question` | none | none |
| `lsp` | new | `LSP` | none | `lsp` | none | none |
| `mcp`, `mcp:<s>`, `mcp:<s>/<t>` | same | `mcp__*`, `mcp__<s>`, `mcp__<s>__<t>` | `*/*`, `<s>/*`, `<s>/<t>` | MCP tool-name patterns (form unverified) | `@mcp`, `@<s>`, `@<s>/<t>` | `mcp_*`, `mcp_<s>_*` |

`code_search` stays valid as an alias for `{file_list, file_search, content_search}`; `doc_search` and `context` have no agent-tool mapping on any inventoried host and are rejected inside `tools` with `acf.agent.tools.unmappable` until a host needs them.

**Illustrative canonical agent** (shows the field shapes only):

```md
---
name: reviewer
displayName: Code reviewer
description: Strict pull-request review focused on correctness and missing tests.
mode: subagent
model: [anthropic/claude-opus-5-5, openai/gpt-6]
effort: high
maxTurns: 40
readonly: true
tools:
  allow: [file_read, code_search, shell, mcp:github]
permissions:
  - { operation: shell, pattern: "git push*", decision: deny }
delegates: []
color: purple
targets:
  claude:
    memory: project
---

You are a strict code reviewer...
```

Core size: 20 semantic fields plus the body, against 4 today (`name`, `description`, `mode`, `model: inherit`). About half are broadly native (name, description, body, mode, model, tools, maxTurns, mcpServers, readonly-equivalent); the rest are carried by two to five tools each.

## 3. Field-level support table

Legend. `N(x)` native with spelling `x`. `T(..)` translated losslessly by the writer. `D(..; code)` degraded as declared, with the named diagnostic (`acf.agent.` prefix omitted). `U` unsupported: the field is dropped with a `lossy` diagnostic of the stated severity (`info` unless marked). `E` error: the agent is not emitted to that target (fail-closed, rule R2). Rows marked *sec* are security restrictions.

Channel notes that apply to whole columns:

- **Claude** cells assume the target output is a real Claude plugin. Plugin agents ignore `permissionMode`, `hooks`, `mcpServers`, `initialPrompt` (verified 2026-10-01); cells say where a loose `.claude/agents/` file would differ.
- **Codex** agents are always loose `.codex/agents/<name>.toml` files, even when the rest of the capability ships as an Agent Plugins package.
- **Copilot and VS Code** read the same `.agent.md` format and the same `com.github.copilot/agents/` plugin namespace (C16).
- **Cursor** agents need `.cursor/agents/` or the `.cursor-plugin` dialect; Cursor's Agent Plugins support covers skills and MCP only.
- **Pi**, **Cascade**, **Agent Plugins 1.0** and **Agent Skills** have no agent definition type: every row is `U`, and the family-level diagnostic `acf.adapter.facet-unsupported` (warn) replaces per-field ones.

### 3.1 Primary targets

| Canonical | Claude (plugin) | Codex | Copilot CLI/cloud | VS Code Local | Cursor | Gemini CLI | OpenCode | Lume |
|---|---|---|---|---|---|---|---|---|
| `name` | N(`name`; file `<name>.md`; id `<plugin>:<name>`) | N(`name`; file `<name>.toml`) | T(file `<name>.agent.md` is the id) | N(`name`, file stem) | N(`name`) | N(`name`) | T(filename only; no `name` key) | T(filename only) |
| `displayName` | U | U | N(`name`) only in Copilot-only files; else D(dropped; displayname.dropped) | D(dropped: `name` is identity here; displayname.dropped) | U | U | U | U |
| `description` | N | N | N | N | N | N | N | N |
| body | N(system prompt) | T(`developer_instructions` string) | N(max 30,000 chars, else E) | N(prepended to user prompt; info) | N | N(system prompt) | N | N(system-prompt addition) |
| `mode: all` | N(implicit) | D(subagent only; mode.narrowed) | N(defaults) | N(defaults) | D(subagent only; mode.narrowed) | D(subagent only; mode.narrowed) | N(`mode: all`) | N(`mode: all`) |
| `mode: subagent` | D(cannot block `--agent` main use; mode.unenforced) | N(implicit) | T(`user-invocable: false`) | T(`user-invocable: false`) | N(implicit) | N(implicit) | N | N |
| `mode: primary` | D(model can still delegate; mode.unenforced, warn) | U(not emitted; warn) | T(`disable-model-invocation: true`) | T(`disable-model-invocation: true`) | U(not emitted; warn) | U(not emitted; warn) | N | N(`mode: root`) |
| `hidden` | U | U | U | U | U | U | N(`hidden`) | U |
| `background` | N(`background`) | U | U | U | N(`is_background`) | U | U | U |
| `model: inherit` | N(`model: inherit`) | D(omit `model`; `[agents]` default may win; model.inherit-approx) | N(omit) | N(omit; picker model) | N(`model: inherit`) | N(`model: inherit`) | N(omit) | D(no inherit value; model.inherit-approx, warn) |
| `model: default` | N(omit) | N(omit) | N(omit) | N(omit) | D(same as inherit; info) | D(same as inherit; info) | N(omit) | N(omit) |
| ModelRef | T(`anthropic/x` to `x`; other providers skipped; model.unresolved) | T(`openai/x` to `x`; other providers via `model_provider` unverified) | T(bare id; id format unverified) | D(needs `Name (vendor)` display form; unverified) | T(bare id) | T(`google/x` to `x`) | N(`provider/model`) | N(`provider/model`) |
| ModelRef list | D(first usable; model.fallback-dropped) | D(first usable) | N(`models`, CLI); D(cloud: first) | N(`model: [..]`) | D(first usable) | D(first usable) | D(first usable) | N(list) |
| `effort` | N(`effort` low..max); D(`none`, `minimal` to `low`; effort.clamped) | N(`model_reasoning_effort`; clamp outside its set) | T(`reasoningEffort`; only low/medium/high verified) | U | T(`model: id[effort=v]`; model-dependent) | D(settings only; effort.dropped) | T(`variant`; provider-defined, unverified) | T(`:<thinking>` suffix; vocabulary unverified) |
| `temperature` | U | U | U | U | U | N(`temperature`) | N(`temperature`) | U |
| `maxTurns` | N(`maxTurns`) | U(warn) | U(unknown) | U | U | N(`max_turns`) | N(`steps`) | U |
| `ambientInstructions: false` | N(`omitClaudeMd: true`; ignored when run as main agent, info) | U(warn) | N(default for subagents; selected agents still load them, info) | U | U | U | U(warn) | U(warn) |
| `ambientInstructions: true` | N(default) | N(default) | N(`include-custom-instructions: true`) | N(default) | N(default, unverified) | N(default, unverified) | N(default) | N(default) |
| `availableSkills` | D(`[]` adds `Skill` to `disallowedTools`; lists unenforced, skills.unenforced warn; never `skills:`) | T(`[[skills.config]] enabled=false` for known non-listed skills; host skills uncovered, skills.partial) | U(warn) | U(warn) | U(warn) | U(warn) | T(`permission.skill`: `"*": deny` plus listed `allow`) | N(`skills` selector) |
| `tools.allow` *sec* | T(`tools`, op map 2) | D(no tool list; if no write op allowed, `sandbox_mode = "read-only"`; rest tools.unenforced warn) | T(`tools` aliases; merged aliases narrowed, tools.narrowed) | T(`tools`; tool names unverified) | D(as Codex via `readonly`; else tools.unenforced warn) | T(`tools`) | T(`permission`: `"*": deny` then listed keys `allow`) | T(`tools` selector) |
| `tools.deny` *sec* | T(`disallowedTools`) | D(write ops: read-only sandbox; other ops E) | T(allowlist of all aliases minus denied; tools.narrowed) | T(allowlist minus denied) | D(write ops: `readonly`; other ops E) | T(allowlist minus denied) | T(`permission` key `deny`) | T(`!token`, emitted last) |
| MCP selectors | T(`mcp__<s>`, `mcp__<s>__<t>`; plugin server prefix unverified) | U | N(`<s>/*`, `<s>/<t>`) | N(`<s>/*`) | U | T(`mcp_<s>_*`) | T(tool-name pattern, unverified) | T(`mcp` selector, server level) |
| `readonly` *sec* | T(`disallowedTools: Write, Edit, NotebookEdit`; plus `Bash, PowerShell` unless `shell` is explicitly allowed, then readonly.shell-open warn) | N(`sandbox_mode = "read-only"`; live parent overrides still win, info) | T(drop `edit`, `execute` from `tools`) | T(allowlist without edit/terminal tools) | N(`readonly: true`) | T(allowlist without write/shell tools) | T(`permission: {edit: deny, bash: deny}`) | D(selector removal; no containment, readonly.advisory warn) |
| `permissions` deny *sec* | D(whole tool in `disallowedTools`, pattern widened to whole tool; permission.narrowed warn) | D(write ops: read-only sandbox; else E) | D(whole op removed from `tools`; pattern deny E) | D(as Copilot) | D(write ops: `readonly`; else E) | T(extension `policies/*.toml` with `subagent`; extension packaging only, unverified) | N(`permission`, sorted allow, ask, deny) | D(whole op via `!token`; pattern deny E) |
| `permissions` ask | U(host prompting applies) | U | U | U | U | T(policy `ask_user`, unverified) | N | U |
| `permissions` allow | U(no per-agent grant; never edit settings) | U | U | U | U | T(policy `allow`, unverified) | N(permission.grant warn at install) | U |
| `delegates: []` | N(`disallowedTools: Agent`) | D(cannot remove spawning per agent; delegates.unenforced warn) | T(omit `agent` from `tools`) | N(`agents: []`) | D(delegates.unenforced warn) | N(agents never delegate) | T(`permission.task: deny`) | N(`agents.delegates`; empty value unverified) |
| `delegates: [names]` | T(`tools: Agent(a, b)` honored only as main thread; subagent role delegates.unenforced warn) | D(delegates.unenforced warn) | D(`agent` kept; delegates.unenforced warn) | N(`agents: [..]` plus `agent` tool) | D(warn) | U(no nesting: stricter, info) | T(`permission.task`: `"*": deny`, names `allow`) | N(`agents.delegates`) |
| `mcpServers` reference | D(plugin ignores; loose file N; mcp.dropped warn) | T(inline copy from capability MCP facet; host-only refs U) | T(inline copy) | D(only `target: github-copilot`) | U(inherits parent MCP; warn) | T(inline copy) | U(global MCP only; warn) | N(admitted by default; `mcp` selector) |
| `mcpServers` inline | D(plugin ignores; loose N; mcp.dropped warn) | N(`[mcp_servers.<n>]`, mapped by MCP facet) | N(`mcp-servers`) | D(only `target: github-copilot`) | U(warn) | N(`mcpServers`) | U(warn) | U(warn) |
| `hooks` *sec when blocking* | D(plugin ignores: observe/add_context dropped, hooks.dropped warn; blocking effects E; loose file N) | U / E | U / E | N(`hooks`, preview, Local only) | U / E | U / E | U / E (plugins are code) | U / E |
| `color` | N(red, blue, green, yellow, purple, orange, pink, cyan); T(sky to cyan, magenta to pink, hex to nearest; color.approximated) | U | U | U | U | U | N(hex); T(named to fixed hex table) | N(9 names); T(pink to magenta, hex to nearest) |
| `only`/`except` | T(decides emission) | T | T(`target: github-copilot` when VS Code excluded) | T(`target: vscode` when Copilot excluded) | T | T | T | T |
| `assets` | T(must live outside `agents/`; body links rewritten) | T(outside `.codex/agents/`) | T | T | T | T | T | T |

### 3.2 Other tools

| Canonical | Amp (code) | Devin Local | Cline | Roo Code | Goose | Kiro | Pi | Cascade | Agent Plugins 1.0 | Agent Skills |
|---|---|---|---|---|---|---|---|---|---|---|
| `name` | N(`name` / directory / mode `key`) | N(`name`; dir form `AGENT.md`) | N(`name`; case-insensitive dedup) | T(`slug`) | N(`name`) | N(`name`) | U | U | U | U |
| `displayName` | N(`display.label` / `label`, max 24) | U | U | N(`name`, required: falls back to `name`) | U | U | U | U | U | U |
| `description` | N(declarative); U(`createAgent`) | N | N | T(`whenToUse` and `description`) | N | N | U | U | U | U |
| body | N(`instructions`, appended to base) | N | N | T(`roleDefinition`) | N | N(body or `prompt`) | U | U | U | U |
| `mode: all` | T(mode + agent) | D(subagent only) | D(unknown role) | N(modes switch and delegate) | N(load and delegate) | N | U | U | U | U |
| `mode: subagent` | T(`createAgent` + tool) | N | N(spawn, unverified) | D(no field) | D(no field) | D(no field) | U | U | U | U |
| `mode: primary` | T(`registerAgentMode`) | U | U | D(no field) | D(no field) | D(no field) | U | U | U | U |
| `hidden` | N(`draft`) | U | U | U | U | U | U | U | U | U |
| `background` | U(call option) | U(runtime choice) | U | U | U | U | U | U | U | U |
| `model: inherit` | D(`extends` snapshots defaults) | D(default is subagent model, not parent; warn) | N(omit, unverified) | U(sticky host state) | N(omit, unverified) | N(omit, unverified) | U | U | U | U |
| ModelRef / list | N(`provider/model`); list D | T(id format unverified); list D | T(`providerId` + `modelId`); list D | U | T(format unverified) | T(model-service id; host falls back); list D | U | U | U | U |
| `effort` | N(`reasoningEffort`, full enum) | U | U | U | U | U | U | U | U | U |
| `temperature` | U | U | U | U | U(UI override only) | U | U | U | U | U |
| `maxTurns` | U | U | N(`maxIterations`) | U | U(recipe setting) | U | U | U | U | U |
| `ambientInstructions` | U | U | U | U | U | U | U | U | U | U |
| `availableSkills` | U | U | D(`skills`, semantics unverified) | U | U | T(`resources: skill://<path>` for known skills) | U | U | U | U |
| `tools.allow` *sec* | N(`tools.include`) | N(`allowed-tools`; names unverified) | N(`tools`; names unverified) | T(`groups` read/edit/command/mcp/modes; narrowed) | E(no tool field) | N(`tools`) | U | U | U | U |
| `tools.deny` *sec* | N(`tools.exclude`) | T(allowlist) | T(allowlist) | T(group removal) | E | N(`excludedTools`; interaction with `tools` unknown) | U | U | U | U |
| MCP selectors | N(`mcp__*` patterns) | unknown | U(no MCP for subagents) | D(`mcp` group only) | U | N(`@s`, `@s/t`) | U | U | U | U |
| `readonly` *sec* | T(exclude edit/shell tools) | T(allowlist) | T(allowlist; Plan mode is not write-proof) | T(`groups` without `edit`, `command`) | E | T(`permissions.rules` deny `fs_write`, `shell`) | U | U | U | U |
| `permissions` | D(whole op via exclude; pattern deny E; ask/allow U) | D(same) | D(same) | T(`["edit", {fileRegex}]` for file_edit allow patterns); others D | E for deny | N(`permissions.rules`; allow also `allowedTools`) | U | U | U | U |
| `delegates` | T(`[]`: exclude delegation tools); list U | N(`[]` is default; list D) | T(`[]`: drop `spawn_agent`, unverified); list D | T(`[]`: drop `modes` group); list D | N(nesting blocked) | N(`toolsSettings.subagent.availableAgents`) | U | U | U | U |
| `mcpServers` | U(declarative `mcpServers` is mention-only: never map) | U | U | U | U(recipes only) | N(`mcpServers`; refs T) | U | U | U | U |
| `hooks` | U / E | U / E | U / E | U / E | U / E | N(`hooks`: agentSpawn, userPromptSubmit, preToolUse, postToolUse, stop) | U | U | U | U |
| `color` | N(hex); T(named to hex) | U | U | U | U | U | U | U | U | U |

No ACF writer exists today for any 3.2 column. Amp output would be generated TypeScript, which is a separate trust and maintenance decision (Q10).

## 4. Conflicts that must not be unioned

General rules used below:

- **R1 Separate meanings, separate fields.** A native key is mapped by behavior, never by spelling.
- **R2 Restriction classes degrade differently.** A security restriction that a target cannot enforce is narrowed (remove the whole covering tool, or switch on the target's read-only mechanism); when no narrowing mechanism exists, the agent is not emitted to that target (`error`). This follows the advisor's fail-closed correction. A focus restriction that a target cannot enforce is dropped with a `lossy` warning.
- **R3 Never broaden.** No canonical value, default, or degradation may grant more than the host default: `readonly: false` never maps to `danger-full-access` or `bypassPermissions`; `permissions` allow rules are dropped where unsupported, never moved into user settings.
- **R4 One owner per output key.** A native key is produced either by canonical translation or by a per-target override (section 5), never both.

| # | Conflict | Evidence | Handling |
|---|---|---|---|
| C1 | **Identity source.** Frontmatter `name` is identity (Claude, Codex, Gemini, Cline, Goose, Devin); filename/path is identity (OpenCode, Lume, Copilot, Kiro default); `name` is only a display label (Copilot, Roo). | 1.2 row 1 | Canonical choice: `name` = identity = basename (unchanged SPEC 10.2); `displayName` holds labels. Readers map Copilot/Roo `name` to `displayName` and the path or `slug` to `name`. A native file whose filename differs from its `name` keeps the original filename in provenance so same-format writes restore it. |
| C2 | **Identity charset and namespacing.** ACF slug forbids `_`, `--`, `/`, uppercase. Claude allows anything up to 256 chars except `:`; Gemini allows `_`; Copilot ids contain `--` (`team--reviewer`); Kiro nested `team/planner`; Claude and Devin plugins qualify as `<plugin>:<name>`. | inventories; SPEC 5.1 | Readers derive a slug and keep the native identity in `targets.<t>.name` (override, section 5) with `acf.agent.name.native-identity` (info). Writers rewrite structured references (`delegates`, command `agent:`, hook matchers, `Agent(..)`) to the target's qualified id. Body prose is not rewritten (`acf.agent.reference.prose`, info). Two native ids that collapse to one slug are an error. |
| C3 | **Inverted scope precedence.** ACF and Claude/Cursor/Kiro/Cline: project beats user. Copilot and Lume: user beats project. Claude additionally lets any loose user/project agent shadow a same-named plugin agent. | 1.4 | ACF resolves its own shadowing before emission (SPEC 17.6). When the same `(agent, name)` exists in both ACF scopes and the target inverts precedence, emit `acf.agent.scope-precedence-inverted` (warn) recommending `rename`. Status must report Claude plugin agents shadowed by unmanaged loose files instead of claiming they are active. |
| C4 | **Omitted model vs inherit.** Omitted means host default on Codex (`[agents]` default, then parent), Devin (`agent.subagent_model`, not parent), Claude (subagent model order including `CLAUDE_CODE_SUBAGENT_MODEL`); it means parent on Cursor, Gemini, Copilot, OpenCode subagents. | Codex/Claude docs verified | Distinct canonical values `inherit` and `default`. Unset keeps acf: 1's `inherit` meaning (6.2). Targets without an explicit inherit value degrade with `acf.agent.model.inherit-approx`. |
| C5 | **Model id namespaces.** Aliases (`opus`, `fable`), bare vendor ids, `provider/model`, `providerId`+`modelId`, VS Code `Name (vendor)`, Cursor `id[params]`, Lume `:thinking`. Copilot `modelPolicy: required` refuses dispatch instead of falling back. | 1.2 | ModelRef is `provider/model-id`; lists are preference-with-fallback (Copilot `preferred`, VS Code, Lume). Aliases, bracket parameters and `modelPolicy: required` are per-target extras. A target with no usable candidate omits the model with `acf.agent.model.unresolved` (warn). |
| C6 | **Availability vs approval under the same spelling.** Devin agent `allowed-tools` restricts availability; Devin skill `allowed-tools` and Kiro `allowedTools` auto-approve; Claude `tools` is availability while Claude permission rules are approval; OpenCode folds the deprecated `tools` map into `permission`. | windsurf, goose-kiro, claude, opencode inventories | Canonical `tools` is availability only; `permissions[].decision` is approval only. Readers classify each native key by behavior. Kiro `allowedTools` becomes `permissions` allow rules; Devin agent `allowed-tools` becomes `tools.allow`. |
| C7 | **Rule evaluation order.** Claude applies `disallowedTools` first; Amp exclusion wins; Kiro `deny > ask > allow`; OpenCode `permission` and Lume selectors are last-match-wins. | inventories, Claude doc | Canonical semantics are order-independent and most-restrictive-wins. Writers for last-match hosts emit allow, then ask, then deny, which reproduces the canonical result. Native lists that rely on order for exceptions (deny `*`, then allow `git status*`) are not representable: the reader leaves the canonical field unset, stores the raw list as a per-target override, and emits `acf.agent.permission.native-only` (info). Portability of that rule is lost; same-format fidelity is not. |
| C8 | **Agent policy vs parent policy.** Codex reapplies the parent's live sandbox/approval overrides over the agent file; Claude ignores the agent's `permissionMode` when the parent is in bypass, acceptEdits or auto mode, and ignores agent `bypassPermissions`; Kiro parent rules constrain descendants; OpenCode agent `permission` overrides global settings and can grant. | Claude and Codex docs verified; opencode, goose-kiro | Canonical agent controls express narrowing intent. `permissions` allow rules are the only grant; writers emit them only where native, and caplet surfaces `acf.agent.permission.grant` (warn) so installation is an explicit consent point. Claude `permissionMode` is never synthesized from canonical fields (overridable and plugin-ignored). |
| C9 | **Instruction placement.** Body replaces the system prompt (Claude, Gemini, OpenCode), is a developer message alongside base instructions (Codex), is appended to a base mode (Amp, Lume), is prepended to the user prompt (VS Code), or is a role definition at the start of the system prompt (Roo). | inventories | Not a canonical field: the body is "agent instructions" and placement is host behavior, declared per target in the registry. Amp `extends` and Roo `customInstructions` stay extras. Authors who depend on replacement semantics must use `only`. |
| C10 | **`skills` preload vs admission.** Claude `skills` injects full skill content at start and does not restrict others; Lume `skills` filters which skills exist; Cline `skills` is undocumented. | Claude doc verified; lume, cline-roo | Canonical name is `availableSkills` (admission). Claude `skills` is a Claude extra and is never generated from `availableSkills`. Cline `skills` is read into extras until its behavior is verified. |
| C11 | **`mcpServers` define vs mention vs filter.** Claude, Gemini, Kiro, Copilot, Codex attach servers; Amp declarative `mcpServers` only names servers in rendered instructions; Lume `mcp` filters existing servers. | inventories | Canonical `mcpServers` attaches. Amp's list is an Amp extra. Lume's filter is produced from `tools` MCP selectors. |
| C12 | **Role admission shapes.** Three-value enum (OpenCode, Lume) vs two booleans (Copilot, VS Code) vs no field (Claude, Cursor, Gemini, Codex). Copilot's both-false state has no enum equivalent. `infer` is retired in the general reference and still documented by the CLI. OpenCode `hidden` is visibility, whereas Copilot `user-invocable: false` also forbids user selection. | copilot, vscode, opencode | Canonical `mode` plus separate `hidden`. Readers map both-false to `mode: subagent`, `hidden: true` with `acf.agent.mode.native-only` (info) and keep the raw booleans as override. Writers emit `disable-model-invocation`, not `infer`; raw `infer` round-trips via extras. |
| C13 | **Agent lifecycle hook contracts.** Codex `SubagentStart` `continue:false` does not prevent the start; Copilot cannot block subagent creation; Cursor `subagentStart` allows allow/deny and treats ask as deny; Claude turns agent-scoped `Stop` into `SubagentStop`; Gemini and Goose emit no subagent events. | codex, copilot, cursor, claude, goose-kiro hooks sections | Out of this facet's union. Agent-scoped `hooks` reuse canonical hook types and effects; adding `subagent_start`/`subagent_stop` to the canonical hook types is the hooks facet's decision. Blocking effects that a target cannot run inside the agent's lifetime are errors for that target (R2). |
| C14 | **Iteration bound semantics.** Claude returns partial output that can be resumed; OpenCode forces a text-only final answer; Gemini's at-limit behavior and units are not inventoried; units are turns, steps or iterations. | inventories | Same meaning (upper bound), so it is core; the at-limit behavior is declared per target in the registry, not a field. |
| C15 | **Read-only enforcement strength.** Codex `read-only` is an OS sandbox; Cursor `readonly` restricts edits and state-changing shell; Cline Plan mode is explicitly not write-proof; Lume roles are focus controls, not containment; Claude `plan` permission mode is overridden by the parent and ignored in plugins. | inventories, Claude doc | Canonical `readonly` is the strict contract. Writers use the strongest native mechanism; tool removal counts as enforcement; advisory-only mechanisms produce `acf.agent.readonly.advisory` (warn); targets with nothing (Goose) are errors. Claude never uses `permissionMode: plan` for it. |
| C16 | **Shared `.agent.md` with split meanings.** Copilot and VS Code read the same files; `name` is display for Copilot and identity for VS Code; `mcp-servers` works for Copilot but not VS Code Local; `argument-hint`/`handoffs` are VS Code-only and ignored by cloud. | copilot, vscode | A file consumed by both is written with `name` = slug and no `displayName` (lossy info). Applicability narrowed to one of them sets `target:` and may use that product's extras. Extras for both products under one file must not collide (R4); a collision is an error. |
| C17 | **Description vs whenToUse (Roo).** | cline-roo | Canonical `description` is delegation guidance, so it maps to Roo `whenToUse`; Roo's UI `description` is a Roo extra (writer copies canonical `description` when absent). |
| C18 | **Cross-tool compatibility directories.** Copilot, VS Code, Cursor and Goose read `.claude/agents/`; Cursor reads `.codex/agents/`. A loose Claude file there is reinterpreted by tools with weaker enforcement (Cursor has no tool list, so a Claude `tools` restriction silently disappears). | inventories | Prefer channels other tools do not scan: a Claude plugin for Claude, `.cursor/agents/` for Cursor, `.github/agents/` (or the plugin namespace) for Copilot/VS Code. When caplet must write loose `.claude/agents/` files and another enabled target scans them, emit `acf.agent.compat-dir-exposure` (warn). |
| C19 | **Description requiredness.** Optional in Cursor, OpenCode, Goose, Kiro, Devin; required in ACF and most others. | inventories | Readers synthesize a description from `displayName` or the first body sentence, flag it as synthesized in provenance, and emit `acf.agent.description.synthesized` (info); same-format writers omit it again. |

## 5. Per-target extras and lossless round trips

### 5.1 What `targets.<t>` holds

The current SPEC 7.1 forbids extension data from replacing canonical data. Same-format losslessness needs one narrow exception, so this facet proposes three kinds of entries, all keyed by **native spelling** and validated by a per-target schema:

1. **Native-only keys**: fields with no canonical meaning (lists below). Emitted verbatim to that target, dropped elsewhere with `acf.target.extension.dropped` (info).
2. **Native overrides**: a native key that is also produced from a canonical field (for example Claude `tools`) and whose exact native value cannot be regenerated from canonical (Claude `Grep` alone; model alias `opus`; comma-string vs YAML-list spelling; order-dependent OpenCode `permission`; non-slug native `name`). An override replaces the translated value for that target only (whole key, no merge: R4). The writer still computes the canonical translation and emits `acf.target.override-diverges` (info) when they differ, so edits to canonical fields are not silently ignored.
3. **Unknown keys**: keys the target schema does not know. Preserved and re-emitted to that target with `acf.target.extension.unknown-field` downgraded from `error` to `warn` for agents (today it is an error, which makes foreign imports impossible).

Readers populate canonical fields only from native values whose mapping is exact; everything else goes to 1-3. Provenance (outside `targets`) records the source format and version, original path and extension (`.agent.md`, `.toml`, `.yaml`, `AGENT.md`), the containing config file and JSON pointer for config-embedded agents (OpenCode `opencode.json`, Roo `.roomodes`, Kiro `.json`), synthesized fields, and the original filename when it differs from `name`.

Guarantee levels:

- **Unchanged same-format package**: the immutable package snapshot is copied byte-for-byte (advisor rule 1). TOML comments, YAML styles and key order survive only through this path.
- **Same-format after canonical round trip**: parse(native) deep-equals parse(write(read(native))). This is the testable losslessness contract for this facet; every inventory example should become a fixture.
- **Cross-format**: canonical fields translate as in section 3; extras for other targets are dropped with diagnostics.

### 5.2 Per-target extras inventory

| Target | Native-only keys kept raw | Typical overrides | Notes |
|---|---|---|---|
| claude | `permissionMode`, `memory`, `isolation`, `initialPrompt`, `skills` (preload), `experimental` (`cacheTtl`), unknown keys | `tools`, `disallowedTools` (specifiers, `Agent(..)`), `model` (aliases), `name` | Plugin channel ignores `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`: those extras emit `acf.agent.plugin-field-ignored` (warn) unless a loose-file channel is chosen (Q4). |
| codex | any other `config.toml` key (`sandbox_mode` other than `read-only`, `approval_policy`, `model_provider`, nested tables) | `skills.config`, `mcp_servers`, `model` | `sandbox_mode = "danger-full-access"` is a grant and needs consent (R3). |
| copilot | `modelPolicy`, `metadata`, `infer`, `argument-hint`, `handoffs` (ignored by cloud) | `tools` (aliases), `name`, `models`, `target` | |
| vscode | `argument-hint`, `handoffs[]` (`label`, `agent`, `prompt`, `send`, `model`), `infer` | `tools`, `model` (display form), `hooks`, `agents` | Handoff targets are agent references; writers rewrite them like `delegates` (C2). |
| cursor | unknown keys | `model` (with `[fast=..,context=..]` parameters) | |
| gemini | `kind: remote`, `agent_card_url`, `agent_card_json`, `auth` (secrets stay as `$ENV`/`!command` text), `timeout_mins`, multi-definition YAML lists | `tools`, `mcpServers` | A remote agent has no body; it round-trips only through extras plus provenance. |
| opencode | `top_p`, `variant` (when not from `effort`), `options`, `disable`, theme-token `color`, `maxSteps`, deprecated `tools` map, unknown keys (provider options) | `permission` (order-dependent rules) | Writers MUST emit only known keys plus extras: OpenCode copies unknown keys into provider options. |
| lume | installed-extension keys | `tools`, `skills`, `mcp` selectors with exception idioms | Unknown keys invalidate a Lume role, so writers emit nothing else. |
| amp | `extends`, `oracle`, `subagents`, `compactionThresholdTokens`, `features`, `serverOnly`, mention-only `mcpServers`, `tools.add`, agent tool modules | `tools` | Code-defined agents round-trip only through the package snapshot. |
| devin | `max-nesting` | `allowed-tools`, `name` | |
| cline | `skills` (until verified), unknown keys | `providerId`, `modelId`, `tools` | |
| roo | `description` (UI), `customInstructions`, `groups` with `fileRegex` beyond the mapping, `rulesFiles`, `source` | `groups`, `name` | |
| kiro | `prompt` as `file://`, `toolAliases`, `includeMcpJson`, `includePowers`, `resources` (`file://`, knowledge bases), `toolsSettings` (other than `availableAgents`), `trustedAgents`, `keyboardShortcut`, `welcomeMessage` | `tools`, `excludedTools`, `permissions`, `hooks` | Post-cutoff documentation caveat (Q8). |
| goose | none known | `model` | |

Target ids for Copilot, VS Code, Gemini, Kiro, Devin, Cline, Roo, Goose, Amp and Lume do not exist in the registry yet; the extras above assume they will (cross-facet decision).

## 6. Delta against current ACF SPEC and code

### 6.1 What exists

- **SPEC 10**: agents are `agents/<name>.md` or `agents/<name>/AGENT.md`; frontmatter `name` (slug equal to basename), `description`, `mode` (`primary`, `subagent`, `all`, default `all`), `model` (only `inherit`, default `inherit`), `assets`, `only`, `except`, `targets`. Body is "the agent's system prompt". SPEC 10.5 and 15 reserve canonical `tools`, `access`, `permissions`, and `title`/`displayName`; SPEC 25 lists them as open. SPEC 11.4 resolves command `agent:` references; SPEC 14.5 requires runtime-taxonomy vocabulary for future tool fields; SPEC 24 has `agent_delegate` and `code_search`.
- **Model** (`model.ts`): `AgentFacet.frontmatter` = `{name, description, mode?, model?: "inherit"}` plus `only`, `except`, `targets`, `assets`.
- **Schema and reader**: `agentFrontmatterSchema` is a plain `z.object`, so unknown keys are stripped; the reader reports them only as `acf.markdown.unknown-frontmatter-field` (info). A Claude-style top-level `tools:` in an ACF agent therefore disappears with an info message and the emitted agent gets every tool.
- **Extensions** (`targets/extensions.ts`): one strict `agentExtension` `{tools: string[], permissions: record, model: string, mode: string}` shared by all five targets. It does not use native spellings (Claude `tools` may be a comma string; there is no `disallowedTools`, `permissionMode`, `sandbox_mode`, `readonly`), and strictness turns every other native key into an error. `IMPLEMENTATION.md` still describes per-target agent schemas (`claudeAgentExtensionSchema` and so on), so docs and code have drifted.
- **Registry** (`targets/registry.ts`): family-level agent support claude `full`, codex `full`, cursor `partial`, opencode `full`, pi `full`.
- **Writers** (`adapters/src/common/emitter.ts` `emitProseFiles`): every target except Cursor writes `renderMarkdownFile(facet.frontmatter, body)` to `<installRoot>/agents/<name>.md`, i.e. the canonical frontmatter verbatim, including the nested `targets:` map. Consequences found while reading:
  - Claude: `targets.claude.tools` lands under an ignored `targets:` key, so the SPEC 10.7 reviewer example emits an agent with all tools (fail-open). `mode`, `only`, `assets` are ignored silently. Output is loose `.claude/agents/`, not a plugin.
  - Codex: writes `.codex/agents/<name>.md`; Codex reads only `*.toml`, so the agent never loads although the registry says `full`.
  - OpenCode: writes `name`, `targets`, `only`, `assets` keys that OpenCode copies into provider options, and `model: inherit`, which is not a `provider/model` value.
  - Pi: writes `.pi/agents/<name>.md`, which nothing in Pi consumes (registry says `full`; pi inventory confirms no native agents).
  - Cursor: skips agents with "does not natively support agent", which is false (`.cursor/agents/` exists).
  - Assets of an agent are written into the same `agents/` directory (test `claude.test.ts` emits `.claude/agents/notes.md`). Claude loads every `.md` there, and plugin agents without frontmatter still load under their filename, so a Markdown asset becomes a bogus agent.
- **Tests**: adapter tests assert only that the body text appears in the output file.

### 6.2 What changes

| Area | Change | Compatibility |
|---|---|---|
| SPEC 10.2 | Add `displayName`, `hidden`, `background`, `effort`, `temperature`, `maxTurns`, `ambientInstructions`, `availableSkills`, `tools`, `readonly`, `permissions`, `delegates`, `mcpServers`, `hooks`, `color`. | Additive optional fields: allowed within acf: 1 (SPEC 15). |
| SPEC 10.4 `model` | Accept `default`, ModelRef, and ModelRef lists. Unset keeps meaning `inherit`. | Additive; no existing meaning changes. |
| SPEC 10.5, 15, 25 | Remove the reservations for agent `tools`, `access`/`permissions` (as `readonly` + `permissions`), and agent `displayName`; resolve the matching open question. `displayName` for other facets stays reserved unless their facet owners adopt it. | Lifts reservations. |
| SPEC 10.6 | Body = "agent instructions"; placement is host-defined (C9). | Clarification. |
| SPEC 7.1, 7.3, 7.4 | Allow native overrides (5.1 kind 2) with one-owner semantics; per-target native-key schemas; unknown agent extension keys become `warn` and are preserved. | Changes a MUST; needs SPEC wording, not a version bump, because previously invalid input becomes valid. |
| SPEC 14.5, 24 | Operation set refined as in section 2 (`file_list`, `file_search`, `content_search`, `notebook_edit`, `skill_invoke`, `user_question`, `lsp`; `code_search` becomes an alias). | Owned by the runtime taxonomy; additive. |
| SPEC 11.4 | References resolve to the target-qualified id (`<plugin>:<name>` for Claude/Devin plugins). | Behavior of writers only. |
| SPEC 22 | Registry declares per-field support (`native`, `translated`, `degraded` with diagnostic id, `unsupported`, `error`) per target instead of family-level `full/partial/none`, plus per-target op-to-tool maps, model provider sets, effort sets and color palettes. | Implementation-owned table. |
| `model.ts` / schemas | Extend `AgentFacet.frontmatter`; add `ToolSelector`, `AgentPermissionRule`, `ModelRef`; reuse `McpServer` and `HookEntry`; make unknown top-level agent keys a `warn` (they are usually misplaced native fields). | Types only. |
| `extensions.ts` | Per-target agent schemas keyed by native spelling (5.2), `.passthrough()` with warn. | Removes the shared generic schema. |
| Registry entries | codex agent `translated` via TOML; cursor agent supported via `.cursor/agents/`; pi agent `none` unless a pinned subagent extension is declared a dependency; claude agent via plugin channel. | Fixes false `full` claims. |
| Writers | Per-target agent writers replace `emitProseFiles`: Claude plugin `agents/` (clean Claude frontmatter only), Codex TOML (`developer_instructions`), Cursor `.cursor/agents/`, OpenCode known-key frontmatter, Copilot/VS Code `.agent.md` (Agent Plugins `com.github.copilot/agents/`), Gemini extension `agents/`. Assets go outside agent discovery directories with rewritten links. | |
| Readers | Foreign readers for Claude plugin/loose agents, Codex TOML, `.agent.md`, Cursor, Gemini, OpenCode (file and `opencode.json`), Kiro, Lume; native identity, overrides and provenance per 5.1. | New. |
| Diagnostics | New codes under `acf.agent.*`: `mode.narrowed`, `mode.unenforced`, `model.inherit-approx`, `model.unresolved`, `model.fallback-dropped`, `effort.clamped`, `effort.dropped`, `tools.narrowed`, `tools.unenforced`, `tools.unmappable`, `readonly.shell-open`, `readonly.advisory`, `permission.narrowed`, `permission.native-only`, `permission.grant`, `permission.unenforceable` (error), `skills.unenforced`, `skills.partial`, `delegates.unenforced`, `mcp.dropped`, `hooks.dropped`, `hooks.unenforceable` (error), `color.approximated`, `displayname.dropped`, `description.synthesized`, `name.native-identity`, `reference.prose`, `scope-precedence-inverted`, `compat-dir-exposure`, `plugin-field-ignored`; plus `acf.target.override-diverges`, `acf.target.extension.dropped`. | Must be added to the `IMPLEMENTATION.md` 11.2 matrix. |
| Tests | Same-format round-trip fixtures per reader (deep-equal parse); one fail-open regression test (SPEC 10.7 example must restrict Claude tools); one asset-in-agents-dir regression; native validation (`claude plugin validate`) on generated plugins. | |

### 6.3 What is new

Foundations that do not exist in any form today: the tool-selector vocabulary and per-target tool maps; the restriction-class rule (R2) for agents; model references and fallback lists; native overrides with divergence diagnostics; foreign agent readers with provenance; reference rewriting to plugin-qualified ids; per-field registry support.

## 7. Open questions and unverified claims

### 7.1 Open design questions

- **Q1** Who owns the refined operation set (section 2): this facet, the hooks/instructions facets that also use operations, or the runtime taxonomy package? All three must agree before `tools` ships.
- **Q2** Should `permissions` ship with the first agent slice? It meets the two-tool rule (OpenCode, Kiro), but its pattern grammar per operation (command prefix, path glob, URL/domain, MCP tool) is undefined and Kiro's details are post-cutoff. Deferring it keeps the core at 19 fields and leaves OpenCode/Kiro rules in extras.
- **Q3** The native-override mechanism (5.1 kind 2) is cross-facet. Skills, commands, hooks and MCP need the same decision; this facet assumes it is adopted.
- **Q4** Claude dual channel: plugin agents ignore `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`. Should caplet emit agents needing those as loose `.claude/agents/` files (exposed to Copilot, VS Code, Cursor, Goose: C18) or degrade them inside the plugin? The choice decides whether "real Claude plugin" output can be as capable as Claude itself.
- **Q5** Claude `mode: primary` could be enforced with a settings `permissions.deny: ["Agent(<name>)"]`, but the advisor rules out writing consumer settings. Accept the documented degradation?
- **Q6** Agent-scoped `hooks` on Claude plugins could be hoisted into plugin `hooks/hooks.json` behind a wrapper that filters on the `agent_type` input field. Worth building, or keep the error?
- **Q7** Copilot and VS Code share files (C16). One shared `.agent.md` per agent, or one file per product with `target:`, given both scan `.github/agents/` and the plugin namespace?
- **Q8** Kiro's agent configuration reference and permissions pages are dated 2026-10-01/02; whether those fields shipped by the snapshot date is unknown. Treat Kiro as a provisional column.
- **Q9** `.agents/agents/<name>.md` is read by Goose and Devin Local. Should caplet adopt it as the shared loose root for tools without a plugin system, as it does for `.agents/skills/`?
- **Q10** Amp and Lume define agents through code or extension-owned keys. Is generated TypeScript an acceptable writer output for Amp, given trust and maintenance cost?
- **Q11** Should `default_agent`-style selection (Claude plugin `agent` setting, OpenCode `default_agent`, Lume preset `root`) become a capability-level field? It is shared by three tools but is package/settings configuration, outside this facet.
- **Q12** Pi: depend on a pinned subagent extension (for example `pi-subagents`) and its schema, or keep Pi agents unsupported?

### 7.2 Unverified claims

- Claude: `fable` alias and model ids are as of the fetched page; current task-management tool names; the exact MCP tool prefix for plugin-provided servers inside `tools`; whether plugin agents honor `memory`, `isolation`, `background`, `skills` (not in the ignored list, so presumably yes); how a plugin agent's bare name collides with loose agents given namespacing.
- Codex: `model_reasoning_effort` enum, whether `approval_policy` and `model_provider` are honored inside agent files, whether a child can be prevented from spawning, project-vs-personal precedence, and any `nickname_candidates`-style display field (absent from the fetched page).
- Copilot: whether the CLI honors `disable-model-invocation` (it documents `infer`); effort values beyond low/medium/high; `maxTurns`/permission fields (UNKNOWN in inventory); how Copilot interprets Claude-only keys in `.claude/agents/`.
- VS Code: tool and tool-set names, the `model` display-name format, precedence across sources, interpretation of Claude-compat `permissionMode`, `color`, `memory`, `maxTurns`, `skills`.
- Cursor: name/description requiredness conflict between guide and plugin reference; plugin vs project precedence; effort parameter values per model; ambient instruction behavior for subagents.
- Gemini: built-in tool names (section 2 column), MCP tool naming inside `tools`, at-limit behavior of `max_turns`, duplicate-name precedence, whether extension policy files can scope rules with `subagent`.
- OpenCode: `variant` values for effort, MCP tool naming for `permission` patterns, whether `name` frontmatter is harmful or merely normalized, whether `"*"` is accepted as a `permission` key for allowlists.
- Lume: tool names for selectors, effort vocabulary after `:`, behavior of an empty `agents.delegates`, whether a role without `model` inherits.
- Devin, Cline, Goose: tool names, model id formats, precedence, Cline configured-agent invocation and `skills` meaning.
- Amp: discovery roots and release status of the declarative agent directory format.
- Cross-tool: whether any tool besides Claude rejects an agent whose tool allowlist resolves to nothing (Claude usually fails to launch it, so `tools.allow: []` on Claude is currently mapped to error, not emitted).
