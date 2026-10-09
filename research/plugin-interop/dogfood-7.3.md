# Dogfood run for task 7.3 (plugin-interop-foundation)

Run on 2026-10-09 (UTC) to record how caplet behaves with real public sources: install one public Claude plugin and one public Agent Plugins package for Claude at user and project scope and for Codex (loose), migrate a loose Claude install, and check status, update and remove. This file records results only; no code was changed.

## Environment

| Item | Value |
|---|---|
| caplet | `@caplet/cli` 0.1.0 built with `bun run build` from branch `pi-dogfood` at `26d9197` (= `plugin-interop-foundation` 26d9197), run as `node apps/caplet/dist/bin.js` |
| Claude Code | 2.1.97 (`~/.local/bin/claude`) |
| Codex | not installed: Codex results are from inspecting the files caplet wrote; whether Codex loads them is UNKNOWN |
| Node / Bun / git | v26.8.1 / 1.4.2 / `/usr/bin/git` |
| Harness | `research/plugin-interop/tools/caplet-dogfood.sh` (scenarios) and `caplet-dogfood-lib.sh` (isolation, logging) |

Reproduce with `bun run build && research/plugin-interop/tools/caplet-dogfood.sh [phase...]`. Logs land in `$ROOT/log/<phase>/<step>.txt` (argv, exit code, output) and snapshots in `$ROOT/snaps/`. Output below is trimmed; `<ROOT>`, `<HOME>` and `<PROJECT>` stand for the throwaway root, HOME and project directory, `acf-project-<h>` for the per-project marketplace hash (it changes with the temp path), and the harness masks token-shaped strings (none appeared).

### Isolation

Every `caplet` and `claude` call runs under `env -i` with `HOME` and `CLAUDE_CONFIG_DIR` inside a fresh `/tmp/caplet-dogfood.*` root, a `PATH` of a private bin directory (symlinks to the real `claude` and `node`) plus `/usr/bin:/bin`, and `XDG_*` under that HOME, with the same guard as `claude-spike.sh` (refuses a HOME outside the root or inside the real home). Before the run and after every phase the harness hashes the real `~/.claude/plugins` tree, `~/.claude/settings.json`, the mtime of `~/.claude.json` and the top-level files of `~/.codex`, and stops with exit 98 on any change. Result: unchanged after every phase (`feb5df49…988c0`). No credentials were copied and no model session was started.

## Sources

| Role | Source | Commit | Contents |
|---|---|---|---|
| Public Claude plugin | `github:anthropics/claude-plugins-official`, `--path plugins/example-plugin` | `315c4e48967d9541c29c3c656441dded353ca7aa` | `.claude-plugin/plugin.json` without `version`; skills `example-command` (`argument-hint`, `allowed-tools`, `$ARGUMENTS` in the body) and `example-skill` (unclassified `version` key); command `example-command`; `.mcp.json` with HTTP server `example-server` (`https://mcp.example.com/api`, unreachable) |
| Public Claude plugin (migration, update) | same repository, `--path plugins/frontend-design` | `315c4e48…` and the older `d029127f7d29bdb8fd8902ac34dd7d5c8ba92b6e` (before the 2026-09-01 SKILL.md change) | one skill, no version |
| Public Agent Plugins 1.0 package | `github:mem0ai/mem0`, `--path integrations/mem0-agent-plugin` | `b7ad69afda6b6ed030347c66d48a13e4de9dec08` | root `plugin.json` (`$schema` 1.0.0, version 0.3.3, author object), six skills (`forget`, `pause`, `remember`, `resume`, `search`, `status`), `mcp.json` with stdio server `mem0` (`python3 ${PLUGIN_ROOT}/core/mcp_server.py`, no `cwd`), `core/*.py` |

Public Agent Plugins packages exist: a grep.app search for the 1.0 `$schema` URL found `mem0ai/mem0`, `koala73/worldmonitor` (two remote MCP servers) and the `sickn33/agentic-awesome-skills` bundles (skills only). mem0 was chosen because its stdio server exercises the D22 refusal.

## Results

| Scenario | Result |
|---|---|
| (a) Claude plugin for Claude, project scope | Pass |
| (a) Claude plugin for Claude, user scope | Pass |
| (b) Agent Plugins package for Claude, project scope | Pass: stdio server refused as designed (D22), exit 2; after `exclude: {mcp: [mem0]}` the six skills install as a plugin |
| (b) Agent Plugins package for Claude, user scope | Pass, same as project |
| (c) Both for Codex (loose), project and user scope | Pass for files; Codex loading UNKNOWN (Codex not installed) |
| (d) Migration loose to plugin, project and user scope | Pass: rename notice once, loose files retired after registration |
| (d) Rollback to `carrier: loose` | Pass: plugin uninstalled, project marketplace removed, loose files re-emitted |
| (e) `status`, `list`, `show` | Pass with noise (see Observations 1 and Defect 8) |
| (e) `update` and re-apply unchanged | Pass: no file writes, no install/update command |
| (e) Real version update (`d029127` to `315c4e4`) | Pass on second run: plugin updated in Claude; the first run fails (Defect 4) |
| (e) Native disable respected (D15) | Pass |
| (e) `remove` | Fail: Claude plugin stays installed and enabled until the next `apply` (Defect 1) |
| Same-format round trip | Pass: every file byte-identical to the source except `plugin.json`, which gains `"version"` |
| `claude plugin validate` on generated plugins | Pass (example-plugin, mem0) |
| D25 global git ignore | Confirmed: in a git checkout Claude wrote `**/.claude/settings.local.json` to `<HOME>/.config/git/ignore` |
| Skill invocation and MCP tool calls through a model | UNKNOWN (needs an authenticated session) |

### (a) Claude plugin for Claude

```text
$ caplet init
$ caplet add github:anthropics/claude-plugins-official --path plugins/example-plugin --pin 315c4e48967d9541c29c3c656441dded353ca7aa -s project -t claude
exit 0
Plan: 9 changes
project  .
  claude  .claude
    + .acf/marketplace/.claude-plugin/marketplace.json
    + .acf/marketplace/plugins/example-plugin/          7 files  example-plugin
    + managed notices
ok Applied 9 files (9 writes, 0 deletes)
Claude plugins project scope · acf-project-<h>
  example-plugin  registered  files current
  registered for this checkout only, at Claude local scope (.claude/settings.local.json)

$ claude plugin list --json
[{"id": "example-plugin@acf-project-<h>",
  "version": "0.0.0-unversioned+315c4e48967d9541c29c3c656441dded353ca7aa.acf.85ac8873ffc5",
  "scope": "local", "enabled": true,
  "installPath": "<HOME>/.claude/plugins/cache/acf-project-<h>/example-plugin/0.0.0-unversioned-315c4e48…acf.85ac8873ffc5",
  "projectPath": "<PROJECT>",
  "mcpServers": {"example-server": {"type": "http", "url": "https://mcp.example.com/api"}}}]

$ claude plugin marketplace list --json
[{"name": "acf-project-<h>", "source": "directory", "path": "<PROJECT>/.claude/.acf/marketplace", …}]

$ claude mcp list
plugin:example-plugin:example-server: https://mcp.example.com/api (HTTP) - ✗ Failed to connect

$ claude plugin validate <PROJECT>/.claude/.acf/marketplace/plugins/example-plugin
✔ Validation passed
```

The server's connection failure is expected (`mcp.example.com` serves nothing). `.claude/settings.local.json` holds `extraKnownMarketplaces.acf-project-<h>` (directory source, absolute path) and `enabledPlugins`. The generated `plugin.json` is the source manifest plus `"version": "0.0.0-unversioned+<commit>.acf.<digest>"` appended; `diff -r` against the source shows no other difference, and the command `commands/example-command.md` travels unchanged in the plugin.

User scope (`-s user`) gives the same result with marketplace `acf-user` at `<HOME>/.claude/.acf/marketplace`, Claude scope `user`, and the server listed by `claude mcp list`.

### (b) Agent Plugins package for Claude

```text
$ caplet add github:mem0ai/mem0 --path integrations/mem0-agent-plugin --pin b7ad69afda6b6ed030347c66d48a13e4de9dec08 -s project -t claude
exit 2
fail MCP server mem0 is blocked for claude by mcp.cwd: claude cannot honor mcp.cwd: Claude ignores a server cwd key and starts plugin stdio servers in the directory claude was launched from, so the server would run elsewhere than declared. Recovery: exclude: { mcp: [mem0] } or except: [claude]
    code  acf.support.refused
1 problem (1 error)
warn Nothing else to apply

$ claude plugin list --json        -> []
$ claude plugin marketplace list --json   -> []
```

The whole capability is blocked for Claude, skills included, so a user must act before anything installs. After appending `exclude: {mcp: [mem0]}` to the entry:

```text
$ caplet apply -s project -t claude
exit 0
Compatibility
  mem0 / claude - translated: the first entry becomes author; legacy "Name <email>" strings are decoded (package.authors)
  claude - native: 6 skills
Plan: 14 changes
    + .acf/marketplace/plugins/mem0/                    12 files  mem0
Executable changes
  claude
    - MCP server mem0: python3 ${ACF_CAPABILITY_DIR}/core/mcp_server.py  mem0
Claude plugins project scope · acf-project-<h>
  mem0  registered  files current

$ claude plugin list --json
[{"id": "mem0@acf-project-<h>", "version": "0.3.3+acf.92c375f2fdd4", "scope": "local", "enabled": true, …}]
$ claude mcp list
No MCP servers configured.
$ claude plugin validate <PROJECT>/.claude/.acf/marketplace/plugins/mem0
✔ Validation passed
```

The generated plugin holds `.claude-plugin/plugin.json` (name, `0.3.3+acf.<d>`, description, author object, homepage, repository, license, keywords), the six skills and `core/*.py`; the Agent Plugins `plugin.json` and `mcp.json` are not copied. User scope behaves the same with `acf-user`.

### (c) Codex (loose)

`add -s project -t codex` for both sources, then `add -s user -t codex` for both. Each writes the skills to the shared `.agents/skills/` root (`<HOME>/.agents/skills/` for user scope) and the servers to `.codex/config.toml` (`<HOME>/.codex/config.toml`):

```toml
# acf:begin mcp_servers.example-server
[mcp_servers.example-server]
url = "https://mcp.example.com/api"
# acf:end mcp_servers.example-server

# acf:begin mcp_servers.mem0
[mcp_servers.mem0]
command = "python3"
args = ["<PROJECT>/.agents/capabilities/mem0/core/mcp_server.py"]
cwd = "<PROJECT>/.agents/capabilities/mem0"
# acf:end mcp_servers.mem0
```

Reported for the Claude plugin on Codex (all `lossy`): command `example-command` omitted (`acf.support.component-omitted`), `argument-hint` not shown (`acf.support.degraded`), `allowed-tools` dropped as a granting key and the skill's `version` key dropped as unclassified (`acf.extras.dropped`). The mem0 server is listed under Executable changes. `$ARGUMENTS` in the `example-command` body reaches Codex unchanged with no diagnostic. A re-apply with `-t codex` reports `Everything up to date`.

### (d) Migration from loose Claude output

```text
# .agents/caplet.yml: targets: {claude: {carrier: loose}}
$ caplet add github:anthropics/claude-plugins-official --path plugins/frontend-design --pin 315c4e48… -s project -t claude
    + skills/frontend-design/LICENSE.txt, SKILL.md, managed notices
$ claude plugin list --json        -> []

# override removed
$ caplet apply -n -s project -t claude
    + .acf/marketplace/.claude-plugin/marketplace.json
    + .acf/marketplace/plugins/frontend-design/         5 files
    - skills/frontend-design/ACF-MANAGED.md, LICENSE.txt, SKILL.md
  would run
    claude plugin marketplace add <PROJECT>/.claude/.acf/marketplace --scope local
    claude plugin install frontend-design@acf-project-<h> --scope local
Claude skills are now invoked through their plugins
  /frontend-design -> /frontend-design:frontend-design

$ caplet apply -s project -t claude
ok Applied 10 files (7 writes, 3 deletes)
  frontend-design  registered  files current
Claude skills are now invoked through their plugins
  /frontend-design -> /frontend-design:frontend-design

$ caplet apply -s project -t claude        (again)
ok Everything up to date                    (no notice)
```

After migration `.claude/skills/` is gone, the sidecar records `renameNoticeShown: true`, and Claude lists `frontend-design@acf-project-<h>` at `local` scope. The same sequence at user scope (override in `<HOME>/.agents/caplet.yml`) prints the notice once for `~/.claude` and installs `frontend-design@acf-user`.

Rollback: setting `carrier: loose` again and adding `example-plugin` refuses `example-plugin` for loose Claude (D9: `command example-command` cannot be carried; recovery `targets.claude.carrier: plugin or except: [claude]`; exit 2), deletes the project marketplace and plugin files, re-emits `.claude/skills/frontend-design/`, uninstalls `frontend-design@acf-project-<h>` and removes the project marketplace from Claude; the user-scope install stays.

### (e) Lifecycle

- `caplet status` after the project install shows the Claude block (`registered  files current`) plus 16 `lossy` warnings for codex, cursor, opencode and pi and `warn 13 changes pending`; `caplet check` exits 1 (`Outputs are stale - 13 files pending`). See Observation 1.
- `caplet list`: `example-plugin  0.0.0-unversioned+315c4e48967d9541c29c3c656441dded353ca7aa  skills 2, mcp 1`. `caplet show`: skills, server and `supported yes` for all five targets.
- `caplet update` (pinned, nothing new; no `-t`, so it also wrote 13 files for the other targets, Observation 1) then `caplet apply -s project -t claude`: `ok Everything up to date`; Claude's `lastUpdated` unchanged and no Claude install or update ran.
- `claude plugin disable example-plugin@acf-project-<h> --scope local`, then `caplet apply`: host block shows `disabled by user  files current`, `enabled` stays `false` (D15).
- Real update: install `frontend-design` at `d029127`, edit the entry's `ref` to `315c4e4`, run `caplet update frontend-design -s project -t claude` (fails, Defect 4), then `caplet apply`: two files updated, Claude reports version `0.0.0-unversioned+315c4e4….acf.f42024fdc261` with a new `lastUpdated`, and both version directories remain in Claude's cache. A further `caplet update frontend-design` reports `Everything up to date`.
- `caplet remove example-plugin -s project` / `-s user`: see Defect 1. The following `caplet apply -s <scope> -t claude` deletes `marketplace.json`, uninstalls the plugin and removes the marketplace (`claude plugin list --json` and `marketplace list --json` both `[]`).

## Defects

1. **`caplet remove` leaves the Claude plugin installed and enabled.** Severity: blocks the user journey.
   Repro: phases `a-project` and `a-user` (`caplet add … -t claude`, then `caplet remove example-plugin -s user`).
   Observed: `ok Removed example-plugin (user scope)`; the plugin directory is deleted but `marketplace.json` still lists `./plugins/example-plugin`, the marketplace stays registered, and `claude plugin list --json` still shows `example-plugin@acf-user` with `"enabled": true`; `claude mcp list` still connects `plugin:example-plugin:example-server` from Claude's cache, and Claude then creates `<HOME>/.claude/plugins/cache/acf-user/example-plugin/unknown/`. Only the next `caplet apply` uninstalls the plugin and removes the marketplace.
   Expected (claude-plugin-output, local marketplace scenario): the plugin directory is deleted after uninstall succeeds, and the marketplace is removed when the scope has no desired plugin.
   Suspected cause: `apps/caplet/src/commands/remove.ts` cleans managed files without running the Claude host reconciliation (`apps/caplet/src/internal/claude-host-flow.ts`) that `apply` runs, and deletes the plugin directory before any uninstall.

2. **`caplet remove a b` removes only `a`.** Severity: wrong output.
   Repro: phase `c-codex`, `caplet remove example-plugin mem0 -s project -t codex`.
   Observed: `ok Removed example-plugin (project scope)` with exit 0; `mem0` stays in `capabilities.yml`, `.agents/skills/` and `.codex/config.toml`. Help documents `caplet remove <name>...`.
   Suspected cause: `apps/caplet/src/commands/remove.ts` reads only the first positional name.

3. **A repeated `--target` selects every target.** Severity: wrong output.
   Repro: phase `f-repro`, `caplet apply -n -s project -t codex -t pi` on mem0.
   Observed: exit 2 with refusals for claude and cursor and planned writes for canonical, codex, opencode and pi; `-t codex` alone plans only canonical and codex. Help says `--target` is repeatable. The same happened on `add … -t claude -t codex` in an exploratory run, which wrote `opencode.json` and `.pi/mcp.json`.
   Suspected cause: `targetSelection` in `apps/caplet/src/internal/workflow.ts` reads the flag with `readOptionalString`, which yields no value for the array a repeated flag produces, and falls back to all targets; `remove.ts:41` has the same `typeof … === "string"` check.

4. **After editing an entry's `ref`, the first `apply` or `update` fails.** Severity: blocks the user journey (a second run succeeds).
   Repro: phase `g-ref-edit` (install `frontend-design` at `d029127`, `sed` the `ref` to `315c4e4`, `caplet apply -s project -t codex` twice); also `e-update` with `caplet update frontend-design`.
   Observed: first run exits 2 with `fail Capabilities.yml ref differs from lock for github:anthropics/claude-plugins-official#path=plugins%2Ffrontend-design (acf.lock.drift)` and applies nothing, yet the lock already holds the new `ref`, `resolvedSha` and digests; the second run applies the update.
   Suspected cause: the planning step (`apps/caplet/src/internal/workflow.ts`, `detectLockDrift(anchoredManifest, lock)` around line 239) compares the manifest with a lock from before this run's resolve, while resolve has already written the new lock; ref drift is not among the drift kinds `driftDiagnosticsForMode` (`packages/installer/src/resolve.ts`) treats as reconciled.

5. **The executable change report lists a server that was never installed as removed.** Severity: wrong output (minor).
   Repro: phase `b-project`: the refused add, then `exclude: {mcp: [mem0]}` and `caplet apply`.
   Observed: `Executable changes / claude / - MCP server mem0: python3 ${ACF_CAPABILITY_DIR}/core/mcp_server.py`, although the refusal kept it from ever being written for Claude.
   Suspected cause: the "before" inventory (`executableComponents` over the installed snapshot, `packages/core/src/emit/executables.ts`, called from the caplet workflow) ignores that the capability was refused for that target.

6. **`caplet remove` without `--target` creates sidecars for tools never targeted.** Severity: wrong output (minor).
   Repro: phase `a-user`.
   Observed: after `add … -t claude`, `status`, `apply -t claude` and `remove example-plugin -s user`, `<HOME>/.codex/`, `<HOME>/.cursor/`, `<HOME>/.pi/agent/` and `<HOME>/.config/opencode/` exist, each holding only `.acf-managed.json` with `{"acf": 1, "managed": []}`; none existed after `add`.
   Suspected cause: `remove.ts` iterates every target id when `-t` is absent and writes an empty sidecar per target.

7. **Package-author compatibility line describes a conversion that did not happen.** Severity: cosmetic.
   Observed on mem0 for Claude: `translated: the first entry becomes author; legacy "Name <email>" strings are decoded (package.authors)`, while the source author is already an object and is written unchanged.
   Suspected cause: the registry cell text for `package.authors` on Claude is printed whenever authors are present, not only when a string is decoded.

8. **Smaller output issues.** Severity: cosmetic.
   - `status` shows `would run claude plugin marketplace add … --scope local` for an already-registered marketplace (the add is unconditional by design, but status presents it as pending work).
   - Capitalisation: `Opencode:` in diagnostics, `Capabilities.yml ref differs …`.
   - Dry runs end with a bare `warn 10 files` / `warn 15 files` line.
   - After an uninstall the host block lists the plugin as `not installed` rather than saying it was uninstalled; after an update it says `registered  files current` without mentioning the update.
   - `.codex/config.toml` keeps a leading blank line after the first server region is removed.
   - Plans list `opencode.json` under the `.opencode` root, but the file is written at the project root (`<PROJECT>/opencode.json`).
   - `caplet list` prints the full synthetic version `0.0.0-unversioned+<40-hex commit>` for unversioned Claude plugins.

## Observations

1. `--target` on `add` is a per-run filter, not stored. Later commands without `-t` (`status`, `check`, `update`) consider every default target: after a Claude-only install, `status` reports 16 lossy warnings for other tools and 13 pending changes, `check` exits 1, and `caplet update` wrote `.agents/skills/`, `.codex/`, `.cursor/`, `.opencode/`/`opencode.json` and `.pi/` output. `emit.defaultTargets` in `caplet.yml` is the persistent setting; nothing in `add` output points to it.
2. Codex project output contains machine-specific absolute paths (`args` and `cwd` of mem0 in `.codex/config.toml`), so a committed `.codex/config.toml` differs between checkouts; D25 avoids the same problem for Claude by registering at `local` scope.
3. Public package affected by the D22 refusal: `mem0ai/mem0` `integrations/mem0-agent-plugin` (stdio server with the Agent Plugins default working directory) is refused for Claude until its server is excluded; its skills are blocked with it.
4. Unversioned Claude plugins get `0.0.0-unversioned+<commit>.acf.<digest>`; Claude stores the cache directory with `+` replaced by `-` and keeps old version directories after an update.
5. Body placeholders (`$ARGUMENTS`) travel unchanged to Codex with no diagnostic; D17 lists them as a pending meaning.
6. The canonical `.agents/skills/` copy reformats frontmatter (folded `description`) and drops the blank line after the closing `---`; content is otherwise unchanged.
7. Installing the same capability at user and project scope gives two Claude installs (`@acf-user` at `user`, `@acf-project-<h>` at `local`), both enabled; caplet prints no notice at default verbosity.
