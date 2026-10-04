---
title: Pi 1.0.1 兼容入口与覆盖范围
type: process
status: active
created: 2026-10-04
updated: 2026-10-04
---

# Pi 1.0.1 兼容入口与覆盖范围

本目录提供可复用的 schema 2 observer 和受控集成入口，对应 [OpenSpec change](../../../openspec/changes/archive/2026-10-04-pi-squad-pi-1-0-1-compatibility/proposal.md)。正式功能、配置与启动以 [USAGE](../../../pi_squad/USAGE.md) 为准。本轮完成 P0 及选定的 P1 实施与代表性真实集成；以下覆盖限制继续保留。宿主核心事件就绪不代表阶段 04 原有 89 项全部通过，也不改变其计数。

## 真实环境

2026-10-04（Asia/Shanghai）使用独立 npm 安装的 Pi **1.0.1**，Node **v24.16.0**、Go **1.27.0**，模型 `local-grok/grok-4.7`，API `openai-completions`。实际入口为 `/private/tmp/pi-squad-compat-1.0.1-runtime/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`，SHA-256 为 `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`。全局 `/usr/local/bin/pi` 保持 1.0.0；上游 `pi-dev` 没有本轮源码修改。

先清理本轮旧测试 space，再在项目 cwd 新建 Herdr workspace。成功运行使用 `wX`（r3，Controller `127.0.0.1:60161`）和随后新建的 `wY`（r4，`127.0.0.1:52894`）。两轮都有 counter、summer、reviewer 三个独立角色、独立 Controller 和对应 Dashboard，并直接读取 pane；wX 另有 auditor 和 audit-team Leader。结束前所有 Attempt cleanup 均为 released，测试 workspace 已关闭。没有停止用户已有服务或调用其他 Agent 协助开发/验收。

TS 类型检查针对上述实际安装的公共声明通过；Controller `go build -o /tmp/pi-squad-compat-controller ./cmd/controller` 通过。不新增或运行单元测试。

## 标准观察入口

在项目根目录启动 Controller、至少三个不同角色 Pi 和 Dashboard。Controller 用独立数据库，仍持本 Project 锁。若已有用户 Controller，不强占该锁。

```bash
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=counter PI_SQUAD_ROLE_ID=counter \
  /绝对路径/pi-1.0.1/node_modules/.bin/pi --no-extensions \
  -e pi_squad/extension/index.ts \
  -e pi_squad_case/04-team-orchestration/compatibility/pi-probe.ts
```

observer 必须最后加载；不用仅包含文件工具的 `--tools` 白名单。完成正式任务后，在 TUI 执行 `/squad-probe-save`，再运行：

```bash
controller doctor --pi-binary /绝对路径/pi-1.0.1/node_modules/.bin/pi \
  --probe-file .agents/pisquad/.runtime/integration-probes/<session_id>.json
```

schema 2 只保存身份、section/request 哈希、工具名称和事件顺序，不保存原始 system、任务正文、payload、headers 或凭据。`formal_execution_ready=true` 要求所选安装匹配，且至少观察到一条有效核心生命周期；它不证明 Controller 业务验收，也不证明同报告的每个任务都成功。

## 受控集成入口

将上面生产 `index.ts` 替换为本目录 `adapter-entry.ts`，再最后加载 `pi-probe.ts`。两种 Squad 入口不能同时加载；`nested-read.ts` 是该入口内部的注册 wrapper，不能单独作为 `-e` 扩展加载。正式生产入口不读取以下控制文件。

控制目录为 `.agents/pisquad/.runtime/compatibility/<agent_id>/`：

| 文件 | 作用 |
|---|---|
| `<point>.pause` | 暂停该集成点，删除文件继续；`<point>.observed.json` 只记录点名及真实时间 |
| `nested-control.json` | 存在时包装本入口的 managed read，实际尝试嵌套 completion，要求宿主返回拒绝；保留原 read 的文件边界与 artifact |
| `request-case.json` | 格式为 `{"case":"history"}`；在生产 hook 之后修改真实 OpenAI chat 请求，observer 位于其后 |
| `leader-bypass.json` | `{"target":"<本轮隔离夹具路径>"}`；真实 Leader query 中用 ctx.executeTool 尝试 write/edit/Worker completion，须全部 isError，保留原 query 后 terminate；不伪造业务结果 |
| `stop-after-read.json` | 存在时让实际 managed read 返回 `terminate:true`，不提交结果，用于 RESULT_MISSING 负例；模型未调用 read 时不能声称此夹具被执行 |
| `provider-proxy.json` | `{"base_url":"http://127.0.0.1:<port>/v1"}`；仅给本会话更换模型传输地址，保留 provider/model 身份和原生凭据查询，不改默认配置 |
| `test-runtime.json` | `{"thinking_level":"low"}`；本集成会话使用低推理等级，避免夹具等待污染固定 deadline；不改用户全局设置 |

`provider-proxy.py` 必须在本轮独立 Herdr pane 前台启动。其 upstream 必须是明确选定的 loopback 模型服务；成功请求与流继续到真实模型。`--control` 的 `{"failures":["retry","overflow"]}` 依次为正式请求注入一次 HTTP 503 或 context-length 400，让 Pi 自身执行 retry/compaction；代理不创建 Task，也不代替模型执行。`--evidence` 只记录 seq、时间、request bytes/hash、正式任务身份、fault 和 HTTP status，绝不记录 headers、凭据或正文。验收后删除控制文件并退出代理。

2026-10-04 原阶段 04 的新增集成位于 ignored `../integration/evidence/r29-20261004/`，矩阵仍为原 89 项；不能把本目录上表的 19 个兼容场景当成阶段退出门。SQLite FULL 集成点仅存在于 `pisquad_integration` 构建，用隔离库引擎配额触发真实写失败，不填满用户磁盘。

本轮使用的集成点是 `settled_before_confirm`：实际 Pi 已 settled，本地正常确认尚未发送；暂停发生在传输队列外，续租和 interruption/stopped 仍能运行。已有 `dispatch_before_received`、`before_final_gate`、`input_after_injection_before_ack`、`input_after_ack`、`result_before_commit`、`result_after_commit_before_settled`、`settled_before_confirm`、`settled_after_confirm` 也可使用。后者暂停在控制面确认之后，旧回调不得清除新的 gate。禁止把文件暂停替代真实 settled。

请求 case：`history` 删除当前任务 system section、保留 user 历史；`tool-mismatch` 删除 `agent_task_get` 声明；`section-updates` 在真实当前 section 前添加旧身份及 Pi 的删除 framing，检查按顺序重放；`unknown` 把 messages 改为不可识别格式。unknown 是诊断负例，模型服务可能继续响应；观察后必须中断该测试任务并清理。

父子正例的临时 Controller 配置仅允许 `compat-counter` 调用 `compat-summer`，通过 `/tmp/pi-squad-compat-direct.yaml` 启动隔离服务；项目配置未修改。默认没有这些 grants 时，之前的子任务请求真实返回 `DIRECT_NOT_AUTHORIZED`，不能把该运行算父子正例。

## 覆盖记录

PASS 表示表内明确说明的真实断言通过；PARTIAL 表示仍有列出的运行分支未覆盖。当前为 **14 PASS / 5 PARTIAL**，不是 19 项全部通过。

| 场景 | 状态 | 实际观察及边界 |
|---|---|---|
| PC-A01 | PASS | 三角色 1.0.1 TUI 注册、whoami、正式任务；另有 audit-team Leader |
| PC-A02 | PASS | RPC/JSON/print 注册前拒绝；普通 RPC get_state 成功；负例身份未注册 |
| PC-A03 | PASS | 实际全局 Pi 1.0.0 TUI 显示所需 1.0.1 profile，恢复普通 Pi |
| PC-A04 | PARTIAL | managed read 内的嵌套 completion 返回拒绝，最终合法 count=3 被 checker 接受；其余八种控制调用共用 model-only 声明及 gate，未逐种实跑 |
| PC-A05 | PASS | 同一 assistant 响应的 clarify→complete 批次，前一错误结果之后才执行后一调用；统一 sequential 声明 |
| PC-A06 | PARTIAL | 仅文件工具的 --tools 导致 agent_clarify 缺失；明确拒绝且没有正式 input/injection receipt；hidden/deferred/codemode 的逐种负例未实跑 |
| PC-A07 | PASS | 正式 canonical、实际 active tools、末位请求工具集合一致；受管 read 和 ls 真正执行 |
| PC-A08 | PASS | 单独 completion、yield、clarify、answer、Leader wait/complete decision、正式 ask reply 均无额外模型请求；真实 settled 后 Controller 推进 |
| PC-A09 | PASS | completion 的 ARTIFACT_LENGTH_CHANGED 409 后模型继续请求；根任务 clarify 的 INVALID_CLARIFICATION 不终止批次；错误未成为 completed |
| PC-A10 | PASS | 同一 assistant 响应的 query+completion 均执行，之后新增一轮文本请求才 settled；未提前跳过 query |
| PC-A11 | PARTIAL | settled_before_confirm 暂停后真实 /new、人工输入均使旧 Attempt interrupted，不成为 completed，停止后 released；compact/bash/fork/tree 组合未逐项重跑 |
| PC-A12 | PARTIAL | 人工输入使 Pi 忙碌时旧任务保持 interrupted/pending cleanup，停止后才 released；doctor 的 pending=true 受控报告被拒绝；纯 pending=true、无其它状态变化的本地回调分支未单独实跑 |
| PC-A13 | PASS | 当前任务 section 被删除，历史 user 仍含合同：canonical match、末位请求 context mismatch，doctor false |
| PC-A14 | PARTIAL | 真实 OpenAI chat 请求中的旧 section→删除→当前 section 正确重放，doctor true；Anthropic tool_addition/removal、Responses additional_tools、Gemini 分支只核对实现和声明，未真实 provider 验收 |
| PC-A15 | PASS | 真实末位未知请求记录 REQUEST_FORMAT_UNSUPPORTED/unknown，doctor false；观察后人工中断 |
| PC-A16 | PASS | 生产观察为 squad_hook/match；后置修改后的末位记录为 last_observer/mismatch；删除工具声明同样不通过 |
| PC-A17 | PASS | 独立 npm 安装临时移开可选 types.d.ts，doctor errors=[]、警告 DECLARATIONS_UNAVAILABLE；有效真实报告仍可就绪，随后恢复文件；独立 native binary 未实跑 |
| PC-A18 | PASS | 以真实报告为基底的 schema 1、版本/profile/mode/path/hash、scope/身份/section/tools/order 负例均不就绪，宿主不匹配和乱序明确报错 |
| PC-A19 | PASS | counter 单任务、ask、Team 与父子链的有序当前上下文生命周期；doctor true，父任务报告含三个有效周期 |

## 保留的失败与实际修正

首次真实运行指出 autocomplete API 位于 `ctx.ui`；已修正激活检查。仅文件工具白名单不能同时保留 Squad 控制工具，已改用完整注册验证和受管 `ls`。空字符串 section 被 Pi 省略，预期证据已采用相同规则；保留旧 mismatch 报告，不改写成 PASS。

Grok 原先返回 CLI 升级所需的 426，用户修复服务后重新进行了正例。两处验收夹具错误也保留：独立扩展重复注册 read 被 Pi 拒绝，且最初误把 executeTool 的错误结果当成功；改为同入口 wrapper 并检查 isError。before_provider_request 的修改结果须直接返回 payload，旧夹具的包装格式错误按 unknown 保留，history 正例/负例均重新采集。

实际报告及原始快照保存在 ignored `../integration/evidence/pi-1.0.1-compat-20261004/`；运行证据默认不纳入提交。本页保存可复用入口、观察方法与覆盖限制。后续补全表中 PARTIAL 时采集新报告，保留旧失败；原阶段 04 验收继续使用其既有索引。


## 阶段 04 收尾使用的可选夹具

`adapter-entry.ts` 仍仅用于隔离验收。新增 `yield_before_commit`、`dispatch_before_received`、`result_before_commit`、`input_after_ack` 和 `settled_after_confirm` 可观察真实回调，不能制造 result 或 settled。`decision_<action>.pause` 暂停真实 Leader 工具，释放后仍检查 native abort、permit 和 Run CAS；暂停必须及时解除，超过120秒只构成超时隔离证据。

`/squad-fixture-ui` 读取本身份 runtime 中的 `ui-command.json`，在实际原生编辑器中设置已有草稿并进入真正的 Picker/Dashboard handler；它不派发任务。`request-case.json` 的 `plain-leader-claim` 让真实 provider 产生普通“完成了”文本，用于 RESULT_MISSING 负例，保留实际工具和 Squad sections。

`native-handoff-image.json` 是图片输入负例的显式开关：Pi1.0.1 原生 CLI 在 ImageContent 前生成 `<file>` 文本，夹具只移除这段已知前缀，保持实际 interactive input 的图片和用户草稿，再进入正式 router，验证 `UNSUPPORTED_HANDOFF_ATTACHMENT`、无模型轮及无部分派发。Pi1.0.1 的 clipboard paste 插入文件路径，不能冒充 ImageContent。该转换不在生产入口安装。
