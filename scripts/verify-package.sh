#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

TEST_DIR=$(mktemp -d)
PACKAGE_PATH=""

cleanup() {
  rm -rf "$TEST_DIR"
  if [[ -n "$PACKAGE_PATH" ]]; then
    rm -f "$PACKAGE_PATH"
  fi
}
trap cleanup EXIT

npm publish --dry-run --json >"$TEST_DIR/publish.json" 2>"$TEST_DIR/publish.err"
if grep -q "npm warn publish errors corrected" "$TEST_DIR/publish.err"; then
  sed -n '1,120p' "$TEST_DIR/publish.err" >&2
  exit 1
fi

PACKAGE_NAME=$(npm pack --json | jq -r '.[0].filename')
PACKAGE_PATH="$ROOT/$PACKAGE_NAME"

cd "$TEST_DIR"
bun init -y >/dev/null
bun add "$PACKAGE_PATH" >/dev/null

test -x node_modules/.bin/butaca
EXPECTED=$(jq -r .version "$ROOT/package.json")
ACTUAL=$(node_modules/.bin/butaca --version | jq -r .data.version)
test "$ACTUAL" = "$EXPECTED"
