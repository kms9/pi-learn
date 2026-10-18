// Completion judge: whether an attempt really ended, and how. Pure: it folds the facts
// the plugin observes for one attempt and answers with a verdict.
//
// P0 showed that no single signal is enough: whenIdle() also resolves on shutdown, a
// cancelled turn fires no turn-stopping, and an interrupted turn is only written to the
// durable log when its Session next opens. So `settled_completed` needs all of:
//   1. the live turn/end of the attempt's turn says completed;
//   2. the durable session log holds that same turn/end, also completed;
//   3. every tool call of the turn has its result (calls and dispatches paired);
//   4. no approval is still waiting.

export function newAttempt({ attemptId, sessionId, fence, turn, pid }) {
  return { attemptId, sessionId, fence, turn, pid, calls: {}, dispatching: 0, approvals: 0, liveEnd: undefined, durableEnd: undefined, durableChecked: false, hostChanged: false }
}

// One fact about the attempt. Returns the next state; the input is not changed.
export function observe(attempt, fact) {
  const next = { ...attempt, calls: { ...attempt.calls } }
  switch (fact.type) {
    case 'tool/call': next.calls[fact.callId] = 'open'; break
    case 'tool/result': {
      // A result whose call id was not kept (a summarised record) closes the oldest open call.
      const callId = fact.callId ?? Object.keys(next.calls).find(id => next.calls[id] === 'open')
      if (callId === undefined) break
      next.calls[callId] = callId in attempt.calls ? 'done' : 'orphan'
      break
    }
    case 'dispatch/start': next.dispatching += 1; break
    case 'dispatch/end': next.dispatching = Math.max(0, next.dispatching - 1); break
    case 'approval/start': next.approvals += 1; break
    case 'approval/end': next.approvals = Math.max(0, next.approvals - 1); break
    case 'turn/end': if (fact.turn === attempt.turn) next.liveEnd = fact.kind; break
    case 'durable':
      // A read before the attempt ended (a poll) has nothing to confirm yet.
      if (fact.kind === undefined && attempt.liveEnd === undefined && !attempt.hostChanged) break
      next.durableChecked = true
      next.durableEnd = fact.kind
      break
    // The host restarted while the attempt was open: its live events are gone.
    case 'host/restarted': next.hostChanged = true; next.dispatching = 0; next.approvals = 0; break
    default: break
  }
  return next
}

const openCalls = attempt => Object.entries(attempt.calls).filter(([, state]) => state === 'open').map(([callId]) => callId)

/**
 * @returns {{verdict:'running'|'awaiting_durable'|'settled_completed'|'settled_aborted'|'settled_blocked'|'settled_failed'|'outcome_unknown', why:string, open:string[]}}
 */
export function verdictOf(attempt) {
  const open = openCalls(attempt)
  const result = (verdict, why) => ({ verdict, why, open, dispatching: attempt.dispatching, approvals: attempt.approvals, liveEnd: attempt.liveEnd, durableEnd: attempt.durableEnd })
  if (attempt.durableEnd === 'interrupted') return result('outcome_unknown', 'the durable log says the turn was interrupted')
  if (attempt.hostChanged && attempt.liveEnd === undefined) {
    if (!attempt.durableChecked) return result('outcome_unknown', 'the host restarted during the attempt and its log was not read yet')
    if (attempt.durableEnd === undefined) return result('outcome_unknown', 'the host restarted during the attempt and the log holds no end for its turn')
  }
  const end = attempt.liveEnd ?? (attempt.hostChanged ? attempt.durableEnd : undefined)
  if (end === undefined) return result('running', 'no turn end yet')
  if (end === 'aborted') return result('settled_aborted', 'the turn was aborted')
  if (end === 'blocked') return result('settled_blocked', 'a pre-step refused the next step')
  if (end !== 'completed') return result('settled_failed', `the turn ended ${end}`)
  if (open.length > 0) return result('outcome_unknown', `the turn ended with ${open.length} tool call(s) without a result`)
  if (attempt.dispatching > 0) return result('outcome_unknown', 'the turn ended while a tool dispatch was still running')
  if (attempt.approvals > 0) return result('outcome_unknown', 'the turn ended while an approval was still waiting')
  if (!attempt.durableChecked) return result('awaiting_durable', 'the live end is not confirmed by the durable log yet')
  if (attempt.durableEnd !== 'completed') return result('outcome_unknown', `the durable log says ${attempt.durableEnd ?? 'nothing'} for the turn the live events completed`)
  return result('settled_completed', 'live and durable ends agree, every call is paired, no approval waits')
}
