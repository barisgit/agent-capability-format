Depends on `agent-plugins-output`.

## 1. Packing

- [ ] 1.1 Confirm with the user which repositories qualify at the root (proposal decision) and record the answer in this change.
- [ ] 1.2 Add `caplet pack --agent-plugins --out <dir>`; verify with a golden equal to the generic-profile output of `agent-plugins-output`.
- [ ] 1.3 Add `--root` and the `caplet check` freshness, identity, Agent Skills frontmatter and generic-refusal checks; verify with fixtures for stale, mismatched and ACF-only-skill roots.
- [ ] 1.4 Keep reading such roots as ACF; validate a passing root with the pinned schemas.

## 2. Documentation and verification

- [ ] 2.1 Update SPEC.md and README for the root profile.
- [ ] 2.2 Run `bun run ci`, `openspec validate acf-root-agent-plugins-package --strict` and `git diff --check`.
