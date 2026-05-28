# Video evidence

The recording at `acf-reference-implementation.mov` (or `.mp4`, depending on
the OS recorder used) walks through:

1. `git checkout feature/reference-implementation`
2. `bun install` (clean install on a fresh worktree)
3. `bun run ci` showing 24/24 turbo tasks green
4. A `caplet apply` round-trip against a sample `./.agents/` scope showing:
   - `.acf-managed.json` sidecar written
   - JSON-pointer ownership preserving user keys in shared files
   - Second `caplet apply` producing no diff (idempotence)
   - `caplet remove <name>` cleaning only ACF-owned regions
5. `charter_status` showing 21/21 VAL pass.

The raw recording file is gitignored (per `.gitignore`'s
`evidence/video/*.{mov,mp4,cast}` rule) so a fresh clone has only this
README until the maintainer re-records or attaches it to the PR.
