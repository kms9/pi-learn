// The "Teams and rules" tab (M3-4): list, create and edit Teams, Roles and Workflows
// without touching files. Every save goes to the Controller, which checks the whole
// configuration first and refuses a change made against an older read.
import { createElement as h, Fragment, useEffect, useState } from 'react'
import { call } from './api.js'
import { refreshNow } from './feed.js'
import { configOf, editsFor, parseWorkflow, roleDoc, teamDoc, validId, workflowDoc } from './config-model.js'
import { store, toast, useStore } from './store.js'

const ACCEPTANCE = { review: '独立审核（指定审核角色）', on_completion: '完成即通过（不审核，仅用于对照实验）' }
const CONDITION = { acceptance_accepted: '上一步通过审核后', execution_completed: '上一步做完就开始' }
const KINDS = { execute: '执行', review: '审核', ask: '提问' }

function useConfig() {
  const [state, setState] = useState({ files: null, error: null })
  const load = async () => {
    try {
      const out = await call('config')
      setState({ files: out.files, error: null })
    } catch (error) {
      setState({ files: null, error: error.message })
    }
  }
  useEffect(() => { void load() }, [])
  return [state, load]
}

async function save(files, wanted, validateOnly, reload) {
  const edits = editsFor(files, wanted)
  if (edits.length === 0) return toast('没有改动', 'ok')
  try {
    const out = await call('config-save', { edits, validateOnly })
    toast(validateOnly ? '检查通过，可以保存' : `已保存（${out.teams.length} 个小队，${out.roles.length} 个角色）`, 'ok')
    if (!validateOnly) await reload()
  } catch (error) {
    toast(`没有保存：${error.message.replace(/^CONFIG_REJECTED:\s*/, '')}`)
  }
  await refreshNow()
}

function Field({ label, children, hint }) {
  return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, h('span', null, label), children, hint ? h('span', { className: 'sq-muted' }, hint) : null)
}

function RoleEditor({ id, role, files, reload, fresh }) {
  const [form, setForm] = useState({ name: id ?? '', description: role?.description ?? '', body: role?.body ?? '', rules: role?.rules ?? '' })
  useEffect(() => setForm({ name: id ?? '', description: role?.description ?? '', body: role?.body ?? '', rules: role?.rules ?? '' }), [id, role?.body])
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const ok = validId(form.name) && form.description.trim() !== '' && form.body.trim() !== ''
  const wanted = () => ({ [`roles/${form.name}/role.md`]: roleDoc(form), [`roles/${form.name}/agents.md`]: `${form.rules.trim() || '提交结果必须用 squad_submit_result。'}\n` })
  return h('div', { className: 'sq-card' },
    h('h3', null, fresh ? '新建角色' : `角色 ${id}`),
    h(Field, { label: '角色 ID', hint: '小写英文字母开头，可用数字和 -，例如 checker' }, h('input', { className: 'sq-input', value: form.name, disabled: !fresh, onChange: set('name') })),
    h(Field, { label: '一句话说明' }, h('input', { className: 'sq-input', value: form.description, onChange: set('description') })),
    h(Field, { label: '角色说明（这个角色是谁、怎么做事）' }, h('textarea', { className: 'sq-text', style: { minHeight: 120 }, value: form.body, onChange: set('body') })),
    h(Field, { label: '工作规则' }, h('textarea', { className: 'sq-text', value: form.rules, onChange: set('rules') })),
    h('div', { className: 'sq-row' },
      h('button', { className: 'sq-btn', disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, '检查'),
      h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, '保存')))
}

function TeamEditor({ id, team, roles, files, reload, fresh }) {
  const blank = { id: '', leader: 'chief', members: [], acceptance: 'review', reviewer: '', defaultWorkflow: '', parallel: 2, instructions: '' }
  const [form, setForm] = useState(team ?? blank)
  useEffect(() => setForm(team ?? blank), [id, team?.raw?.config_version])
  const roleIds = Object.keys(roles)
  const member = roleId => form.members.find(entry => entry.role_ref === roleId)
  const toggle = roleId => setForm(current => ({ ...current, members: member(roleId) ? current.members.filter(entry => entry.role_ref !== roleId) : [...current.members, { role_ref: roleId, responsibility: roles[roleId]?.description ?? roleId }] }))
  const ok = validId(form.id) && form.members.length > 0 && (form.acceptance !== 'review' || member(form.reviewer))
  const wanted = () => ({ [`teams/${form.id}/team.json`]: teamDoc(form), [`teams/${form.id}/instructions.md`]: `${form.instructions.trim() || '按流程完成任务。'}\n` })
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  return h('div', { className: 'sq-card' },
    h('h3', null, fresh ? '新建小队' : `小队 ${id}`),
    h(Field, { label: '小队 ID', hint: '小写英文，例如 math' }, h('input', { className: 'sq-input', value: form.id, disabled: !fresh, onChange: set('id') })),
    h(Field, { label: 'Leader（负责安排和收尾的 Bot）', hint: 'chief 对应 Bot「Chief」' }, h('input', { className: 'sq-input', value: form.leader, onChange: set('leader') })),
    h('div', null, h('div', null, '成员角色'),
      roleIds.length === 0 ? h('div', { className: 'sq-muted' }, '先新建角色') : roleIds.map(roleId => h('div', { key: roleId, className: 'sq-row' },
        h('label', { className: 'sq-row' }, h('input', { type: 'checkbox', checked: Boolean(member(roleId)), onChange: () => toggle(roleId) }), roleId),
        member(roleId) ? h('input', { className: 'sq-input', style: { flex: 1 }, value: member(roleId).responsibility, placeholder: '在小队里负责什么', onChange: event => setForm(current => ({ ...current, members: current.members.map(entry => (entry.role_ref === roleId ? { ...entry, responsibility: event.target.value } : entry)) })) }) : null))),
    h(Field, { label: '成果怎么验收' }, h('select', { className: 'sq-select', value: form.acceptance, onChange: set('acceptance') }, Object.entries(ACCEPTANCE).map(([value, label]) => h('option', { key: value, value }, label)))),
    form.acceptance === 'review' ? h(Field, { label: '审核角色（必须是成员，且不能审自己）' }, h('select', { className: 'sq-select', value: form.reviewer, onChange: set('reviewer') }, h('option', { value: '' }, '选择'), form.members.map(entry => h('option', { key: entry.role_ref, value: entry.role_ref }, entry.role_ref)))) : null,
    h(Field, { label: '默认流程' }, h('select', { className: 'sq-select', value: form.defaultWorkflow, onChange: set('defaultWorkflow') }, h('option', { value: '' }, '不用流程，由 Leader 安排'), Object.keys(team?.workflows ?? {}).map(workflowId => h('option', { key: workflowId, value: workflowId }, workflowId)))),
    h(Field, { label: '同时进行的任务数' }, h('input', { className: 'sq-input', type: 'number', min: 1, max: 8, value: form.parallel, onChange: set('parallel') })),
    h(Field, { label: '小队说明（所有成员都会看到）' }, h('textarea', { className: 'sq-text', value: form.instructions, onChange: set('instructions') })),
    h('div', { className: 'sq-row' },
      h('button', { className: 'sq-btn', disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, '检查'),
      h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, '保存'),
      fresh ? null : h('button', { className: 'sq-btn', onClick: async () => { try { await call('bind-team', { teamId: form.id }); toast('已绑定到群', 'ok') } catch (error) { toast(`绑定失败：${error.message}`) } await refreshNow() } }, '建群并绑定')))
}

function WorkflowEditor({ teamId, team, workflowId, files, reload, fresh }) {
  const start = workflowId && team?.workflows?.[workflowId] ? team.workflows[workflowId] : { id: '', steps: [] }
  const [form, setForm] = useState(start)
  useEffect(() => setForm(start), [teamId, workflowId])
  const roles = (team?.members ?? []).map(entry => entry.role_ref)
  const setStep = (index, patch) => setForm(current => ({ ...current, steps: current.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) }))
  const ok = validId(form.id) && form.steps.length > 0 && form.steps.every(step => validId(step.id) && step.role_ref && step.goal?.trim())
  const wanted = () => ({ [`teams/${teamId}/workflows/${form.id}.json`]: workflowDoc(form) })
  return h('div', { className: 'sq-card' },
    h('h3', null, fresh ? `给小队 ${teamId} 新建流程` : `流程 ${teamId} / ${workflowId}`),
    h(Field, { label: '流程 ID' }, h('input', { className: 'sq-input', value: form.id, disabled: !fresh, onChange: event => setForm(current => ({ ...current, id: event.target.value })) })),
    h('table', { className: 'sq-table' },
      h('thead', null, h('tr', null, ['步骤 ID', '角色', '类型', '目标', '在哪一步之后', ''].map(label => h('th', { key: label }, label)))),
      h('tbody', null, form.steps.map((step, index) => h('tr', { key: index },
        h('td', null, h('input', { className: 'sq-input', value: step.id, onChange: event => setStep(index, { id: event.target.value }) })),
        h('td', null, h('select', { className: 'sq-select', value: step.role_ref, onChange: event => setStep(index, { role_ref: event.target.value }) }, h('option', { value: '' }, '选择'), roles.map(role => h('option', { key: role, value: role }, role)))),
        h('td', null, h('select', { className: 'sq-select', value: step.kind || 'execute', onChange: event => setStep(index, { kind: event.target.value }) }, Object.entries(KINDS).map(([value, label]) => h('option', { key: value, value }, label)))),
        h('td', null, h('textarea', { className: 'sq-text', style: { minHeight: 40 }, value: step.goal ?? '', onChange: event => setStep(index, { goal: event.target.value }) })),
        h('td', null,
          h('select', { className: 'sq-select', value: step.depends_on?.[0]?.step ?? '', onChange: event => setStep(index, { depends_on: event.target.value ? [{ step: event.target.value, condition: step.depends_on?.[0]?.condition || 'acceptance_accepted' }] : [] }) },
            h('option', { value: '' }, '一开始就做'), form.steps.filter((_, i) => i !== index).map(other => h('option', { key: other.id, value: other.id }, other.id))),
          step.depends_on?.[0] ? h('select', { className: 'sq-select', value: step.depends_on[0].condition, onChange: event => setStep(index, { depends_on: [{ ...step.depends_on[0], condition: event.target.value }] }) }, Object.entries(CONDITION).map(([value, label]) => h('option', { key: value, value }, label))) : null),
        h('td', null, h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => setForm(current => ({ ...current, steps: current.steps.filter((_, i) => i !== index) })) }, '删除')))))),
    h('div', { className: 'sq-row' },
      h('button', { className: 'sq-btn', onClick: () => setForm(current => ({ ...current, steps: [...current.steps, { id: `step-${current.steps.length + 1}`, role_ref: roles[0] ?? '', kind: 'execute', goal: '', depends_on: current.steps.length > 0 ? [{ step: current.steps.at(-1).id, condition: 'acceptance_accepted' }] : [] }] })) }, '加一步'),
      h('button', { className: 'sq-btn', disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, '检查'),
      h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, '保存')))
}

export function ConfigTab() {
  const [{ files, error }, reload] = useConfig()
  const bound = useStore(state => state.teams)
  const [selected, setSelected] = useState(null)
  if (error) return h('div', { className: 'sq-main' }, h('div', { className: 'sq-card' }, `读不到配置：${error}`))
  if (files === null) return h('div', { className: 'sq-main' }, h('div', { className: 'sq-muted' }, '读取中…'))
  const { roles, teams } = configOf(files)
  const item = (key, title, sub) => h('button', { key, className: 'sq-item', 'data-on': selected?.key === key || undefined, onClick: () => setSelected({ key }) }, h('div', null, title), sub ? h('div', { className: 'sq-muted' }, sub) : null)
  const key = selected?.key ?? ''
  let editor = h('div', { className: 'sq-muted' }, '选择左边的小队、流程或角色，或新建一个。小队由角色组成，流程规定先做什么、后做什么。')
  const [kind, a, b] = key.split(':')
  if (kind === 'team') editor = h(TeamEditor, { id: a, team: teams[a], roles, files, reload })
  if (kind === 'new-team') editor = h(TeamEditor, { roles, files, reload, fresh: true })
  if (kind === 'role') editor = h(RoleEditor, { id: a, role: roles[a], files, reload })
  if (kind === 'new-role') editor = h(RoleEditor, { files, reload, fresh: true })
  if (kind === 'flow') editor = h(WorkflowEditor, { teamId: a, team: teams[a], workflowId: b, files, reload })
  if (kind === 'new-flow') editor = h(WorkflowEditor, { teamId: a, team: teams[a], files, reload, fresh: true })
  return h(Fragment, null,
    h('div', { className: 'sq-side' },
      h('div', { className: 'sq-muted' }, '小队'),
      Object.values(teams).map(team => h(Fragment, { key: team.id },
        item(`team:${team.id}`, team.id, `${team.members?.length ?? 0} 个角色 · ${bound[team.id] ? '已绑定到群' : '未绑定'}`),
        Object.keys(team.workflows ?? {}).map(workflowId => item(`flow:${team.id}:${workflowId}`, `　流程 ${workflowId}`, `${team.workflows[workflowId].steps.length} 步`)),
        item(`new-flow:${team.id}`, '　＋ 新建流程'))),
      item('new-team', '＋ 新建小队'),
      h('div', { className: 'sq-muted' }, '角色'),
      Object.entries(roles).map(([roleId, role]) => item(`role:${roleId}`, roleId, role.description)),
      item('new-role', '＋ 新建角色')),
    h('div', { className: 'sq-main' }, editor))
}

// Reading a workflow back for a fresh editor needs the parser; kept exported for tests.
export { parseWorkflow }
