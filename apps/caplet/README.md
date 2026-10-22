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
caplet add github:owner/repo --ref main       # add a source, resolve, and apply
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

Skills and MCP servers are the supported path in 0.1.x. Hooks are experimental: caplet
does not yet write them in each tool's native format, so tools may ignore them.

`caplet --help` lists every command; `caplet <command> --help` shows its flags.

## License

Apache-2.0
