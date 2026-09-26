---
title: 用户验收与实验记录规范
status: draft
type: process
acceptance_status: not_run
updated: 2026-09-27
---

# 用户验收与实验记录规范

当前计划清单共 **160 项**：ID 15、DISC 16、MSG 12、INV 15、阶段04 89、OBS 13。阶段04的89项为TR-A01—A33、CMD-A01—A16、P4-A01—A40，唯一清单见 [统一需求](04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)，实施顺序和来源见 [技术设计](04-team-orchestration/TEAM_RUNTIME_DESIGN.md)。其它阶段数量沿用各阶段登记；本次没有重新执行这些用例。

计划数量不是测试结果。P4新能力的89项均NOT_RUN；已有HTTP/身份/消息切片的部分PASS/PARTIAL证据继续保留在原RESULT中，不被本次文档整合重置，也不能自动当作新协议已通过。文中的lab工具需先实现，不能拿文档示例冒充可运行程序。

## 1. 验收前置条件

先检查当前Git分支/commit、阶段CLI/extension、Go/Node/Pi/模型配置、隔离实验状态和必要权限。所有Pi由使用者手动启动。阶段04使用当前项目的`.agents/pisquad`与其`.runtime`，不以旧SQUAD_HOME/旧UDS布局代替新目录验收；其它阶段按各自版本合同记录。

真实可见检查遵守`pi_squad/AGENTS.md`：新建专用测试workspace、至少三个不同Role Pi、Controller与Dashboard分终端、正常Pi从当前项目cwd启动。Herdr可以只是人工测试终端宿主；00—04的协作路由与状态判定不依赖Herdr adapter/API，不用Intercom/Teams等其它扩展补足被测能力。必须区分Herdr宿主和阶段05的业务location/focus适配器。

首次记录`go version`、`node --version`、`pi --version`、`git rev-parse HEAD`及实际doctor结果。记录实际扩展、模型与协议版本。API key、token、完整环境变量和敏感用户数据不得写入报告。源码或安装版本与固定参考不同，注明差异并重新验证API，不只写“最新版本”。

明确区分：`NOT_RUN`未执行；`BLOCKED`前置条件不足；`FAIL`执行但不满足；`PASS`操作、观察和证据全部满足。模型自述不能改变状态。`PARTIAL`只能用于报告汇总，不替代单用例四态。

## 2. 标准操作流程

按阶段文档准备配置、workspace、身份和一次性权限；运行正常流程并记录ID与状态。再逐条测试异常，每次只改变一个因素：退出Pi、目标/new、暂停目标进程、停止Go、重复请求或错误输入。

每一步写明“哪个终端、输入什么、应看到什么、实际看到什么”。计时从服务接收/事件发生点计算，不靠回忆。失败先保留证据、定位层级再修改；复测产生新记录关联原失败，不覆盖失败历史。

阶段通过要求本阶段全部用例PASS及前阶段关键流程无回归。NOT_RUN/BLOCKED必须保留，不用“基本通过”掩盖。允许分增量验收，但应列出尚未通过项。P4按M0—M8实施，不能先把@role转成Messaging ask就宣布正式调用通过。

## 3. 单用例记录模板

记录放本地`acceptance-runs/<run-id>/<case-id>.md`，默认不提交Git；需共享时只提交脱敏摘要。阶段04也可放Project runtime下的实验目录，但不能把运行状态写进Role/Team声明配置。

```markdown
# TR-A21 / 本次运行标识

状态：NOT_RUN
执行人：
日期及本地时区：
阶段/代码 commit：
Go / Node / Pi / extension 版本：
实际 protocol/schema 版本：
模型 provider/model：
Project root / 状态目录（脱敏）：
前置用例及结果：
fixture 路径 / sha256：

## 身份和关联
caller agent_id / runtime_id / session_id / binding_epoch：
target role_id / primary_agent_id / runtime_id / session_id / binding_epoch：
controller_epoch / primary_binding_epoch / ownership_revision：
request_id / message_id / ask_id：
task_id / attempt_id / segment_id / root_task_id / parent_task_id：
team_id / run_id / config_version / config_hash / goal_revision：

## 实际操作
终端 A：输入……
终端 B：输入……
CLI：运行……

## 预期与实际
预期：
实际：
计时起点/终点及测得时延：
是否发生非预期 Pi 启动/会话切换：

## 证据
真实Pi输入/工具轨迹：
命令输出文件：
事件 seq 范围 / trace_id：
资源和状态快照：
截图或录像：
结果 JSON / artifact摘要 / 确定性检查：
使用的test-only故障点及触发记录：

## 判定
PASS / FAIL / BLOCKED 及理由：
失败层级：protocol / directory / messaging / adapter / model / policy / task / acceptance / observer
修复 commit：
复测记录：
```

## 4. 必须保留的证据

| 能力 | 足够的用户证据 | 不足的证据 |
|---|---|---|
| 身份 | /new前后及重开后的完整身份JSON、epoch与ownership | 相同alias或PID |
| 发现 | 三Pi真实列表、同revision、离线时间线 | 只列配置文件 |
| 消息 | 正确接收端、唯一ID、收据及reply关联 | 发出方说已发送 |
| 调用 | Task/Attempt/segment、目标输入、result_proposed、settled、检查器 | 完成关键词或Herdr idle |
| 小队 | 真实Leader decision、DAG、成员任务、审查返工、最终Gate及释放 | 一个Agent模拟团队讨论 |
| Pi交互 | 补全/Picker/输入handled、原文件引用回归、Task路由证据 | 仅显示一个角色菜单 |
| Dashboard | 同revision投影、blockers/owner/Task/acceptance、stale恢复 | 静态截图或idle标签 |
| Herdr观察（阶段05） | 当前映射、安全focus、移动后刷新、拔除adapter后的业务回归 | pane名一致 |

控制面保留event_seq、事件类型、服务器时间、来源绑定、request/trace/run/task/attempt/segment等关联。模型token流无需全部存库；结果和关键事件必须足够追溯。禁止导出credential。

## 5. 真实Pi与故障模拟的分工

每阶段正常主流程必须使用真实Pi、真实extension、真实Go控制面。自然语言调用验证模型实际调用工具；显式命令/@role验证输入处理及正式Router，不要求为了证明路由再多跑一次本地LLM。

无模型测试验证CAS、旧代次、重复请求、状态迁移、协议不兼容和故障窗口，不能替代真实会话输入。异常不易手工复现时可使用test-only failpoint，例如dispatch持久化后/注入前/注入后ACK前；记录注入点和事件。failpoint只在实验构建启用，不给模型开放控制面破坏工具。

计划分组：ID 15（含ID-X01—06）、DISC 16（含DISC-X01—04）、MSG 12、INV 15、P4 89（TR 33 + CMD 16 + P4补充40）、OBS 13，总160。每份阶段文档定义具体判据，不用一个lab命令替代整组验收。P4保留原TR/CMD编号，补充用例不宣称对应既有测试已通过。

## 6. 计时、并行与完成的判定

本机控制面响应/消息received目标通常2秒；旧Directory实验的心跳2秒、suspect6秒、offline10秒按对应阶段配置记录，不自动冒充当前HTTP默认值。记录实测和容差，不把目标数字抄成实际结果。模型120秒仅是收集结果的观察预算，不是SLA。

并行由两个不同Agent的运行区间重叠证明。单Pi的正式segment不得重叠。父Attempt suspended期间可释放执行容量，但逻辑affinity仍保留，不能让无关任务进入同一会话。任务太快无法观察时更换可复现材料，不伪造时间。

Task completed与acceptance accepted分别验证。数字fixture三行10/20/30，真值count=3、sum=60，由独立确定性检查器核对。强制错误候选sum=50应被reviewer拒绝，返工后复审。审查证据保存reviewer身份和被审查版本，实施者自写“审查通过”不构成独立验收。

## 7. 故障恢复与安全清理

停止Go不代表Pi停止。重启后先查看needs_review和真实目标状态；recover --attach-evidence只关联可核实旧结果，retry --rebind-current才创建新Attempt，不能混用。取消请求与执行已停止分开，旧结果不能复活已中断任务。

暂停/终止进程前，在agents get和进程列表人工核对本实验PID，禁止pkill pi等宽泛操作。只关闭旧测试workspace，不动用户其它服务。停止Herdr adapter和停止Herdr server分开；宿主退出可能使Pi退出。

结束实验先核实活动/隔离任务，手动退出实验Pi，停止测试Go/observer，备份DB、配置和必要session证据。保留失败与artifact摘要；不删除全局~/.pi、上游submodule或用户项目；文件副作用不自动回滚。

需要由Claude等验收Agent执行时，按当前pi_squad/AGENTS.md动态读取派发者pane/terminal，记录handoff_id、callback和报告路径，完成或明确阻塞后主动回传一次。回传不自动批准下一阶段。本次需求整合没有派发或运行此类验收。
