#!/usr/bin/env bash
# Rerun of the 2026-10-08 real-manifest runtime check (research/plugin-interop/reviews/
# 2026-10-08-runtime-real-manifest.md): main's caplet installs the user's real capabilities.yml
# in a throwaway HOME, then the branch's caplet migrates it to Claude plugins through the local
# claude CLI, checks idempotency and removes it. The real profile is only read: its sentinel
# files are hashed before and after, and the run fails if any hash changes.
#
# Usage: real-manifest-rerun.sh <branch-checkout> [main-checkout]
# Private sources resolve with the user's git and gh credentials (GIT_CONFIG_GLOBAL, GH_CONFIG_DIR).
set -u
BRANCH=${1:?branch checkout}
MAIN=${2:-/home/blaz/code/agent-capability-format}
REAL_HOME=$(getent passwd "$(id -un)" | cut -d: -f6)
RUN=$(mktemp -d /var/tmp/caplet-rerun-XXXXXX)
SANDBOX=$RUN/home
EVIDENCE=$RUN/evidence
mkdir -p "$SANDBOX/.agents" "$EVIDENCE" "$RUN/tmp"

sentinels() {
  for file in "$REAL_HOME/.claude/.acf-managed.json" "$REAL_HOME/.agents/capabilities.lock" \
    "$REAL_HOME/.agents/capabilities.yml" "$REAL_HOME/.claude/settings.json" \
    "$REAL_HOME/.claude/plugins/installed_plugins.json" "$REAL_HOME/.claude/plugins/known_marketplaces.json"; do
    if [ -e "$file" ]; then sha256sum "$file"; else echo "absent  $file"; fi
  done
  ls -la "$REAL_HOME/.claude/plugins" | sha256sum | sed 's|-$|ls -la ~/.claude/plugins|'
}
sentinels > "$EVIDENCE/real-before.txt"
cp "$REAL_HOME/.agents/capabilities.yml" "$SANDBOX/.agents/capabilities.yml"

export HOME=$SANDBOX
export CLAUDE_CONFIG_DIR=$SANDBOX/.claude CODEX_HOME=$SANDBOX/.codex PI_CODING_AGENT_DIR=$SANDBOX/.pi/agent
export XDG_CONFIG_HOME=$SANDBOX/.config XDG_CACHE_HOME=$SANDBOX/.cache XDG_DATA_HOME=$SANDBOX/.local/share XDG_STATE_HOME=$SANDBOX/.local/state
export TMPDIR=$RUN/tmp GIT_CONFIG_GLOBAL=$REAL_HOME/.gitconfig GH_CONFIG_DIR=$REAL_HOME/.config/gh
export DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 GIT_TERMINAL_PROMPT=0 NO_COLOR=1
if [ "$HOME" = "$REAL_HOME" ]; then echo "refusing: HOME is the real home" >&2; exit 98; fi
cd "$SANDBOX" || exit 97

step=0
run() {
  local name=$1; shift
  step=$((step + 1))
  local log; log=$(printf '%s/%02d-%s.log' "$EVIDENCE" "$step" "$name")
  "$@" > "$log" 2>&1
  local code=$?
  printf '%02d %-24s exit %s  %s\n' "$step" "$name" "$code" "$(grep -v '^\s*$' "$log" | tail -1 | cut -c1-150)"
}
main_caplet() { bun "$MAIN/apps/caplet/src/bin.ts" "$@"; }
branch_caplet() { bun "$BRANCH/apps/caplet/src/bin.ts" "$@"; }

run main-update main_caplet update --scope user --no-apply --yes
run main-apply main_caplet apply --scope user --yes
run branch-dry-run branch_caplet apply --scope user --dry-run
run branch-apply branch_caplet apply --scope user --yes
run plugin-list claude plugin list --json
run marketplace-list claude plugin marketplace list --json
run mcp-list claude mcp list
run branch-status branch_caplet status --scope user
run branch-apply-again branch_caplet apply --scope user --yes
run branch-status-again branch_caplet status --scope user
names=$(bun -e 'const l=JSON.parse(await Bun.file(process.argv[1]).text()); console.log([...new Set(l.entries.flatMap((e)=>e.capabilityNames??[]))].sort().join(" "))' "$SANDBOX/.agents/capabilities.lock")
echo "capabilities: $names" > "$EVIDENCE/names.txt"
run branch-remove branch_caplet remove $names --scope user --yes
run plugin-list-after claude plugin list --json
run marketplace-list-after claude plugin marketplace list --json

export HOME=$REAL_HOME
sentinels > "$EVIDENCE/real-after.txt"
if cmp -s "$EVIDENCE/real-before.txt" "$EVIDENCE/real-after.txt"; then
  echo "real profile sentinels unchanged"; cat "$EVIDENCE/real-after.txt"
else
  echo "REAL PROFILE CHANGED"; diff "$EVIDENCE/real-before.txt" "$EVIDENCE/real-after.txt"; exit 99
fi
echo "evidence: $EVIDENCE"
