// Gate policy: which input may wake a managed Bot Session, decided per step. Pure: the
// plugin (../index.js) feeds it the claimed messages, the binding and its admissions.
//
// A managed binding is one Bot in one place (its own chat, or its Session in one group),
// with a frozen model route. Only an input that carries the Controller's admission
// (`source.kind === 'squad'` with the binding's current fence) opens an attempt; every
// other wake-up — the user, another Bot, a group relay, a schedule, DS Bot resuming
// after a restart, a part handoff, a stop notice, a reply, a retry — is held.

// The wake-up an input stands for, from the source DS Bot or DSH gave it.
export function wakeOf(source) {
  if (source === undefined || source === null) return 'unknown'
  if (source.kind === 'squad') return 'squad'
  if (source.kind === 'user') return 'user'
  if (source.kind === 'schedule') return 'schedule'
  if (source.kind === 'bot') {
    if (source.resumed || source.resent || source.role === 'resume') return 'resume'
    if (source.retried || source.role === 'retry') return 'retry'
    switch (source.role) {
      case 'handoff': return 'handoff'
      case 'stopped': return 'stopped'
      case 'reply': return 'reply'
      case 'report': return 'group-report'
      case 'request': return 'bot-request'
      case 'room': return 'group-relay'
      case 'post': return 'group-post'
      case 'kickoff': return 'kickoff'
      default: return `bot-${source.role ?? 'other'}`
    }
  }
  // DSH's own plugins put inputs into a running turn too (repeat-tool-reminder, for one).
  return typeof source.kind === 'string' ? `harness:${source.kind}` : 'unknown'
}

// Wake-ups a binding may let through without an admission, by policy switch.
const SELF_STARTED = new Set(['handoff', 'stopped', 'reply', 'group-report', 'retry'])
export function allowedByPolicy(wake, policy = {}) {
  if (wake === 'resume') return policy.allowResume === true
  if (SELF_STARTED.has(wake)) return policy.allowSelfStart === true
  return false
}

const sameRoute = (a, b) => a !== undefined && b !== undefined && a.provider === b.provider && a.model === b.model
  && (a.effort === undefined || b.effort === undefined || a.effort === b.effort)

// The route the next request of a Session will use, from DSH's modelSelection projection.
export function nextRoute(selection) {
  const picked = selection?.pending ?? selection?.lastUsed ?? undefined
  return picked === undefined || picked === null ? undefined
    : { provider: picked.provider, model: picked.model, ...(picked.reasoningEffort ? { effort: picked.reasoningEffort } : {}) }
}

/**
 * One step of a managed Session.
 * @param {{messages: {id:string, source?:any}[], step:number, turn:number}} step
 * @param {{fence:number, frozen?:{provider:string, model:string, effort?:string}, policy?:object}} binding
 * @param {{attemptId:string, fence:number, turn:number}|undefined} active  the attempt this turn runs, if any
 * @param {Map<string, {attemptId:string, fence:number}>|undefined} admissions  pending admissions by attempt id
 * @param {{provider:string, model:string, effort?:string}|undefined} route  the route the step would use
 * @returns {{action:'enter'|'reject', reason:string, keep:string[], hold:{id:string, wake:string, why:string}[], opens?:{attemptId:string, fence:number}}}
 */
export function decideStep({ messages, step }, binding, active, admissions, route) {
  const hold = []
  const keep = []
  let opens
  for (const message of messages) {
    const source = message.source
    const wake = wakeOf(source)
    if (wake === 'squad') {
      const admission = admissions?.get(source.attemptId)
      if (admission === undefined) { hold.push({ id: message.id, wake, why: 'unknown_attempt' }); continue }
      if (source.fence !== binding.fence || admission.fence !== binding.fence) { hold.push({ id: message.id, wake, why: 'stale_fence' }); continue }
      if (active !== undefined && active.attemptId !== source.attemptId) { hold.push({ id: message.id, wake, why: 'other_attempt_running' }); continue }
      if (active === undefined && opens !== undefined && opens.attemptId !== source.attemptId) { hold.push({ id: message.id, wake, why: 'one_attempt_per_turn' }); continue }
      if (active === undefined) opens = { attemptId: source.attemptId, fence: source.fence }
      keep.push(message.id)
      continue
    }
    if (allowedByPolicy(wake, binding.policy)) { keep.push(message.id); continue }
    // Harness input steers the attempt that runs; it never opens one.
    if (wake.startsWith('harness:') && active !== undefined) { keep.push(message.id); continue }
    hold.push({ id: message.id, wake, why: 'no_admission' })
  }
  const running = active !== undefined || opens !== undefined
  // A frozen route is checked before anything reaches the model: a fallback DS Bot or DSH
  // applied in the background shows up here as a different next route.
  if (running && binding.frozen !== undefined && !sameRoute(binding.frozen, route)) {
    return { action: 'reject', reason: 'model_mismatch', keep: [], hold: messages.map(message => ({ id: message.id, wake: wakeOf(message.source), why: 'model_mismatch' })), route, frozen: binding.frozen }
  }
  if (active !== undefined && step > 1) return { action: 'enter', reason: 'attempt_continues', keep, hold }
  if (opens !== undefined) return { action: 'enter', reason: 'attempt_opens', keep, hold, opens }
  if (keep.length > 0) return { action: 'enter', reason: 'policy_allows', keep, hold }
  // Nothing the binding may run: the whole step is refused (an empty batch would still
  // reach the model with DSH's runtime context).
  return { action: 'reject', reason: messages.length === 0 ? 'no_attempt' : 'no_admission', keep, hold }
}
