// Links into the Squad page (P2 = C): a reminder in a Team's group links to
// /?squad=<team>:<run>:<task>. Opening it, or clicking it inside DS Bot, opens the page
// at that Team, Run and node; the address loses the parameter again.
import { store } from './store.js'
import { parseSquadLink } from './link-model.js'

function open(target) {
  store.set(state => ({ ...state, open: true, tab: 'runs', teamScope: target.teamId, runId: target.runId, focus: { taskId: target.taskId, runId: target.runId, at: Date.now() } }))
}

export function followLinks() {
  const first = parseSquadLink(window.location.search)
  if (first !== undefined) {
    open(first)
    const url = new URL(window.location.href)
    url.searchParams.delete('squad')
    window.history.replaceState(window.history.state, '', url)
  }
  // A link clicked inside DS Bot opens the page in place instead of reloading.
  const onClick = (event) => {
    const anchor = event.target?.closest?.('a[href]')
    if (!anchor) return
    let url
    try { url = new URL(anchor.getAttribute('href'), window.location.href) } catch { return }
    // Any host: the link names the address the host was started with, which may not be
    // the one this page was opened under.
    const target = url.pathname === '/' ? parseSquadLink(url.search) : undefined
    if (target === undefined) return
    event.preventDefault()
    event.stopPropagation()
    open(target)
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
