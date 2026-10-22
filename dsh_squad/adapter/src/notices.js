// Reminders in a Team's group (P2 = C): when something in a Run needs a person or a
// step failed, the Team's Leader Bot posts one line in the group with a link that opens
// the Squad page at that node. What counts is decided exactly as the page does it
// (summaryOf in the client), so the group and the page never disagree. Pure.
import { summaryOf } from '../../client/src/summary.js'

/**
 * The link that opens the Squad page at a node (the page reads ?squad= on load, and
 * opens it in place when clicked inside DS Bot). `base` is the web address: DS Bot's
 * message renderer keeps only absolute links.
 */
export const squadLink = ({ teamId, runId, taskId }, base = '') => `${base.replace(/\/$/, '')}/?squad=${encodeURIComponent([teamId, runId, taskId ?? ''].join(':'))}`

/** A stable key for one thing a person is asked about. */
export const noticeKey = item => [item.kind, item.runId, item.taskId ?? 'run', item.note ?? ''].join('|')

/**
 * What is new to say since `seen` (keys already posted): one post per Team, its items
 * listed, oldest first as the summary orders them.
 * @returns {{teamId:string, keys:string[], text:string}[]}
 */
export function noticesFor(snapshot, approvals, seen = new Set(), base = '') {
  const sum = summaryOf(snapshot, approvals, null)
  const items = [
    ...sum.attention.map(item => ({ ...item, kind: 'attention' })),
    ...sum.failed.map(item => ({ ...item, kind: 'failed' })),
  ].filter(item => !seen.has(noticeKey(item)))
  const byTeam = new Map()
  for (const item of items) byTeam.set(item.teamId, [...(byTeam.get(item.teamId) ?? []), item])
  return [...byTeam.entries()].map(([teamId, list]) => ({
    teamId,
    keys: list.map(noticeKey),
    text: [
      `【Squad】小队 ${teamId} 有 ${list.length} 件事需要你处理：`,
      ...list.map(item => `- ${item.kind === 'failed' ? '失败' : '需要你处理'}：${title(item)}${item.note ? `（${item.note}）` : ''} → [打开 Squad 页面](${squadLink(item, base)})`),
    ].join('\n'),
  }))
}

const title = (item) => {
  const text = item.taskId === null ? `整个小队：${item.title}` : String(item.title ?? '')
  const line = text.split(/[。\n]/)[0].trim()
  return line.length > 40 ? `${line.slice(0, 40)}…` : line
}
