#!/usr/bin/env bash
# P0 controller smoke: register two agents, list online, drop one heartbeat,
# observe offline, restart controller, confirm identity persisted.
#
# This path does not require `pi` or Herdr. The README documents the
# additional `pi -e` two-process flow for a local machine that has Pi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$ROOT/pi_squad/controller"
WORKDIR="${TMPDIR:-/tmp}/pi_squad_p0_smoke_$$"
DB="$WORKDIR/pi_squad.sqlite"
LOG="$WORKDIR/controller.log"
PID_FILE="$WORKDIR/controller.pid"
# Never inherit the production listen address; every smoke owns a private port.
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
LISTEN="127.0.0.1:$PORT"
BASE="http://${LISTEN}"
TIMEOUT="2s"

mkdir -p "$WORKDIR"
(cd "$CTRL" && go build -o "$WORKDIR/controller" ./cmd/controller)
cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    wait "$(cat "$PID_FILE")" 2>/dev/null || true
  fi
}
trap cleanup EXIT

start_controller() {
  # Refuse an occupied port before issuing any request, including on restart.
  python3 - "$PORT" <<'CHECK_PORT'
import socket,sys
with socket.socket() as s:
    s.bind(("127.0.0.1", int(sys.argv[1])))
CHECK_PORT
  "$WORKDIR/controller" \
    -listen "$LISTEN" \
    -db "$DB" \
    -heartbeat-timeout "$TIMEOUT" >"$LOG" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 50); do
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      cat "$LOG" >&2
      return 1
    fi
    if curl -sf "$BASE/health" >/dev/null; then
      sleep 0.1
      kill -0 "$(cat "$PID_FILE")" 2>/dev/null || { cat "$LOG" >&2; return 1; }
      return 0
    fi
    sleep 0.15
  done
  echo "controller failed to start; log:" >&2
  cat "$LOG" >&2
  return 1
}

stop_controller() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    wait "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
}

register() {
  local id="$1" role="$2"
  curl -sf -X POST "$BASE/agents/register" \
    -H 'content-type: application/json' \
    -d "{\"agent_id\":\"$id\",\"role\":\"$role\",\"squad_id\":\"alpha\",\"runtime_type\":\"pi\",\"space_id\":\"ws-smoke\",\"pane_id\":\"pane-$id\",\"runtime_id\":\"$3\",\"runtime_session_id\":\"sess-$id\",\"runtime_token\":\"smoke-private-credential-at-least-32b\"}"
  echo
}

heartbeat() {
  curl -sf -X POST "$BASE/agents/heartbeat" \
    -H 'content-type: application/json' \
    -d "{\"agent_id\":\"$1\",\"runtime_id\":\"$2\",\"runtime_session_id\":\"sess-$1\",\"runtime_token\":\"smoke-private-credential-at-least-32b\"}"
  echo
}

echo "== start controller"
start_controller

echo "== register backend + reviewer"
register backend backend 11111111-1111-4111-8111-111111111111
register reviewer reviewer 22222222-2222-4222-8222-222222222222

echo "== list (expect both online)"
LIST1="$(curl -sf "$BASE/agents")"
echo "$LIST1"
printf '%s' "$LIST1" | python3 -c '
import json,sys
body=json.load(sys.stdin)
agents={a["agent_id"]:a for a in body["agents"]}
assert set(agents)=={"backend","reviewer"}, agents
assert all(a["status"]=="online" for a in agents.values()), agents
print("PASS list both online")
'

echo "== heartbeat only backend, wait for reviewer timeout"
# Keep backend alive across the offline window; reviewer is silent.
for _ in $(seq 1 6); do
  heartbeat backend 11111111-1111-4111-8111-111111111111 >/dev/null
  sleep 0.4
done

echo "== list after timeout (reviewer offline, backend online)"
LIST2="$(curl -sf "$BASE/agents")"
echo "$LIST2"
printf '%s' "$LIST2" | python3 -c '
import json,sys
body=json.load(sys.stdin)
agents={a["agent_id"]:a for a in body["agents"]}
assert agents["backend"]["status"]=="online", agents
assert agents["reviewer"]["status"]=="offline", agents
print("PASS reviewer offline, backend online")
'

echo "== restart controller (same sqlite)"
stop_controller
start_controller
LIST3="$(curl -sf "$BASE/agents")"
echo "$LIST3"
printf '%s' "$LIST3" | python3 -c '
import json,sys
body=json.load(sys.stdin)
ids={a["agent_id"] for a in body["agents"]}
assert ids=={"backend","reviewer"}, ids
print("PASS identities persisted after controller restart")
'

echo "== same credentials re-register stays one row; different UUID conflicts"
register reviewer reviewer 22222222-2222-4222-8222-222222222222
CONFLICT="$(curl -s -o /tmp/pi-squad-smoke-conflict.json -w '%{http_code}' -X POST "$BASE/agents/register" \
  -H 'content-type: application/json' \
  -d '{"agent_id":"reviewer","role":"reviewer","squad_id":"alpha","runtime_id":"33333333-3333-4333-8333-333333333333","runtime_session_id":"sess-reviewer","runtime_token":"other-smoke-credential-at-least-32-chars"}')"
echo "conflict status $CONFLICT"
python3 - <<'PY'
import json
body=json.load(open("/tmp/pi-squad-smoke-conflict.json"))
assert "already owned" in body.get("error",""), body
print("PASS different UUID rejected, no overwrite")
PY
GOT="$(curl -sf "$BASE/agents/reviewer")"
echo "$GOT"
printf '%s' "$GOT" | python3 -c '
import json,sys
a=json.load(sys.stdin)
assert a["agent_id"]=="reviewer"
assert a["runtime_id"]=="22222222-2222-4222-8222-222222222222"
assert a["status"]=="online"
print("PASS same agent_id still original UUID, no reviewer-2")
'

COUNT="$(curl -sf "$BASE/agents" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["agents"]))')"
if [[ "$COUNT" != "2" ]]; then
  echo "FAIL expected 2 agents, got $COUNT" >&2
  exit 1
fi

echo
echo "P0 controller smoke PASS"
echo "workdir: $WORKDIR"
echo "db: $DB"
echo "log: $LOG"
echo
echo "Pi binary smoke is documented in README.md (requires local pi)."
