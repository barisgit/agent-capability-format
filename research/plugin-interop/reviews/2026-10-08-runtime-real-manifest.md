# Runtime check with the user's real capabilities.yml (branch 9474c12)

**Result: DONE — runtime inspection completed; migration failed.**

Used temporary HOME `/tmp/caplet-runtime-wiGKg1/home`, isolated Claude configuration, and authorized Git/gh credentials. All four private capabilities resolved; none skipped. No repository edits.

### Commands and outcomes

Prefixes:
- **Main:** `bun /home/blaz/code/agent-capability-format/apps/caplet/src/bin.ts` (`a5699cf`)
- **Branch:** `bun /home/blaz/code/agent-capability-format/.worktrees/plugin-interop/apps/caplet/src/bin.ts` (`9474c12`)

| Command | Exit | Observed result |
|---|---:|---|
| Main `update --scope user --no-apply --yes` | 0 | Resolved four capabilities |
| Main `apply --scope user --yes` | 0 | 1106 managed writes |
| Branch `apply --scope user --dry-run` | 2 | Two validation errors; no persistent changes |
| Branch `apply --scope user --yes` | 2 | Same errors; no persistent changes |
| `claude plugin list --json` | 0 | `[]` |
| `claude mcp list` | 0 | No MCP servers configured |
| Branch `status --scope user` | 2 | Four plugins not installed; 1104 changes pending |
| Branch second `apply --scope user --yes` | 2 | Same errors; successful no-op **not established** |
| Branch `remove design engineering-workflows knowledge-ops paxia --scope user --yes` | 0 | 1106 managed files cleaned |

The manifest contains one source, `github:barisgit/capabilities`. Because `remove` accepts capability names, its four selected capabilities were removed together.

### Blocking defect

These existing source files declare top-level `allowed-tools`:
- `knowledge-ops/skills/superset-integrations/SKILL.md`
- `knowledge-ops/skills/superset-plugins/SKILL.md`

Branch diagnostic: `acf.skill.native-key-not-core`, requiring target-specific native declarations. Main accepted the same inputs. They were left unchanged.

Another warning: Claude drops authors after the first from `engineering-workflows`.

Migration never reached native plugin installation. Migrated plugin behavior, MCP integration, successful apply idempotency, and native plugin removal remain unverified.

### Sandbox files

- Main update created **1146 files**, including source cache, unpacked capabilities, and lock.
- Main apply created **1108 files**: 1106 managed outputs and two management sidecars.
- Branch dry-run/apply/status created or changed no persistent files.
- Claude plugin listing created isolated `.claude/.claude.json` and its backup.
- Removal deleted **1631 files**, including unpacked capabilities and canonical/legacy outputs; updated manifest, lock, and both sidecars.
- Final manifest and lock are empty. No Claude plugin tree was created. Sandbox retained.

### Real-profile verification

Before and after SHA-256 values matched exactly:

```text
/home/blaz/.claude/.acf-managed.json
43c691505c5644d76c6ced971e50d3435413cc426530b09cc4bd07b15f447e51

/home/blaz/.agents/capabilities.lock
7a2f45306448599a5e5f2e58bf8889c71e41e1ceb41ea1b7d69f34d0eca70091
```

Before/after `ls -la /home/blaz/.claude/plugins` matched byte-for-byte. Worktree status also matched. All three `cmp` checks exited 0. These verify the requested sentinels, not every file throughout real HOME; isolation used environment redirects rather than a filesystem write sandbox.

### Evidence

Complete report, every command/exit/trimmed output, and exact file inventories:
`/var/tmp/caplet-runtime-wiGKg1/report.md`

Raw logs, per-command deltas, before/after inventories, environment, hashes, and plugin listings:
`/var/tmp/caplet-runtime-wiGKg1/evidence/`

**Next:** implementation/source owner must resolve compatibility with the two existing `allowed-tools` declarations, then rerun the isolated migration. The branch does not currently pass this real-manifest workflow.
