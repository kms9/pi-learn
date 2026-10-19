// dsh-squad-adapter: the DSH side of Squad. It holds managed DS Bot Sessions to what a
// Controller admitted, through the seam that the ds-bot patch adds (dsBotSeam), and
// tells the Controller what really happened (squad/3, dsh_squad/protocol):
//
// - every step of a managed Session is decided here first, before DS Bot's own pre-step
//   logic, whatever order the plugins loaded in (src/policy.js);
// - DS Bot asks before it resumes or resends work on its own (seam.allows);
// - each admitted attempt is judged done only by live and durable ends together, with
//   every tool call paired (src/judge.js), and only then reported settled;
// - a model route that differs from the frozen one is refused before the request goes
//   out, and again if it shows up at request time;
// - inside an attempt only the contract's tools and the task tools run (src/toolset.js),
//   and the Session sees its Role, Team and Task (src/context.js).
//
// Each managed (Bot, place) is its own Controller runtime with its own credential. Its
// runtime id and token live in this host's state, so a host restart keeps the identity
// and can report the attempts it lost (host_restart). A new part Session re-registers
// with the old one as previous_session_id, which moves binding_epoch on.
//
// Without a Controller (no DSH_SQUAD_PROJECT) the route /api/squad-adapter stands in for
// it (manage, admit, cancel, state): the P1 drivers run on that.
//
// State: $DSH_HOME/squad-adapter/state.json (0600); every decision: decisions.jsonl.
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { decideStep, nextRoute, wakeOf } from './src/policy.js'
import { newAttempt, observe, verdictOf } from './src/judge.js'
import { durableTurnEnd, readSessionEvents } from './src/durable.js'
import { createClient, discover } from './src/controller.js'
import { endReport, nextReceipt, resultValue } from './src/reports.js'
import { contextHash, taskSection } from './src/context.js'
import { refusal, TASK_TOOLS } from './src/toolset.js'

export const name = 'dsh-squad-adapter'
export const inject = ['dsBotSeam', 'sessions', 'connection', 'tools', 'systemPrompt']

const ROUTE = '/api/squad-adapter'
const HOST_PROFILE = 'dsh/0.2.1-rc.2+ds-bot/e13bc34'
const CAPABILITIES = { input_gate: true, settle_judge: true, route_freeze: true, context_sections: true }
const SETTLED = new Set(['settled_completed', 'settled_aborted', 'settled_blocked', 'settled_failed'])
const ENDED = new Set([...SETTLED, 'outcome_unknown', 'superseded'])
const TICK_MS = 1000
const HEARTBEAT_MS = 5000
const RENEW_MS = 8000

export const bindingKey = owner => (owner === undefined || owner.botId === undefined || !['chat', 'group-member'].includes(owner.place)
  ? undefined : `${owner.botId}|${owner.roomId ?? 'chat'}`)

export function apply(ctx, config = {}) {
  const seam = ctx.dsBotSeam
  const dshHome = config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const projectRoot = config.projectRoot ?? process.env.DSH_SQUAD_PROJECT
  const dir = join(dshHome, 'squad-adapter')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const statePath = join(dir, 'state.json')
  const logPath = join(dir, 'decisions.jsonl')
  const hostId = `host-${randomUUID()}`

  // bindings: managed places; admissions: delivered, not yet opened; attempts: judged;
  // held: inputs kept out (Q36), kept across restarts; outbox: reports not yet accepted.
  let state = { bindings: {}, admissions: {}, attempts: {}, held: {}, outbox: [] }
  try { state = { ...state, ...JSON.parse(readFileSync(statePath, 'utf8')) } } catch { /* first start */ }
  const save = () => {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    try { chmodSync(statePath, 0o600) } catch { /* best effort */ }
  }
  let seq = 0
  const log = (event, data) => appendFileSync(logPath, `${JSON.stringify({ seq: ++seq, ts: new Date().toISOString(), pid: process.pid, event, ...data })}\n`)

  /** @type {Map<string, string>} the attempt each managed Session's current turn runs */
  const activeBySession = new Map()
  /** @type {Map<string, string>} `${turn}:${step}` of the last step the gate decided, by Session */
  const decided = new Map()

  const sessionFor = ({ botId, roomId }) => (roomId ? seam.groupSessionOf(roomId, botId) : seam.chatOf(botId))
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
    if (next.verdict.verdict !== attempt.verdict?.verdict) {
      log('verdict', { attemptId, sessionId: next.sessionId, fact: fact.type, ...next.verdict })
      if (next.controlled) queueEnd(next)
    }
    save()
  }
  const confirmDurable = async (attemptId, session) => {
    const attempt = state.attempts[attemptId]
    if (attempt === undefined) return
    if (session !== undefined) await ctx.sessions.flush(session).catch(() => {})
    const end = durableTurnEnd(readSessionEvents(dshHome, attempt.sessionId), attempt.turn)
    judge(attemptId, { type: 'durable', kind: end.kind, started: end.started })
  }

  // ---- Controller link -------------------------------------------------------------
  let client
  const connect = () => {
    if (projectRoot === undefined) return undefined
    if (client !== undefined) return client
    try {
      const found = discover(projectRoot)
      client = createClient(found)
      log('controller/found', { endpoint: found.endpoint, epoch: found.epoch })
    } catch (error) {
      log('controller/missing', { error: String(error?.message ?? error) })
    }
    return client
  }
  // A Controller that restarted has a new id: find it again on the next tick.
  const lost = (error) => {
    if (error?.code === 'CONTROLLER_IDENTITY_MISMATCH' || error?.code === 'PROTOCOL_MISMATCH' || error?.name === 'TypeError') client = undefined
  }
  const runtimeOf = binding => (binding?.controller?.binding === undefined ? undefined : { token: binding.controller.token, binding: binding.controller.binding })

  // Reports go through a persisted outbox: a report whose answer was lost is sent again
  // with the same request_id, and the Controller answers it from its idempotency record.
  const enqueue = (report) => {
    if (state.outbox.some(entry => entry.requestId === report.requestId)) return
    state.outbox.push(report)
    save()
  }
  function queueEnd(attempt) {
    const end = endReport(attempt.verdict, { hostRestarted: attempt.hostChanged })
    if (end === undefined) return
    if (end.kind === 'settled') enqueue({ kind: 'event', key: attempt.key, attemptId: attempt.attemptId, requestId: `settled-${attempt.attemptId}`, body: { type: 'settled', idle: true, pending: false, outcome: end.outcome } })
    else enqueue({ kind: 'interrupt', key: attempt.key, attemptId: attempt.attemptId, requestId: `interrupt-${attempt.attemptId}`, reason: end.reason })
  }

  async function sendEvent(binding, attempt, requestId, body) {
    const runtime = runtimeOf(binding)
    const dispatch = attempt.dispatch
    const out = await client.attemptEvent(runtime, attempt.attemptId, {
      request_id: requestId, expected_revision: dispatch.revision, segment_id: dispatch.segment,
      fencing_token: dispatch.fence, controller_epoch: dispatch.epoch, ...body,
    })
    dispatch.revision = out.revision
    return out
  }

  async function flushOutbox() {
    for (const report of [...state.outbox]) {
      const binding = state.bindings[report.key]
      const attempt = state.attempts[report.attemptId]
      const runtime = runtimeOf(binding)
      if (runtime === undefined) continue
      try {
        if (report.kind === 'event') {
          if (attempt?.dispatch === undefined) throw Object.assign(new Error('attempt unknown here'), { code: 'LOCAL' })
          // Receipts first: an end cannot overtake the chain that opened the attempt.
          if (report.body.type === 'settled' || report.body.type === 'result_proposed') await advanceReceipts(binding, attempt)
          await sendEvent(binding, attempt, report.requestId, report.body)
        } else if (report.kind === 'interrupt') {
          await client.interrupt(runtime, report.requestId, report.reason)
        } else if (report.kind === 'hold') {
          await client.hold(runtime, report.input)
        }
        state.outbox = state.outbox.filter(entry => entry !== report)
        log('report', { kind: report.kind, requestId: report.requestId, type: report.body?.type })
      } catch (error) {
        lost(error)
        // A rejected report (stale binding, a quarantined attempt) is final: the
        // Controller already decided, and sending it again cannot change that.
        if (error?.status >= 400 && error?.status < 500) {
          state.outbox = state.outbox.filter(entry => entry !== report)
          log('report/rejected', { kind: report.kind, requestId: report.requestId, code: error.code, message: error.message })
        } else {
          log('report/retry', { kind: report.kind, requestId: report.requestId, error: String(error?.message ?? error) })
          break
        }
      }
      save()
    }
  }

  async function advanceReceipts(binding, attempt) {
    const dispatch = attempt.dispatch
    for (;;) {
      const step = nextReceipt(dispatch.receipts, { delivered: dispatch.delivered, opened: attempt.opened === true })
      if (step === undefined) return
      await sendEvent(binding, attempt, `${step}-${attempt.attemptId}`, { type: step })
      dispatch.receipts.push(step)
      save()
    }
  }

  function roleHash(roleId) {
    const raw = readFileSync(join(projectRoot, '.agents/dshsquad/roles', roleId, 'role.md'))
    return createHash('sha256').update(raw).digest('hex')
  }

  async function register(key, binding, sessionId) {
    const c = binding.controller
    const previous = c.binding?.session_id
    const out = await client.register({
      host: { profile: HOST_PROFILE, host_id: hostId, bot_id: binding.botId, ...(binding.roomId ? { room_id: binding.roomId } : {}), place: binding.roomId ? 'group-member' : 'chat' },
      agent_id: c.agentId, runtime_id: c.runtimeId, session_id: sessionId, previous_session_id: previous ?? '',
      runtime_token: c.token, mode: 'role', role_id: c.roleId, activity: 'idle',
      capabilities: CAPABILITIES, role_hash: roleHash(c.roleId), available_tools: ['read', 'grep', 'find', 'ls', 'write', 'edit'],
    })
    c.binding = out.binding
    save()
    log('controller/registered', { key, agentId: c.agentId, sessionId, epoch: out.binding.binding_epoch, previous: previous ?? null })
    // The old part's attempt cannot go on in the new Session: the Controller has
    // interrupted it (session_changed); here it only stops being active.
    if (previous !== undefined && previous !== sessionId) {
      for (const attempt of Object.values(state.attempts)) {
        if (attempt.key !== key || ENDED.has(attempt.verdict?.verdict)) continue
        attempt.verdict = { verdict: 'superseded', why: 'a new part Session took over the binding' }
        activeBySession.delete(attempt.sessionId)
        log('verdict', { attemptId: attempt.attemptId, sessionId: attempt.sessionId, ...attempt.verdict })
      }
      save()
    }
  }

  async function takeDispatch(key, binding, dispatch) {
    const a = dispatch.attempt
    const t = dispatch.task
    if (state.attempts[a.attempt_id] !== undefined || state.admissions[a.attempt_id] !== undefined) return
    const sessionId = sessionFor(binding)
    if (sessionId === undefined) return
    const record = {
      ...newAttempt({ attemptId: a.attempt_id, sessionId, fence: a.fencing_token, turn: undefined, pid: process.pid }),
      key, controlled: true, opened: false, allowedTools: a.context?.allowed_tools ?? [],
      taskId: t.task_id, verdict: { verdict: 'dispatched', why: 'received from the Controller' },
      dispatch: { revision: a.revision, segment: a.segment_id, fence: a.fencing_token, epoch: a.controller_epoch, receipts: [], delivered: false, task: t, attempt: a },
    }
    state.attempts[a.attempt_id] = record
    save()
    await advanceReceipts(binding, record)
    // The Controller's fencing token is the fence: only this input opens the attempt.
    binding.fence = a.fencing_token
    state.admissions[a.attempt_id] = { key, fence: a.fencing_token, sessionId, at: new Date().toISOString() }
    save()
    log('admit', { attemptId: a.attempt_id, key, fence: a.fencing_token, sessionId, taskId: t.task_id })
    await deliver(sessionId, `Squad task ${t.task_id}: ${t.goal}`, { kind: 'squad', attemptId: a.attempt_id, fence: a.fencing_token })
    record.dispatch.delivered = true
    save()
    await advanceReceipts(binding, record)
  }

  const lastBeat = new Map()
  const lastRenew = new Map()
  async function tickBinding(key, binding) {
    const c = binding.controller
    const sessionId = sessionFor(binding)
    if (sessionId === undefined) return
    if (c.binding === undefined || c.binding.session_id !== sessionId) await register(key, binding, sessionId)
    const runtime = runtimeOf(binding)
    const active = Object.values(state.attempts).find(attempt => attempt.key === key && attempt.controlled && !ENDED.has(attempt.verdict?.verdict))
    if (Date.now() - (lastBeat.get(key) ?? 0) > HEARTBEAT_MS) {
      try {
        await client.heartbeat(runtime, active === undefined ? 'idle' : 'working')
      } catch (error) {
        // A binding the Controller no longer knows registers again.
        if (error?.code === 'BINDING_CHANGED' || error?.code === 'UNAUTHORIZED') c.binding = undefined
        throw error
      }
      lastBeat.set(key, Date.now())
    }
    if (active !== undefined && active.opened && Date.now() - (lastRenew.get(active.attemptId) ?? 0) > RENEW_MS) {
      enqueue({ kind: 'event', key, attemptId: active.attemptId, requestId: `renew-${active.attemptId}-${Date.now()}`, body: { type: 'renew' } })
      lastRenew.set(active.attemptId, Date.now())
    }
    if (active === undefined) for (const dispatch of await client.dispatches(runtime)) await takeDispatch(key, binding, dispatch)
    else if (active.dispatch !== undefined && active.opened) await advanceReceipts(binding, active).catch(() => {})
  }

  let ticking = false
  async function tick() {
    if (ticking || connect() === undefined) return
    ticking = true
    try {
      await seam.ready()
      for (const [key, binding] of Object.entries(state.bindings)) {
        if (binding.controller === undefined) continue
        try {
          await tickBinding(key, binding)
        } catch (error) {
          lost(error)
          log('controller/error', { key, code: error?.code ?? null, error: String(error?.message ?? error) })
        }
      }
      await flushOutbox()
    } finally {
      ticking = false
    }
  }

  // ---- Host restart ---------------------------------------------------------------
  // Attempts this host did not see end were cut by a restart: their live events are
  // gone, so only the durable log can say how they ended, and an unconfirmed end is
  // unknown (reported as host_restart, never retried by itself).
  for (const [attemptId, attempt] of Object.entries(state.attempts)) {
    if (ENDED.has(attempt.verdict?.verdict) || attempt.pid === process.pid) continue
    if (attempt.turn === undefined) {
      // Dispatched but never opened: nothing reached the model in this binding.
      attempt.verdict = { verdict: 'outcome_unknown', why: 'the host restarted before the attempt opened' }
      attempt.hostChanged = true
      if (attempt.controlled) queueEnd(attempt)
      continue
    }
    judge(attemptId, { type: 'host/restarted' })
    void confirmDurable(attemptId).catch(error => log('error', { where: 'restart-confirm', attemptId, error: String(error) }))
  }
  save()

  // ---- 1. Every step of a managed Session, before DS Bot's own pre-step logic. ------
  function holdInput(key, binding, message, sessionId, entry) {
    const at = new Date().toISOString()
    const text = (message?.content ?? []).map(block => (block.type === 'text' ? block.text : '')).join('\n')
    state.held[entry.id] = { sessionId, key, wake: entry.wake, why: entry.why, at, text: text.slice(0, 16_384) }
    if (binding.controller !== undefined) {
      enqueue({ kind: 'hold', key, requestId: `hold-${entry.id}`, input: { request_id: `hold-${entry.id}`, input_id: entry.id, wake: entry.wake, why: entry.why, text: text.slice(0, 16_384), held_at: at } })
    }
  }

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
    for (const entry of decision.hold) holdInput(key, binding, messages.find(candidate => candidate.id === entry.id), agent.id, entry)
    log('pre-step', {
      sessionId: agent.id, key, owner, turn, step, action: decision.action, reason: decision.reason,
      wakes: messages.map(message => wakeOf(message.source)), kept: decision.keep.length, held: decision.hold,
      ...(decision.reason === 'model_mismatch' ? { route: decision.route, frozen: decision.frozen } : {}),
    })
    if (decision.reason === 'model_mismatch' && active !== undefined) judge(active.attemptId, { type: 'turn/end', turn: active.turn, kind: 'model_mismatch' })
    if (decision.action === 'reject') {
      save()
      setTimeout(() => void rewake(agent).catch(error => log('error', { where: 'rewake', sessionId: agent.id, error: String(error) })), 0)
      return { kind: 'reject' }
    }
    if (decision.opens !== undefined) {
      const { attemptId, fence } = decision.opens
      const previous = state.attempts[attemptId]
      state.attempts[attemptId] = {
        ...newAttempt({ attemptId, sessionId: agent.id, fence, turn, pid: process.pid }),
        ...(previous?.controlled ? { controlled: true, allowedTools: previous.allowedTools, taskId: previous.taskId, dispatch: previous.dispatch } : {}),
        key, opened: true, verdict: { verdict: 'running', why: 'opened' },
      }
      delete state.admissions[attemptId]
      activeBySession.set(agent.id, attemptId)
      const section = sectionFor(agent.id)
      state.attempts[attemptId].contextHash = section === '' ? null : contextHash(section)
      save()
      log('attempt/open', { attemptId, sessionId: agent.id, key, turn, fence, contextHash: state.attempts[attemptId].contextHash })
      setTimeout(() => void tick().catch(() => {}), 0)
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
    for (let tries = 0; tries < 50 && agent.status === 'running'; tries += 1) await new Promise(resolve => setTimeout(resolve, 100))
    const pending = [...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])]
    if (pending.length === 0 || agent.status === 'running') return
    for (const message of pending) agent.inbox.remove(message.id)
    for (const message of pending) agent.followup(message)
    await ctx.sessions.flush(agent.session)
    log('rewake', { sessionId: agent.id, count: pending.length, wakes: pending.map(message => wakeOf(message.source)) })
  }

  // ---- 2. Work DS Bot would start on its own after a restart. ------------------------
  function allows(sessionId, what, detail) {
    const { key, binding } = bindingOf(sessionId)
    if (binding === undefined) return true
    const allowed = binding.policy?.allowResume === true
    log('self-start', { sessionId, key, what, allowed, detail })
    return allowed
  }

  ctx.effect(() => seam.attachGate({ preStep, allows }), 'squad-adapter: seam')

  ctx.on('agent/created', async ({ agent, source }) => {
    await seam.ready()
    const owner = seam.ownerOf(agent.id)
    log('agent/created', { sessionId: agent.id, source, owner: owner ?? null })
    return undefined
  })

  // ---- 3. Judge facts and the step audit, from the Session event log. ----------------
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
        setTimeout(() => void confirmDurable(attemptId, session).catch(error => log('error', { where: 'confirm', attemptId, error: String(error) })), 0)
        break
      }
      default: break
    }
  })

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

  // The tool guard: no tool outside an admitted attempt in a managed Session, and inside
  // one only what its contract allows. Guards are monotonic, so no later listener can
  // turn a denial back into permission.
  ctx.tools.guard((exec) => {
    const sessionId = exec?.agent?.id
    const { binding } = bindingOf(sessionId)
    const why = refusal(exec?.name, binding === undefined ? undefined : attemptOf(sessionId), binding !== undefined)
    if (why !== undefined) log('tool-guard', { sessionId, tool: exec?.name, managed: binding !== undefined })
    return why
  })

  // ---- 5. The frozen route, again at request time. ----------------------------------
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

  // ---- Task context (M1-5) ----------------------------------------------------------
  function sectionFor(sessionId) {
    const attempt = attemptOf(sessionId) ?? Object.values(state.attempts).find(candidate => candidate.sessionId === sessionId && candidate.controlled && !ENDED.has(candidate.verdict?.verdict))
    return attempt?.dispatch === undefined ? '' : taskSection({ task: attempt.dispatch.task, attempt: attempt.dispatch.attempt })
  }
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'squad-task',
    order: 650,
    interpolate: false,
    text: context => sectionFor(context?.agent?.id),
  }), 'squad-adapter: task section')

  // ---- Task tools (M1-4) ------------------------------------------------------------
  const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }
  const toolContext = (exec) => {
    const sessionId = exec?.agent?.id
    const attempt = attemptOf(sessionId)
    const { key, binding } = bindingOf(sessionId)
    if (attempt === undefined || binding === undefined) return { error: 'Squad task tools work only in a Squad task.' }
    if (!attempt.controlled || binding.controller === undefined || connect() === undefined) return { error: 'This task has no Controller to report to.' }
    return { attempt, binding, key, runtime: runtimeOf(binding) }
  }
  const failure = error => `Refused by the Controller: ${error?.code ?? ''} ${error?.message ?? error}`.trim()
  const tools = [
    {
      name: 'squad_task',
      description: 'Read your current Squad task: its goal, acceptance criteria and the results of the tasks it builds on.',
      parameters: {},
      async run({ attempt, runtime }) {
        const t = attempt.dispatch.task
        const lines = [`task ${t.task_id} (${t.kind}): ${t.goal}`]
        if (t.acceptance_criteria) lines.push(`acceptance: ${JSON.stringify(t.acceptance_criteria)}`)
        for (const ref of t.refs ?? []) {
          const input = await client.task(runtime, ref.task_id).catch(error => ({ error }))
          lines.push(input.error ? `input ${ref.task_id}: unavailable (${input.error.code ?? input.error})` : `input ${ref.task_id} (revision ${input.result?.revision}): ${JSON.stringify(input.result?.value ?? null)}`)
        }
        return lines.join('\n')
      },
    },
    {
      name: 'squad_submit_result',
      description: 'Submit the result of your Squad task. Give a JSON object when the task asks for one, otherwise your answer as text. Call it once, at the end; the task is finished only when this is accepted.',
      parameters: { result: { type: 'string', required: true, description: 'The result: a JSON object, or plain text' } },
      async run({ attempt, binding }, args) {
        const value = resultValue(args.result)
        if (value === undefined) return 'Write a result first.'
        const t = attempt.dispatch.task
        await advanceReceipts(binding, attempt)
        await sendEvent(binding, attempt, `result-${attempt.attemptId}`, { type: 'result_proposed', result: { revision: 0, goal_revision: t.applied_revision, attempt_id: '', agent_id: '', value, artifacts: [], refs: [], hash: '' } })
        save()
        return 'Result recorded. End your turn now; the task is reviewed after it settles.'
      },
    },
    {
      name: 'squad_yield',
      description: 'Pause your Squad task until the tasks it depends on (for example one you delegated) report back. End your turn right after.',
      parameters: { reason: { type: 'string', description: 'What you wait for' } },
      async run({ attempt, binding }) {
        await sendEvent(binding, attempt, `yield-${attempt.attemptId}-${attempt.dispatch.segment}`, { type: 'yield' })
        save()
        return 'Paused. End your turn; you continue in this task when the results arrive.'
      },
    },
    {
      name: 'squad_delegate',
      description: 'Hand part of your Squad task to another role as a child task. Its result comes back to this task; you cannot finish before it does.',
      parameters: {
        role: { type: 'string', required: true, description: 'The role (or agent) that does the child task' },
        goal: { type: 'string', required: true, description: 'A self-contained goal for the child task' },
      },
      async run({ attempt, runtime }, args) {
        const t = attempt.dispatch.task
        const current = await client.task(runtime, t.task_id)
        const child = await client.createChild(runtime, t.task_id, { request_id: `child-${attempt.attemptId}-${contextHash(`${args.role}\n${args.goal}`).slice(0, 16)}`, target: String(args.role), goal: String(args.goal), kind: 'execute', write_set: [], dependencies: [], refs: [], expected_revision: current.revision })
        return `Child task ${child.task_id} created for ${args.role}. Call squad_yield and end your turn to wait for it.`
      },
    },
    {
      name: 'squad_clarify',
      description: 'Ask the task that delegated yours a question you cannot go on without. End your turn after asking.',
      parameters: { question: { type: 'string', required: true, description: 'The question' } },
      async run({ attempt, runtime }, args) {
        const out = await client.clarify(runtime, attempt.attemptId, { request_id: `clarify-${attempt.attemptId}-${contextHash(String(args.question)).slice(0, 16)}`, expected_revision: attempt.dispatch.revision, question: String(args.question) })
        attempt.dispatch.revision = out.revision
        save()
        return 'Question sent. End your turn; the answer comes back into this task.'
      },
    },
  ]
  if (typeof seam.defineTool === 'function') {
    for (const tool of tools) {
      if (!TASK_TOOLS.includes(tool.name)) continue
      ctx.tools.register(seam.defineTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        output,
        async execute(args, exec) {
          const found = toolContext(exec)
          if (found.error) return found.error
          try {
            const text = await tool.run(found, args ?? {})
            log('task-tool', { tool: tool.name, attemptId: found.attempt.attemptId })
            return text
          } catch (error) {
            lost(error)
            log('task-tool/refused', { tool: tool.name, attemptId: found.attempt.attemptId, code: error?.code ?? null, error: String(error?.message ?? error) })
            return failure(error)
          }
        },
      }))
    }
  }

  // ---- The operator entry and the Controller stand-in --------------------------------
  const deliver = async (sessionId, text, source) => {
    const agent = await seam.resolveAgent(sessionId)
    agent.followup(seam.createMessage({ text, source }))
    await ctx.sessions.flush(agent.session)
  }
  const keyOf = body => bindingKey({ botId: body.botId, roomId: body.roomId, place: body.roomId ? 'group-member' : 'chat' })
  async function handle(endpoint, body = {}) {
    switch (endpoint) {
      // Managing a place; with agentId and roleId it becomes a Controller runtime.
      case 'manage': {
        const key = keyOf(body)
        const previous = state.bindings[key]
        const controller = body.agentId === undefined ? undefined
          : { agentId: body.agentId, roleId: body.roleId, runtimeId: previous?.controller?.runtimeId ?? randomUUID(), token: previous?.controller?.token ?? `${randomUUID()}${randomUUID()}`, binding: previous?.controller?.binding }
        state.bindings[key] = { botId: body.botId, ...(body.roomId ? { roomId: body.roomId } : {}), fence: previous?.fence ?? 0, ...(body.frozen ? { frozen: body.frozen } : {}), policy: body.policy ?? {}, ...(controller ? { controller } : {}) }
        save()
        log('manage', { key, botId: body.botId, roomId: body.roomId ?? null, agentId: body.agentId ?? null, roleId: body.roleId ?? null, frozen: body.frozen ?? null })
        setTimeout(() => void tick().catch(() => {}), 0)
        return { key, binding: { ...state.bindings[key], controller: controller ? { agentId: controller.agentId, roleId: controller.roleId } : undefined } }
      }
      case 'unmanage': {
        const key = keyOf(body)
        delete state.bindings[key]
        save()
        return { key }
      }
      // The stand-in: only for places without a Controller runtime.
      case 'admit': {
        const key = keyOf(body)
        const binding = state.bindings[key]
        if (binding === undefined) throw new Error(`not managed: ${key}`)
        if (binding.controller !== undefined) throw new Error('this place takes work from its Controller')
        binding.fence += 1
        const sessionId = sessionFor(body)
        if (sessionId === undefined) throw new Error(`no Session for ${key}`)
        state.admissions[body.attemptId] = { key, fence: binding.fence, sessionId, at: new Date().toISOString() }
        save()
        log('admit', { attemptId: body.attemptId, key, fence: binding.fence, sessionId })
        await deliver(sessionId, String(body.text), { kind: 'squad', attemptId: body.attemptId, fence: binding.fence })
        return { attemptId: body.attemptId, fence: binding.fence, sessionId }
      }
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
          bindings: Object.fromEntries(Object.entries(state.bindings).map(([key, binding]) => [key, { ...binding, controller: binding.controller ? { agentId: binding.controller.agentId, roleId: binding.controller.roleId, binding: binding.controller.binding } : undefined }])),
          attempts: Object.fromEntries(Object.entries(state.attempts).map(([id, attempt]) => [id, { sessionId: attempt.sessionId, turn: attempt.turn, verdict: attempt.verdict, controlled: attempt.controlled === true, taskId: attempt.taskId, receipts: attempt.dispatch?.receipts, contextHash: attempt.contextHash }])),
          active: Object.fromEntries(activeBySession),
          held: Object.entries(state.held).map(([id, entry]) => ({ id, sessionId: entry.sessionId, wake: entry.wake, why: entry.why, at: entry.at })),
          outbox: state.outbox.map(entry => ({ kind: entry.kind, requestId: entry.requestId })),
          controller: projectRoot === undefined ? null : { projectRoot, connected: client !== undefined },
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
  }), 'squad-adapter: route')

  if (projectRoot !== undefined) {
    ctx.effect(() => {
      const timer = setInterval(() => void tick().catch(error => log('error', { where: 'tick', error: String(error) })), TICK_MS)
      timer.unref?.()
      return () => clearInterval(timer)
    }, 'squad-adapter: controller loop')
  }
  log('adapter/start', { dshHome, projectRoot: projectRoot ?? null, hostId, attempts: Object.keys(state.attempts).length, bindings: Object.keys(state.bindings).length })
}
