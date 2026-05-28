#!/usr/bin/env bash
# VAL-PACKAGES verifier: checks that the five workspace packages and the caplet
# app are all present, each has its own package.json + tests, and that
# `Bun.*` usage is restricted to apps/caplet (libraries must remain node-only).

set -euo pipefail

cd "$(dirname "$0")/.."

required_packages=(
  "packages/core"
  "packages/adapters"
  "packages/installer"
  "packages/sdk"
  "packages/runtime-taxonomy"
  "apps/caplet"
)

fail() { echo "FAIL: $*" >&2; exit 1; }

for p in "${required_packages[@]}"; do
  [ -d "$p" ]                 || fail "missing package dir: $p"
  [ -f "$p/package.json" ]    || fail "missing $p/package.json"
  [ -d "$p/tests" ]           || fail "missing $p/tests directory"
  grep -q '"test"'  "$p/package.json"  || fail "$p/package.json missing test script"
done

# Bun.* must not appear in library packages — only apps/caplet may use Bun.*.
violations=$(grep -RIn --include='*.ts' --include='*.tsx' \
  -E '\bBun\.' packages/ 2>/dev/null || true)
if [ -n "$violations" ]; then
  echo "FAIL: Bun.* usage outside apps/caplet:" >&2
  echo "$violations" >&2
  exit 1
fi

echo "OK: 5 packages + apps/caplet present, libraries free of Bun.*"
