#!/bin/sh
# Fetch each GitHub submodule's tracked branch (see .gitmodules) and merge.
# After this, `git status` in the overlay will show new gitlink SHAs if they moved.
# Commit those gitlinks in the overlay when you want to pin the new versions.
# Then run: python3 scripts/sync-zh.py
set -e
cd "$(dirname "$0")/.."
git submodule sync --recursive
git submodule update --init --recursive
git submodule update --remote --merge
echo
git submodule status
echo
echo "If gitlinks changed, commit them in this overlay repo, then:"
echo "  python3 scripts/sync-zh.py"
