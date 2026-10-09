#!/usr/bin/env bash
# Helpers for the task 7.3 dogfood run (research/plugin-interop/dogfood-7.3.md): run the
# worktree's built caplet CLI and the local `claude` against throwaway HOME and project
# directories under a fresh /tmp root, and record every command's argv, exit code and output.
#
# Safety contract (same as claude-spike.sh): every caplet and claude invocation goes through
# `run_isolated`, which refuses to run unless HOME is inside a fresh mktemp root under /tmp and
# outside the real home, and passes a minimal environment (env -i) with CLAUDE_CONFIG_DIR under
# that HOME. `dog_init` hashes the real ~/.claude/plugins tree, ~/.claude/settings.json and the
# mtime of ~/.claude.json; `real_state_check` recomputes them and exits 98 on any change.
# No credentials are copied and no model session is started.
#
# Usage: source this file, call dog_init, then `fresh <phase>` and `cap`/`cc` steps.

REPO=${REPO:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}
CAPLET_JS=$REPO/apps/caplet/dist/bin.js
REAL_HOME=$HOME

# real_state: digest of the real Claude state this run must never touch.
real_state() {
  {
    if [ -d "$REAL_HOME/.claude/plugins" ]; then
      (cd "$REAL_HOME/.claude/plugins" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
    fi
    sha256sum "$REAL_HOME/.claude/settings.json" 2>/dev/null
    stat -c '%Y %n' "$REAL_HOME/.claude.json" 2>/dev/null
    [ -d "$REAL_HOME/.codex" ] && find "$REAL_HOME/.codex" -maxdepth 1 -type f -printf '%T@ %p\n' | sort
  } | sha256sum | cut -d' ' -f1
}

dog_init() {
  ROOT=$(mktemp -d /tmp/caplet-dogfood.XXXXXX)
  BIN=$ROOT/bin
  mkdir -p "$BIN" "$ROOT/log"
  ln -s "$(readlink -f "$(command -v claude)")" "$BIN/claude"
  ln -s "$(readlink -f "$(command -v node)")" "$BIN/node"
  REAL_STATE_BEFORE=$(real_state)
  echo "$REAL_STATE_BEFORE" >"$ROOT/real-state.before"
}

real_state_check() {
  local now
  now=$(real_state)
  if [ "$now" != "$REAL_STATE_BEFORE" ]; then
    echo "REAL CLAUDE/CODEX STATE CHANGED: stopping" >&2
    exit 98
  fi
  echo "real state unchanged ($now)"
}

guard() {
  case "$ROOT" in /tmp/caplet-dogfood.*) ;; *) echo "refusing: ROOT=$ROOT" >&2; exit 99 ;; esac
  case "$H" in "$ROOT"/*) ;; *) echo "refusing: HOME=$H not under $ROOT" >&2; exit 99 ;; esac
  case "$H" in "$REAL_HOME" | "$REAL_HOME"/*) echo "refusing: HOME inside real home" >&2; exit 99 ;; esac
}

# fresh <phase>: new empty HOME and project directory.
fresh() {
  PHASE=$1
  H=$ROOT/$PHASE/home
  P=$ROOT/$PHASE/project
  mkdir -p "$H/.claude" "$P" "$ROOT/log/$PHASE"
  guard
}

# run_isolated <step> <program> <args...>: runs in $P (or $CWD) with a minimal environment and
# writes $ROOT/log/$PHASE/<step>.txt (argv, exit code, merged output with temp paths replaced).
run_isolated() {
  local step=$1; shift
  guard
  local cwd=${CWD:-$P} out=$ROOT/log/$PHASE/$step.txt ec
  local raw
  # shellcheck disable=SC2086 # EXTRA_ENV is a deliberate word-split list of NAME=value pairs
  raw=$(cd "$cwd" && env -i HOME="$H" CLAUDE_CONFIG_DIR="$H/.claude" PATH="$BIN:/usr/bin:/bin" \
    XDG_CONFIG_HOME="$H/.config" XDG_CACHE_HOME="$H/.cache" XDG_DATA_HOME="$H/.local/share" \
    XDG_STATE_HOME="$H/.local/state" DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 TERM=dumb NO_COLOR=1 GIT_TERMINAL_PROMPT=0 \
    ${EXTRA_ENV:-} timeout 300 "$@" 2>&1 </dev/null)
  ec=$?
  {
    echo "\$ (cwd ${cwd/#$ROOT/<ROOT>}) ${*/#$CAPLET_JS/caplet}"
    echo "exit $ec"
    printf '%s\n' "$raw" | redact
  } >"$out"
  echo "[$PHASE/$step] exit $ec"
  return 0
}

# redact: replaces temp roots with placeholders and masks anything token-shaped.
redact() {
  sed -E -e "s#$H#<HOME>#g" -e "s#$P#<PROJECT>#g" -e "s#$ROOT#<ROOT>#g" \
    -e 's#(sk-ant-|ghp_|gho_|github_pat_|xox[bp]-)[A-Za-z0-9_-]+#<REDACTED>#g'
}

cap() { local step=$1; shift; run_isolated "$step" node "$CAPLET_JS" "$@"; }
cc() { local step=$1; shift; run_isolated "$step" claude "$@"; }

# show <phase>/<step>: print a recorded step.
show() { cat "$ROOT/log/$1.txt"; }
