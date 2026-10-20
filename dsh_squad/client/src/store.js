// One small store for the page, shared by every slot this plugin fills.
import { useSyncExternalStore } from 'react'
import { EMPTY } from './projection.js'

export function createStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set: (next) => {
      const updated = typeof next === 'function' ? next(value) : next
      if (updated === value) return
      value = updated
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
  }
}

export const store = createStore({
  open: false, tab: 'runs', runId: null, projection: EMPTY, teams: {}, approvals: [], previewBase: null, connected: null, toast: null, preview: null, errors: [], teamScope: null, focus: null,
})

export function useStore(select) {
  return useSyncExternalStore(store.subscribe, () => select(store.get()))
}

export const toast = (text, kind = 'error') => store.set(state => ({ ...state, toast: { text, kind, at: Date.now() } }))
