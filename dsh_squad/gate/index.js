// dsh-squad-gate: the P1 Squad gate prototype. It holds managed Bot Sessions to what a
// Controller admitted, through the seam that the ds-bot patch adds (dsBotSeam):
//
// - every step of a managed Session is decided here first, before DS Bot's own pre-step
//   logic, whatever order the plugins loaded in (src/policy.js);
// - DS Bot asks before it resumes or resends work on its own (seam.allows);
// - each admitted attempt is judged done only by live and durable ends together, with
//   every tool call paired (src/judge.js);
// - a model route that differs from the frozen one is refused before the request goes
//   out, and again if it shows up at request time.
//
// Order-independent backstops: a monotonic tool guard (no tools without an admitted
// attempt) and a step audit (a managed step the gate never decided is cancelled).
//
// State: $DSH_HOME/squad-gate/state.json; every decision: decisions.jsonl. A test-only
// route, /api/squad-gate, stands in for the Controller (manage, admit, cancel, state).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { decideStep, nextRoute, wakeOf } from './src/policy.js'
import { newAttempt, observe, verdictOf } from './src/judge.js'
import { durableTurnEnd, readSessionEvents } from './src/durable.js'

export const name = 'dsh-squad-gate'
export const inject = ['dsBotSeam', 'sessions', 'connection', 'tools']

const ROUTE = '/api/squad-gate'
const SETTLED = new Set(['settled_completed', 'settled_aborted', 'settled_blocked', 'settled_failed'])

export const bindingKey = owner => (owner === undefined || owner.botId === undefined || !['chat', 'group-member'].includes(owner.place)
  ? undefined : `${owner.botId}|${owner.roomId ?? 'chat'}`)

export function apply(ctx, config = {}) {
  const seam = ctx.dsBotSeam
  const dshHome = config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dir = join(dshHome, 'squad-gate')
  mkdirSync(dir, { recursive: true })
  const statePath = join(dir, 'state.json')
  const logPath = join(dir, 'decisions.jsonl')

  let state = { bindings: {}, admissions: {}, attempts: {} }
  try { state = { ...state, ...JSON.parse(readFileSync(statePath, 'utf8')) } } catch { /* first start */ }
  const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  let seq = 0
  const log = (event, data) => appendFileSync(logPath, `${JSON.stringify({ seq: ++seq, ts: new Date().toISOString(), pid: process.pid, event, ...data })}\n`)

  /** @type {Map<string, string>} the attempt each managed Session's current turn runs */
  const activeBySession = new Map()
  /** @type {Map<string, string>} `${turn}:${step}` of the last step the gate decided, by Session */
  const decided = new Map()
  /** @type {Map<string, {message:any, sessionId:string, wake:string, why:string, at:string}>} */
  const held = new Map()

  const bindingOf = (sessionId) => {
    const owner = seam.ownerOf(sessionId)
    const key = bindingKey(owner)
    return key === undefined ? {} : { owner, key, binding: state.bindings[key] }
  }
  const attemptOf = sessionId => state.attempts[activeBySession.get(sessionId)]
  const judge = (attemptId, fact) => {
    const attempt = state.attempts[attemptId]
    if (attempt === undefined) return
    const next = observe(attempt, fact)
    next.verdict = verdictOf(next)
    state.attempts[attemptId] = next
    if (next.verdict.verdict !== attempt.verdict?.verdict) log('verdict', { attemptId, sessionId: next.sessionId, fact: fact.type, ...next.verdict })
    save()
  }
  const confirmDurable = async (attemptId, session) => {
    const attempt = state.attempts[attemptId]
    if (attempt === undefined) return
    if (session !== undefined) await ctx.sessions.flush(session).catch(() => {})
    const end = durableTurnEnd(readSessionEvents(dshHome, attempt.sessionId), attempt.turn)
    judge(attemptId, { type: 'durable', kind: end.kind, started: end.started })
  }

  // Attempts this host did not see end were cut by a restart: their live events are gone,
  // so only the durable log can say how they ended, and an unconfirmed end is unknown.
  for (const [attemptId, attempt] of Object.entries(state.attempts)) {
    if (SETTLED.has(attempt.verdict?.verdict) || attempt.pid === process.pid) continue
    judge(attemptId, { type: 'host/restarted' })
    void confirmDurable(attemptId).catch(error => log('error', { where: 'restart-confirm', attemptId, error: String(error) }))
  }

  // 1. Every step of a managed Session, before DS Bot's own pre-step logic.
  async function preStep(payload, inner) {
    const { agent, messages = [], turn, step } = payload
    const { key, binding, owner } = bindingOf(agent?.id)
    if (binding === undefined) return inner()
    decided.set(agent.id, `${turn}:${step}`)
    const activeId = activeBySession.get(agent.id)
    const active = activeId !== undefined && state.attempts[activeId]?.turn === turn ? state.attempts[activeId] : undefined
    const selection = ctx.get?.('sessionProjections')?.stateOf?.(agent.session, 'modelSelection')
    const route = nextRoute(selection)
    const admissions = new Map(Object.entries(state.admissions).filter(([, admission]) => admission.key === key))
    const decision = decideStep({ messages, turn, step }, binding, active, admissions, route)
    for (const entry of decision.hold) {
      const message = messages.find(candidate => candidate.id === entry.id)
      held.set(entry.id, { message, sessionId: agent.id, wake: entry.wake, why: entry.why, at: new Date().toISOString() })
    }
    log('pre-step', {
      sessionId: agent.id, key, owner, turn, step, action: decision.action, reason: decision.reason,
      wakes: messages.map(message => wakeOf(message.source)), kept: decision.keep.length, held: decision.hold,
      ...(decision.reason === 'model_mismatch' ? { route: decision.route, frozen: decision.frozen } : {}),
    })
    if (decision.reason === 'model_mismatch' && active !== undefined) judge(active.attemptId, { type: 'turn/end', turn: active.turn, kind: 'model_mismatch' })
    if (decision.action === 'reject') {
      setTimeout(() => void rewake(agent).catch(error => log('error', { where: 'rewake', sessionId: agent.id, error: String(error) })), 0)
      return { kind: 'reject' }
    }
    if (decision.opens !== undefined) {
      const { attemptId, fence } = decision.opens
      state.attempts[attemptId] = { ...newAttempt({ attemptId, sessionId: agent.id, fence, turn, pid: process.pid }), key, verdict: { verdict: 'running', why: 'opened' } }
      delete state.admissions[attemptId]
      activeBySession.set(agent.id, attemptId)
      save()
      log('attempt/open', { attemptId, sessionId: agent.id, key, turn, fence })
    }
    const result = await inner()
    if (result?.kind === 'reject') {
      log('pre-step/inner-reject', { sessionId: agent.id, turn, step })
      return result
    }
    if (decision.hold.length === 0) return result
    const drop = new Set(decision.hold.map(entry => entry.id))
    return { ...result, messages: result.messages.filter(message => !drop.has(message.id)) }
  }

  // A rejected step ends DSH's driver loop, and what is still queued would wait for the
  // next wake-up. Queued input is put back through followup(), which wakes the driver, so
  // each piece gets its own step (and its own decision).
  async function rewake(agent) {
    // The rejected turn closes just after this listener returns.
    for (let tries = 0; tries < 50 && agent.status === 'running'; tries += 1) await new Promise(resolve => setTimeout(resolve, 100))
    const pending = [...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])]
    if (pending.length === 0 || agent.status === 'running') return
    for (const message of pending) agent.inbox.remove(message.id)
    for (const message of pending) agent.followup(message)
    await ctx.sessions.flush(agent.session)
    log('rewake', { sessionId: agent.id, count: pending.length, wakes: pending.map(message => wakeOf(message.source)) })
  }

  // 2. Work DS Bot would start on its own after a restart.
  function allows(sessionId, what, detail) {
    const { key, binding } = bindingOf(sessionId)
    if (binding === undefined) return true
    const allowed = binding.policy?.allowResume === true
    log('self-start', { sessionId, key, what, allowed, detail })
    return allowed
  }

  ctx.effect(() => seam.attachGate({ preStep, allows }), 'squad-gate: seam')

  // Ownership at creation: the seam must name a new Bot Session's owner at once.
  ctx.on('agent/created', async ({ agent, source }) => {
    await seam.ready()
    const owner = seam.ownerOf(agent.id)
    log('agent/created', { sessionId: agent.id, source, owner: owner ?? null })
    return undefined
  })

  // 3. Judge facts and the step audit, from the Session event log.
  ctx.on('session/event', (session, event) => {
    const sessionId = session?.id
    const attemptId = activeBySession.get(sessionId)
    switch (event.type) {
      case 'step/start': {
        const { binding } = bindingOf(sessionId)
        if (binding === undefined) break
        const at = `${event.data?.turn}:${event.data?.step}`
        if (decided.get(sessionId) === at) break
        // A step the gate never decided: something outside DS Bot's chain let it in.
        log('ungated-step', { sessionId, at, decided: decided.get(sessionId) ?? null })
        void seam.resolveAgent(sessionId).then(agent => agent.cancel({ kind: 'hook', reason: 'squad/ungated-step' })).catch(() => {})
        break
      }
      case 'tool/call': if (attemptId) judge(attemptId, { type: 'tool/call', callId: event.data?.callId }); break
      case 'tool/result': if (attemptId) judge(attemptId, { type: 'tool/result', callId: event.data?.message?.toolCallId }); break
      case 'turn/end': {
        if (attemptId === undefined) break
        const turn = event.data?.turn
        if (state.attempts[attemptId]?.turn !== turn) break
        activeBySession.delete(sessionId)
        judge(attemptId, { type: 'turn/end', turn, kind: event.data?.reason?.kind })
        // The durable end is read after DSH has written this event out.
        setTimeout(() => void confirmDurable(attemptId, session).catch(error => log('error', { where: 'confirm', attemptId, error: String(error) })), 0)
        break
      }
      default: break
    }
  })

  // Dispatches (nested PTC calls included) and approvals of the running attempt.
  ctx.on('tools/execute', async (exec, next) => {
    const attemptId = activeBySession.get(exec?.agent?.id)
    if (attemptId === undefined) return next()
    judge(attemptId, { type: 'dispatch/start' })
    try {
      return await next()
    } finally {
      judge(attemptId, { type: 'dispatch/end' })
    }
  }, { prepend: true })
  ctx.on('approval/request', async (request, next) => {
    const attemptId = activeBySession.get(request?.agent?.id ?? request?.sessionId)
    if (attemptId === undefined) return next()
    judge(attemptId, { type: 'approval/start' })
    try {
      return await next()
    } finally {
      judge(attemptId, { type: 'approval/end' })
    }
  }, { prepend: true })

  // Backstop: no tool runs in a managed Session outside an admitted attempt. Guards are
  // monotonic, so no later listener can turn this denial back into permission.
  ctx.tools.guard((exec) => {
    const sessionId = exec?.agent?.id
    const { binding } = bindingOf(sessionId)
    if (binding === undefined || activeBySession.has(sessionId)) return undefined
    log('tool-guard', { sessionId, tool: exec?.name })
    return 'Squad: this Session runs only work a Controller admitted, and none is running now.'
  })

  // 5. The frozen route, again at request time: a fallback applied mid-turn is refused.
  ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    const attempt = attemptOf(payload?.agent?.id)
    const { binding } = bindingOf(payload?.agent?.id)
    const frozen = binding?.frozen
    if (attempt === undefined || frozen === undefined) return config
    if (config?.provider === frozen.provider && config?.model === frozen.model) return config
    log('model-refused', { sessionId: payload.agent.id, attemptId: attempt.attemptId, route: { provider: config?.provider, model: config?.model }, frozen })
    judge(attempt.attemptId, { type: 'turn/end', turn: attempt.turn, kind: 'model_mismatch' })
    throw Object.assign(new Error(`Squad: model ${config?.provider}/${config?.model} differs from the frozen ${frozen.provider}/${frozen.model}`), { code: 'squad/model-mismatch' })
  })

  // Test-only stand-in for the Controller.
  const sessionFor = ({ botId, roomId }) => (roomId ? seam.groupSessionOf(roomId, botId) : seam.chatOf(botId))
  const deliver = async (sessionId, text, source) => {
    const agent = await seam.resolveAgent(sessionId)
    agent.followup(seam.createMessage({ text, source }))
    await ctx.sessions.flush(agent.session)
  }
  async function handle(endpoint, body = {}) {
    switch (endpoint) {
      case 'manage': {
        const key = bindingKey({ botId: body.botId, roomId: body.roomId, place: body.roomId ? 'group-member' : 'chat' })
        state.bindings[key] = { botId: body.botId, ...(body.roomId ? { roomId: body.roomId } : {}), fence: state.bindings[key]?.fence ?? 0, ...(body.frozen ? { frozen: body.frozen } : {}), policy: body.policy ?? {} }
        save()
        log('manage', { key, binding: state.bindings[key] })
        return { key, binding: state.bindings[key] }
      }
      case 'unmanage': {
        const key = bindingKey({ botId: body.botId, roomId: body.roomId, place: body.roomId ? 'group-member' : 'chat' })
        delete state.bindings[key]
        save()
        return { key }
      }
      case 'admit': {
        const key = bindingKey({ botId: body.botId, roomId: body.roomId, place: body.roomId ? 'group-member' : 'chat' })
        const binding = state.bindings[key]
        if (binding === undefined) throw new Error(`not managed: ${key}`)
        binding.fence += 1
        const sessionId = sessionFor(body)
        if (sessionId === undefined) throw new Error(`no Session for ${key}`)
        state.admissions[body.attemptId] = { key, fence: binding.fence, sessionId, at: new Date().toISOString() }
        save()
        log('admit', { attemptId: body.attemptId, key, fence: binding.fence, sessionId })
        await deliver(sessionId, String(body.text), { kind: 'squad', attemptId: body.attemptId, fence: binding.fence })
        return { attemptId: body.attemptId, fence: binding.fence, sessionId }
      }
      // A squad input with a fence of the caller's choosing: a late or replayed delivery.
      case 'inject-raw': {
        const sessionId = sessionFor(body)
        await deliver(sessionId, String(body.text), { kind: 'squad', attemptId: body.attemptId, fence: body.fence })
        return { sessionId }
      }
      case 'cancel': {
        const attempt = state.attempts[body.attemptId]
        if (attempt === undefined) throw new Error('unknown attempt')
        const agent = await seam.resolveAgent(attempt.sessionId)
        agent.cancel({ kind: 'user' })
        return true
      }
      case 'refresh': {
        await confirmDurable(body.attemptId)
        return state.attempts[body.attemptId]?.verdict
      }
      case 'state':
        return {
          bindings: state.bindings,
          attempts: Object.fromEntries(Object.entries(state.attempts).map(([id, attempt]) => [id, { sessionId: attempt.sessionId, turn: attempt.turn, verdict: attempt.verdict }])),
          active: Object.fromEntries(activeBySession),
          held: [...held.entries()].map(([id, entry]) => ({ id, sessionId: entry.sessionId, wake: entry.wake, why: entry.why, at: entry.at })),
        }
      default:
        throw new Error(`unknown endpoint ${endpoint}`)
    }
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body
      try { body = await request.json() } catch { body = {} }
      try {
        return Response.json({ ok: true, value: await handle(String(body?.endpoint ?? ''), body?.payload) })
      } catch (error) {
        return Response.json({ ok: false, error: { message: error?.message ?? String(error) } })
      }
    },
  }), 'squad-gate: route')
  log('gate/start', { dshHome, attempts: Object.keys(state.attempts).length, bindings: Object.keys(state.bindings).length })
}
