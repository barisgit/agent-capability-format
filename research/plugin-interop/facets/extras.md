# Facet: other native capability types (snapshot 2026-10-01)

Scope: everything a package can ship beyond skills, agents, commands, instructions, hooks and MCP servers. That covers LSP servers, themes, install-time configuration options (`userConfig` and its relatives), model providers, output styles, monitors, status lines, keybindings, apps and connectors, code modules (JS/TS plugins and extensions, custom tools), and the remaining one-tool components (workflows, channels, evals, automations, recipes, specs, formatters, canvases, `bin/`). Permission policies (Gemini `policies/`, `excludeTools`) belong to the permissions facet; listing metadata (`interface`, icons, URLs) belongs to the packaging facet. They appear here only where they collide with this facet's names.

Evidence: the 15 inventories under `../tools/` (each cites its sources), the advisor note `../advice-core-vs-extras.md`, and three spot checks made for this facet on 2026-10-01:

- [Claude plugins reference](https://code.claude.com/docs/en/plugins-reference): the LSP field table (strict object; `command` and `extensionToLanguage` required; `transport` accepts `socket` but every server runs over stdio; `requestTimeout` needs v2.1.288), the monitor fields (`name`, `command`, `description`, `when`), the `userConfig` field table (`options` needs v2.1.271), and the `${...}` resolution table (LSP: `command`, `args`, `env`, `workspaceFolder`; monitors: `command` only, nothing exported).
- [Claude terminal config](https://code.claude.com/docs/en/terminal-config): theme `base` presets, the color value forms, "Tokens not listed here fall through to the base preset", "Unknown tokens and invalid color values are ignored", and the token reference (`claude`, `text`, `inverseText`, `inactive`, `subtle`, `suggestion`, `permission`, `remember`, `success`, `error`, `warning`, `merged`, `promptBorder`, `planMode`, `autoAccept`, `bashBorder`, `ide`, `fastMode`, `effortUltra`, `diffAdded`/`diffRemoved` = **backgrounds** of added/removed lines, `diffAddedDimmed`, `diffRemovedDimmed`, `diffAddedWord`, `diffRemovedWord`, `userMessageBackground`, `userMessageBackgroundHover`, `bashMessageBackgroundColor`, `memoryBackgroundColor`, `selectionBg` = mouse text selection, `rate_limit_fill`, `rate_limit_empty`, `briefLabelYou`, `briefLabelClaude`, `*Shimmer` pairs, `<color>_FOR_SUBAGENTS_ONLY`). Claude has no terminal background token.
- [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference): LSP fields `command`, `bash`, `powershell`, `cwd` ("Absolute or relative to the configuration file. Supports `${PLUGIN_ROOT}`"), `args` ("ignored for `bash` and `powershell`"), `env`, `fileExtensions` (required), `rootUri` ("Project root relative to the git root (default: `.`)"), `initializationOptions`.

"ACF targets" means the five targets in `packages/core/src/targets/registry.ts` (claude, codex, cursor, opencode, pi).

Cell and status legend (same as `commands.md`):

| Mark | Meaning |
|---|---|
| **N**(spelling) | Native: the target has the same meaning; writer emits that spelling. |
| **T**(how) | Translated: a deterministic rewrite preserves the meaning. |
| **D**(how) | Degraded: meaning is weakened in a declared way; writer emits the named `lossy` diagnostic. |
| **E** | Refused: writer does not emit the entity for that target (`error` diagnostic) because every available degradation would leak a secret, widen execution, or silently break a reference. |
| **U** | Unsupported and nothing to emit. Treated as D with a diagnostic when the canonical field is set. |
| **I** | Installer-resolved: the target has no declaration for this, so the ACF installer prompts, stores the consumer's value, and the writer emits the resolved value (section 2.3.4). |
| **?** | Unverified: documentation does not establish the behavior; writer treats it as U until a fixture proves it (section 7). |
| — | Not applicable. |

## 1. Concept map

### 1.1 Which tools ship what, and where it lives

"Pkg" = a package (plugin, extension, bundle) can ship it. "Cfg" = only consumer/user/project configuration can declare it. "Code" = only a code module can register it. Blank = not documented.

| Concept | Claude | Codex | Copilot CLI | VS Code | Cursor | Gemini | OpenCode | Amp | Windsurf/Devin | Cline | Roo | Goose | Kiro | Pi | Lume | Agent Plugins | MCPB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LSP server | Pkg | — | Pkg | — | — | — | Cfg | | | Code | | — | — | Code | — | — | — |
| Theme definition | Pkg (experimental) | — | — (built-in names only) | — | — | Pkg | Pkg (`oc-themes`), Cfg dirs | removed | — (`theme_mode`) | | | Cfg env | — | Pkg | — | — | — |
| Config options declared by package | Pkg `userConfig` | — | — | | Pkg `variables` (admin-supplied) | Pkg `settings[]` | — | | — | | | — | — | Code (`registerFlag`) | Code (Zod `settings.schema`) | — | Pkg `user_config` |
| Model provider | Code (Mods) | Cfg `model_providers` | Cfg `providers.json` (schema unknown) | | | — | Cfg `provider`; Code (provider/auth hooks) | | Cfg (`agent.model` only) | Code | | Cfg | | Cfg `models.json`; Code | | — | — |
| Output style | Pkg | — | | — | — | — | | | | | | | | — | — | — | — |
| Monitor (background watcher) | Pkg (experimental) | — | | | — | — | | (status items, Code) | | | | | | — | — | — | — |
| Status line | Cfg `statusLine`; Pkg default `subagentStatusLine` only | — | Cfg `statusLine` | — | — | — | | Code | | | | | | Code (`setStatus`/`setFooter`) | | — | — |
| Keybindings | Cfg `keybindings.json` | Cfg `tui.keymap` | | — | — | — | Cfg `tui.json` | Cfg `amp.keymap` | Cfg `keymap` | | | | Cfg (agent `keyboardShortcut`) | Cfg `keybindings.json`; Code `registerShortcut` | Cfg | — | — |
| Apps / connectors | — (MCP only) | Pkg `.app.json` | Cfg `connectors` | MCP Apps | MCP Apps, canvases | — | | | | | | | | — | — | — | — |
| Code module (in-process or child process JS/TS) | Pkg Mods `modules`, `workflows/` | — | Pkg CLI extensions (child process), canvas extensions | — | — (VS Code ext API) | — | Pkg plugins + `tools/` | Pkg plugins | — | Pkg SDK plugins | Pkg `.roo/tools` | — | — | Pkg `extensions` | Pkg extensions | — | — |
| Executables on PATH | Pkg `bin/` | | | | | | | | | | | | | | | — | — |
| Scheduled / automated prompts | — | | | Pkg `automations/` | | | | | | Code `automationEvents` | | Pkg recipes | Pkg workflows (post-cutoff) | | | — | — |
| Formatter | (hooks) | | | | | | Cfg `formatter` | | | | | | | | | — | — |

### 1.2 Shared meanings and their spellings

Only concepts that at least two tools express with the same observable behavior are listed. Each row becomes one canonical field in section 2.

| Meaning | Spellings |
|---|---|
| LSP server launched for a set of file extensions | Claude `lspServers.<name>` / `.lsp.json`; Copilot `lspServers.<name>` in `lsp.json` or `com.github.copilot/lsp.json`; OpenCode config `lsp.<name>` |
| LSP executable + argv | Claude `command` + `args`; Copilot `command` + `args`; OpenCode `command: string[]` |
| LSP process environment | Claude `env`; Copilot `env`; OpenCode `env` |
| File extension to LSP language id | Claude `extensionToLanguage`; Copilot `fileExtensions`; OpenCode `extensions[]` (extension only, no language id) |
| LSP `initialize` request options | Claude `initializationOptions`; Copilot `initializationOptions`; OpenCode `initialization` |
| Named color theme the user can select | Claude `themes/*.json`; Gemini `themes[]`; OpenCode `themes/<name>.json`; Pi `themes/*.json` |
| Theme is designed for a dark or light terminal | Claude `base: dark` / `base: light`; OpenCode per-color `{dark, light}` (finer) |
| Theme token color (one row per token, see 2.2.2) | e.g. success: Claude `success`, Gemini `status.success`, OpenCode `success`, Pi `success` |
| Option the consumer supplies when enabling a package | Claude `userConfig.<key>`; MCPB `user_config.<key>`; Gemini `settings[]`; Cursor `variables.properties.<key>` |
| Option value type | Claude/MCPB `type` (`string`, `number`, `boolean`, `directory`, `file`); Cursor JSON Schema `type` |
| Option label | Claude/MCPB/Cursor `title`; Gemini `name` (also its lookup key) |
| Option help text | Claude/MCPB/Cursor/Gemini `description` |
| Option must be supplied | Claude/MCPB `required: true`; Cursor `required: [key]` |
| Option default | Claude/MCPB/Cursor `default` |
| Option is a secret | Claude/MCPB/Gemini `sensitive` |
| Option holds a list | Claude `multiple` (string only); MCPB `multiple` (directory/file only); Cursor `type: array` |
| Option restricted to fixed values | Claude `options`; Cursor `enum` |
| Numeric bounds | Claude/MCPB `min`/`max`; Cursor `minimum`/`maximum` |
| Reference to an option value inside a launched process config | Claude/MCPB `${user_config.KEY}`; Cursor `${KEY}`; Gemini env var named by `envVar` |
| Provider endpoint | Codex `base_url`; OpenCode `options.baseURL`; Pi `baseUrl` |
| Provider wire protocol | Codex `wire_api`; OpenCode `npm` (AI SDK package); Pi `api` |
| Provider API key taken from an environment variable | Codex `env_key`; OpenCode `env[]` + `{env:VAR}`; Pi `apiKey: "$VAR"` |
| Extra request headers | Codex `http_headers`; OpenCode `options.headers` (?); Pi `headers` |
| Model catalog entry: id, display name, context window, max output, reasoning, input modalities, per-token cost | OpenCode `models.<id>` (`limit.context`, `limit.output`, `reasoning`, `modalities.input`, `cost.*`); Pi `models[]` (`contextWindow`, `maxTokens`, `reasoning`, `input`, `cost.*`) |

Concepts that look shared but are not (detailed in section 4): status lines (same JSON, different stdin payload contract), keybindings (inverted map direction and precedence), code-module tools (incompatible `execute` contracts), `settings` (Claude defaults versus Gemini inputs), `extensions` (Agent Plugins namespaces versus Copilot executable paths), LSP root directory (Claude path versus Copilot git-relative), and several theme tokens with the same spelling but different meaning.

## 2. Proposed canonical ACF core schema

Four additions, ordered by how much evidence supports them: LSP servers (three tools, near-identical), themes (four tools, partial token overlap), config options (four declaration formats, one shared reference contract), and providers (three tools, but all consumer configuration; gated, see 2.4). Everything else in section 1.1 stays native (section 5).

### 2.1 LSP servers: `lsp/lsp.yml`

```yaml
# lsp/lsp.yml (illustrative)
servers:
  gopls:
    command: gopls
    args: [serve]
    env: { GOFLAGS: "-mod=mod" }
    languages: { ".go": go, ".mod": go.mod }
    initializationOptions: { usePlaceholders: true }
    targets:
      claude: { restartOnCrash: false }
```

| Field | Type | Meaning | Origin |
|---|---|---|---|
| key (`servers.<name>`) | slug `^[a-z0-9][a-z0-9-]*$` | Server identity within the capability. Writers scope it per section 4 (C11). | Claude, Copilot, OpenCode |
| `command` | string, required, no whitespace | Executable launched over stdio. Same rule as Claude ("No spaces unless the value starts with `/`" is tightened to none). | Claude, Copilot, OpenCode `command[0]` |
| `args` | string[], default `[]` | Exec-form arguments, never shell-parsed. | Claude, Copilot, OpenCode `command[1..]` |
| `env` | map string->string | Added to the server process environment. | Claude, Copilot, OpenCode |
| `languages` | map `".ext"` -> LSP language id, required, non-empty | Which files the server handles and the `languageId` sent for them. Keys start with `.`. | Claude `extensionToLanguage`, Copilot `fileExtensions`, OpenCode `extensions` (keys only) |
| `initializationOptions` | any JSON | Sent in the LSP `initialize` request. | Claude, Copilot, OpenCode `initialization` |
| `targets.<t>` | per-target typed object | Section 5. | SPEC §7 |

Transport is always stdio; there is no canonical `transport` field (C12). Placeholders `${ACF_CAPABILITY_DIR}`, `${ACF_PACKAGE_DIR}` and `${config.KEY}` (2.3.3) are allowed in `command`, `args` and `env` values, nowhere else.

### 2.2 Themes: `themes/<name>.yml`

```yaml
# themes/dusk.yml (illustrative)
name: dusk            # optional; defaults to the file stem
appearance: dark      # dark | light, required
colors:
  accent: "#a78bfa"
  success: "#50fa7b"
  diff.addedBg: "#14532d"
  syntax.keyword: 141
  background: default
```

#### 2.2.1 Theme fields

| Field | Type | Meaning | Origin |
|---|---|---|---|
| `name` | slug, default file stem | Name shown in the host's theme picker. | Claude `name` (default filename), Gemini `name`, OpenCode file stem, Pi `name` |
| `appearance` | enum `dark` \| `light`, required | The terminal background the theme is designed for; the base every unset token falls back to. | Claude `base: dark` / `base: light`; OpenCode `{dark, light}` per color (finer, C15) |
| `colors` | map canonical token -> color, sparse | Token overrides. Unset tokens use the target's built-in theme for `appearance`. | all four |

Color values (canonical domain):

| Form | Meaning | Origin |
|---|---|---|
| `"#rrggbb"` lowercase | 24-bit color | Claude, Gemini, OpenCode, Pi (Pi requires six digits; readers expand `#rgb`) |
| integer 0-255 | xterm-256 palette index | Claude `ansi256(n)`, OpenCode, Pi |
| `default` | Terminal default color (no color set) | OpenCode `"none"`, Pi `""` |

Readers normalize other native forms into this domain: Claude `rgb(r,g,b)` to hex, Claude `ansi:<name>` to index 0-15, Gemini CSS color names to hex. Writers never emit the theme *selection* (C14).

#### 2.2.2 Canonical tokens

Only tokens with the same meaning in at least two tools. Every other native token stays in `targets.<t>.colors` (section 5).

| Token | Meaning | Claude | Gemini | OpenCode | Pi |
|---|---|---|---|---|---|
| `accent` | Primary brand/highlight color | `claude` | `text.accent` | `primary` | `accent` |
| `text` | Default foreground | `text` | `text.primary` | `text` | `text` |
| `textMuted` | Secondary text: hints, timestamps, disabled | `inactive` | `text.secondary` | `textMuted` | `muted` |
| `success` | Success state | `success` | `status.success` | `success` | `success` |
| `warning` | Warning state | `warning` | `status.warning` | `warning` | `warning` |
| `error` | Error state | `error` | `status.error` | `error` | `error` |
| `background` | Main UI background | U | `background.primary` | `background` | U |
| `border` | Default border | U (`promptBorder` is narrower) | `border.default` | `border` | `border` |
| `link` | Link text | U | `text.link` | `markdownLink` | `mdLink` |
| `userMessageBg` | Background behind the user's own messages | `userMessageBackground` | U | U | `userMessageBg` |
| `diff.addedBg` | Background of added lines | `diffAdded` | `background.diff.added` | `diffAddedBg` | U |
| `diff.removedBg` | Background of removed lines | `diffRemoved` | `background.diff.removed` | `diffRemovedBg` | U |
| `diff.addedText` | Foreground of added lines | U | U | `diffAdded` | `toolDiffAdded` |
| `diff.removedText` | Foreground of removed lines | U | U | `diffRemoved` | `toolDiffRemoved` |
| `diff.contextText` | Foreground of unchanged diff lines | U | U | `diffContext` | `toolDiffContext` |
| `markdown.heading` | Rendered heading | U | U | `markdownHeading` | `mdHeading` |
| `markdown.code` | Inline code | U | U | `markdownCode` | `mdCode` |
| `markdown.codeBlock` | Fenced code block text | U | U | `markdownCodeBlock` | `mdCodeBlock` |
| `markdown.quote` | Block quote | U | U | `markdownBlockQuote` | `mdQuote` |
| `markdown.rule` | Horizontal rule | U | U | `markdownHorizontalRule` | `mdHr` |
| `markdown.listBullet` | List marker | U | U | `markdownListItem` (?) | `mdListBullet` |
| `syntax.comment` | Code comment | U | `ui.comment` (?) | `syntaxComment` | `syntaxComment` |
| `syntax.keyword` | Keyword | U | U | `syntaxKeyword` | `syntaxKeyword` |
| `syntax.function` | Function name | U | U | `syntaxFunction` | `syntaxFunction` |
| `syntax.variable` | Variable | U | U | `syntaxVariable` | `syntaxVariable` |
| `syntax.string` | String literal | U | U | `syntaxString` | `syntaxString` |
| `syntax.number` | Number literal | U | U | `syntaxNumber` | `syntaxNumber` |
| `syntax.type` | Type name | U | U | `syntaxType` | `syntaxType` |
| `syntax.operator` | Operator | U | U | `syntaxOperator` | `syntaxOperator` |
| `syntax.punctuation` | Punctuation | U | U | `syntaxPunctuation` | `syntaxPunctuation` |

30 tokens. Deliberately excluded because the same or similar spelling means different things: Claude `selectionBg` (mouse selection) versus Pi `selectedBg` (selected list row); Claude `promptBorder` (input box) versus `border`; OpenCode `borderActive` versus Pi `borderAccent` versus Gemini `border.focused` (Gemini does not render the last); OpenCode `markdownLinkText` versus Pi `mdLinkUrl` (which of text/URL each colors is unverified).

### 2.3 Config options: manifest `config`

#### 2.3.1 Declaration

```yaml
# acf.yml (illustrative)
acf: 1
name: acme-search
config:
  api_token:
    type: string
    title: API token
    description: Token from the Acme dashboard.
    required: true
    sensitive: true
  region:
    type: string
    title: Region
    description: Data residency region.
    default: eu
    choices: [eu, us]
  roots:
    type: directory
    title: Indexed folders
    description: Folders the server may read.
    multiple: true
```

The block is a top-level manifest field on purpose: SPEC §4.2 makes current readers reject unknown top-level fields, so a package that depends on options fails closed on an old reader instead of launching MCP servers with literal `${config.KEY}` arguments.

| Field | Type | Meaning | Origin |
|---|---|---|---|
| key | `^[A-Za-z_][A-Za-z0-9_]*$`, unique case-insensitively | Option identity and reference name. Case-insensitive uniqueness keeps the derived environment variable name (2.3.3) injective. | Claude key rule; MCPB, Cursor, Gemini `envVar` |
| `type` | enum `string` \| `number` \| `boolean` \| `directory` \| `file`, required | Value type. `directory`/`file` are strings holding an absolute path chosen with a picker. | Claude, MCPB; Cursor JSON Schema `type` |
| `title` | string, required | Label shown when prompting. | Claude, MCPB, Cursor; Gemini `name` |
| `description` | string, required | Help text. | all four |
| `required` | boolean, default `false` | The option must have a non-empty value **after** the default is applied. | Claude, MCPB, Cursor |
| `default` | value of `type`; list of strings when `multiple` | Used when the consumer supplies nothing. Forbidden with `sensitive: true`. | Claude, MCPB, Cursor |
| `sensitive` | boolean, default `false` | Secret: masked on entry, never written to a plain-text file by any ACF writer or installer, never substituted into Markdown content. | Claude, MCPB, Gemini |
| `multiple` | boolean, default `false`; only for `string`, `directory`, `file` | Value is a list of that type. | Claude (string), MCPB (directory/file), Cursor `type: array` |
| `choices` | string[], 1-64 chars each; only for non-multiple, non-sensitive `string` | Value must be one of these. | Claude `options`, Cursor `enum` |
| `min` / `max` | number; only for `number` | Inclusive bounds. | Claude, MCPB, Cursor `minimum`/`maximum` |

#### 2.3.2 Value supply

Canonical meaning: the **consumer installing the package** supplies the value when the package is enabled. Where the value is stored, and whether user or workspace scope wins, is the host's business (SPEC §1.4 stays: ACF defines no secret store). Cursor's admin-supplied values and Gemini's workspace override are host behaviors that writers report (section 4, C6).

#### 2.3.3 Reference: `${config.KEY}`

A new placeholder, resolved like the existing `${ACF_*}` placeholders (SPEC §13a.4.1), allowed only in:

- MCP `command`, `args`, `env` values, `url`, `headers` values;
- LSP `command`, `args`, `env` values;
- hook `args` and `env` values (exec form). Not in hook `command`, and never in a hook with `shell` set, because Claude rejects option interpolation in shell-form hooks and shell interpolation of a consumer string is an injection path.

A `multiple` option referenced as a whole `args` element expands to one element per value (MCPB rule, also the safe reading for Claude). Anywhere else (inside a longer string, in `env`, `url`, `headers`) a `multiple` reference is an error, because hosts disagree on how lists join.

Not allowed in skill, agent, command or instruction bodies: only Claude substitutes there, and only non-sensitive values. Authors who need that keep it in `targets.claude` content.

#### 2.3.4 Installer resolution for targets without declarations

Codex, OpenCode, Pi and most other tools have no package option facility. For them the ACF installer prompts when the capability is installed, stores **non-sensitive** values in the consumer's `capabilities.yml` entry (`config: { region: us }`), and the writer substitutes the literal value. A **sensitive** option is never stored by ACF; the writer emits a host environment-variable reference named `ACF_<CAPABILITY>_<KEY>` (uppercased, non-alphanumerics to `_`) in fields where the target expands environment variables, and refuses (E) where it does not. That is the `I` mark in the tables.

### 2.4 Providers and models: `providers/providers.yml` (gated)

Three tools share the meaning, so the union rule puts it in the core. No tool lets a *package* declare one; all three are consumer configuration (Codex `config.toml`, OpenCode `opencode.json`, Pi `~/.pi/agent/models.json`), and only code modules (Claude Mods, OpenCode provider hooks, Pi extensions, Cline plugins) register providers from a package. ACF already writes MCP servers into the same files as owned regions, so emission is mechanically the same, but adding a credential-bearing endpoint is a consumer decision. Writers therefore emit providers only when the consumer's `capabilities.yml` entry opts in (`providers: allow`); otherwise every target is D with `acf.adapter.provider-not-enabled`. Writers never set the default model (`model`, `small_model`, `agent.model`); selection is consumer-only.

```yaml
# providers/providers.yml (illustrative)
providers:
  acme:
    name: Acme AI
    api: openai-responses
    baseUrl: https://api.acme.example/v1
    apiKeyEnv: ACME_API_KEY
    headers: { X-Team: "${config.team}" }
    models:
      acme-large:
        name: Acme Large
        contextWindow: 200000
        maxOutputTokens: 32000
        reasoning: true
        input: [text, image]
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }
```

| Field | Type | Meaning | Origin |
|---|---|---|---|
| key | slug | Provider id | Codex `model_providers.<id>`, OpenCode `provider.<id>`, Pi `providers.<id>` |
| `name` | string | Display name | Codex `name`, OpenCode `name`, Pi (via model `name` only) |
| `api` | enum `openai-chat` \| `openai-responses` \| `anthropic-messages` \| `google-generative` | Wire protocol | Codex `wire_api` (`responses` only), OpenCode `npm`, Pi `api` |
| `baseUrl` | URL | Endpoint | Codex `base_url`, OpenCode `options.baseURL`, Pi `baseUrl` |
| `apiKeyEnv` | env var name | Credential comes from this variable; never a literal, never a command | Codex `env_key`, OpenCode `env[]`, Pi `apiKey: "$NAME"` |
| `headers` | map | Extra request headers (no credentials) | Codex `http_headers`, OpenCode `options.headers` (?), Pi `headers` |
| `models.<id>.name` | string | Model display name | OpenCode, Pi |
| `models.<id>.contextWindow` | int tokens | Context window | OpenCode `limit.context`, Pi `contextWindow` |
| `models.<id>.maxOutputTokens` | int tokens | Output cap | OpenCode `limit.output`, Pi `maxTokens` |
| `models.<id>.reasoning` | boolean | Model supports reasoning | OpenCode, Pi |
| `models.<id>.input` | subset of `text`, `image` | Accepted input modalities | OpenCode `modalities.input`, Pi `input` |
| `models.<id>.cost.{input,output,cacheRead,cacheWrite}` | USD per 1M tokens | Pricing for usage display | OpenCode `cost.*` (snake case), Pi `cost.*` |

### 2.5 Diagnostics

| Code | Severity | Fired when |
|---|---|---|
| `acf.lsp.invalid` | error | `command` contains whitespace, `languages` empty or a key lacks the leading dot, placeholder outside allowed fields. |
| `acf.adapter.lsp-unsupported` | lossy | Target cannot run LSP servers (most targets). |
| `acf.adapter.lsp-language-id-dropped` | lossy | OpenCode: only extensions are emitted; the host picks the language id. |
| `acf.adapter.lsp-name-scoped` | info | Writer emitted a scoped server name (C11); reports the effective name. |
| `acf.theme.invalid-color` | error | Color outside the canonical domain. |
| `acf.adapter.theme-unsupported` | lossy | Target has no package themes. |
| `acf.adapter.theme-token-dropped` | lossy | A set canonical token has no carrier on the target (U cell); lists tokens. |
| `acf.adapter.theme-color-approximated` | lossy | Palette index converted to hex (Gemini); indices 0-15 depend on the user's terminal palette. |
| `acf.adapter.theme-filled` | info | Pi: unset tokens filled from the writer's built-in palette for `appearance`. |
| `acf.config.invalid` | error | Field combination violates 2.3.1 (`default` with `sensitive`, `choices` on a non-string, `multiple` on `number`/`boolean`, case-insensitive key clash). |
| `acf.config.reference-forbidden` | error | `${config.KEY}` outside 2.3.3 surfaces, unknown key, or `multiple` reference inside a string. |
| `acf.adapter.config-installer-resolved` | info | `I` cells: the installer prompts and substitutes. |
| `acf.adapter.config-secret-refused` | error | `E`: a sensitive option is referenced in a field where the target neither substitutes options nor expands environment variables. |
| `acf.adapter.config-constraint-dropped` | lossy | `choices`, `min`/`max`, `required`, `default`, `multiple` or picker type lost; lists them. Installer still enforces them when it prompts. |
| `acf.adapter.config-admin-supplied` | warn | Cursor: values come from team admins, not the installing user. |
| `acf.adapter.provider-not-enabled` | lossy | Providers present but the consumer did not opt in. |
| `acf.adapter.provider-api-unsupported` | error | Target cannot speak the declared `api` (Codex for anything but `openai-responses`). |
| `acf.adapter.provider-field-dropped` | lossy | Model catalog fields without a carrier (Codex has none). |
| `acf.native.dropped` | lossy (code modules: warn) | A native extra for another format is not emitted for this target; one per item with its path. |
| `acf.native.ownership-conflict` | error | A native extra and a generated output claim the same path or manifest key. |
| `acf.native.reference-broken` | error | A rename, filter or `only`/`except` would leave a native extra referencing a missing entity (C24). |
| `acf.native.code-not-activated` | warn | Native code module preserved but not enabled because the consumer did not opt in (section 5.3). |

## 3. Field-level support table

### 3.1 Current ACF targets and package formats

#### LSP

| Canonical | Claude | Codex | Cursor | OpenCode | Pi | Copilot CLI | VS Code | Agent Plugins 1.0 | MCPB |
|---|---|---|---|---|---|---|---|---|---|
| Carrier | N(plugin `.lsp.json`, `lspServers`) | U | U | T(consumer `opencode.json` `lsp.<name>` owned region, like MCP) | U (extension code only) | N(`com.github.copilot/lsp.json`; legacy `lsp.json`) | U | U (namespace only) | U |
| key | N(object key) | — | — | T(scoped name, C11) | — | N(object key) | — | — | — |
| `command` | N | — | — | T(`command[0]`) | — | N(`command`) | — | — | — |
| `args` | N | — | — | T(`command[1..]`) | — | N(`args`) | — | — | — |
| `env` | N | — | — | N(`env`) | — | N | — | — | — |
| `languages` | N(`extensionToLanguage`) | — | — | D(`extensions` = keys; id dropped) | — | N(`fileExtensions`) | — | — | — |
| `initializationOptions` | N | — | — | T(`initialization`) | — | N | — | — | — |
| `${ACF_CAPABILITY_DIR}` | T(`${CLAUDE_PLUGIN_ROOT}`) | — | — | T(absolute install path) | — | ? T(`${PLUGIN_ROOT}`; documented for `cwd` only, else absolute path) | — | — | — |
| `${config.KEY}` | T(`${user_config.KEY}`) | — | — | I | — | I | — | — | — |

#### Themes

| Canonical | Claude | Codex | Cursor | OpenCode | Pi | Copilot CLI | VS Code | Agent Plugins 1.0 | MCPB |
|---|---|---|---|---|---|---|---|---|---|
| Carrier | N(plugin `themes/<name>.json`, `experimental.themes`) | U | U | N(`themes/<name>.json` + `package.json` `oc-themes`; loose install `.opencode/themes/`) | N(`themes/<name>.json`, `pi.themes`) | U (built-in names only) | U | U | U |
| `name` | N(`name`) | — | — | T(file stem) | N(`name`) | — | — | — | — |
| `appearance` | N(`base: dark\|light`) | — | — | T(plain colors; mode implied) | D(dropped; theme fixed) | — | — | — | — |
| color `#rrggbb` | N | — | — | N | N | — | — | — | — |
| color index 0-255 | T(`ansi256(n)`) | — | — | N | N | — | — | — | — |
| color `default` | D(token omitted; base color shows) | — | — | N(`"none"`) | N(`""`) | — | — | — | — |
| tokens | N/U per 2.2.2 | — | — | N/U per 2.2.2 | N/U per 2.2.2 | — | — | — | — |
| unset tokens | N(fall through to `base`) | — | — | ? (fallback unverified) | T(filled from built-in palette, info) | — | — | — | — |

#### Config options

| Canonical | Claude | Codex | Cursor | OpenCode | Pi | Copilot CLI | VS Code | Agent Plugins 1.0 | MCPB |
|---|---|---|---|---|---|---|---|---|---|
| Carrier | N(`userConfig`) | I | T(`variables` JSON Schema) | I | I | I | ? I | U (I when installed by ACF) | N(`user_config`) |
| key | N | I | N(property name) | I | I | I | I | — | N |
| `type: string` | N | I | N | I | I | I | I | — | N |
| `type: number` | N | I | N | I | I | I | I | — | N |
| `type: boolean` | N | I | N | I | I | I | I | — | N |
| `type: directory` / `file` | N | I | D(`string`; picker lost) | I | I | I | I | — | N |
| `title` | N | I | N | I | I | I | I | — | N |
| `description` | N | I | N | I | I | I | I | — | N |
| `required` | N | I | T(object `required[]`) | I | I | I | I | — | T(emit `required: false` when `default` is set, C4) |
| `default` | N | I | N | I | I | I | I | — | N |
| `sensitive` | N | I (env reference) | ? D(masking unverified; warn) | I (env reference) | I (env reference) | I | I | — | N |
| `multiple` (string) | N | I | T(`type: array`, `items: string`) | I | I | I | I | — | D(single string; constraint dropped) |
| `multiple` (directory/file) | D(`type: string` + `multiple`; picker lost) | I | T(`array` of string) | I | I | I | I | — | N |
| `choices` | N(`options`) | I | T(`enum`) | I | I | I | I | — | D(dropped) |
| `min` / `max` | N | I | T(`minimum`/`maximum`) | I | I | I | I | — | N |
| `${config.KEY}` in MCP | T(`${user_config.KEY}`) | I(non-sensitive literal; sensitive: `env_vars`/`bearer_token_env_var` where the field allows, else E) | ? T(`${KEY}`) | I(non-sensitive literal; sensitive `{env:VAR}`) | — (no native MCP) | I(literal; sensitive E unless env expansion verified) | I | — | T(`${user_config.KEY}`) |
| `${config.KEY}` in hook args/env | T(`${user_config.KEY}` in args); env ? (Claude documents substitution in `command`/`args` only; hooks also receive `CLAUDE_PLUGIN_OPTION_<KEY>`) | I | ? T | I | I | I | I | — | — |
| `${config.KEY}` in LSP | T(`${user_config.KEY}`) | — | — | I | — | I | — | — | — |

#### Providers (only when the consumer opts in)

| Canonical | Claude | Codex | Cursor | OpenCode | Pi | Copilot CLI | VS Code | Agent Plugins 1.0 | MCPB |
|---|---|---|---|---|---|---|---|---|---|
| Carrier | U (Mods code only) | T(`config.toml` `[model_providers.<id>]` owned region) | U | T(`opencode.json` `provider.<id>` owned region) | T(`~/.pi/agent/models.json` `providers.<id>` owned region) | ? (`providers.json` schema unknown) | U | U | U |
| `name` | — | N | — | N | D(no provider display name; dropped) | — | — | — | — |
| `api: openai-responses` | — | N(`wire_api = "responses"`) | — | ? T(`npm: @ai-sdk/openai`) | N(`openai-responses`) | — | — | — | — |
| `api: openai-chat` | — | E | — | ? T(`npm: @ai-sdk/openai-compatible`) | N(`openai-completions`) | — | — | — | — |
| `api: anthropic-messages` | — | E | — | ? T(`npm: @ai-sdk/anthropic`) | N | — | — | — | — |
| `api: google-generative` | — | E | — | ? T(`npm: @ai-sdk/google`) | N(`google-generative-ai`) | — | — | — | — |
| `baseUrl` | — | N(`base_url`) | — | T(`options.baseURL`) | N | — | — | — | — |
| `apiKeyEnv` | — | N(`env_key`) | — | T(`env: [NAME]`, `options.apiKey: "{env:NAME}"`) | T(`apiKey: "$NAME"`) | — | — | — | — |
| `headers` | — | N(`http_headers`) | — | ? T(`options.headers`) | N | — | — | — | — |
| `models.*` | — | D(dropped; Codex has no catalog) | — | T(`models.<id>`: `limit.context`, `limit.output`, `reasoning`, `modalities.input`, `cost.cache_read`/`cache_write`) | T(`models[]`: `contextWindow`, `maxTokens`, `reasoning`, `input`, `cost.cacheRead`/`cacheWrite`) | — | — | — | — |

### 3.2 Other inventoried tools

| Canonical | Gemini | Amp | Windsurf/Devin | Cline | Roo | Goose | Kiro | Lume |
|---|---|---|---|---|---|---|---|---|
| LSP (all fields) | U | ? U | ? U | U (code plugin only) | U | U | U | U |
| Theme carrier | N(manifest `themes[]`, `type: "custom"`) | U (removed) | U (`theme_mode` only) | ? U | ? U | U (`GOOSE_CLI_THEME` env) | U | U |
| Theme `name` | N | — | — | — | — | — | — | — |
| Theme `appearance` | D(dropped; no field) | — | — | — | — | — | — | — |
| color `#rrggbb` | N | — | — | — | — | — | — | — |
| color index 0-255 | D(nearest hex; 0-15 approximated) | — | — | — | — | — | — | — |
| color `default` | D(token omitted) | — | — | — | — | — | — | — |
| tokens | N/U per 2.2.2 | — | — | — | — | — | — | — |
| Config carrier | T(`settings[]`) | I | I | I | I | I | I | I (native Zod schema lives in code) |
| key | T(`envVar` = uppercased key) | I | I | I | I | I | I | I |
| `type` | D(all values are strings in `.env`; number/boolean parsed by consumer) | I | I | I | I | I | I | I |
| `title` | T(`name`, C3) | I | I | I | I | I | I | I |
| `description` | N | I | I | I | I | I | I | I |
| `required` | D(every setting is prompted; empty accepted ?) | I | I | I | I | I | I | I |
| `default` | D(dropped; no default field) | I | I | I | I | I | I | I |
| `sensitive` | N(keychain) | I | I | I | I | I | I | I |
| `multiple`, `choices`, `min`/`max` | D(dropped) | I | I | I | I | I | I | I |
| `${config.KEY}` in MCP | T(`${ENVVAR}` env expansion) | I | I | I | I | I | I | I |
| `${config.KEY}` in hook args/env | ? T(env var delivered to hooks unverified) | I | I | I | I | I | I | I |
| Providers | U | U | U (`agent.model` selection only) | U (code) | ? U | ? (consumer provider config; schema not inventoried) | U | U |

## 4. Conflicts that must not be unioned

| # | Conflict | Why a union would be wrong | Handling |
|---|---|---|---|
| C1 | `extensions` manifest key: Agent Plugins = map of reverse-domain namespace to client metadata; Copilot legacy = executable paths (`string`, `string[]`, `{paths, exclusive}`) | Same key, one is data and the other is code to run. Reading one as the other either runs metadata paths or drops executables. | Readers dispatch on manifest format first (AP `$schema` at `plugin.json` root versus Copilot legacy lookup order). Copilot legacy `extensions` goes to native extras as a code module (5.3). Copilot writer emits AP form only. |
| C2 | `settings`: Claude plugin `settings` = defaults applied to the host (only `agent` and `subagentStatusLine`); Gemini `settings[]` = inputs the user supplies | Opposite direction of data flow. | Gemini `settings[]` reads into canonical `config`. Claude `settings` stays native (`targets.claude`), references validated (C24), never applied to any other host's settings. |
| C3 | Gemini `settings[].name` is both the display label and a lookup key | Canonical splits key and `title`. | Writer: `name` = `title`, `envVar` = uppercased key (lookup also works by `envVar`). Reader: key = `envVar`, `title` = `name`; native `name` kept for byte round trip. |
| C4 | MCPB checks `required` before merging defaults; Claude treats `default` as satisfying | Same flag pair, different outcome. | Canonical: default first. MCPB writer emits `required: false` whenever `default` is present. |
| C5 | `multiple`: Claude string only; MCPB directory/file only | Each tool rejects the other's combination. | Canonical allows all three types; writers D per table. |
| C6 | Who supplies option values: user on enable (Claude, MCPB, Gemini user `.env`), team admin (Cursor), workspace `.env` overriding user (Gemini) | Different trust and scope. A per-user secret declared for Cursor ends up admin-wide. | Canonical says "consumer" without scope. Cursor writer warns `config-admin-supplied`; Gemini workspace override is host behavior, reported in docs only. |
| C7 | Option reference surfaces and delivery: Claude placeholder in exec args, MCP, LSP, content, error in shell hooks/monitors/`headersHelper`; env `CLAUDE_PLUGIN_OPTION_<KEY>` to hooks; Gemini delivers by env var; Cursor `${KEY}` | No single substitution model. | Canonical allows only the surfaces in 2.3.3, each with a verified translation or `I`. |
| C8 | Claude substitutes non-sensitive options into skill/agent bodies and replaces sensitive ones with a placeholder | Only Claude does content substitution; elsewhere the literal `${...}` would reach the model. | Not canonical. Kept in `targets.claude` content. |
| C9 | LSP root: Claude `workspaceFolder` (path, placeholders); Copilot `rootUri` (relative to the git root, default `.`) and `cwd` (process directory, relative to the config file) | Different bases (project root versus git root versus config file). | No canonical root field. Each stays in its own `targets.<t>`. |
| C10 | OpenCode `extensions[]` has no language id | The host infers the id; the server may receive a different `languageId`. | D with `lsp-language-id-dropped`. |
| C11 | LSP name collisions: OpenCode same-name entry replaces a built-in server; Claude later definition with the same name replaces the earlier; Copilot unverified | A package server named `typescript` would silently replace OpenCode's built-in. | Canonical names are capability-scoped. OpenCode writer emits `<capability>-<name>` (info). Deliberate built-in replacement is native-only (`targets.opencode.replaces: typescript`). Whether two OpenCode servers on one extension both run is unverified (Q3). |
| C12 | Claude `transport: socket` is accepted but runs stdio | The field does not do what it says. | Not canonical; stdio implied. Raw `transport` kept in `targets.claude` for round trip. |
| C13 | Copilot `bash`/`powershell` launchers (shell-parsed, platform-selected, `args` ignored) | Shell launch versus exec form. | Not canonical (exec form only); kept in `targets.copilot`. |
| C14 | Theme definition versus theme selection (Claude `/theme`, Gemini `ui.theme`, OpenCode `tui.json` `theme`, Pi `theme` setting) | Selection is consumer state. | Writers emit definitions only. Native selection keys in a package are dropped with `acf.native.dropped`. |
| C15 | Light/dark: Claude whole-theme `base` (plus daltonized and ANSI variants); OpenCode per-color `{dark, light}`; Gemini and Pi none | OpenCode's per-color variants and Claude's daltonized/ANSI bases have no second carrier. | Canonical `appearance` per theme. OpenCode reader projects the variant matching the declared mode (dark when ambiguous) and keeps the file native. Claude non-plain bases kept in `targets.claude.base`, canonical `appearance` from the dark/light prefix. |
| C16 | Same token spelling, different meaning: Claude `diffAdded` = background, OpenCode `diffAdded` = foreground (`diffAddedBg` is background), Pi `toolDiffAdded` = foreground; Claude `selectionBg` versus Pi `selectedBg` | Spelling-based mapping would paint text as background. | Canonical splits `diff.addedBg` and `diff.addedText`; selection tokens excluded (2.2.2). |
| C17 | Missing tokens: Claude falls through to `base`; Pi requires the full color set; Gemini/OpenCode unverified | Sparse canonical theme versus complete native file. | Canonical is sparse. Pi writer fills from its built-in palette for `appearance` (info). |
| C18 | Theme name collisions and precedence: OpenCode built-ins < user < project root < cwd; Gemini shows `name (extension)`; Claude and Pi plugin/package naming unverified | A package theme could shadow a built-in or a user theme. | Writers report the effective name; collisions with documented built-ins are errors. |
| C19 | Keybindings: Claude key -> action (`null` unbinds); Codex, Pi, Amp action -> key(s) (`[]`/`null` unbinds); OpenCode action -> key \| `false` \| `"none"` \| object; Amp user keymap overrides project (inverted precedence); action vocabularies are disjoint | No shared action ids and opposite map direction; all are consumer settings. | Not canonical. Not a package component in any tool; native keybinding files in a package are dropped with `acf.native.dropped`. |
| C20 | Status line: Claude and Copilot both `{type: "command", command, padding, refreshInterval}` | Identical shape, but the command reads a host-specific session JSON on stdin, so the same script prints different (or no) output. It is also a singleton consumer setting; Claude plugins may set only `subagentStatusLine`. | Not canonical. Claude `subagentStatusLine` stays in native Claude `settings`. |
| C21 | Code-module tools: Pi `execute(toolCallId, params, signal, onUpdate, ctx)` with TypeBox; OpenCode `execute(args, context)` with Zod; Roo `execute` returning a string; Amp JSON Schema `inputSchema` under Bun; Cline result policies and retries; Claude Mods `register(on, options)` in-process middleware; Copilot CLI extensions as child processes | Different runtimes, schemas, return shapes and lifecycles. SPEC §15 already says portable tools are MCP servers. | Not canonical. Preserved as native code modules (5.3). |
| C22 | Provider credentials: Pi `apiKey` is an expression (`!cmd` runs a shell command, `$VAR`, `${VAR}`, `$$`/`$!` escapes); OpenCode `{env:VAR}`; Codex `env_key` and `auth.command` | Some forms execute code. | Canonical `apiKeyEnv` (a variable name) only. Readers move `!cmd`, `auth.command`, OAuth blocks into native extras. Pi writer validates the emitted value starts with `$` and that literal values containing `$` or `!` are escaped. |
| C23 | Claude output style `force-for-plugin` (first forcing style wins, global) | Global singleton; no second tool has output styles. | Native only. |
| C24 | Native extras that name canonical entities: Claude monitor `when: on-skill-invoke:<skill>`, Claude `settings.agent: <agent>`, Codex `onboardingSkill` | Renames, filters and `only`/`except` cannot rewrite opaque native data. | Readers record these references; any operation that renames or removes the referenced entity fails with `acf.native.reference-broken` (advisor rule). |
| C25 | Code modules that change host policy: OpenCode plugin config hooks can mutate permissions; Claude Mods `allowModsToOverrideDenyRules` | Preserved bytes would carry a permission change across the trust boundary. | Preserved, never activated without consumer opt-in (5.3). |
| C26 | Claude manifest path keys `outputStyles`, `themes`, `monitors`, `workflows` replace default discovery; `lspServers` merges | Emitting a generated `themes/` folder plus a preserved `experimental.themes` path would hide one of them. | Single owner per output path or key; overlap is `acf.native.ownership-conflict`. |

No exit-code or decision contracts exist in this facet's core. The only processes with exit semantics (monitors, status-line commands, code-module tools) are all native-only, so they cannot leak a fail-open degradation into another target.

## 5. Per-target extras and lossless round trips

### 5.1 Where raw extras live

Two homes, matching what `commands.md` uses for entity extras:

1. **Entity extras** in `targets.<t>` on a canonical entity (SPEC §7): `lsp/lsp.yml` server entries, theme files, config options, providers. Each target gets its own schema (today `packages/core/src/targets/extensions.ts` gives all five targets the same schema). A key that a canonical field owns for that target is an error.
2. **Native components** with no canonical entity (output styles, monitors, code modules, Codex apps, VS Code automations, ...): a verbatim tree under `native/<format-id>/` mirroring the native package layout, plus `native/<format-id>/manifest.json` holding the native manifest keys that the reader did not project. Format ids, not target ids, because one format feeds several targets (Agent Plugins namespace `com.github.copilot` serves Copilot CLI and VS Code). Each Agent Plugins namespace is its own format id (`ap/com.github.copilot`, `ap/com.openai`, `ap/dev.kiro`, unknown ones kept as-is). The target registry lists the format ids each target consumes.

### 5.2 What stays raw, per tool

| Tool | Entity extras (`targets.<t>`) | Native components (`native/<format-id>/`) |
|---|---|---|
| Claude | LSP: `transport`, `settings` (didChangeConfiguration), `workspaceFolder`, `startupTimeout`, `shutdownTimeout`, `requestTimeout`, `restartOnCrash`, `maxRestarts`, `diagnostics`. Theme: `base` variants `*-daltonized`, `*-ansi`, non-canonical tokens (`inverseText`, `subtle`, `suggestion`, `permission`, `remember`, `merged`, `promptBorder`, `planMode`, `autoAccept`, `bashBorder`, `ide`, `fastMode`, `effortUltra`, `diff*Dimmed`, `diff*Word`, `userMessageBackgroundHover`, `bashMessageBackgroundColor`, `memoryBackgroundColor`, `selectionBg`, `rate_limit_*`, `briefLabel*`, shimmer and subagent colors), original color spellings (`rgb()`, `ansi:<name>`, `#rgb`). Config: content substitution (C8). | `output-styles/`, `monitors/monitors.json` / `experimental.monitors`, `workflows/`, `evals/`, `bin/`, `channels`, plugin `settings` (`agent`, `subagentStatusLine`), Mods `modules` and `types`, `dependencies`, `defaultEnabled`, `package.json` + lockfile. |
| Codex | Providers: `env_key_instructions`, `query_params`, `env_http_headers`, retry/timeout fields, `requires_openai_auth`, `supports_*`, `auth.*` (command execution), `aws.*`, `experimental_bearer_token` (refused on read: a literal secret). | `.app.json` apps, `onboardingSkill`, `interface` (packaging facet), `extensions.com.openai` overlay. |
| Copilot CLI | LSP: `cwd`, `rootUri`, `bash`, `powershell`. | CLI extensions (`extensions/`, legacy manifest `extensions`), canvas extensions, `ap/com.github.copilot/*` beyond `lsp.json`. |
| VS Code | — | `automations/*.automation.md` and `ap/com.github.copilot.automations`, tool sets `.jsonc`. |
| Cursor | Config: JSON Schema keywords beyond 2.3.1 (`const`, nested `properties`, `items` beyond strings, `pattern`, length limits, `integer`). | Canvases, `logo` (packaging). |
| Gemini | Theme: tokens outside 2.2.2 (`text.response`, `ui.symbol`, `ui.gradient`, `ui.active`, `ui.focus`, `border.focused`), legacy flat keys, CSS color names. Config: native `name` spelling. | `policies/`, `excludeTools` (permissions facet), `plan.directory`, `contextFileName` (instructions facet), `migratedTo`. |
| OpenCode | LSP: `disabled`, `replaces` (C11). Theme: `defs`, per-color `{dark, light}`, references, tokens outside 2.2.2 (`secondary`, `info`, `backgroundPanel`, `backgroundElement`, `borderActive`, `borderSubtle`, `diffHunkHeader`, `diffHighlight*`, `diffContextBg`, `diff*LineNumber*`, `markdownText`, `markdownLinkText`, `markdownEmph`, `markdownStrong`, `markdownListEnumeration`, `markdownImage*`). Providers: `whitelist`, `blacklist`, `enterpriseUrl`, `setCacheKey`, timeouts, SDK `options`, model `family`, `release_date`, `attachment`, `temperature`, `tool_call`, `experimental`, `interleaved`, `status`, `variants`, `cost.context_over_200k`, output modalities. | `plugins/`, `tools/`, `package.json` `exports`/`engines`, formatters, workspace adapters. |
| Pi | Theme: `vars`, `export.*`, tokens outside 2.2.2 (`borderAccent`, `borderMuted`, `dim`, `thinkingText`, scrollbar, `selectedBg`, `customMessage*`, `tool*Bg`, `toolTitle`, `toolOutput`, `searchMatch*`, `mdLinkUrl`, `mdCodeBlockBorder`, `mdQuoteBorder`, `thinking*`, `bashMode`). Providers: `oauth`, `authHeader`, `modelOverrides`, `compat`, `thinkingLevelMap`, `samplingParams`, cost `tiers`, `apiKey` command/literal forms (C22). | `extensions/` (code), `package.json` `pi.video`/`pi.image`. |
| Amp | — | `.amp/plugins/` (code), toolboxes. |
| Cline / Roo | — | SDK plugins; `.roo/tools/`. |
| Goose / Kiro | — | Recipes; `dev.kiro/`, specs, workflows, steering. |
| Lume | — | `extension.json` + entrypoint. |
| MCPB | Config: original `required` (C4). | `_meta`, `tools[]`, `tools_generated` (MCP facet). |
| Windsurf/Devin | — | — (nothing in this facet is packageable) |

### 5.3 Code modules

All code modules (Claude Mods and workflows, OpenCode plugins and tools, Pi extensions, Amp plugins, Copilot CLI extensions, Roo tools, Cline plugins, Lume extensions) are preserved byte-for-byte and emitted only to a target that consumes their format. Preserved is not activated: the installer writes them only when the consumer's `capabilities.yml` entry allows native code (`native: { code: allow }`), and otherwise emits `acf.native.code-not-activated`. Lock hashes (SPEC §19) cover the `native/` tree, so an update to code is visible. No reader projects a code module into canonical tools, commands or providers; the portable equivalent of a code tool is an MCP server.

### 5.4 Round-trip contract

1. **Unchanged same-format package**: copy the preserved native snapshot byte-for-byte (advisor rule 2). This keeps Claude theme color spellings, OpenCode `defs` and `{dark, light}` colors, Gemini legacy theme keys, JSON key order and comments in JSONC.
2. **Translated or modified**: emit the typed projection for canonical entities, merge `targets.<t>` entity extras for the matching target, and copy `native/<format-id>/` for formats the target consumes. Generated and native outputs must not overlap (C26).
3. **Cross-format**: native components of other formats are dropped with one `acf.native.dropped` per item. Entity extras for other targets are ignored silently (they are target-scoped by construction).
4. **Exclusion safety**: `only`/`except`, include/exclude and renames run before emission. A native extra that references an excluded or renamed entity fails (C24). A native manifest key that lists component paths (Claude `outputStyles`, `monitors`) is regenerated from surviving files, never copied blindly.

## 6. Delta vs current ACF SPEC and code

### 6.1 Exists today

- `targets.<target>` extension slots on manifest, frontmatter, hooks, MCP servers and family blocks (SPEC §7), with strict per-family schemas in `packages/core/src/targets/extensions.ts`.
- Placeholder substitution for `${ACF_CAPABILITY_DIR}`, `${ACF_PACKAGE_DIR}`, `${ACF_HOOK_DIR}` (`packages/adapters/src/common/placeholders.ts`, plain `replaceAll`).
- Owned regions in consumer config files for MCP (SPEC §22.5, §22.7), which the OpenCode LSP and provider writers reuse.

### 6.2 Gaps found (current behavior, verified in code and spec)

- `FacetFamily` in `packages/core/src/types/model.ts` has six members; SPEC §3.3 says the facet folders are "exactly" those six. `lsp/`, `themes/`, `providers/` would be non-semantic files today (SPEC §3.4), silently ignored.
- `extensions.ts` gives every target the same schema, so target-specific extras (Claude LSP timeouts, OpenCode theme `defs`) cannot be validated per target.
- `AcfCapability` carries no source format, native snapshot or remainder; SPEC §14.4 forbids reading native artifacts as canonical input at all. Every reader in this facet depends on lifting that.
- No writer emits a plugin manifest; `packages/adapters/src/{claude,codex,cursor,opencode,pi}/index.ts` only call `emitSkills` and `emitStandardAdapter`.
- SPEC §1.4 rules out secret management and §13a.4.1 forbids extra environment expansion in canonical MCP fields; both stay true under 2.3, but §13a.4.1 needs `${config.KEY}` added to its placeholder list.

### 6.3 Changes and additions

| Area | Change |
|---|---|
| SPEC §2, §3.1, §3.3, §8 | Add families `lsp` (`lsp/lsp.yml`) and `theme` (`themes/<name>.yml`); `provider` (`providers/providers.yml`) gated per 2.4. Old readers ignore the new folders, which is acceptable because none of them is referenced by other facets. |
| SPEC §4.2 | Add top-level `config` (2.3.1). Old readers reject the manifest, which is intended (fail closed). |
| SPEC §13a.4.1 | Add `${config.KEY}` with the surface list and list-expansion rule of 2.3.3; extend the same placeholder set to hook `args`/`env` and LSP fields. |
| SPEC §7, `extensions.ts` | Per-target schemas per family; new family slots `lsp`, `theme`, `config`, `provider`. |
| SPEC §14.4, model | Readers for native formats: `AcfCapability.source = { format, snapshotHash, remainder }`; `native/<format-id>/` tree (5.1) is semantic and included in lock hashes (§19). |
| SPEC §14.6, IMPLEMENTATION §11.2 | Register the codes in 2.5. |
| SPEC §15 | Keep the `tools/` reservation; record that code modules are native-only (5.3). |
| SPEC §22.1 registry, `registry.ts` | Per-family support plus per-field support for these families (the tables in section 3 are the source); `formats` consumed by each target; built-in names (LSP servers, themes) for collision checks. |
| `capabilities.yml` (installer) | Per-entry `config` values (non-sensitive only), `providers: allow`, `native: { code: allow }`. Installer prompts for options on targets marked `I`. |
| Adapters | New emitters: Claude `.lsp.json`, `themes/`, `userConfig`; OpenCode `lsp` and `provider` owned regions, `themes/`; Pi `themes/`, `models.json` owned region; Codex `model_providers` owned region; `${config.KEY}` substitution in `placeholders.ts` with per-target spelling. |
| Targets not yet in the registry | Copilot CLI, Gemini and MCPB would carry most of the N cells for LSP, themes and config; adding them is out of scope here but changes the cost/benefit of this facet. |

## 7. Open questions and unverified claims

1. **Providers in core**: the union rule admits them, but no tool lets a package declare one. Is a gated core family better than leaving providers native-only? (Product decision.)
2. **Gemini option delivery**: whether settings reach hooks as env vars, whether `required` exists implicitly, and whether `${VAR:-default}` works in MCP config are unverified.
3. **OpenCode LSP**: are `extensions` entries written with the leading dot; do two servers on one extension both run; what replaces a built-in when a package entry shares its name.
4. **Copilot LSP**: does `${PLUGIN_ROOT}` expand in `command`/`args`/`env` (documented only for `cwd`); what wins on name collisions across plugins and the user config.
5. **Cursor variables**: placeholder syntax `${KEY}` versus env expansion, masking of secret-like values, precedence.
6. **Theme tokens**: Gemini `text.accent` versus `accent`; Gemini `ui.comment` as code comment; OpenCode `markdownListItem` as bullet; missing-token fallback in Gemini and OpenCode; whether Pi truly requires every token; whether Claude and Pi namespace package theme names.
7. **Theme name collisions** with host built-ins: the built-in lists per host are not inventoried.
8. **Claude `requestTimeout`** needs v2.1.288 (after the inventory cutoff) and `options` needs v2.1.271; writers need a minimum host version policy or must keep them native.
9. **Copilot `providers.json`** and the Goose provider schema are unknown; both may later join 2.4.
10. **OpenCode `npm` mapping** for `api` and `options.headers` are inferred from the AI SDK, not from OpenCode docs.
11. **Statusline**: if Claude and Copilot ever publish a shared stdin payload, C20 could move to core; today it cannot.
12. **Code-module shim**: a subprocess bridge (one tool contract, per-host wrapper) could make simple code tools portable, but SPEC §15 says tools are MCP. Not proposed.
13. **Byte-for-byte snapshots** of JSONC files are assumed; whether readers must also preserve file modes and symlinks is shared with the packaging facet.

## Assessment for the union-without-sacrifice rule

The core is small: LSP has 6 fields, themes have 3 fields plus 30 tokens and 3 color forms, config has 10 fields, a 5-value type enum and one placeholder, and providers (gated) have 12 fields. Everything else in this facet is native-only.

Four things strain the rule. (1) Providers qualify for the core by overlap, but they are consumer configuration everywhere, so the union is only usable behind a consumer opt-in. (2) Most targets have no option facility, so config relies on installer resolution, and sensitive values must be refused where a target cannot expand environment variables. (3) Theme vocabularies overlap only partly (Claude carries 9 of the 30 tokens; Claude and Pi have no background token), and the same spellings carry opposite meanings for diff colors. (4) Code modules, the largest native surface (Pi's whole package model, OpenCode plugins, Claude Mods), cannot be unioned at all and cross a trust boundary.
