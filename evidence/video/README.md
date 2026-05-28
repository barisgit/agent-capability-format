# Video evidence

Files in this directory:

- `acf-reference-implementation.cast` — asciinema source (replay with `asciinema play <file>`).
- `acf-reference-implementation.gif` — animated GIF rendered with `agg`.
- `acf-reference-implementation.mp4` — H.264 video rendered from the GIF via `ffmpeg`.

Regeneration:
```
asciinema rec evidence/video/acf-reference-implementation.cast --overwrite \
    --title 'ACF reference implementation walkthrough' \
    --command /tmp/acf-recording-script.sh
agg --theme github-dark --font-size 14 --idle-time-limit 2 \
    evidence/video/acf-reference-implementation.cast \
    evidence/video/acf-reference-implementation.gif
ffmpeg -y -i evidence/video/acf-reference-implementation.gif \
    -movflags +faststart -pix_fmt yuv420p \
    -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' \
    evidence/video/acf-reference-implementation.mp4
```

The recording walks through:

1. `git checkout feature/reference-implementation`
2. `bun install` (clean install on a fresh worktree)
3. `bun run ci` showing 24/24 turbo tasks green
4. A `caplet apply` round-trip against a sample `./.agents/` scope showing:
   - `.acf-managed.json` sidecar written
   - JSON-pointer ownership preserving user keys in shared files
   - Second `caplet apply` producing no diff (idempotence)
   - `caplet remove <name>` cleaning only ACF-owned regions
5. `charter_status` showing 21/21 VAL pass.

Large raw screen recordings (`*.mov`) remain gitignored; the small
rendered artifacts above are committed so a fresh clone can replay them
immediately.
