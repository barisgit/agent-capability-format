#!/usr/bin/env bash
set -euo pipefail

# Create a repo-local git worktree for the agent-capability-format repo.
# This repo is currently spec-only; once implementers scaffold apps/caplet +
# packages/*, this script will install deps if a lockfile is present.
#
# Usage:
#   ./scripts/worktree-new.sh <type/name>            # create a new branch
#   ./scripts/worktree-new.sh --existing <type/name> # attach to an existing branch
#
# Branch names MUST be typed: <type>/<name> where type is one of
#   feature, fix, chore, docs, refactor, test, perf, ci, build, revert, spike

usage() {
  echo "Usage: $0 [--existing] <type/name>" >&2
  echo "Types: feature, fix, chore, docs, refactor, test, perf, ci, build, revert, spike" >&2
  echo "Examples:" >&2
  echo "  $0 feature/caplet-core" >&2
  echo "  $0 --existing feature/caplet-core" >&2
}

is_valid_branch_type() {
  case "$1" in
    feature|fix|chore|docs|refactor|test|perf|ci|build|revert|spike) return 0 ;;
    *) return 1 ;;
  esac
}

MODE="new"
if [[ "${1:-}" == "--existing" ]]; then
  MODE="existing"
  shift
fi

BRANCH="${1:-}"
if [[ -z "$BRANCH" ]]; then
  usage
  exit 1
fi

TYPE="${BRANCH%%/*}"
if ! is_valid_branch_type "$TYPE"; then
  echo "error: invalid branch type '${TYPE}'" >&2
  usage
  exit 1
fi

case "$BRANCH" in
  */)                 echo "error: branch must not end with '/'" >&2; exit 1 ;;
  *//*)               echo "error: branch must not contain '//'"  >&2; exit 1 ;;
  *..*)               echo "error: branch must not contain '..'"  >&2; exit 1 ;;
  -*)                 echo "error: branch must not start with '-'" >&2; exit 1 ;;
  /*)                 echo "error: branch must not be absolute"   >&2; exit 1 ;;
esac
if [[ "$BRANCH" != */* ]]; then
  echo "error: branch must be of the form <type>/<name>" >&2
  usage
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
DIR_NAME="${BRANCH//\//-}"
WORKTREE_DIR="${ROOT}/.worktrees/${DIR_NAME}"

if [[ -d "$WORKTREE_DIR" ]]; then
  echo "error: worktree already exists at ${WORKTREE_DIR}" >&2
  exit 1
fi

mkdir -p "${ROOT}/.worktrees"

if [[ "$MODE" == "existing" ]]; then
  echo "Fetching from origin..."
  git fetch origin "$BRANCH" 2>/dev/null || git fetch origin || true

  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "Attaching to local branch: $BRANCH"
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    echo "Attaching to remote-tracking branch: origin/$BRANCH"
    git worktree add -b "$BRANCH" "$WORKTREE_DIR" "origin/$BRANCH"
  else
    echo "error: branch '$BRANCH' not found locally or on origin" >&2
    exit 1
  fi
else
  if ! git worktree add -b "$BRANCH" "$WORKTREE_DIR" 2>/dev/null; then
    echo "branch creation failed; trying existing local branch checkout" >&2
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  fi
fi

# Optional dependency install. Repo is spec-only today; this becomes useful once
# implementers scaffold apps/caplet + packages/*. Pick the first lockfile that exists.
if [[ -f "${WORKTREE_DIR}/bun.lock" || -f "${WORKTREE_DIR}/bun.lockb" ]]; then
  echo "Installing deps with bun..."
  (cd "$WORKTREE_DIR" && bun install)
elif [[ -f "${WORKTREE_DIR}/pnpm-lock.yaml" ]]; then
  echo "Installing deps with pnpm..."
  (cd "$WORKTREE_DIR" && pnpm install)
elif [[ -f "${WORKTREE_DIR}/package-lock.json" ]]; then
  echo "Installing deps with npm..."
  (cd "$WORKTREE_DIR" && npm install)
elif [[ -f "${WORKTREE_DIR}/yarn.lock" ]]; then
  echo "Installing deps with yarn..."
  (cd "$WORKTREE_DIR" && yarn install)
fi

echo ""
echo "Worktree ready:"
echo "  dir:    ${WORKTREE_DIR}"
echo "  branch: ${BRANCH}"
echo ""
echo "Next:"
echo "  cd ${WORKTREE_DIR}"
