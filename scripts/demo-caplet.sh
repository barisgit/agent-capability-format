#!/usr/bin/env bash
# Live demo of caplet exercising real ACF capabilities end-to-end.
# Used by evidence/video/ recording.
set -e

REPO="/Users/blaz/Programming_local/Projects/agent-capability-format/.worktrees/feature-reference-implementation"
DEMO="$(mktemp -d -t caplet-demo-XXXX)"
HOME_FAKE="$DEMO/home"
PROJ="$DEMO/project"
SRC="$DEMO/sources"
CAPLET="bun $REPO/apps/caplet/src/bin.ts"

pause() { sleep "${1:-1}"; }
hdr()   { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; pause 0.6; }

mkdir -p "$HOME_FAKE/.agents" "$PROJ/.agents" "$SRC/code-review"

clear
echo "================================================================"
echo " caplet demo: build a capability, fetch, apply, inspect sidecar,"
echo " demonstrate idempotence + user-key preservation, remove."
echo "================================================================"
pause 1

hdr "1. Build a tiny local ACF capability  ($SRC/code-review)"
cat > "$SRC/code-review/acf.yml" <<'YML'
acf: 1
name: code-review
version: 1.0.0
description: Reusable code review skill, instruction, and MCP server.
YML

mkdir -p "$SRC/code-review/skills/review-pr" \
         "$SRC/code-review/instructions" \
         "$SRC/code-review/agents" \
         "$SRC/code-review/mcp" \
         "$SRC/code-review/hooks"

cat > "$SRC/code-review/skills/review-pr/SKILL.md" <<'MD'
---
name: review-pr
description: Review a pull request line-by-line with focus on regressions.
---
# Review PR
Walk the diff, flag risks, and propose minimal fixes.
MD

cat > "$SRC/code-review/instructions/style.md" <<'MD'
---
name: style
description: Always remind the reviewer to comment on naming + tests.
activation: always
---
Always check naming clarity and test coverage when reviewing.
MD

cat > "$SRC/code-review/agents/reviewer.md" <<'MD'
---
name: reviewer
description: Code reviewer persona.
mode: subagent
---
You are a thorough, terse code reviewer.
MD

cat > "$SRC/code-review/mcp/mcp.yml" <<'YML'
servers:
  - name: code-review-tools
    transport: stdio
    command: node
    args: [server.js]
YML

cat > "$SRC/code-review/hooks/hooks.yml" <<'YML'
pre_tool:
  - name: guard-bash
    effect: observe
    run:
      command: "echo reviewing"
    match:
      operation: "Bash"
YML

find "$SRC/code-review" -type f | sed "s|$SRC/||"
pause 2

hdr "2. Wire it into the project via capabilities.yml"
cat > "$PROJ/.agents/capabilities.yml" <<YML
acf: 1
capabilities:
  - source: path:$SRC/code-review
YML
cat "$PROJ/.agents/capabilities.yml"
pause 2

hdr "3. caplet doctor  (environment check)"
HOME="$HOME_FAKE" $CAPLET doctor --cwd "$PROJ" || true
pause 2

hdr "4. caplet fetch  (resolve path: source -> capability tree + lockfile)"
HOME="$HOME_FAKE" $CAPLET fetch --cwd "$PROJ" --scope project
echo
echo "Capability tree under $PROJ/.agents/capabilities/:"
find "$PROJ/.agents/capabilities" -maxdepth 4 -type f | sed "s|$PROJ/||"
echo
echo "Lockfile head:"
head -20 "$PROJ/.agents/capabilities.lock"
pause 3

hdr "5. Pre-seed user-authored key inside the project .claude/settings.json"
mkdir -p "$PROJ/.claude"
cat > "$PROJ/.claude/settings.json" <<'JSON'
{
  "user_key": "this must survive caplet apply + remove",
  "permissions": { "allow": ["Bash(*)", "Read(*)"] }
}
JSON
cat "$PROJ/.claude/settings.json"
pause 2

hdr "6. caplet apply  (emit FileDiffs, write artifacts + sidecar)"
HOME="$HOME_FAKE" $CAPLET apply --cwd "$PROJ" --scope project --target claude
pause 1
echo
echo "Project install root (./.claude/) now contains:"
find "$PROJ/.claude" -maxdepth 4 -type f 2>/dev/null | sed "s|$PROJ/||"
pause 3

hdr "7. .acf-managed.json sidecar  (every owned region recorded)"
if [ -f "$PROJ/.claude/.acf-managed.json" ]; then
  cat "$PROJ/.claude/.acf-managed.json" | head -40
fi
pause 3

hdr "8. Marker block inside CLAUDE.md  (instruction activation: always)"
if [ -f "$PROJ/.claude/CLAUDE.md" ]; then
  cat "$PROJ/.claude/CLAUDE.md"
fi
pause 3

hdr "9. settings.json after apply  (user_key + permissions PRESERVED)"
if [ -f "$PROJ/.claude/settings.json" ]; then
  cat "$PROJ/.claude/settings.json"
fi
pause 3

hdr "10. caplet diff  (re-emit: idempotent -> no pending diffs)"
HOME="$HOME_FAKE" $CAPLET diff --cwd "$PROJ" --scope project --target claude || true
pause 2

hdr "11. caplet ls  (resolved capabilities per scope)"
HOME="$HOME_FAKE" $CAPLET ls --cwd "$PROJ" --scope project
pause 2

hdr "12. caplet inspect code-review"
HOME="$HOME_FAKE" $CAPLET inspect code-review --cwd "$PROJ" --scope project | head -30
pause 3

hdr "13. caplet remove code-review  (clean only ACF-owned regions)"
HOME="$HOME_FAKE" $CAPLET remove code-review --cwd "$PROJ" --scope project --target claude
pause 1
echo
echo "Project .claude/ tree after remove (user files intact):"
find "$PROJ/.claude" -maxdepth 4 -type f 2>/dev/null | sed "s|$PROJ/||" || true
echo
echo "settings.json after remove  (still has user_key + permissions):"
[ -f "$PROJ/.claude/settings.json" ] && cat "$PROJ/.claude/settings.json"
pause 3

hdr "Demo complete. Cleaning up $DEMO"
rm -rf "$DEMO"
echo "Done."
