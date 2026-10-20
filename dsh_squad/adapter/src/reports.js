// What the adapter tells the Controller about one attempt, and when. Pure: given what
// was already reported and what the gate now knows, it answers the next report.
//
// The receipt chain is strictly ordered (squad/3): adapter_received → injection_requested
// → input_observed; then result_proposed (from the task tool) and finally settled, or an
// interruption when the end cannot be confirmed.

const ORDER = ['adapter_received', 'injection_requested', 'input_observed']

const SETTLED_OUTCOME = {
  settled_completed: 'completed',
  settled_aborted: 'aborted',
  settled_blocked: 'blocked',
  settled_failed: 'failed',
}

/**
 * The next receipt to send, or undefined when the chain is as far as the facts go.
 * @param {string[]} sent  receipts already accepted by the Controller
 * @param {{delivered:boolean, opened:boolean}} facts
 */
export function nextReceipt(sent, facts) {
  const done = new Set(sent)
  for (const step of ORDER) {
    if (done.has(step)) continue
    if (step === 'injection_requested' && !facts.delivered) return undefined
    if (step === 'input_observed' && !facts.opened) return undefined
    return step
  }
  return undefined
}

/**
 * How a verdict ends the attempt at the Controller.
 * @returns {{kind:'settled', outcome:string}|{kind:'interrupt', reason:string}|undefined}
 */
export function endReport(verdict, { hostRestarted = false } = {}) {
  if (verdict === undefined) return undefined
  const outcome = SETTLED_OUTCOME[verdict.verdict]
  if (outcome !== undefined) return { kind: 'settled', outcome }
  if (verdict.verdict === 'outcome_unknown') return { kind: 'interrupt', reason: hostRestarted ? 'host_restart' : 'outcome_unknown' }
  return undefined
}

/**
 * The Value a submitted result carries: the model's JSON when it wrote JSON, else its
 * text as an answer (ask Tasks require exactly {"answer": "..."}).
 */
export function resultValue(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return undefined
  try {
    const value = JSON.parse(raw)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value
  } catch { /* plain text */ }
  return { answer: raw }
}

/** A review verdict from a result the model wrote itself, or undefined when it has none. */
export function reviewVerdict(value) {
  const decision = String(value?.decision ?? '').trim().toLowerCase()
  if (decision !== 'accepted' && decision !== 'rejected') return undefined
  return { decision, reason: String(value?.reason ?? '').trim() || '(no reason)' }
}
