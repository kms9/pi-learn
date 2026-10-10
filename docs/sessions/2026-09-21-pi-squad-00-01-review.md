---
title: Pi Squad 身份与发现的三方评审
type: session
status: active
created: 2026-09-21
updated: 2026-09-21
tags:
  - project-wiki
  - session
  - pi-squad
---

# Pi Squad 身份与发现的三方评审

## 用户要做什么

结合阶段 00/01 评估如何完成需求，与当前 Herdr 中 Grok、Cursor 协商；冲突由用户补充或裁决。本轮为设计评审，不是实现或运行验收。

## 协商参与者与证据

- Codex：主协调、核对源码、统一写回 wiki。
- Grok：用户明确指定当前 Herdr `w3:p1`。
- Cursor：当前 Herdr `w6:p1`。
- 起初向 `w5:p1` 发过只读评审，随后用户指定 `w3:p1`；前者不计入正式共识。
- 通过现有 Herdr `agent prompt/read/get` 交互，没有创建新 Agent。Herdr 是本次评审通道，不成为阶段 00/01 产品依赖。
- 输入：[阶段00](../../pi_squad_case/00-identity-protocol/README.md)、[阶段01](../../pi_squad_case/01-agent-discovery/README.md)、[总方案](../../pi_squad_case/README.md)、[[sessions/2026-09-21-pi-squad-plan|此前需求确认]]。
- 检查时 overlay HEAD：`355f75a4850ccf8d37c5a174ef6c548b45e7f0a6`；Pi HEAD：`890f920884f6d21fc7617d236ef9e1cc5d7a0ef8`。
- Pi 原文证据：[事件类型](../../pi-dev/packages/coding-agent/src/core/extensions/types.ts)、[reload 实现](../../pi-dev/packages/coding-agent/src/core/agent-session.ts)、[ResourceLoader](../../pi-dev/packages/coding-agent/src/core/resource-loader.ts)。before_switch/fork 可取消；shutdown 原因包括 reload/new/resume/fork；不能一概视为进程退出。

## 达成了什么

结论：现有总体路线可实现，但应先补齐身份占用、重连代次、生命周期和名单快照合同，再按 00→01 实施。00/01 只完成“我是谁”和“还有谁在线”，完整委派/小队需求仍需 02—04；Herdr 只在 05 增强观察。

用户已裁决：

1. **占用优先**：“先拒绝新 Pi，待我确认旧 Pi 退出或显式释放身份”。失租只改变在线状态，不自动让新 runtime 抢占身份。
2. **suspect 拒绝投递**：“暂停并明确报不可联系；恢复 online 后由调用者重试”。不隐式排队、自动重试或补发。

Cursor R2 同意快照、生命周期与隔离自动发现入口修订；R3 同意占用优先、CAS释放、跨 daemon 保留占用，并要求连续性校验摘要持久化。Grok R1 同意整体路线并提出细化意见；R2 明确“同意”，要求终稿删除旧pending、区分presence/重绑宽限/ownership、改写DISC-07、同事务撤销摘要；上述条件已写入终稿。Cursor 随后以 `SQUAD_REVIEW_CURSOR_FINAL` 明确同意终稿，并确认“无阻塞需求冲突”。用户裁决优先于各 Agent 早先的租约优先建议。

## 收敛合同

| 主题 | 实施合同 |
|---|---|
| 身份 | agent_id 长期稳定；runtime_id 进程级；session_id 读取 Pi；alias、PID、cwd、Herdr 位置不作身份。 |
| 所有权/租约 | SQLite 持久化 ownership 与撤销记录；lease 只证明在线。suspect、offline、EOF、daemon重启均不自动释放身份。 |
| 同 runtime 重连 | 进程随机 secret 只放 globalThis；Go 保存校验摘要并与 ownership 绑定。认证后原子换 connection_epoch，旧连接拒绝。原 secret 不写日志、配置或 DB。不是同 UID 恶意进程隔离。 |
| 代次 | connection_epoch 使用跨 daemon 不重复 UUID；daemon_epoch 每次启动新发。session实际变化、失租后重绑、daemon重启后重绑或release增加持久 binding_epoch。有效租约内纯连接更换不增 binding。 |
| 释放 | 正常认证 quit 释放；未能提交的 quit、异常退出需用户确认后 operator-only release。完整 agent_id + expected runtime/binding_epoch 做事务CAS；撤销旧runtime并记录审计，迟到重连返回 BINDING_REVOKED。只让出逻辑身份，不kill、不证明本地副作用停止。 |
| 生命周期 | factory只声明；session_start 开资源；shutdown对称清理。before_switch/fork 可取消，不提前提交换绑或永久暂停。以实际 session_start/session_id 提交换绑。 |
| reload | 清理旧listener/timer/socket，本地generation拦旧回调；runtime_id不变。transport断开立即不可联系但ownership保留；旧逻辑租约仍有效则重连保binding，失租则递增。宽限不超过最后有效心跳起10秒，不因reload重置期限。 |
| 名单 | canonical agents 按相同筛选条件、daemon_epoch/revision比较；self 是viewer投影。last_seen_at保存该版本已发布的真实心跳时间，发布刷新时revision++，内部租约另存；禁止同revision偷偷改值或把发布时间冒充心跳。 |
| Watch | 原子snapshot+cursor或有界增量日志；gap、overflow、daemon变化强制全量重取。list默认仅online，get可读离线，watch默认所有presence变化。 |
| suspect | 后续send/ask/invoke返回AGENT_SUSPECT、retryable=true，由调用者在online后重试。本阶段未开放接口仍返回CAPABILITY_UNAVAILABLE。 |
| activity | 初始unknown，真实事件/采样才更新；UI结束恢复当前底层activity，不盲目idle；换会话清旧状态。idle不是业务完成。 |
| 配置/协议 | alias在SQLite为真源；改名保持普通文件原路径，doctor可修复alias投影，不动ID/token。hello分agent/operator；幂等键含principal/method/request_id且检测异payload。半帧超时、连接/队列上限需实现。 |
| reload验收入口 | -e只作快速测试；ID-06用隔离实验项目 .pi/extensions/ 单一自动发现入口，不同时双载、不改全局安装；加载清单和具体隔离命令需实测。 |

这些是拟实现合同。尚无功能代码或运行结果；不得把讨论中的接口当作已可用。

## 如何完成需求

| 增量 | 工作与可见结果 | 门槛 |
|---|---|---|
| M0 基础 | Go module/TS锁、profile CLI、SQLite迁移、权限、daemon独占锁、frame/hello。 | frame异常、重复请求、独占与配置恢复测试有真实结果。 |
| M1 单Pi | 薄TS adapter，whoami对齐CLI；用真实Pi的new/reload/退出重开验证身份。 | ID-01—09 + ID-X01—06；含占用、CAS释放、旧runtime拒绝、服务重启。 |
| M2 三Pi | 复用同一身份服务和租约，新增Directory及CLI。 | 三个用户手动启动Pi，名单真实互见、跨cwd不混身份。 |
| M3 对话与观察 | 单一命令dispatcher、agent_directory工具、snapshot/watch；StringEnum、结构化details和输出截断遵循扩展约束。 | 真实模型工具调用轨迹；不是模型凭空回答名单。 |
| M4 故障回归 | 暂停/恢复、真休眠、daemon重启、旧连接、watch断档、显式release。 | DISC-01—12 + DISC-X01—04，回归阶段00；不能用mock替代真实Pi流程。 |
| 后续 | 02消息→03正式委派→04固定小队→05可选Herdr观察。 | 不把“发现在线”当作“已经交付任务”。 |

代码只写 overlay `pi_squad_case/`；根一个Go module、一套TS依赖锁；后阶段复用前阶段工厂/包，不复制系统，不改上游submodule。具体Go/SQLite版本首次实现锁定并记录，实装Pi/API兼容性由doctor与运行验收确认。

原计划75项保留，新增00六项、01四项补充验收，合计85项计划用例，全部 NOT_RUN。没有运行验收，不能声称阶段通过。

## 分歧怎样收敛

- Cursor起初建议心跳刷新不升revision、默认list含suspect、保留symlink路径；讨论后采用不可变canonical snapshot、list仅online、普通文件原路径。
- Grok起初建议last_seen不进入canonical；协调方提出真实心跳时间冻结在已发布版本、刷新必升revision，避免展示值与快照版本矛盾。
- 两方早先讨论失租后新实例接入；用户明确选择占用优先，最终合同拆出持久ownership，不因租约过期释放。
- 自动发现reload按根AGENTS.md执行；隔离项目入口避免修改全局配置。未实测能力保持unknown/NOT_RUN。

## 未决与限制

用户的Q6/Q7均已回答，不再保留为产品歧义。运行层未知：本机Pi版本是否匹配、globalThis跨reload表现、隔离加载命令、macOS休眠计时与重连时延；在实现/验收中验证，不编造结果。三方评审已经收敛，当前没有待用户裁决的需求冲突。

## 写回了哪些 wiki 页

- 本页、[[questions/open-questions|开放问题]]、索引与日志。
- 两份阶段README及总索引/验收文档同步用户裁决和补充用例。
- 相关需求：[[sessions/2026-09-21-pi-squad-plan|六阶段需求规划]]。

- 已决规则：[[decisions/2026-09-21-squad-ownership-and-suspect|身份占用与suspect投递]]。


## 与指定 Grok 的再次协商

用户要求“再和grok协商一下”，继续使用既有 Herdr `w3:p1`。本轮未再请求 Cursor 评审；以下为 Codex 与 Grok 在前次三方合同基础上的技术细化，不将其写成 Cursor 已复核的新结论。

Grok 以 `GROK_FOLLOWUP_R1` 提出三个可复现的设计反例：同runtime双hello反复夺连接；quit提交但ACK丢失后，旧请求误释放新owner；嵌套prompt/乱序事件误报idle。Codex补充旧socket的close/timeout也须校验代次，并纠正connect_seq服务器应保存收到值而非再加1。

经第二轮交换，Grok以 `GROK_FOLLOWUP_FINAL 同意` 明确接受：

1. **握手排序**：进程单一连接管理器、generation和单飞；按agent/runtime递增connect_seq，Go事务比较并持久化最大值；旧hello、close、timeout均不能覆盖新连接。随机connection_epoch用于相等校验，不负责握手排序。
2. **释放重放**：quit与operator release用同一CAS撤销原语。quit先停自动重连，提交即终态；ACK丢失不自动夺回。仍获授权的operator重放只读原结果，已撤销runtime不能利用幂等查询重新握手；由operator查审计。Grok确认这是既有“释放撤销旧runtime”的实现澄清，无须新增用户裁决。
3. **活动状态**：prompt_depth与底层activity分离，depth>0保持blocked；归零后根据当前状态重新判断；缺口/unmatched end标unknown。presence/activity立即升revision，last_seen单独节流，不延迟真实状态变化。

具体合同已写入 [00第11节](../../pi_squad_case/00-identity-protocol/README.md)、[01第10节](../../pi_squad_case/01-agent-discovery/README.md)。细化ID-X02/X04/X06、DISC-08/X02子场景，不增加总用例数，仍85项且全部NOT_RUN。

开工判断：M0可开始；M1所需握手/释放合同已补齐，可以进入实现，旧close回调防护须与hello一起完成；prompt嵌套观察在M3验证。本轮只协商和修改文档，没有实现代码或运行实验。没有新增待用户判断的产品分歧。
