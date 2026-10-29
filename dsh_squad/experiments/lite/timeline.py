# Timeline and task table of one Squad run, from the Controller's event log and task rows
# (feat/dsh-exp-lite). Read-only. Times are offsets from run_created.
#
#   python3 dsh_squad/experiments/lite/timeline.py <project dir> > timeline.md
import json, sqlite3, sys
from datetime import datetime

project = sys.argv[1]
db = sqlite3.connect(f'file:{project}/.dsh-squad/controller/state.sqlite?mode=ro', uri=True)
events = db.execute('select seq, type, entity_id, revision, server_time, details from events order by seq').fetchall()
tasks = {}
for (body,) in db.execute('select body from tasks'):
    t = json.loads(body)
    tasks[t['id'] if 'id' in t else t.get('task_id')] = t

def parse(ts):
    # Controller times carry nanoseconds; keep microseconds.
    head, frac = ts.rstrip('Z').split('.') if '.' in ts else (ts.rstrip('Z'), '0')
    return datetime.fromisoformat(f'{head}.{frac[:6]}+00:00')

t0 = parse(events[0][4])
for seq, typ, entity, rev, ts, details in events:
    if typ in ('renew', 'heartbeat', 'settled_quiet'):
        continue
    d = json.loads(details) if details else None
    d = d if isinstance(d, dict) else {'value': d}
    t = (parse(ts) - t0).total_seconds()
    label = {
        'run_created': 'run created', 'run_admitted': 'run admitted (FIFO, one active run)',
        'leader_step_planned': 'Leader step planned (LLM Leader)', 'leader_decision': f"Leader decision: {d.get('action')}",
        'dispatch_intent': 'dispatch intent', 'result_proposed': 'result proposed',
        'acceptance_accepted': 'acceptance: accepted', 'acceptance_rejected': f"acceptance: REJECTED ({d.get('reason', '')[:80]})",
        'review_planned': 'review task planned', 'final_gate_failed': f"final check refused: {d.get('code', d)}",
        'task_rebased': 'task rebased (redo on new version)', 'controller_resumed': 'Controller resumed after a pause',
        'run_progress': 'run progress', 'task_progress': 'task progress', 'roles_released': 'roles released',
        'registered': f"runtime registered ({d.get('mode', '')})",
    }.get(typ)
    if label is None:
        continue
    print(f"| {t:8.1f} | {typ} | {entity[:18]} | {label} |")
print()
print('| task | kind | role | state | acceptance | rework of | depends on |')
print('|---|---|---|---|---|---|---|')
for tid, t in tasks.items():
    acc = (t.get('acceptance') or {}).get('decision', '-')
    deps = ', '.join(f"{d['task_id'][:12]}({d['condition']})" for d in t.get('dependencies') or [])
    print(f"| {tid[:14]} | {t.get('kind')} | {t.get('role_id')} | {t.get('state')} | {acc} | {(t.get('rework_of') or '-')[:12]} | {deps or '-'} |")
