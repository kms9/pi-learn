// A front for ds-bot's scripted mock (dev/mock-llm.mjs): requests from a Session that
// runs a Squad task (its system prompt has the "# Squad task" section; DSH sends the
// prompt in the messages as well as in `system`) are answered
// here, everything else is passed on to the ds-bot mock unchanged.
//
//   MOCK_PORT=<front> MOCK_INNER_PORT=<ds-bot mock> node probes/squad-mock.mjs
//
// A Squad turn, by words in the task goal:
//   (default)  squad_task, then squad_submit_result {"answer":"done: <goal>"}, then a line
//   不提交      says it is done in text, never submits (a missing result)
//   用bash      tries bash first (the tool guard must refuse it), then submits as usual
//   慢 N        waits N seconds before each answer
//   派给 角色    squad_delegate to that role, then squad_yield (the parent waits)
//   首版请退回   the result carries this phrase, and a review rejects a candidate with it
//   课件         the result hands in lesson.html as a file
// A Leader step decides from the "## Run status" summary the adapter writes: complete,
// a rework of each rejected task, or wait. A review reads its inputs (squad_task) and
// gives squad_review: rejected when an input says 首版请退回, else accepted.
// The log (MOCK_LOG) gets one line per Squad answer: {t, squad:true, task, step, tool}.
import { createServer, request as httpRequest } from 'node:http'
import { appendFileSync } from 'node:fs'

const PORT = Number(process.env.MOCK_PORT ?? 8765)
const INNER = Number(process.env.MOCK_INNER_PORT ?? PORT + 1000)
const LOG = process.env.MOCK_LOG
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 300)

const textOf = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.map(block => (block.type === 'text' ? block.text : '')).join('\n') : ''
const systemText = system => typeof system === 'string' ? system
  : Array.isArray(system) ? system.map(block => block.text ?? '').join('\n') : ''

function sse(res, payload) {
  res.write(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`)
}

// The task this turn works on, and the tool calls it already made since the task input.
export function squadTurn(body) {
  const messages = body.messages ?? []
  const prompt = [systemText(body.system), ...messages.map(message => textOf(message.content))].join('\n')
  if (!/^# Squad task$/m.test(prompt)) return undefined
  let start = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user' && /Squad task (task-[0-9a-f]+): /.test(textOf(messages[i].content))) { start = i; break }
  }
  if (start < 0) return undefined
  const [, taskId, goal] = textOf(messages[start].content).match(/Squad task (task-[0-9a-f]+): ([\s\S]*)/)
  const calls = []
  const results = []
  for (const message of messages.slice(start + 1)) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type === 'tool_use') calls.push(block.name)
      if (block.type === 'tool_result') results.push(typeof block.content === 'string' ? block.content : textOf(block.content))
    }
  }
  // DSH keeps earlier copies of the system prompt in the history: the last one is current.
  const last = (pattern) => [...prompt.matchAll(pattern)].at(-1)?.[1]
  const kind = last(/^- task: task-[0-9a-f]+ \((\w+)\)/gm) ?? 'execute'
  const summary = last(/^- summary: (.*)$/gm) ?? ''
  return { taskId, goal: goal.trim(), calls, kind, summary, results: results.join('\n') }
}

export function plan({ goal = '', calls, kind = 'execute', summary = '', results = '' }) {
  const tool = (name, input) => [{ type: 'tool_use', name, input }]
  const done = name => calls.includes(name)
  if (kind === 'leader_step') {
    if (done('squad_decide')) return [{ type: 'text', text: '已决定。' }]
    if (/complete the Run/.test(summary)) return tool('squad_decide', { action: 'complete', note: 'all accepted' })
    const rejected = [...summary.matchAll(/(task-[0-9a-f]+) \(role ([a-z][a-z0-9-]*)\)/g)]
    if (rejected.length > 0) {
      const tasks = rejected.map(([, taskId, role]) => ({ id: `rework-${taskId.slice(5, 17)}`, role_ref: role, kind: 'rework', rework_of: taskId, goal: '返工：按审查意见修改课件后重新提交', depends_on: [] }))
      return tool('squad_decide', { action: 'dispatch', note: 'rework rejected work', tasks: JSON.stringify(tasks) })
    }
    return tool('squad_decide', { action: 'wait', note: 'tasks still running' })
  }
  if (kind === 'review') {
    if (!done('squad_task')) return tool('squad_task', {})
    if (!done('squad_review')) return tool('squad_review', /首版请退回/.test(results) ? { decision: 'rejected', reason: '首版不达标：请补充例题后重交' } : { decision: 'accepted', reason: '内容完整，符合要求' })
    return [{ type: 'text', text: '审查完成。' }]
  }
  if (/不提交/.test(goal)) return [{ type: 'text', text: '任务已完成。' }]
  const delegate = goal.match(/派给\s*([a-z][a-z0-9-]*)/)
  if (delegate !== null) {
    if (!done('squad_delegate')) return tool('squad_delegate', { role: delegate[1], goal: `子任务：${goal}` })
    if (!done('squad_yield')) return tool('squad_yield', { reason: 'waiting for the child' })
    return [{ type: 'text', text: '等待子任务。' }]
  }
  if (/用bash/.test(goal) && !done('bash')) return tool('bash', { command: 'ls' })
  if (!done('squad_task')) return tool('squad_task', {})
  if (!done('squad_submit_result')) {
    const answer = { answer: `done: ${goal}` }
    // Courseware hands in a page as a file, kept by the Controller (D8).
    if (/课件/.test(goal)) return tool('squad_submit_result', { result: JSON.stringify(answer), file_name: 'lesson.html', file_type: 'text/html', file_content: `<!doctype html><meta charset="utf-8"><title>分数</title><h1>认识分数</h1><p>${goal}</p><script>document.title += ' ✓'</script>` })
    return tool('squad_submit_result', { result: JSON.stringify(answer) })
  }
  return [{ type: 'text', text: '结果已提交。' }]
}

function answer(res, body, out) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const id = `squad-${Date.now()}`
  sse(res, { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: body.model ?? 'mock', content: [], usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0 } } })
  out.forEach((block, index) => {
    if (block.type === 'text') {
      sse(res, { type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      sse(res, { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    } else {
      sse(res, { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `call-${id}-${index}`, name: block.name, input: {} } })
      sse(res, { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    }
    sse(res, { type: 'content_block_stop', index })
  })
  const usedTool = out.some(block => block.type === 'tool_use')
  sse(res, { type: 'message_delta', delta: { stop_reason: usedTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
  sse(res, { type: 'message_stop' })
  res.end()
}

function forward(req, res, raw) {
  const upstream = httpRequest({ host: '127.0.0.1', port: INNER, method: req.method, path: req.url, headers: req.headers }, (reply) => {
    res.writeHead(reply.statusCode ?? 502, reply.headers)
    reply.pipe(res)
  })
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `squad-mock: inner mock unavailable: ${error.message}` } }))
  })
  upstream.end(raw)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const server = createServer((req, res) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      let body
      try { body = JSON.parse(raw) } catch { body = undefined }
      const turn = body !== undefined && req.url.endsWith('/v1/messages') && body.stream === true ? squadTurn(body) : undefined
      if (turn === undefined) return forward(req, res, raw)
      const out = plan(turn)
      const slow = Number(turn.goal.match(/慢\s*(\d+)/)?.[1] ?? 0) * 1000
      if (LOG) appendFileSync(LOG, `${JSON.stringify({ t: new Date().toISOString(), squad: true, task: turn.taskId, step: turn.calls.length + 1, tool: out.find(block => block.type === 'tool_use')?.name ?? null, model: body.model ?? null })}\n`)
      setTimeout(() => answer(res, body, out), DELAY + slow)
    })
  })
  server.listen(PORT, '127.0.0.1', () => console.log(`squad mock on http://127.0.0.1:${PORT}/v1 (inner ${INNER})`))
}
