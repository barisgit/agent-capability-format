# @caplet/cli

`caplet` installs [Agent Capability Format](https://github.com/barisgit/agent-capability-format)
(ACF) capabilities and syncs them into Claude Code, Codex, Cursor, OpenCode, and Pi.

## Install

Requires Node.js 20 or later and `git` for remote sources.

```bash
npm install --global @caplet/cli
caplet --version
```

Or run it once without installing: `npx @caplet/cli --help`.

## Usage

```bash
caplet init                                   # create .agents/capabilities.yml
caplet add github:owner/repo --pin main       # add exactly one source, resolve, and apply
caplet apply --dry-run                        # preview emitted file changes
caplet apply                                  # write native artifacts for each target
caplet                                        # status summary
caplet check --frozen --strict                # CI: fail on stale or lossy output
```

`caplet --help` lists every command; `caplet <command> --help` shows its flags.

Every command supports `--json`. `init` reports the manifest path and whether
it was created; `completion` returns the shell script inside the JSON envelope.

### Validation and CI

`check` exits 0 with no errors, 1 for stale outputs, 2 for errors (including
missing lock entries), or 3 for stale locks with `--frozen`. Preserved edited
artifacts needing manual cleanup keep exit 0, with a warning rather than a clean result.

Native manifests reject unknown top-level keys and invalid SemVer 2.0.0 versions.
Unknown `only`/`except` target ids in `acf.yml` or `capabilities.yml` are errors,
with did-you-mean hints for typos; non-core Markdown frontmatter stays permissive.

### Claude plugins

Claude defaults to plugins for skills, MCP servers, and Claude-native content.
ACF capabilities with agents, commands, hooks, or instructions stay loose as a whole.
Set `targets.claude.carrier: loose` in `caplet.yml` to use loose files instead.

Deselecting a capability or `caplet remove`
uninstalls it and, like `claude plugin uninstall`, deletes the data and options Claude saved for
it. Still-selected identities come from the selection even if ownership records are lost.
When a still-selected capability no longer needs its plugin but Claude would delete saved
options, caplet keeps the plugin and warns (`acf.claude.uninstall-held`). Claude keeps loading it
until you run `claude plugin uninstall <id> --scope <scope> --keep-data`, so a capability that
moved to loose files loads twice meanwhile. A capability whose only Claude content was
left out as invalid, or which a refusal blocks on Claude, keeps its plugin exactly as installed:
caplet neither installs a missing host copy nor updates a differing version.

### Supported content

An imported skill with a host-native value that host rejects (for example `effort: extreme`) is
left out for every target with the warning `acf.source.component-invalid`.

Skills and MCP servers are the supported path in 0.1.x. In 0.1.0, ACF hooks
(including `targets.<target>.hooks` entries) are refused on every target with
`acf.support.refused`, a blocked outcome, and recovery. Apply leaves that capability's
existing output unchanged on the target and exits non-zero; `show` reports `no`
support there. Exclude the hook or target to install the rest. Caplet never downgrades
restricting effects to `observe`. Foreign Claude-plugin hooks stay unchanged inside
Claude plugins. Native writers remain in `claude-loose-hooks-repair` and the Codex
hooks backlog item.

### Sources and safe mutation

Local `path:` sources can name a capability, a collection's parent, or its
`acf/` directory directly. Collection selectors are relative to `acf/`.

`add` preflights the full plan and restores the prior manifest, lock and snapshots
on failure. Native output and host operations are not rolled back across roots.

Unowned files and capability directories are never replaced or deleted. Identical
content may be adopted; otherwise `acf.apply.unowned` names the path to move or
delete. Restore a lost sidecar or lock from backup to recover its ownership.

`apply --offline` never fetches. A missing or unusable locked snapshot fails without
removing its output or ownership; run `apply` online to restore a missing snapshot.

## License

Apache-2.0
