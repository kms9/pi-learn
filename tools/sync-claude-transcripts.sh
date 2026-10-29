#!/usr/bin/env bash
# Refresh transcripts/claude/ from the local Claude Code sessions of
# /workspace/dsh_squad_dev: export (SpecStory) -> redact -> verify scan ->
# commit only transcripts/ in the separate worktree -> plain push.
# Fails closed: if any scan finds anything, nothing is committed or pushed.
#
# Env overrides:
#   PROJECT_KEY_DIR  empty dir whose path maps to the same Claude project key
#                    (-workspace-dsh-squad-dev) as /workspace/dsh_squad_dev,
#                    so the main worktree is never touched (default /workspace/dsh-squad-dev)
#   WORKTREE         transcripts worktree (default /workspace/dsh_squad_dev-transcripts)
#   BRANCH           remote branch (default feat/dsh-exp)
#   NO_PUSH=1        stop after committing
set -euo pipefail

PROJECT_KEY_DIR=${PROJECT_KEY_DIR:-/workspace/dsh-squad-dev}
WORKTREE=${WORKTREE:-/workspace/dsh_squad_dev-transcripts}
BRANCH=${BRANCH:-feat/dsh-exp}
DEST_REL=transcripts/claude
export TZ=America/Los_Angeles PYTHONDONTWRITEBYTECODE=1
export PATH="$HOME/.local/bin:$PATH"

die() { echo "sync-claude-transcripts: $*" >&2; exit 1; }
command -v specstory >/dev/null || die "specstory not found"
command -v gitleaks  >/dev/null || die "gitleaks not found (fail closed)"
[[ "$BRANCH" != "main" ]] || die "refusing to touch main"

# 1. worktree must be clean and on top of origin/$BRANCH
cd "$WORKTREE"
[[ -z "$(git status --porcelain)" ]] || die "worktree $WORKTREE is not clean"
git fetch -q origin "$BRANCH"
git rebase -q "origin/$BRANCH" || { git rebase --abort || true; die "rebase onto origin/$BRANCH failed"; }

# 2. export Claude sessions only (never `specstory run`, never other providers)
mkdir -p "$PROJECT_KEY_DIR"
[[ -z "$(ls -A "$PROJECT_KEY_DIR")" ]] || die "$PROJECT_KEY_DIR must be an empty dir"
STAGE=$(mktemp -d /tmp/claude-transcripts.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/out" "$STAGE/cfg" "$STAGE/dbg"
( cd "$PROJECT_KEY_DIR" && specstory sync claude --no-cloud-sync --local-time-zone \
    --no-usage-analytics --no-version-check --no-stats --silent \
    --output-dir "$STAGE/out" --config-dir "$STAGE/cfg" --debug-dir "$STAGE/dbg" )
[[ -z "$(ls -A "$PROJECT_KEY_DIR")" ]] || die "specstory wrote into $PROJECT_KEY_DIR"
shopt -s nullglob
md=("$STAGE"/out/*.md)
(( ${#md[@]} > 0 )) || die "no sessions exported"
mkdir -p "$STAGE/md" && cp "${md[@]}" "$STAGE/md/"

# 3. redact, then verify with independent scans (fail closed)
python3 "$WORKTREE/tools/redact-transcripts.py" "$STAGE/md" > "$STAGE/redact.json"
python3 "$WORKTREE/tools/redact-transcripts.py" --check "$STAGE/md" > /dev/null \
  || die "redaction self-check still finds matches"
python3 - "$STAGE/md" <<'PY' || die "independent scan found secrets"
import glob, os, re, sys
d = sys.argv[1]
lits = []
for f in glob.glob(os.path.expanduser("~/.secrets/*.env")):
    for l in open(f):
        if "=" in l and re.search(r"KEY|TOKEN|SECRET|PASS", l.split("=")[0], re.I):
            v = l.split("=", 1)[1].strip().strip("\"'")
            if len(v) >= 8: lits.append(v)
rx = re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"
                r"|(?<![A-Z0-9])AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{8,}\.eyJ"
                r"|Bearer [A-Za-z0-9._~+/=-]{20,}|xox[abposr]-[A-Za-z0-9-]{10,}")
bad = 0
for f in glob.glob(os.path.join(d, "*.md")):
    t = open(f, encoding="utf-8", errors="replace").read()
    n = sum(t.count(v) for v in lits) + len(rx.findall(t))
    if n: print(f"hit(s) in {os.path.basename(f)}: {n}", file=sys.stderr); bad += n
sys.exit(1 if bad else 0)
PY
gitleaks dir "$STAGE/md" --no-banner --redact --log-level warn \
  -c "$WORKTREE/tools/gitleaks-transcripts.toml" || die "gitleaks found leaks"

# 4. copy into worktree, commit only transcripts/
mkdir -p "$WORKTREE/$DEST_REL"
cp "$STAGE"/md/*.md "$WORKTREE/$DEST_REL/"
git add -- transcripts/
if git diff --cached --quiet; then
  echo "sync-claude-transcripts: no changes"; exit 0
fi
[[ -z "$(git diff --cached --name-only | grep -v '^transcripts/')" ]] || die "staged files outside transcripts/"
git commit -q -m "docs(transcripts): 刷新 Claude Code 会话记录（已脱敏）" -- transcripts/
echo "committed $(git rev-parse --short HEAD)"
[[ "${NO_PUSH:-}" == 1 ]] && exit 0

# 5. plain push (never force); one fetch+rebase retry on non-fast-forward
if ! git push -q origin "HEAD:refs/heads/$BRANCH"; then
  git fetch -q origin "$BRANCH"
  git rebase -q "origin/$BRANCH" || { git rebase --abort || true; die "rebase failed"; }
  git push -q origin "HEAD:refs/heads/$BRANCH" || die "push failed"
fi
echo "pushed $(git rev-parse --short HEAD) to origin/$BRANCH"
