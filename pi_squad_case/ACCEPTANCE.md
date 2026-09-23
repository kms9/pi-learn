---
title: 用户验收与实验记录规范
status: draft
type: process
acceptance_status: not_run
updated: 2026-09-21
---

# 用户验收与实验记录规范

本目录 6 个阶段共 **85 个计划用例**（原75项＋评审补充10项），均尚未执行。用例不是可运行脚本；文中的 lab 工具也需要先实现。该文档规定实施后怎样证明功能可用，以及哪些证据不足以宣告通过。

## 1. 验收前置条件

先检查当前 Git 分支/commit、阶段 CLI/extension、Go/Node/Pi/模型配置、独立 SQUAD_HOME、必要权限。所有 Pi 由使用者手动启动。阶段 00—04 不连接 Herdr，不借助已有 Intercom/Teams 扩展偷偷补足功能。

首次验收记录 `go version`、`node --version`、`pi --version`、`git rev-parse HEAD`、`squad doctor --json`。API key、token、完整环境变量、真实用户敏感数据不得录入报告。版本或源码与锁定参考不同，要注明差异并复核 API；不能只说“最新版本”。

明确区分四种状态：`NOT_RUN` 未执行；`BLOCKED` 因前置条件不足无法执行；`FAIL` 执行后不满足标准；`PASS` 操作、观察和证据全部满足。模型自称成功不能改变状态。

## 2. 标准操作流程

先按阶段文档准备配置、workspace、身份和一次性权限；运行正常流程，记录 ID 与状态。随后逐条执行异常场景，每次只改变一个因素：退出一个 Pi、在目标 `/new`、暂停目标进程、停止 Go、重复一条消息或使用错误数据。

每步写出“在哪个终端、输入什么、应看到什么、实际看到什么”。时间从服务接收/事件发生点计算，不从记忆估算。出现失败先保存证据，定位在哪一层，再修改实现；复测用新记录关联原失败，不覆盖旧失败。

阶段通过要求本阶段所有用例 PASS，且前阶段关键流程无回归。任何 NOT_RUN/BLOCKED 都应保留，不写“基本通过”代替缺失证据。允许按每个真实闭环分批验收，但必须报告尚未通过部分。

## 3. 单用例记录模板

复制以下模板到本地 `acceptance-runs/<run-id>/<case-id>.md`。默认该目录不提交 Git；需要分享时只提交脱敏后的证据摘要。

```markdown
# INV-01 / 本次运行标识

状态：NOT_RUN
执行人：
日期及本地时区：
阶段/代码 commit：
Go / Node / Pi / extension 版本：
模型 provider/model：
SQUAD_HOME（脱敏）：
前置用例及结果：
fixture 路径 / sha256：

## 身份和关联
caller agent_id / runtime_id / session_id / binding_epoch：
target agent_id / runtime_id / session_id / binding_epoch：
request_id / message_id / ask_id：
task_id / attempt_id / root_task_id / parent_task_id：
team_id / squad_run_id / config_version：

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
命令输出文件：
事件 seq 范围 / trace_id：
截图或录像：
结果 JSON / 文件摘要：

## 判定
PASS / FAIL / BLOCKED 及理由：
失败层级：protocol / directory / messaging / adapter / model / policy / task / acceptance / observer
修复 commit：
复测记录：
```

## 4. 必须保留的证据

| 能力 | 足够的用户证据 | 不足的证据 |
|---|---|---|
| 身份 | `/new` 前后及重开后的完整身份 JSON | 相同 alias 或 PID |
| 发现 | 三 Pi 实际列表、同 revision、离线时间线 | CLI 仅列出配置文件 |
| 消息 | 正确接收端、唯一 ID、收据和对应 reply | 发出方写“已发送” |
| 调用 | task/attempt、真实目标输入、result_proposed、settled、检查器结论 | 输出有“完成”或 Herdr 显示 idle |
| 小队 | 真实 Leader 决策、DAG、成员任务、审查/返工、最终 gate | 一个 Agent 写了一段模拟团队讨论 |
| 观察 | 当前映射和安全 focus、移动后刷新、拔除 adapter 的业务回归 | 只有一张静态表格 |

控制面事件保留 `event_seq`、事件类型、服务器时间、来源绑定、request/trace/task/attempt 等关联。模型 token 流不必全量进入数据库；结果和必要状态事件应足够追溯。禁止导出 credential。

## 5. 真实 Pi 与故障模拟的分工

每阶段主流程必须使用真实 Pi、真实 extension、真实 Go IPC，且通过自然语言调用对应工具。无模型测试能验证 framing、旧代次、重复请求、状态迁移、协议不兼容，但不能证明对话路由、实际 session 输入或工具调用成立。

异常窗口不易手工复现时可使用明确的 test-only failpoint，例如 dispatch 持久化后、Pi 注入前、注入后回执前；必须记录注入点和实际事件。failpoint 只在实验构建显式启用，不能给普通模型开放任意破坏控制面的工具。

85 个用例分组为 ID 15（原9＋ID-X01—06）、DISC 16（原12＋DISC-X01—04）、MSG 12、INV 15、TEAM 14、OBS 13。每份阶段文档定义了该组全部步骤和判据；不要用一个 lab 命令替代整组用户验收。

## 6. 计时、并行与完成的判定

本机服务响应/消息 received 目标通常 2 秒；Directory 心跳2秒、suspect6秒、offline10秒，具体容差见阶段01。记录实测结果而不是把目标数字抄进“实际”。模型等待预算120秒仅用于收集结果，不视为性能承诺。

并行必须由两个不同 Agent 的 running 时间区间重叠证明。单 Agent 正式任务的区间不得重叠。若任务太快看不出，使用更长的只读材料重新测试，不伪造开始/结束时间。

任务 completed 与 acceptance accepted 分别检查。数字 fixture 真值由独立确定性检查器核对：三行10/20/30，count=3、sum=60。审查报告保存其证据和 reviewer 身份；不能让被审查者代写“已审查通过”作为唯一证据。

## 7. 故障恢复与安全清理

停止 Go 不代表 Pi 已停止工作。重启后先查看 needs_review 和目标真实状态；`recover --attach-evidence` 只关联可核实结果，`retry --rebind-current` 才创建新 attempt，二者不得混用。

暂停/终止进程前，在 `agents get` 输出和操作系统进程列表中人工核对仅属于本实验的 PID。禁止 `pkill pi` 等宽泛操作。停止 Herdr adapter 与停止 Herdr server 分开测试；宿主退出可能使 Pi 退出。

实验结束先核实活动任务，手动退出实验 Pi，停止 Go/observer；备份 DB、配置和必要 session 证据。新一轮使用新的 SQUAD_HOME，不能删除全局 `~/.pi`、上游 submodule 或用户项目。文件副作用不自动回滚；修复测试文件时保留旧摘要与失败证据。
