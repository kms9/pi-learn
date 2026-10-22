// squad/3 client: what the adapter says to the Controller. Every runtime (one managed
// Bot place) speaks with its own credential and its exact binding; the Controller
// rejects a stale one. No retries here: the caller decides, and a write whose answer
// was lost is looked up again by request_id (the Controller is idempotent on it).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROTOCOL = 'squad/3'

export class ControllerError extends Error {
  constructor(status, body) {
    super(`${body?.code ?? status}: ${body?.message ?? 'request failed'}`)
    this.status = status
    this.code = body?.code ?? String(status)
    this.details = body?.details
  }
}

/** The running Controller of a project, from the discovery file `serve` publishes. */
export function discover(projectRoot) {
  const d = JSON.parse(readFileSync(join(projectRoot, '.agents/dshsquad/.runtime/controller.json'), 'utf8'))
  if (d.protocol_version !== PROTOCOL) throw new Error(`Controller speaks ${d.protocol_version}, not ${PROTOCOL}`)
  return { endpoint: String(d.endpoint).replace(/\/$/, ''), controllerId: d.controller_id, epoch: d.controller_epoch }
}

export function createClient({ endpoint, controllerId, fetch = globalThis.fetch, timeoutMs = 10_000 }) {
  async function call(method, path, { body, runtime, operator } = {}) {
    const headers = { accept: 'application/json', 'x-squad-protocol': PROTOCOL, 'x-squad-controller': controllerId }
    if (body !== undefined) headers['content-type'] = 'application/json'
    // The operator credential stays on this host; the browser never sees it (X-3).
    if (operator !== undefined) headers.authorization = `Bearer ${operator}`
    if (runtime !== undefined) {
      headers.authorization = `Bearer ${runtime.token}`
      headers['x-squad-agent'] = runtime.binding.agent_id
      headers['x-squad-binding'] = JSON.stringify(runtime.binding)
    }
    const response = await fetch(`${endpoint}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    let parsed
    try { parsed = await response.json() } catch { parsed = undefined }
    if (!response.ok) throw new ControllerError(response.status, parsed)
    return parsed
  }
  return {
    call,
    health: () => call('GET', '/health'),
    register: body => call('POST', '/v2/agents/register', { body }),
    heartbeat: (runtime, activity, extra = {}) => call('POST', '/v2/agents/heartbeat', { runtime, body: { binding: runtime.binding, activity, underlying_activity: activity, ...extra } }),
    dispatches: runtime => call('GET', '/v2/dispatches', { runtime }).then(out => out?.dispatches ?? []),
    attemptEvent: (runtime, attemptId, body) => call('POST', `/v2/attempts/${encodeURIComponent(attemptId)}/events`, { runtime, body }),
    interrupt: (runtime, requestId, reason) => call('POST', '/v2/agents/interruption', { runtime, body: { request_id: requestId, binding: runtime.binding, reason } }),
    hold: (runtime, input) => call('POST', '/v2/agents/held-inputs', { runtime, body: { ...input, binding: runtime.binding } }),
    task: (runtime, taskId) => call('GET', `/v2/tasks/${encodeURIComponent(taskId)}`, { runtime }),
    createChild: (runtime, parentId, body) => call('POST', `/v2/tasks/${encodeURIComponent(parentId)}/children`, { runtime, body }),
    snapshot: () => call('GET', '/v2/snapshot'),
    run: (runtime, runId) => call('GET', `/v2/runs/${encodeURIComponent(runId)}`, { runtime }),
    decide: (runtime, runId, body) => call('POST', `/v2/runs/${encodeURIComponent(runId)}/decisions`, { runtime, body }),
    uploadArtifact: (runtime, body) => call('POST', '/v2/artifacts', { runtime, body }),
    clarify: (runtime, attemptId, body) => call('POST', `/v2/attempts/${encodeURIComponent(attemptId)}/clarify`, { runtime, body }),
  }
}
