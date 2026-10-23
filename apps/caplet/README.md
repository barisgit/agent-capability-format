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
caplet add github:owner/repo --pin main       # add a source, resolve, and apply
caplet apply --dry-run                        # preview emitted file changes
caplet apply                                  # write native artifacts for each target
caplet                                        # status summary
caplet check --frozen --strict                # CI: fail on stale or lossy output
```

Claude receives each capability as a plugin. Deselecting a capability or `caplet remove`
uninstalls it and, like `claude plugin uninstall`, deletes the data and options Claude saved for
it. When a still-selected capability no longer needs its plugin but Claude would delete saved
options, caplet keeps the plugin and warns (`acf.claude.uninstall-held`). Claude keeps loading it
until you run `claude plugin uninstall <id> --scope <scope> --keep-data`, so a capability that
moved to loose files loads twice meanwhile.

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

`caplet --help` lists every command; `caplet <command> --help` shows its flags.

## License

Apache-2.0
