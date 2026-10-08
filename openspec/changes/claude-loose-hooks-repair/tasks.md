## 1. Reproduce and fix

- [ ] 1.1 Add a failing golden showing today's `.claude/settings.json` hook output and a real-host check (`CAPLET_HOST_TESTS=claude`) that Claude does not run it.
- [ ] 1.2 Emit Claude's `{matcher, hooks: [{type: "command", command, timeout}]}` shape with seconds, ownership tracking and removal that keeps user entries; verify with goldens for add, update and removal beside a user hook.
- [ ] 1.3 Map `permission_request` to `PermissionRequest`; verify with a registry test and a golden.
- [ ] 1.4 Refuse hooks whose `block`, `decide` or `block_result` effect a target cannot honor; verify with an adapter test and negative fixture per affected target.

## 2. Documentation and verification

- [ ] 2.1 Update SPEC.md §22.6 and README; run `bun run ci`, `openspec validate claude-loose-hooks-repair --strict` and `git diff --check`; run the real-host check.
