// dsh-squad-probe: an observe-only DSH plugin for the P0 phase of the DS Bot + Squad
// migration. It records the agent, inbox, tool, model-request and session events that a
// Squad adapter would have to gate, one JSON object per line, so the order of the events
// in each scenario can be read back later.
//
// It never changes behavior: emit/serial listeners only record; every waterfall listener
// returns exactly what next() returned (or rethrows what it threw). Waterfalls are
// registered with `prepend` so the probe sees a step even when an inner listener (such as
// ds-bot's parts.js) rejects it without calling next().
//
// Output: $DSH_PROBE_OUT, else $DSH_HOME/probe/events.jsonl.
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'

export const name = 'dsh-squad-probe'
export const inject = []

const TEXT_MAX = 160
const SKIP_KEYS = new Set(['agent', 'session', 'signal', 'ctx', 'runtime', 'registry', 'scope', 'parent', 'store'])

// A bounded, cycle-safe summary of an unknown value: shapes are recorded, bulk is not.
export function brief(value, depth = 2, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.length > TEXT_MAX ? `${value.slice(0, TEXT_MAX)}…(${value.length})` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function') return '[fn]'
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[cycle]'
  seen.add(value)
  if (value instanceof Error) return { error: value.name, message: brief(value.message), code: value.code }
  if (value instanceof Uint8Array) return `[bytes ${value.length}]`
  if (Array.isArray(value)) {
    if (depth <= 0) return `[array ${value.length}]`
    const items = value.slice(0, 8).map(item => brief(item, depth - 1, seen))
    return value.length > 8 ? [...items, `…+${value.length - 8}`] : items
  }
  if (depth <= 0) return `[object ${Object.keys(value).slice(0, 6).join(',')}]`
  const out = {}
  for (const [key, item] of Object.entries(value).slice(0, 24)) {
    out[key] = SKIP_KEYS.has(key) ? '[skipped]' : brief(item, depth - 1, seen)
  }
  return out
}

const textOf = content => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.map(block => (block?.type === 'text' ? block.text : `[${block?.type}]`)).join('\n') : '')

// What a user-role message is: its id, where it came from, and the start of its text.
export function messageSummary(message) {
  if (message === undefined || message === null) return undefined
  const text = textOf(message.content)
  return {
    id: message.id,
    role: message.role,
    source: brief(message.source, 1),
    text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…(${text.length})` : text,
  }
}

export function apply(ctx, config = {}) {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const out = config.out ?? process.env.DSH_PROBE_OUT ?? join(dshHome, 'probe', 'events.jsonl')
  mkdirSync(dirname(out), { recursive: true })
  let seq = 0

  // DS Bot keeps the Bot <-> Session map in its private runtime; the only way an outside
  // plugin can name a Session's Bot is to read the plugin's state file. That is the seam
  // gap the report calls H2, recorded here on purpose.
  const statePath = join(dshHome, 'bot', 'state.json')
  let owners = new Map()
  let ownersAt = 0
  let ownersMtime = 0
  const ownerOf = (sessionId) => {
    if (typeof sessionId !== 'string') return undefined
    const now = Date.now()
    if (now - ownersAt > 500) {
      ownersAt = now
      try {
        const mtime = statSync(statePath).mtimeMs
        if (mtime !== ownersMtime) {
          ownersMtime = mtime
          const state = JSON.parse(readFileSync(statePath, 'utf8'))
          const next = new Map()
          for (const bot of Object.values(state.bots ?? {})) {
            // A Bot's first chat part is the Session whose id is the Bot's id.
            next.set(bot.id, { bot: bot.name, place: bot.sessionId && bot.sessionId !== bot.id ? 'chat-part' : 'chat' })
            if (bot.sessionId) next.set(bot.sessionId, { bot: bot.name, place: 'chat' })
            for (const part of bot.segments ?? []) if (part.sessionId) next.set(part.sessionId, { bot: bot.name, place: 'chat-part' })
          }
          for (const room of Object.values(state.rooms ?? {})) {
            next.set(room.id, { room: room.name, place: 'group-own' })
            for (const [botId, sessionIdOf] of Object.entries(room.sessions ?? {})) {
              next.set(sessionIdOf, { bot: state.bots?.[botId]?.name ?? botId, room: room.name, place: 'group-member' })
            }
          }
          owners = next
        }
      } catch {
        // No state yet (first start) or a write in progress: keep the last map.
      }
    }
    return owners.get(sessionId)
  }

  const record = (event, sessionId, data) => {
    const line = {
      seq: ++seq,
      ts: new Date().toISOString(),
      mono: Math.round(performance.now()),
      pid: process.pid,
      event,
      ...(sessionId ? { session: sessionId, owner: ownerOf(sessionId) } : {}),
      ...data,
    }
    try {
      appendFileSync(out, `${JSON.stringify(line)}\n`)
    } catch {
      // The probe must never break the host.
    }
  }
  const agentId = agent => agent?.id ?? agent?.session?.id
  const execSession = exec => agentId(exec?.agent) ?? exec?.sessionId
  const execSummary = exec => ({
    tool: exec?.name,
    call: exec?.callId ?? exec?.id ?? exec?.toolCallId,
    // DSH names the outermost call of a nested (PTC) call `rootCallId`.
    parentCall: exec?.rootCallId !== exec?.callId ? exec?.rootCallId : undefined,
    args: brief(exec?.args ?? exec?.arguments ?? exec?.input, 1),
    keys: Object.keys(exec ?? {}).filter(key => !SKIP_KEYS.has(key)).slice(0, 20),
  })
  // Waterfall wrapper: record the call, pass it on untouched, record the outcome.
  const around = (event, sessionOf, before, after) => async (...args) => {
    const next = args.at(-1)
    const started = performance.now()
    record(`${event}:in`, sessionOf(...args), before(...args))
    try {
      const result = await next()
      record(`${event}:out`, sessionOf(...args), { ms: Math.round(performance.now() - started), ...after(result, ...args) })
      return result
    } catch (error) {
      record(`${event}:throw`, sessionOf(...args), { ms: Math.round(performance.now() - started), error: brief(error) })
      throw error
    }
  }

  record('probe/start', undefined, { out, dshHome, node: process.version })
  ctx.effect?.(() => () => record('probe/stop', undefined, {}), 'squad-probe: lifecycle')

  // Agent lifecycle.
  const idleWatch = new WeakSet()
  ctx.on('agent/created', ({ agent, source }) => {
    record('agent/created', agentId(agent), { source: brief(source, 1), status: brief(agent?.status, 1) })
    return undefined
  })
  ctx.on('agent/disposed', ({ agent }) => record('agent/disposed', agentId(agent), {}))
  ctx.on('agent/status', ({ agent, status }) => {
    record('agent/status', agentId(agent), { status: brief(status, 1) })
    // When does whenIdle() resolve, compared with status and turn-stopping? Never awaited.
    if (agent !== undefined && !idleWatch.has(agent) && typeof agent.whenIdle === 'function') {
      idleWatch.add(agent)
      const id = agentId(agent)
      const started = performance.now()
      Promise.resolve().then(() => agent.whenIdle()).then(
        () => { idleWatch.delete(agent); record('probe/when-idle', id, { waitedMs: Math.round(performance.now() - started) }) },
        error => { idleWatch.delete(agent); record('probe/when-idle-error', id, { error: brief(error) }) },
      )
    }
  })
  ctx.on('agent/error', ({ agent, turn, step, error }) => record('agent/error', agentId(agent), { turn, step, error: brief(error) }))
  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    record('agent/turn-stopping', agentId(agent), {
      turn,
      inbox: { nextStep: agent?.inbox?.nextStep?.length, nextTurn: agent?.inbox?.nextTurn?.length },
    })
  })
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    // Chunks are presentation data; only the attempt boundaries are kept.
    if (frame?.kind === 'chunk' || frame?.type === 'chunk') return
    record('agent/assistant-stream', agentId(agent), { frame: brief(frame, 1) })
  })

  // Inbox: every message that can wake a model.
  ctx.on('agent/inbox/inserted', ({ agent, message }) => record('agent/inbox/inserted', agentId(agent), { message: messageSummary(message) }))
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => record('agent/inbox/claimed', agentId(agent), { turn, message: messageSummary(message) }))
  ctx.on('agent/inbox/discarded', ({ agent, message }) => record('agent/inbox/discarded', agentId(agent), { message: messageSummary(message) }))

  // Step admission, model route and request errors.
  ctx.on('agent/pre-step', around('agent/pre-step', ({ agent }) => agentId(agent),
    ({ turn, step, messages }) => ({ turn, step, messages: (messages ?? []).map(messageSummary) }),
    decision => ({ decision: decision?.kind, entered: decision?.messages?.length, startsRequestSeries: decision?.startsRequestSeries })), { prepend: true })
  ctx.on('agent/request', around('agent/request', ({ agent }) => agentId(agent),
    ({ turn, step }) => ({ turn, step }),
    config => ({ route: brief({ provider: config?.provider, model: config?.model, effort: config?.effort ?? config?.reasoningEffort, keys: Object.keys(config ?? {}) }, 2) })), { prepend: true })
  ctx.on('agent/request-error', around('agent/request-error', ({ agent }) => agentId(agent),
    ({ turn, step, provider, failure }) => ({ turn, step, provider, failure: brief(failure, 1) }),
    action => ({ action: brief(action, 1) })), { prepend: true })
  ctx.on('llm/stream', (options, next) => {
    // The stream itself is passed through untouched; only who asked is recorded. ds-bot
    // synthesizes the group relay here, so a group's own Session shows up as a call.
    record('llm/stream', options?.sessionId, { purpose: options?.purpose, provider: options?.provider, model: options?.model, messages: options?.messages?.length, tools: options?.tools?.length })
    return next()
  }, { prepend: true })

  // Tools: decision, real dispatch, result.
  ctx.on('tools/pre-execute', around('tools/pre-execute', exec => execSession(exec), exec => execSummary(exec),
    decision => ({ decision: brief(decision, 1) })), { prepend: true })
  ctx.on('tools/execute', around('tools/execute', exec => execSession(exec), exec => ({ tool: exec?.name, call: execSummary(exec).call, parentCall: execSummary(exec).parentCall }),
    result => ({ isError: result?.isError, keys: Object.keys(result ?? {}).slice(0, 10) })), { prepend: true })
  ctx.on('tools/result', (exec, result) => {
    record('tools/result', execSession(exec), { tool: exec?.name, call: execSummary(exec).call, isError: result?.isError, outcome: brief(result?.outcome ?? result?.status, 1) })
    return undefined
  })
  ctx.on('approval/request', around('approval/request', req => agentId(req?.agent) ?? req?.sessionId,
    req => ({ request: brief(req, 1) }), outcome => ({ outcome: brief(outcome, 1) })), { prepend: true })

  // Sessions: the durable log every live event ends up in.
  ctx.on('session/created', session => record('session/created', session?.id, { header: brief(session?.header, 1) }))
  ctx.on('session/disposed', session => record('session/disposed', session?.id, {}))
  ctx.on('session/event', (session, event) => {
    const data = event?.data
    record('session/event', session?.id, {
      type: event?.type,
      eventSeq: event?.seq,
      ...(data?.source ? { source: brief(data.source, 1) } : {}),
      ...(event?.type === 'user/message' ? { text: messageSummary(data)?.text } : {}),
      data: brief(data, 1),
    })
  })
}
