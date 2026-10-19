import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configOf, editsFor, parseRole, parseTeam, parseWorkflow, roleDoc, teamDoc, workflowDoc } from '../src/config-model.js'

test('a role round-trips through its form', () => {
  const doc = roleDoc({ name: 'checker', description: '检查: 格式与功能', body: '你是检查员。' })
  assert.match(doc, /^---\nname: checker\ndescription: "检查: 格式与功能"\n---\n你是检查员。\n$/)
  assert.deepEqual(parseRole(doc), { name: 'checker', description: '检查: 格式与功能', body: '你是检查员。' })
  assert.match(roleDoc({ name: 'a', description: '教学审核', body: 'x' }), /description: 教学审核\n/)
})

test('a team form writes a complete team.json and bumps its version', () => {
  const doc = teamDoc({ id: 'math', leader: 'chief', members: [{ role_ref: 'builder', responsibility: '' }, { role_ref: 'reviewer', responsibility: '审核' }], acceptance: 'review', reviewer: 'reviewer', defaultWorkflow: 'lesson', parallel: 2 })
  const team = JSON.parse(doc)
  assert.equal(team.config_version, 1)
  assert.equal(team.members[0].responsibility, 'builder')
  assert.deepEqual(team.policy.acceptance_policy, { mode: 'review', reviewer_ref: 'reviewer', child_policy: 'separate' })
  const again = JSON.parse(teamDoc({ ...parseTeam(doc), acceptance: 'on_completion' }))
  assert.equal(again.config_version, 2)
  assert.equal(again.policy.acceptance_policy.reviewer_ref, undefined)
})

test('a workflow step hands its dependencies in as inputs', () => {
  const doc = workflowDoc({ id: 'lesson', steps: [{ id: 'research', role_ref: 'researcher', goal: 'g1', depends_on: [] }, { id: 'build', role_ref: 'builder', goal: 'g2', depends_on: [{ step: 'research', condition: '' }, { step: '' }] }] })
  const w = JSON.parse(doc)
  assert.deepEqual(w.steps[1].depends_on, [{ step: 'research', condition: 'acceptance_accepted' }])
  assert.deepEqual(w.steps[1].refs, [{ task_id: 'research', result_revision: 0, hash: '', length: 0 }])
  assert.equal(parseWorkflow(doc).steps.length, 2)
})

test('edits carry the hash each file was read with, and skip unchanged files', () => {
  const files = [{ path: 'roles/a/role.md', content: 'x', hash: 'h1' }]
  assert.deepEqual(editsFor(files, { 'roles/a/role.md': 'y', 'roles/a/agents.md': 'z' }), [
    { path: 'roles/a/role.md', content: 'y', expected_hash: 'h1' },
    { path: 'roles/a/agents.md', content: 'z', expected_hash: '' },
  ])
  assert.deepEqual(editsFor(files, { 'roles/a/role.md': 'x' }), [])
})

test('the listed files become roles, teams and their workflows', () => {
  const files = [
    { path: 'roles/builder/role.md', content: roleDoc({ name: 'builder', description: 'd', body: 'b' }) },
    { path: 'roles/builder/agents.md', content: 'rules' },
    { path: 'teams/math/team.json', content: teamDoc({ id: 'math', leader: 'chief', members: [{ role_ref: 'builder' }], acceptance: 'on_completion', parallel: 1 }) },
    { path: 'teams/math/instructions.md', content: 'teach' },
    { path: 'teams/math/workflows/lesson.json', content: workflowDoc({ id: 'lesson', steps: [{ id: 's', role_ref: 'builder', goal: 'g', depends_on: [] }] }) },
  ]
  const config = configOf(files)
  assert.equal(config.roles.builder.rules, 'rules')
  assert.equal(config.teams.math.instructions, 'teach')
  assert.equal(config.teams.math.workflows.lesson.steps[0].id, 's')
})
