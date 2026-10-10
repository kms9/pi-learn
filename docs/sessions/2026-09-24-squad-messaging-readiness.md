---
title: 2026-09-24 Squad 通信验证就绪评估
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 Squad 通信验证就绪评估

## 用户要做什么

基于角色文件与 cwd/runtime_id 已落地的进展，判断是否可以进入相互通信验证。

## 最新复核：角色目录与发现已通过，可开始通信开发

2026-09-24 根据 Claude `wB:p1` 最新回答及 `pi_squad_case/role_dir_check/RESULT.md` 复核：本轮使用 `wD`、端口 `18781`，三个正常 Pi 从仓库 cwd 加载 reviewer/backend/scribe；Controller 与 Dashboard 显示三者 online。reviewer 按 role=scribe 查询，再以返回的 agent_id 调用 get_agent，cwd/runtime_id 与目标 whoami 一致。旧平铺配置是明确的拒绝负例。此结论替代下文早期“缺 get_agent / 缺三个正常角色”的现状描述；不代表原 P0/P1 全部故障恢复用例已验收。

结论：可以进入相互通信的开发阶段；当前还不能直接验证消息往返。源码中 Extension 仅注册 list_agents/get_agent，Controller 仅有注册、心跳、列表、单体查询及 health 路由。

建议先实现 HTTP 纯文本通知闭环（发送、收件、确认、查询），再增加关联原消息的显式回复和异步 ask。角色只用于发现，发送按 agent_id 精确路由；发送时固定目标运行实例和会话，回复关联原 message_id/ask_id，不依赖“最近联系人”。Controller 接受、扩展收到、模型回复必须分开表示。

通信首个切片同时补实例持有者校验：当前 register 使用 agent_id 冲突覆盖，heartbeat 不带 runtime_id，UUID 仍只是元数据。需要衔接已拍板的身份占用/显式释放规则，防止旧进程心跳、收件或确认影响新绑定；/new 后旧消息不能进入新会话。消息 ID、幂等、收件确认是通信基础，不扩展为智能体历史/状态管理，也不引入 tools/model/skills 配置。

开发完成后仍交 Claude 在独立 Herdr workspace 验收：A → B 指定投递、B → A 关联回复、第三个 Pi 不误收、重复投递不重复处理、离线明确失败、进程替换和 /new 不串会话。首轮通知不自动触发模型；自动 ask 后续接入空闲检查和忙时排队，回复不自动生成新问题。

本轮仅查阅验收证据和实现，未自行启动测试或修改运行服务。下文保留初次评估及历史合同差异，实施时需要形成与当前 HTTP 实现一致的通信契约。

## 达成了什么

结论：已有足够基础开展下一轮工作，但尚不能将 P0/P1 标为全部验收完成，也没有可直接使用的消息工具。建议下一轮先补齐前置验收，再实现最小 P2 往返。

### 已有基础与缺口

- 已验证真实 Pi 角色加载、两个有效实例注册、cwd/UUID、提示注入、/new/reload；第三个测试 Pi 是无角色的负例，不等于三个有效 Agent 注册。
- Controller smoke 证明协议层 offline/重注册/服务重启，但真实 Pi 的三个有效成员、停一侧、同身份进程重启、Controller 重启后持续 Pi 心跳链路仍需对应原 Mandatory Cases 补证据。
- list_agents 工具与 HTTP 单体查询已有；Extension 的 get_agent 工具尚缺，P1 的真实工具调用与角色/离线查询尚需正式验收。
- runtime_id 目前只是记录属性。现有 upsert 允许同 agent_id 覆盖，HeartbeatRequest 不带 runtime_id，SQL 仅按 agent_id 更新。UUID 不能直接被视为有效持有者校验；可靠通信前需补接收方绑定与过期 runtime 拒绝，否则旧进程可能误续心跳或取消息。

### 建议下一步范围

1. 使用隔离端口/数据库和三个真实 Pi 补跑 P0；不再以旧“无 Pi”环境结论替代当前结果。
2. 补 get_agent 与 P1 发现验证，通过既有退出门后进入 P2。
3. 沿用现有 HTTP Controller，加入 send_message、内部 poll/ack、reply_message，先实现纯文本。消息路由按 agent_id，冻结目标 runtime_id 和 runtime_session_id；role 只用于发现，cwd 只作上下文。
4. 先证明 A → Controller → B 收件，再证明 B 的显式回复按 message_id/reply_to 或 correlation_id 回到 A。回复不自动再次触发回复，避免无限往返。
5. 最小验收包括正确收件人、回复关联、重复轮询去重、离线明确失败、/new 或进程替换不把旧消息交给新绑定。先跑无模型投递检查，再用真实模型验证一次自动回复。

历史记录/智能体状态管理仍不展开。通信所需 message_id、关联和最小投递确认不能省略：Controller 接受不等于 Pi 收到，更不等于模型回复。完整 crash/retry 窗口处理不能被单次 ping/pong 替代。

### 旧合同差异

当前 P0 属于 Notion HTTP P0–P7 路线；`02-agent-messaging/README.md` 是较早 UDS 六阶段方案，其 CLI、统一 agent_message 工具、ownership 和复杂状态不应被描述为已实现。

Notion P2 写“离线保存消息”，旧 02 写“离线失败留记录、恢复不自动投递”。建议按已拍板的显式重试原则，离线留失败记录且不自动补投；实施前在新的 HTTP P2 文档明确此语义。旧 ownership/suspect 决策与当前 P0 upsert 的差异需要明确衔接，不能借本次评估默默宣布旧决定失效。

## 写回了哪些 wiki 页

- 本页、主索引、开放问题和日志。

## 未决

- HTTP P2 应明确实例绑定/占用校验与离线失败记录的合同，既有 UUID 字段不等于已有防旧实例机制。
- 本轮仅评估，没有实现消息功能、发送 Agent 消息或运行新测试。

## 相关页面

- 概念：[[concepts/pi-squad]]
- 实现：[[sessions/2026-09-24-squad-frontmatter-runtime-implementation]]
- 来源：[[sources/herdr-pi-extension-cases]]（P0/P1 退出门、P2）
- 证据：`pi_squad_case/phase_00_identity/RESULT.md`、`ACCEPTANCE.md`、`CASES.md`；`pi_squad/controller/agent/registry.go`、`model.go`。
- 旧决策：[[decisions/2026-09-21-squad-ownership-and-suspect]]
