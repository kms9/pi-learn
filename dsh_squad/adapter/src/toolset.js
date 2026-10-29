// Which tools an admitted attempt may call. Pure. The Controller speaks of the tools
// in a Task contract (read, grep, find, ls, write, edit); the DSH host serves its own
// names. Squad's task tools are always open inside an attempt and nowhere else.
// Anything not listed — shell, run_code, message_bot, post_to_group, MCP — is refused
// in a formal attempt, because its side effects cannot be fenced (MIGRATION_PLAN §5).

export const TASK_TOOLS = ['squad_task', 'squad_check_page', 'squad_submit_result', 'squad_review', 'squad_decide', 'squad_yield', 'squad_delegate', 'squad_clarify']

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

// File tools inside a formal attempt reach only the project directory and DS Bot's
// workspace (DSH-M1-08 "未授权路径"): an absolute path elsewhere, or a relative one
// that climbs out, is refused before the tool runs. Symlinks are followed first.
const PATH_ARGS = { read: ['file_path', 'path'], read_image: ['path', 'file_path'], write: ['file_path'], edit: ['file_path'], str_replace_editor: ['path', 'file_path'], glob: ['path', 'pattern'], grep: ['path'] }

/**
 * @param {string} name  the DSH tool name
 * @param {unknown} args  the call's parsed arguments
 * @param {string[]} roots  absolute directories the attempt may touch; the first is where relative paths start
 * @param {(path:string)=>string} real  resolves symlinks (identity when the path does not exist)
 */
export function pathRefusal(name, args, roots, real = path => path) {
  const fields = PATH_ARGS[name]
  if (fields === undefined || roots.length === 0 || args === null || typeof args !== 'object') return undefined
  const inside = (target, root) => target === root || target.startsWith(root.endsWith('/') ? root : `${root}/`)
  for (const field of fields) {
    const raw = args[field]
    if (typeof raw !== 'string' || raw === '') continue
    // A glob pattern only names a place when it is absolute or climbs out.
    if (field === 'pattern' && !raw.startsWith('/') && !raw.startsWith('~') && !raw.split('/').includes('..')) continue
    const expanded = raw.startsWith('~') ? `/${raw}` : raw
    const base = field === 'pattern' ? expanded.split(/[*?[{]/)[0] || '/' : expanded
    const target = real(resolvePath(roots[0], base))
    if (!roots.some(root => inside(target, real(root)))) return `Squad: ${name} may not reach ${raw} in this task (only the project and the workspace).`
  }
  return undefined
}

function resolvePath(from, path) {
  const parts = (path.startsWith('/') ? path : `${from}/${path}`).split('/')
  const out = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}
