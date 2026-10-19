// Forms for Roles, Teams and Workflows, and the files they become (M3-4). Pure. The
// Controller validates the whole configuration before writing; these helpers only
// build the files and the edits, each with the hash of what the form was loaded from.

const ID = /^[a-z][a-z0-9-]*$/
export const validId = id => ID.test(id)

export function parseRole(content = '') {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const head = match?.[1] ?? ''
  const field = (name) => {
    const raw = head.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? ''
    if (!raw.startsWith('"')) return raw
    try { return JSON.parse(raw) } catch { return raw }
  }
  return { name: field('name'), description: field('description'), body: (match?.[2] ?? '').trim() }
}

// YAML scalars are quoted when they could be misread (a colon, a leading symbol).
const yamlText = text => (/^[\w一-鿿][^:#\n]*$/u.test(text) ? text : JSON.stringify(text))
export const roleDoc = ({ name, description, body }) => `---\nname: ${name}\ndescription: ${yamlText(description.trim())}\n---\n${body.trim()}\n`

export const DEFAULT_POLICY = {
  run_admission: 'fifo_single_active', max_parallel_tasks: 2, max_delegate_depth: 2, max_total_tasks: 20, max_attempts_per_task: 3,
  allowed_tools: ['read', 'grep', 'find', 'ls'], writable_roots: [],
}

export function parseTeam(content, instructions = '') {
  const team = JSON.parse(content)
  const acceptance = team.policy?.acceptance_policy ?? {}
  return {
    id: team.team_id, leader: team.leader?.agent_ref ?? 'chief', members: team.members ?? [],
    acceptance: acceptance.mode ?? 'review', reviewer: acceptance.reviewer_ref ?? '',
    defaultWorkflow: team.default_workflow ?? '', parallel: team.policy?.max_parallel_tasks ?? 2,
    instructions, raw: team,
  }
}

export function teamDoc(form) {
  const base = form.raw ?? {}
  const policy = { ...DEFAULT_POLICY, ...(base.policy ?? {}), max_parallel_tasks: Number(form.parallel) || 1 }
  policy.acceptance_policy = form.acceptance === 'review'
    ? { mode: 'review', reviewer_ref: form.reviewer, child_policy: base.policy?.acceptance_policy?.child_policy ?? 'separate' }
    : { mode: form.acceptance, child_policy: base.policy?.acceptance_policy?.child_policy ?? 'separate' }
  const team = {
    schema_version: 1, team_id: form.id, config_version: (base.config_version ?? 0) + 1,
    leader: { agent_ref: form.leader }, members: form.members.map(member => ({ role_ref: member.role_ref, responsibility: member.responsibility || member.role_ref })),
    instructions_file: 'instructions.md', ...(form.defaultWorkflow ? { default_workflow: form.defaultWorkflow } : {}), policy,
  }
  return `${JSON.stringify(team, null, 2)}\n`
}

export function parseWorkflow(content) {
  const workflow = JSON.parse(content)
  return { id: workflow.workflow_id, steps: workflow.steps.map(step => ({ ...step, depends_on: step.depends_on ?? [] })) }
}

export function workflowDoc({ id, steps }) {
  const clean = steps.map(step => ({
    id: step.id, role_ref: step.role_ref, kind: step.kind || 'execute', goal: step.goal,
    depends_on: (step.depends_on ?? []).filter(dep => dep.step).map(dep => ({ step: dep.step, condition: dep.condition || 'acceptance_accepted' })),
    // Each dependency's result is also handed to the step as an input.
    refs: (step.depends_on ?? []).filter(dep => dep.step).map(dep => ({ task_id: dep.step, result_revision: 0, hash: '', length: 0 })),
  }))
  return `${JSON.stringify({ schema_version: 1, workflow_id: id, steps: clean }, null, 2)}\n`
}

/** The edits that write `wanted` (path → content), each against the hash it was read with. */
export function editsFor(files, wanted) {
  const hashOf = new Map(files.map(file => [file.path, file.hash]))
  const contentOf = new Map(files.map(file => [file.path, file.content]))
  return Object.entries(wanted)
    .filter(([path, content]) => contentOf.get(path) !== content)
    .map(([path, content]) => ({ path, content, expected_hash: hashOf.get(path) ?? '' }))
}

/** Roles, Teams and Workflows from the listed files. */
export function configOf(files) {
  const roles = {}
  const teams = {}
  const content = path => files.find(file => file.path === path)?.content
  for (const file of files) {
    let match = file.path.match(/^roles\/([^/]+)\/role\.md$/)
    if (match) roles[match[1]] = { ...parseRole(file.content), rules: content(`roles/${match[1]}/agents.md`) ?? '' }
    match = file.path.match(/^teams\/([^/]+)\/team\.json$/)
    if (match) {
      try {
        teams[match[1]] = { ...parseTeam(file.content, content(`teams/${match[1]}/instructions.md`) ?? ''), workflows: {} }
      } catch { teams[match[1]] = { id: match[1], broken: true, workflows: {} } }
    }
  }
  for (const file of files) {
    const match = file.path.match(/^teams\/([^/]+)\/workflows\/([^/]+)\.json$/)
    if (match && teams[match[1]]) {
      try { teams[match[1]].workflows[match[2]] = parseWorkflow(file.content) } catch { /* shown as missing */ }
    }
  }
  return { roles, teams }
}
