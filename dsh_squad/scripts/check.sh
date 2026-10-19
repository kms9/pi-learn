#!/bin/sh
# The minimum check for every work package (2026-10-19 plan, X-1): the Controller
# builds, vets and passes its tests; the adapter passes its tests; the seam patch
# applies to the pinned ds-bot and ds-bot's own tests pass on the result.
#
#   dsh_squad/scripts/check.sh [--skip-ds-bot]
set -eu
SQUAD="$(cd "$(dirname "$0")/.." && pwd)"
echo "== controller"
(cd "$SQUAD/controller" && go build ./... && go vet ./... && go test ./...)
for pkg in adapter client; do
  [ -f "$SQUAD/$pkg/package.json" ] || continue
  echo "== $pkg"
  (cd "$SQUAD/$pkg" && npm test --silent)
done
echo "== client bundle up to date"
(cd "$SQUAD/client" && node scripts/build.mjs --check)
if [ "${1:-}" != --skip-ds-bot ]; then
  echo "== ds-bot + seam patch"
  log="$SQUAD/.build/ds-bot-test.log"
  mkdir -p "$SQUAD/.build"
  "$SQUAD/scripts/prepare-ds-bot.sh" --test >"$log" 2>&1 || { tail -40 "$log"; exit 1; }
  grep -E '^(applied|ℹ (tests|pass|fail))' "$log"
fi
echo "check: ok"
