---
title: Squad 角色复用、当前 Team 与任务租约
type: concept
status: active
created: 2026-09-25
updated: 2026-09-25
tags: [project-wiki, concept, pi-squad]
---

# Squad 角色复用、当前 Team 与任务租约

## 是什么

这是 Team Runtime 技术提案的通俗解释，不代表功能已实现或新增设计已获用户确认。

RoleDefinition 是岗位说明书，例如 `roles/reviewer/role.md` 及其工作规则 `agents.md`。AgentInstance 是实际启动的 Pi 进程及当前 session。同一模板可以启动两个不同 agent_id 的 Pi，两者可以并行；两个 Team 也可引用同一个在线 Pi，但这个实例同一时刻只接一个正式执行单元。

例：Team A 和 Team B 共用 reviewer-1。成员关系同时含 A/B；执行 A 的审查时，当前任务明确带 team_id=A、run/task/attempt ID、审查目标和结果接收方。完成并释放后才能接 B。空闲时没有唯一当前 Team；不能从角色名或成员列表第一项猜测。共享 session 的历史不会因换 team_id 自动清除。

任务租约是 Controller 发给某次执行尝试的、有有效期的许可。Agent、Team 和项目有空余容量只是领取条件；授予时还检查依赖、身份及写文件冲突。Extension 自动处理协议，模型不必记住定时续约，用户不必逐项批准。

- 原子获取：检查和占用在一个不可被其它领取请求插入的短事务内完成。A/B 同时争 reviewer-1，只有一方取得全部必要资源，不会都看到空闲并一起开工。
- 续约：执行中定期延长有效期；例如 30 秒许可、每 10 秒续约只是建议。任务可持续数分钟，租约并不限制总时长。Agent 在线心跳与当前 attempt 续约不是同一件事。
- 实例绑定：许可绑定 agent_id、runtime_id、runtime_session_id 和 attempt；同名 Pi 重启或 `/new` 后不能继承旧许可。
- 旧结果拒绝：旧 attempt/失效许可返回结果不能覆盖新结果或推进依赖；可留作待核实证据，不等于删除产物。
- 失租隔离：没能续约只说明 Controller 无法继续确认许可，不证明 Pi 或其子进程已停止。把该 Agent 和冲突写资源标为不可再次分配。
- 显式恢复：先确认旧执行停止及产物归属，再记录释放、接纳已核实结果或新建 attempt。正常完成自动释放；只有状态不明的故障路径需要对账，不能仅看到重新 online 就自动重跑。

执行与审查都消耗实际 Pi 的模型循环和容量，所以都需许可。数据库中检查“审查是否已通过”这种纯状态判断不需要再开一个模型任务。只读审查虽无写文件副作用，也可能占着 Pi 或产生迟到的错误归属结果；初版统一协议，未来可单独优化。

## 不是什么

- “加入 Team”不等于“正在执行该 Team 的任务”，也不等于永久给角色文件写上 Team ID。
- 任务租约不等于 Controller 单实例文件锁，也不等于 agent_id 身份占用。
- 租约过期不是杀进程信号，fencing token 也不能直接阻止已启动 shell 写普通文件。
- 隔离不是关整个 Team/项目；不冲突且还有容量的其它 Agent 可继续。若隔离资源占满项目限额，则新任务也会等待。
- “最终会过期”不保证故障后自动恢复可用。这里选择先避免重复执行；人工确认旧进程停止的能力是恢复方案的一部分。

## 证据

- [需求文档 TR-03/04](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)
- [技术文档第 6–8 节](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md)
- 用户 2026-09-25 请求解释上述设计，不构成开始实施授权。

## 相关页面

- 概念：[[concepts/pi-squad]]
- 来源：[[sources/multica-team-runtime]]
- 会话：[[sessions/2026-09-25-squad-role-lease-explanation]]
