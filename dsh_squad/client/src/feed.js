// Keeps the page's copy of the Controller's state current (M3-1): read the snapshot,
// then follow the event cursor; read the snapshot again whenever events move past it,
// skip ahead (a gap), come from a restarted Controller, or the connection drops.
import { call } from './api.js'
import { acceptSnapshot, lost, readEvents } from './projection.js'
import { store } from './store.js'

let timer = null
let running = false

async function refresh() {
  const view = await call('view')
  store.set(state => (view.connected === false
    ? { ...state, connected: false }
    : { ...state, connected: true, projection: acceptSnapshot(state.projection, view.snapshot), teams: view.teams ?? {}, approvals: view.approvals ?? [], previewBase: view.previewBase, errors: view.errors ?? [] }))
}

async function step() {
  const { projection } = store.get()
  try {
    if (projection.stale || projection.snapshot === null) return await refresh()
    const page = await call('events', { after: projection.revision })
    if (page?.connected === false) return store.set(state => ({ ...state, connected: false }))
    if (readEvents(projection, page).resnapshot) await refresh()
  } catch (error) {
    store.set(state => ({ ...state, projection: lost(state.projection, error) }))
  }
}

export const refreshNow = () => step().catch(() => {}).then(() => refresh().catch(() => {}))

export function startFeed() {
  if (running) return () => {}
  running = true
  const loop = async () => {
    await step()
    // Faster while the page is open; slow when only the group strip is watching.
    timer = setTimeout(loop, store.get().open ? 1200 : 4000)
  }
  void loop()
  return () => { running = false; clearTimeout(timer) }
}
