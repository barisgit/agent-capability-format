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
caplet add github:owner/repo                  # add a source, resolve, and apply
caplet apply --dry-run                        # preview emitted file changes
caplet apply                                  # write native artifacts for each target
caplet                                        # status summary
caplet check --frozen --strict                # CI: fail on stale or lossy output
```

`caplet --help` lists every command; `caplet <command> --help` shows its flags.

## License

Apache-2.0
