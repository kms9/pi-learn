#!/bin/sh
# Builds the patched ds-bot the P1 bench loads: the dsh-bot submodule's pinned commit,
# exported (the submodule itself stays untouched), plus dsh_squad/patches/ds-bot/*.patch.
#
#   dsh_squad/scripts/prepare-ds-bot.sh [--test]
#
# Output: dsh_squad/.build/ds-bot (gitignored), a git repo whose first commit is the
# upstream copy, so `git diff` there shows exactly what the patches change. --test runs
# ds-bot's unit tests on the result against dev/harness of the submodule.
set -eu
SQUAD="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$SQUAD")"
OUT="$SQUAD/.build/ds-bot"
UPSTREAM="$(git -C "$REPO/dsh-bot" rev-parse HEAD)"

# --stamp prints what a build from the current submodule and patches would be made of.
if [ "${1:-}" = --stamp ]; then
  printf '%s %s\n' "$UPSTREAM" "$(cat "$SQUAD"/patches/ds-bot/*.patch | sha256sum | cut -d' ' -f1)"
  exit 0
fi
rm -rf "$OUT"
mkdir -p "$OUT"
git -C "$REPO/dsh-bot" archive "$UPSTREAM" ds-bot | tar -x -C "$OUT" --strip-components=1
cd "$OUT"
git init -q
git add -A
git -c user.name=prepare -c user.email=prepare@localhost commit -qm "ds-bot at dsh-bot $UPSTREAM"
for patch in "$SQUAD"/patches/ds-bot/*.patch; do
  git apply --whitespace=nowarn "$patch"
  echo "applied $(basename "$patch")"
done
# Build tools and the test harness come from the submodule's own installs.
[ -d "$REPO/dsh-bot/ds-bot/node_modules" ] && ln -sfn "$REPO/dsh-bot/ds-bot/node_modules" node_modules
printf 'node_modules\n' >> .git/info/exclude
git diff --stat
# What this build is made of, so a later run knows when the submodule or a patch moved.
printf '.squad-build\n' >> .git/info/exclude
"$SQUAD/scripts/prepare-ds-bot.sh" --stamp > .squad-build
if [ "${1:-}" = --test ]; then
  DSH_HARNESS="$REPO/dsh-bot/ds-bot/dev/harness" node --import ./test/harness-resolve.mjs --test "test/*.test.js"
fi
