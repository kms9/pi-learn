#!/bin/sh
# P0 probe bench: DS Bot's scripted mock model plus a released DSH Web whose profile loads
# ds-bot (from the dsh-bot submodule) and the observe-only probe (probes/dsh-probe).
#
#   probes/bench.sh <name> <web-port> <mock-port> [start|stop|reset|status]
#
# Data lives in probes/.run/<name> (DSH_HOME; never ~/.dsh). The DSH runtime is the npm
# release named in probes/versions.lock.json, installed once into probes/.run/harness.
# Environment: CONTEXT_WINDOW, CHECK_RATIO (as in ds-bot's dev/bench.sh), MOCK_DELAY_MS.
# MODEL=real uses the real DeepSeek API instead of the mock: the caller sources the key
# file first (DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY); this script never writes either down.
# DSH speaks the Anthropic Messages protocol, served under <base>/anthropic.
# CATALOG=flash-only drops deepseek-v4-pro from the model catalog (fallback scenario).
set -eu
NAME=${1:?usage: bench.sh <name> <web-port> <mock-port> [start|stop|reset|status]}
WEB_PORT=${2:?usage}
MOCK_PORT=${3:?usage}
ACTION=${4:-start}
case "$NAME" in *[!a-z0-9-]*|'') echo "bench name must match [a-z0-9-]+" >&2; exit 1 ;; esac

PROBES="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$PROBES")"
PLUGIN="$REPO/dsh-bot/ds-bot"
PROBE="$PROBES/dsh-probe"
DRIVER="$PROBES/dsh-probe-driver"
MODEL=${MODEL:-mock}
DSH_VERSION=$(node -p "require('$PROBES/versions.lock.json').dsh.npm")
HARNESS="$PROBES/.run/harness"
HOME_DIR="$PROBES/.run/$NAME"
DSH="$HARNESS/node_modules/.bin/dsh"

alive() { [ -f "$HOME_DIR/$1.pid" ] && kill -0 "-$(cat "$HOME_DIR/$1.pid")" 2>/dev/null; }

stop_one() {
  file="$HOME_DIR/$1.pid"
  [ -f "$file" ] || return 0
  pid=$(cat "$file")
  kill -TERM "-$pid" 2>/dev/null || true
  i=0
  while kill -0 "-$pid" 2>/dev/null && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
  kill -KILL "-$pid" 2>/dev/null || true
  rm -f "$file"
}

ensure_harness() {
  if [ -x "$DSH" ] && [ "$("$DSH" --version)" = "$DSH_VERSION" ]; then return 0; fi
  mkdir -p "$HARNESS"
  printf '{ "name": "probe-harness", "private": true }\n' > "$HARNESS/package.json"
  npm install --prefix "$HARNESS" --no-fund --no-audit "@deepseek-ai/dsh@$DSH_VERSION" >/dev/null
}

ensure_profile() {
  profile="$HOME_DIR/profiles/web"
  if [ -f "$profile/package.json" ] && grep -q "\"link:$DRIVER\"" "$profile/package.json"; then return 0; fi
  mkdir -p "$profile"
  cat > "$profile/package.json" <<EOF
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": { "ds-bot": "link:$PLUGIN", "dsh-squad-probe": "link:$PROBE", "dsh-squad-probe-driver": "link:$DRIVER" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "ds-bot", "dsh-squad-probe", "dsh-squad-probe-driver"] } }
}
EOF
  printf 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n' > "$profile/pnpm-workspace.yaml"
  (cd "$profile" && DSH_HOME="$HOME_DIR" pnpm install >/dev/null)
}

write_overlay() {
  overlay="$HOME_DIR/bench.patch.yml"
  : > "$overlay"
  if [ -n "${CHECK_RATIO:-}" ]; then
    printf -- '- id: bot\n  config:\n    checkRatio: %s\n' "$CHECK_RATIO" >> "$overlay"
  fi
  if [ -n "${CONTEXT_WINDOW:-}" ]; then
    {
      printf -- '- id: llm-deepseek\n  config:\n    models:\n'
      printf -- '      - { id: deepseek-flash, contextWindow: %s, maxTokens: 8000, inputModalities: [text, image] }\n' "$CONTEXT_WINDOW"
      [ "${CATALOG:-}" = flash-only ] || printf -- '      - { id: deepseek-v4-pro, contextWindow: %s, maxTokens: 8000 }\n' "$CONTEXT_WINDOW"
    } >> "$overlay"
  fi
  [ -s "$overlay" ] || printf '[]\n' > "$overlay"
}

start_web() {
  log="$HOME_DIR/web.log"
  rm -f "$log"
  if [ "$MODEL" = real ]; then
    [ -n "${DEEPSEEK_API_KEY:-}" ] && [ -n "${DEEPSEEK_BASE_URL:-}" ] || { echo "MODEL=real needs DEEPSEEK_BASE_URL and DEEPSEEK_API_KEY in the environment (source the key file)" >&2; exit 1; }
    base="${DEEPSEEK_BASE_URL%/}/anthropic"
  else
    base="http://127.0.0.1:$MOCK_PORT/v1"
    DEEPSEEK_API_KEY=mock-key
  fi
  (cd "$HOME_DIR" && DSH_HOME="$HOME_DIR" DSH_PROBE_OUT="$HOME_DIR/probe/events.jsonl" \
    DEEPSEEK_BASE_URL="$base" DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
    setsid "$DSH" --profile web --patch "$HOME_DIR/bench.patch.yml" --no-open --port "$WEB_PORT" \
    </dev/null >"$log" 2>&1 & echo $! >"$HOME_DIR/web.pid")
  i=0
  until grep -q "dsh web: http" "$log" 2>/dev/null; do
    i=$((i + 1))
    if [ $i -gt 180 ] || ! alive web; then echo "dsh web did not start; see $log" >&2; tail -30 "$log" | grep -v 'token=' >&2; exit 1; fi
    sleep 1
  done
}

start() {
  mkdir -p "$HOME_DIR"
  ensure_harness
  ensure_profile
  write_overlay
  if [ "$MODEL" != real ] && ! alive mock; then
    (cd "$PLUGIN" && MOCK_PORT="$MOCK_PORT" MOCK_DELAY_MS="${MOCK_DELAY_MS:-300}" MOCK_LOG="$HOME_DIR/mock.jsonl" \
      setsid node dev/mock-llm.mjs "$HOME_DIR" </dev/null >"$HOME_DIR/mock.out" 2>&1 & echo $! >"$HOME_DIR/mock.pid")
  fi
  alive web || start_web
  status
}

status() {
  for name in mock web; do
    if alive $name; then echo "$name: running (pid $(cat "$HOME_DIR/$name.pid"))"; else echo "$name: stopped"; fi
  done
  echo "home: $HOME_DIR  web: http://127.0.0.1:$WEB_PORT  mock: $MOCK_PORT  dsh: $DSH_VERSION"
}

case "$ACTION" in
  start) start ;;
  # Only the web host: the restart scenario keeps the mock and the data.
  restart-web) stop_one web; write_overlay; start_web; status ;;
  kill-web) [ -f "$HOME_DIR/web.pid" ] && kill -KILL "-$(cat "$HOME_DIR/web.pid")" 2>/dev/null; rm -f "$HOME_DIR/web.pid"; status ;;
  stop) stop_one web; stop_one mock; status ;;
  reset)
    stop_one web
    stop_one mock
    rm -rf "$HOME_DIR/bot" "$HOME_DIR/sessions" "$HOME_DIR/probe" "$HOME_DIR/mock.jsonl" "$HOME_DIR/cookies.txt"
    start
    ;;
  status) status ;;
  *) echo "unknown action $ACTION" >&2; exit 1 ;;
esac
