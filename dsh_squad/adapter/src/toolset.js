// Which tools an admitted attempt may call. Pure. The Controller speaks of the tools
// in a Task contract (read, grep, find, ls, write, edit); the DSH host serves its own
// names. Squad's task tools are always open inside an attempt and nowhere else.
// Anything not listed — shell, run_code, message_bot, post_to_group, MCP — is refused
// in a formal attempt, because its side effects cannot be fenced (MIGRATION_PLAN §5).

export const TASK_TOOLS = ['squad_task', 'squad_submit_result', 'squad_review', 'squad_decide', 'squad_yield', 'squad_delegate', 'squad_clarify']

const DSH_NAMES = {
  read: ['read', 'read_image'],
  grep: ['grep'],
  find: ['glob'],
  ls: ['glob'],
  write: ['write'],
  edit: ['edit', 'str_replace_editor'],
}

// Memory inside a formal attempt is a read-only view (2026-10-19 D12): recall reads it,
// remember and forget would change what later steps and other Runs start from.
const MEMORY_READ = ['recall']
const MEMORY_WRITE = ['remember', 'forget']

/** DSH tool names for a contract's allowed tools, task tools included. */
export function hostTools(allowed = []) {
  const out = new Set([...TASK_TOOLS, ...MEMORY_READ])
  for (const name of allowed) for (const host of DSH_NAMES[name] ?? []) out.add(host)
  return out
}

/**
 * Why a call is refused, or undefined when it may run.
 * @param {string} name  the DSH tool name
 * @param {{allowedTools?: string[]}|undefined} attempt  the running attempt (undefined: none)
 * @param {boolean} managed  whether the Session is managed at all
 */
export function refusal(name, attempt, managed) {
  const isTaskTool = TASK_TOOLS.includes(name)
  if (!managed) return isTaskTool ? 'Squad task tools work only in a Squad task.' : undefined
  if (attempt === undefined) return 'Squad: this Session runs only work a Controller admitted, and none is running now.'
  // An attempt the stand-in admitted (no contract) keeps the host's own tool set.
  if (attempt.allowedTools === undefined) return undefined
  if (MEMORY_WRITE.includes(name)) return 'Squad: memory is read-only during a formal task; note what you learned in your result instead.'
  return hostTools(attempt.allowedTools).has(name) ? undefined : `Squad: ${name} is not allowed in this task (allowed: ${[...hostTools(attempt.allowedTools)].join(', ')}).`
}
