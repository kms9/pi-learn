// The experiment report tab (M3-3): reports the experiment runner wrote into the
// project (.dsh-squad/reports/*.json, format dsh-squad-experiment/1). It shows what was
// measured and how, and says plainly when the data came from the mock model.
import { createElement as h, Fragment, useEffect, useState } from 'react'
import { call } from './api.js'

const GROUP = {
  S: '单个强 Agent', A: 'DS Bot 自由协作', B: 'Squad 任务 DAG（不审核）', C: 'Squad DAG + 独立审核', D: 'C + 高级资源调度',
}
const fmt = (value, digits = 0) => (value === null || value === undefined || Number.isNaN(value) ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits }))

function Bars({ groups, pick, unit }) {
  const values = groups.map(group => pick(group.summary) ?? 0)
  const max = Math.max(1, ...values)
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, groups.map((group, index) => h('div', { key: group.id, className: 'sq-row', style: { flexWrap: 'nowrap' } },
    h('span', { style: { width: 28 } }, group.id),
    h('div', { style: { flex: 1 } }, h('div', { className: 'sq-bar', style: { width: `${(values[index] / max) * 100}%` } })),
    h('span', { className: 'sq-muted', style: { width: 110, textAlign: 'right' } }, `${fmt(values[index], 1)} ${unit}`))))
}

function Report({ report }) {
  const groups = report.groups ?? []
  return h('div', { className: 'sq-card' },
    h('h3', null, report.title ?? report.id),
    h('div', { className: 'sq-muted' }, `${report.created} · 模型 ${report.model?.model ?? '?'}${report.model?.effort ? `（${report.model.effort}）` : ''} · 每组 ${report.repeats ?? '?'} 次`),
    report.mock ? h('div', { className: 'sq-banner', style: { borderRadius: 8 } }, '这份报告用的是脚本化的 mock 模型，只验证实验流程能跑通，数字不代表真实效果。') : null,
    h('div', null, `任务：${report.task?.goal ?? ''}`),
    h('table', { className: 'sq-table' },
      h('thead', null, h('tr', null, ['组', '做法', '成功', '平均耗时', '平均模型调用', '平均 Token', '审核', '返工', '人工介入'].map(label => h('th', { key: label }, label)))),
      h('tbody', null, groups.map(group => h('tr', { key: group.id },
        h('td', null, group.id), h('td', null, GROUP[group.id] ?? group.label),
        h('td', null, `${group.summary?.succeeded ?? 0}/${group.runs?.length ?? 0}`),
        h('td', null, `${fmt(group.summary?.mean_seconds, 1)} 秒`),
        h('td', null, fmt(group.summary?.mean_model_calls, 1)),
        h('td', null, fmt(group.summary?.mean_tokens)),
        h('td', null, fmt(group.summary?.reviews)), h('td', null, fmt(group.summary?.reworks)), h('td', null, fmt(group.summary?.human_actions)))))),
    h('div', { className: 'sq-grid' },
      h('div', null, h('div', { className: 'sq-muted' }, '平均 Token（含辅助调用）'), h(Bars, { groups, pick: s => s?.mean_tokens, unit: '' })),
      h('div', null, h('div', { className: 'sq-muted' }, '平均耗时'), h(Bars, { groups, pick: s => s?.mean_seconds, unit: '秒' }))),
    (report.notes ?? []).length > 0 ? h('ul', { className: 'sq-muted' }, report.notes.map((note, index) => h('li', { key: index }, note))) : null)
}

export function ReportsTab() {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { call('reports').then(setReports, failure => setError(failure.message)) }, [])
  return h('div', { className: 'sq-main' },
    error ? h('div', { className: 'sq-card' }, `读不到报告：${error}`) : null,
    reports === null && !error ? h('div', { className: 'sq-muted' }, '读取中…') : null,
    reports?.length === 0 ? h('div', { className: 'sq-card' }, h(Fragment, null, '还没有实验报告。用 ', h('code', null, 'node dsh_squad/experiments/run.mjs'), ' 跑一次对照实验后会出现在这里。')) : null,
    (reports ?? []).map(report => h(Report, { key: report.id, report })))
}
