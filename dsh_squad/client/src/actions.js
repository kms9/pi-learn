// What a person does on a node (UI plan §2.5–2.6), shown next to the card.
//
// Failed: one line of why, and only Ignore and Retry (D1). Retry confirms the stop in
// one more line when the end was uncertain, and offers a result that arrived after the
// cut when there is one. Needs you: the one action the node waits for (allow a tool,
// accept a result, carry on after a restart). Every popover can send the Leader guidance
// about this node. Every action carries the revision the card was drawn for.
import { createElement as h, Fragment, useState } from 'react'
import { call, requestId } from './api.js'
import { refreshNow } from './feed.js'
import { store, toast, useStore } from './store.js'

async function act(what, endpoint, payload, after) {
  try {
    await call(endpoint, payload)
    toast(`${what}：已提交`, 'ok')
    after?.()
  } catch (error) {
    const stale = /REVISION|CONFLICT|changed|moved on/i.test(error.message)
    toast(stale ? '这一步已更新，刷新后再处理。' : `${what}失败：${error.message}`)
  } finally {
    await refreshNow()
  }
}

function Guidance({ run, task }) {
  const [text, setText] = useState('')
  if (!run || ['completed', 'cancelled'].includes(run.phase)) return null
  return h('div', { className: 'sq-row sq-pop-guide' },
    h('input', { className: 'sq-input', style: { flex: 1 }, placeholder: task ? '就这一步给 Leader 补充指导' : '给 Leader 补充指导', value: text, onChange: event => setText(event.target.value), onClick: event => event.stopPropagation() }),
    h('button', { className: 'sq-btn', disabled: text.trim() === '', onClick: () => act('补充指导', 'operate', { kind: 'run', id: run.run_id, op: 'guidance', body: { request_id: requestId('guide'), expected_revision: run.revision, note: text.trim(), ...(task ? { task_id: task.task_id } : {}) } }, () => setText('')) }, '发送'))
}

function FailedTask({ node }) {
  const { task, state } = node
  const attempts = useStore(s => s.projection.snapshot?.views?.attempts ?? [])
  const evidence = useStore(s => s.projection.snapshot?.views?.evidence ?? [])
  const [step, setStep] = useState(null)
  const own = (task.attempt_ids ?? []).map(id => attempts.find(attempt => attempt.attempt_id === id)).filter(Boolean)
  const open = own.filter(attempt => attempt.cleanup_state !== 'released')
  const late = evidence.filter(row => own.some(attempt => attempt.attempt_id === row.attempt_id) && row.disposition === 'rejected_late_or_stale')
  const runtime = open.at(-1)?.target?.runtime_id ?? own.at(-1)?.target?.runtime_id ?? ''
  const restart = confirm => act('重试', 'operate', { kind: 'task', id: task.task_id, op: 'restart', body: { request_id: requestId('restart'), expected_revision: task.revision, expected_runtime: runtime, note: '在 Squad 页面重试', confirm_stopped: confirm } })
  const adopt = row => act('采用这份结果', 'operate', { kind: 'task', id: task.task_id, op: 'recover', body: { request_id: requestId('adopt'), expected_revision: task.revision, evidence: `evidence:${row.seq}`, note: '在 Squad 页面采用迟到的结果' } })
  return h(Fragment, null,
    h('div', { className: 'sq-pop-title' }, '没能完成'),
    h('div', { className: 'sq-pop-reason' }, state.reason),
    step === 'ignore' ? h('div', { className: 'sq-pop-confirm' }, '忽略后最终检查不再要求这一步。确定？',
      h('div', { className: 'sq-row' }, h('button', { className: 'sq-btn', onClick: () => setStep(null) }, '算了'), h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => act('忽略', 'operate', { kind: 'task', id: task.task_id, op: 'cancel', body: { request_id: requestId('ignore'), expected_revision: task.revision, note: '忽略：在 Squad 页面忽略这一步', ignore: true } }) }, '确定忽略')))
      : step === 'confirm' ? h('div', { className: 'sq-pop-confirm' }, '重试前请确认：上一次已经停下了（例如 DS Bot 已重启完毕）。',
        h('div', { className: 'sq-row' }, h('button', { className: 'sq-btn', onClick: () => setStep(null) }, '算了'), h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => restart(true) }, '确认并重试')))
        : h('div', { className: 'sq-row sq-pop-main' },
          h('button', { className: 'sq-btn', onClick: () => setStep('ignore') }, '忽略'),
          h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => (open.length > 0 ? setStep('confirm') : restart(false)) }, '重试')),
    late.length > 0 && step === null ? h('div', { className: 'sq-pop-extra' }, `它在中断后交了一份结果。`, open.length === 0
      ? h('button', { className: 'sq-link', onClick: () => adopt(late.at(-1)) }, '采用这份结果')
      : h('span', { className: 'sq-muted' }, '（确认停止后可以采用）')) : null)
}

function FailedRun({ run, state }) {
  const [step, setStep] = useState(null)
  return h(Fragment, null,
    h('div', { className: 'sq-pop-title' }, '最后检查没通过'),
    h('div', { className: 'sq-pop-reason' }, state.reason),
    step === 'ignore' ? h('div', { className: 'sq-pop-confirm' }, '结束这个 Run，已有的成果都保留。确定？',
      h('div', { className: 'sq-row' }, h('button', { className: 'sq-btn', onClick: () => setStep(null) }, '算了'), h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => act('结束 Run', 'operate', { kind: 'run', id: run.run_id, op: 'cancel', body: { request_id: requestId('end'), expected_revision: run.revision, note: '忽略：结束 Run，保留成果' } }) }, '确定结束')))
      : h('div', { className: 'sq-row sq-pop-main' },
        h('button', { className: 'sq-btn', onClick: () => setStep('ignore') }, '忽略'),
        h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => act('重试', 'operate', { kind: 'run', id: run.run_id, op: 'resume', body: { request_id: requestId('resume'), expected_revision: run.revision, note: '在 Squad 页面让 Leader 重新检查' } }) }, '重试')))
}

function Stale({ task }) {
  const tasks = useStore(s => s.projection.snapshot?.views?.tasks ?? [])
  const inputs = (task.dependencies ?? []).map(dep => tasks.find(candidate => candidate.task_id === dep.task_id)).filter(input => input?.superseded_by)
  const name = inputs[0] ? (inputs[0].title || String(inputs[0].goal).split(/[。\n]/)[0].slice(0, 24)) : '上游'
  const op = which => act(which === 'rebase' ? '用新版本重做' : '保留这一版', 'operate', { kind: 'task', id: task.task_id, op: which, body: { request_id: requestId(which), expected_revision: task.revision, note: which === 'rebase' ? '在 Squad 页面用新版本重做' : '在 Squad 页面保留这一版' } })
  return h(Fragment, null,
    h('div', { className: 'sq-pop-title' }, '基于旧版本'),
    h('div', null, `它用的是「${name}」被退回的旧版本，那一步已经返工。`),
    h('div', { className: 'sq-row sq-pop-main' },
      h('button', { className: 'sq-btn', onClick: () => op('keep') }, '保留这一版'),
      h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => op('rebase') }, '用新版本重做')))
}

function Approval({ entry, expectedRevision }) {
  return h(Fragment, null,
    h('div', { className: 'sq-pop-title' }, '需要你批准工具'),
    h('div', null, `想运行 ${entry.tool}${entry.reason ? `：${entry.reason}` : ''}`),
    entry.detail?.code || entry.detail?.text ? h('pre', { className: 'sq-pre sq-muted' }, String(entry.detail.code ?? entry.detail.text).slice(0, 400)) : null,
    h('div', { className: 'sq-row sq-pop-main' },
      h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => act('拒绝', 'approve', { approvalId: entry.id, attemptId: entry.attemptId, expectedRevision, choice: 'reject' }) }, '拒绝'),
      h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => act('允许', 'approve', { approvalId: entry.id, attemptId: entry.attemptId, expectedRevision, choice: 'allow' }) }, '允许一次')))
}

function Accept({ task }) {
  const previewBase = useStore(s => s.previewBase)
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')
  const decide = (decision, note) => act(decision === 'accepted' ? '验收通过' : '退回', 'accept', { taskId: task.task_id, body: { request_id: requestId('accept'), expected_revision: task.revision, decision, result_hash: task.result.hash, note } })
  const html = (task.result?.artifacts ?? []).find(art => art.media_type === 'text/html')
  return h(Fragment, null,
    h('div', { className: 'sq-pop-title' }, '请确认这个结果是否可以交付'),
    h('pre', { className: 'sq-pre sq-muted' }, JSON.stringify(task.result?.value ?? null, null, 2).slice(0, 300)),
    html && previewBase ? h('button', { className: 'sq-link', onClick: () => store.set(s => ({ ...s, preview: { url: `${previewBase}/v2/artifacts/sha256/${html.sha256}`, name: html.name } })) }, `预览 ${html.name ?? ''}`) : null,
    reject ? h('div', { className: 'sq-pop-confirm' },
      h('input', { className: 'sq-input', placeholder: '一句话写清要改什么', value: reason, onChange: event => setReason(event.target.value) }),
      h('div', { className: 'sq-row' }, h('button', { className: 'sq-btn', onClick: () => setReject(false) }, '算了'), h('button', { className: 'sq-btn', 'data-kind': 'danger', disabled: reason.trim() === '', onClick: () => decide('rejected', reason.trim()) }, '退回')))
      : h('div', { className: 'sq-row sq-pop-main' },
        h('button', { className: 'sq-btn', onClick: () => setReject(true) }, '退回'),
        h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => decide('accepted', '在 Squad 页面验收通过') }, '通过')))
}

function Held({ run }) {
  return h(Fragment, null,
    h('div', { className: 'sq-pop-title' }, '系统重启过，确认后继续'),
    h('div', { className: 'sq-muted' }, '先处理下面标红的步骤（重试或忽略），再让 Run 继续。'),
    h('div', { className: 'sq-row sq-pop-main' },
      h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => act('继续', 'operate', { kind: 'run', id: run.run_id, op: 'resume', body: { request_id: requestId('resume'), expected_revision: run.revision, note: '在 Squad 页面确认继续' } }) }, '继续')))
}

/** The popover for a node that needs a person or failed; undefined for the rest. */
export function hasActions(node) {
  return node && (node.state.status === 'failed' || node.state.status === 'attention')
}

export function NodePopover({ node, x, y, onDetails, onClose }) {
  const approvals = useStore(s => s.approvals)
  const attempts = useStore(s => s.projection.snapshot?.views?.attempts ?? [])
  const runs = useStore(s => s.projection.snapshot?.views?.runs ?? [])
  const run = node.kind === 'run' ? node.run : runs.find(candidate => candidate.run_id === node.task?.run_id)
  const task = node.task
  const approval = task ? approvals.find(entry => entry.taskId === task.task_id) : undefined
  const attempt = approval ? attempts.find(candidate => candidate.attempt_id === approval.attemptId) : undefined
  let body = null
  if (node.state.status === 'failed') body = node.kind === 'run' ? h(FailedRun, { run, state: node.state }) : h(FailedTask, { node })
  else if (approval) body = h(Approval, { entry: approval, expectedRevision: attempt?.revision })
  else if (task && node.state.note === '基于旧版本') body = h(Stale, { task })
  else if (task && task.state === 'completed' && task.acceptance_policy?.mode === 'human') body = h(Accept, { task })
  else if (node.kind === 'run' && run?.recovery_hold) body = h(Held, { run })
  return h('div', { className: 'sq-pop', 'data-s': node.state.status, style: { transform: `translate(${x}px, ${y}px)` }, onMouseDown: event => event.stopPropagation(), onClick: event => event.stopPropagation(), role: 'dialog', 'aria-label': '处理这一步' },
    h('button', { className: 'sq-x sq-pop-close', 'aria-label': '关闭', onClick: onClose }, '×'),
    body,
    h(Guidance, { run, task }),
    h('button', { className: 'sq-link sq-muted', onClick: onDetails }, '查看详情'))
}
