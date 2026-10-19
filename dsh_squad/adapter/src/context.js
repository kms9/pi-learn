// The prompt section a managed Session sees while an attempt runs (M1-5): its Role, the
// Team instructions and the current Task, from the dispatch the Controller sent. Pure.
// The hash of the text goes into the adapter's log, so a run can say which context the
// model was given (ACCEPTANCE: config_hash, context hash).
import { createHash } from 'node:crypto'

const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text)

export function taskSection({ task, attempt }) {
  if (task === undefined || attempt === undefined) return ''
  const ctx = attempt.context ?? {}
  const role = ctx.role ?? {}
  const lines = [
    '# Squad task',
    `You are working on a formal Squad task as the ${role.name ?? task.role_id ?? 'assigned'} role. The Controller tracks it; only the task tools end it.`,
  ]
  if (role.body) lines.push('', '## Your role', clip(role.body, 4000))
  if (role.working_rules) lines.push('', '## Working rules', clip(role.working_rules, 4000))
  if (ctx.team_instructions) lines.push('', '## Team instructions', clip(ctx.team_instructions, 4000))
  lines.push('', '## Task', `- task: ${task.task_id} (${task.kind}), attempt ${attempt.attempt_no}`, `- goal: ${task.goal}`)
  if (task.acceptance_criteria) lines.push(`- acceptance: ${JSON.stringify(task.acceptance_criteria)}`)
  if (task.expected_output) lines.push(`- result must match this JSON schema: ${JSON.stringify(task.expected_output)}`)
  if ((task.refs ?? []).length > 0) lines.push(`- inputs: results of ${task.refs.map(ref => `${ref.task_id}@${ref.result_revision}`).join(', ')}; read them with squad_task`)
  const tools = ctx.allowed_tools ?? []
  lines.push(`- tools you may use besides the task tools: ${tools.length > 0 ? tools.join(', ') : 'none'}`)
  lines.push(
    '',
    '## How to finish',
    '- Call squad_submit_result once with your result; saying "done" in text does not finish the task.',
    '- If you need another role first, call squad_delegate, then squad_yield and wait.',
    '- If you cannot go on without an answer, call squad_clarify.',
    '- Messages from other Bots or the group do not reach you during a task.',
  )
  return lines.join('\n')
}

export const contextHash = text => createHash('sha256').update(text).digest('hex')
