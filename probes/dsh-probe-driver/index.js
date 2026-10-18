// dsh-squad-probe-driver: a test-only route for the P0 bench. ds-bot puts every Bot
// Session on the standard preset, so nested (PTC) tool calls never occur there; this
// route makes a plain DSH Session on another preset and prompts it, so the probe can
// record what a nested call looks like. It is mounted only by probes/bench.sh.
import { randomUUID } from 'node:crypto'

export const name = 'dsh-squad-probe-driver'
export const inject = ['sessionController', 'connection']

const ROUTE = '/api/squad-probe-driver'

export function apply(ctx) {
  const presets = async () => (await ctx.get?.('agentPresets')?.list?.()) ?? []
  const handle = async (endpoint, body = {}) => {
    switch (endpoint) {
      case 'presets':
        return (await presets()).map(preset => ({ id: preset.id, name: preset.name, broken: preset.broken !== undefined }))
      case 'create': {
        const { sessionId } = await ctx.sessionController.create({ cwd: String(body.cwd), ...(body.agentPreset ? { agentPreset: String(body.agentPreset) } : {}) })
        return { sessionId }
      }
      case 'send':
        await ctx.sessionController.prompt({ requestId: randomUUID(), sessionId: String(body.sessionId), mode: 'queue', content: [{ type: 'text', text: String(body.text) }] }, AbortSignal.timeout(30_000))
        return true
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
  }), 'squad-probe-driver: route')
}
