// The page talks only to DS Bot's host, on the adapter's route, with DS Bot's own login.
const ROUTE = 'api/squad-adapter'

export async function call(endpoint, payload = {}) {
  let response
  try {
    // Document-relative, so a DSH served under a base path still works.
    response = await fetch(ROUTE, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: `ui/${endpoint}`, payload }) })
  } catch (error) {
    throw Object.assign(new Error('连不上 DS Bot 宿主，请确认它还在运行。'), { code: 'NETWORK', cause: error })
  }
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: `HTTP_${response.status}` })
  const result = await response.json()
  if (!result.ok) throw Object.assign(new Error(result.error?.message ?? '请求失败'), { code: 'SQUAD' })
  return result.value
}

export const requestId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
