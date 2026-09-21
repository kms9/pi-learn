---
title: Pi Squad 源码证据与版本索引
status: draft
type: source
updated: 2026-09-21
---

# 源码证据与版本索引

此索引区分“上游实际代码”“本实验设计”和“尚未实现/测试”。引用固定到 commit，不用浮动 main 链接充当证据。核查日期2026-09-21；没有运行这些上游仓库的完整测试，也没有验证本机 Pi/Herdr 安装。

## 1. 源码基线

本仓分支基线：`kms9/pi-learn@2ee5bd7995d1504f73aa5955181f3b9fa5289b8e`。Pi、Intercom、Subagents沿用该提交的gitlink。外部参考只固定阅读快照，不在本次修改.gitmodules或擅自引入运行依赖。

| 来源 | 固定 commit | 本仓参考路径 | 选择依据 |
|---|---|---|---|
| `earendil-works/pi` | `890f920884f6d21fc7617d236ef9e1cc5d7a0ef8` | `pi-dev/` | pi-learn gitlink |
| `nicobailon/pi-intercom` | `199279ae861bf53ce014809fb2a03337538ae13e` | `pi-intercom/` | pi-learn gitlink |
| `nicobailon/pi-subagents` | `678f842f386334d8444af9265ff85636e3216cef` | `pi-subagents/` | pi-learn gitlink |
| `tmustier/pi-agent-teams` | `2c1776d2a68104aaadc1c622d8a704684c7c35d6` | `外部参考，非本次新增submodule` | external inspected snapshot |
| `multica-ai/multica` | `b866dacd1cc5932d88863b5634826d8efb9260c6` | `外部参考，非本次新增submodule` | external inspected snapshot |
| `herdrdev/herdr` | `5a649142233631f8407b4099da0e8e78dfef8574` | `外部参考，非本次新增submodule` | external inspected snapshot |

## 2. 已读文件、函数与所支持结论

“全文件”指本次读取文件内容；标范围的只依据该范围，不推断整个项目。搜索片段与长响应截断均单列，后续修改相关实现前必须再打开具体函数及测试。

### earendil-works/pi

| 固定源码链接 | 阅读范围/方式 | 函数或类型 | 阶段与参考逻辑 |
|---|---|---|---|
| [packages/coding-agent/src/core/extensions/types.ts](https://github.com/earendil-works/pi/blob/890f920884f6d21fc7617d236ef9e1cc5d7a0ef8/packages/coding-agent/src/core/extensions/types.ts) | 220–380；380–650；695–830；1170–1490 | `ExtensionContext、SessionStartEvent/ShutdownEvent、AgentSettledEvent、ExtensionAPI` | 00–05：真实 session/lifecycle；ctx.abort；命令工具；输入/显示/状态entry边界。 |
| [packages/coding-agent/package.json](https://github.com/earendil-works/pi/blob/890f920884f6d21fc7617d236ef9e1cc5d7a0ef8/packages/coding-agent/package.json) | 1–115 | `name/version/engines` | 00及所有前置检查：参考包0.86.1、Node>=22.19.0；不是已检测的本机安装。 |
| [packages/coding-agent/src/cli/args.ts](https://github.com/earendil-works/pi/blob/890f920884f6d21fc7617d236ef9e1cc5d7a0ef8/packages/coding-agent/src/cli/args.ts) | 代码搜索命中片段，不声称通读全文件 | `--no-extensions / -e 解析分支` | 00–05：禁止自动发现其他扩展，显式加载本阶段入口仍可用。 |

### nicobailon/pi-intercom

| 固定源码链接 | 阅读范围/方式 | 函数或类型 | 阶段与参考逻辑 |
|---|---|---|---|
| [broker/framing.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/broker/framing.ts) | 全文件 | `writeMessage/createMessageReader` | 00/02：长度前缀、UTF-8 JSON、分片重组、最大帧；Go重写。 |
| [broker/protocol.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/broker/protocol.ts) | 全文件 | `isMessage/isMessageReceipt/isSessionInfo/isSessionRegistration` | 00–02：消息、收据、注册字段验证；显示字段不作认证。 |
| [broker/broker.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/broker/broker.ts) | 1–220 | `IntercomBroker、ConnectedSession、DeliveryRecord、MessageReceiptRoute、scopedSessionKey` | 01/02：中央注册/连接/作用域/路由数据结构；未通读全部路由handler，不据此宣称全部实现无缺陷。 |
| [broker/client.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/broker/client.ts) | 1–170 | `IntercomClient.isConnected/startLivenessHeartbeat/runLivenessProbe` | 01：主动检测半开连接；我们的2/6/10秒是自定测试配置。 |
| [reply-tracker.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/reply-tracker.ts) | 全文件 | `ReplyTracker.recordIncomingMessage/resolveReplyTarget/markReplied` | 02/03：ask/reply关联和歧义失败；Go持久化；不用长阻塞Promise占Pi。 |

### nicobailon/pi-subagents

| 固定源码链接 | 阅读范围/方式 | 函数或类型 | 阶段与参考逻辑 |
|---|---|---|---|
| [src/extension/herdr-pi-bridge.ts](https://github.com/nicobailon/pi-subagents/blob/678f842f386334d8444af9265ff85636e3216cef/src/extension/herdr-pi-bridge.ts) | 入口、execute、session_start、message_end、agent_settled、supervisor及configure片段；长响应存在截断 | `registerHerdrPiBridge、execute、activeRequestId` | 02–04：command/accepted/event/settled关联、supervisor反馈；不借远程启动/SSH/manifest；Pi公开abort属于ctx。 |
| [src/runs/shared/herdr-pi-protocol.ts](https://github.com/nicobailon/pi-subagents/blob/678f842f386334d8444af9265ff85636e3216cef/src/runs/shared/herdr-pi-protocol.ts) | 全文件 | `HerdrPiFrame/encodeHerdrPiFrame/HerdrPiFrameDecoder` | 00/03：JSONL帧版本/请求身份；与Intercom长度前缀并不兼容。 |

### tmustier/pi-agent-teams

| 固定源码链接 | 阅读范围/方式 | 函数或类型 | 阶段与参考逻辑 |
|---|---|---|---|
| [extensions/teams/task-store.ts](https://github.com/tmustier/pi-agent-teams/blob/2c1776d2a68104aaadc1c622d8a704684c7c35d6/extensions/teams/task-store.ts) | 1–290 | `TeamTask/updateTask/isTaskBlocked/claimTask/completeTask` | 03/04：任务owner、依赖和原子写文件；Go另外实现事务式占槽、失败/取消/验收。 |

### multica-ai/multica

| 固定源码链接 | 阅读范围/方式 | 函数或类型 | 阶段与参考逻辑 |
|---|---|---|---|
| [server/internal/handler/squad_briefing.go](https://github.com/multica-ai/multica/blob/b866dacd1cc5932d88863b5634826d8efb9260c6/server/internal/handler/squad_briefing.go) | 1–250 | `squadOperatingProtocolFor/buildSquadLeaderBriefing/buildSquadRoster/squadOperatingProtocolHardRules` | 04：Go侧组装协调规则、roster、instructions；派发后结束轮次、触发重评估、防重复派发。 |

### herdrdev/herdr

| 固定源码链接 | 阅读范围/方式 | 函数或类型 | 阶段与参考逻辑 |
|---|---|---|---|
| [src/integration/env.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/integration/env.rs) | 全文件 | `HERDR_*_ID_ENV_VAR/apply_pane_base_env` | 05：ID/socket启动线索；不是可靠的实时位置或认证。 |
| [src/api/client.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/api/client.rs) | 1–160 | `ApiClient/ConnectionTarget/request_value/status` | 05：显式session/socket端点；JSONL；ping版本能力。 |
| [src/api/schema.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/api/schema.rs) | 1–240 | `Request/Method` | 05：核对ping/session.snapshot/pane.get/process_info/focus/events.subscribe。 |
| [src/api/schema/session.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/api/schema/session.rs) | 全文件 | `SessionSnapshot` | 05：workspaces/tabs/panes/layouts/agents快照；不假设全局事件cursor。 |
| [src/api/schema/events.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/api/schema/events.rs) | 1–180 | `EventsSubscribeParams/Subscription` | 05：订阅枚举；事件作为失效通知并重新拉快照。 |

## 3. 不能直接照搬的部分

Intercom 的 broker/client 是 TypeScript；本实验只借鉴协议校验、连接注册、收据和关联思想，Go重写。它的离线邮箱语义不属于本轮：已离线目标必须失败，手动重开不自动收到旧委派。

herdr-pi-bridge 围绕特定run和remote placement构建，包含runtime目录、manifest、socket、配置和终端交互。我们借鉴请求与事件关联，不复用远程机器、SSH、进程启动和pane分配。其内部强制类型转换不能代替Pi公开API校验；本实验调用`ctx.abort()`。

Intercom framing为4字节长度前缀；Subagents bridge和Herdr API为JSONL。我们内部采用独立命名的长度前缀协议；Go Herdr adapter另外实现JSONL，不声明wire兼容。

Pi Agent Teams示例有owner和依赖；这并不证明它具有本实验的稳定agent_id、绑定代次、完整取消、验收或跨Agent事务式并发控制。Multica的roster briefing与触发模式值得借鉴，但它的issue/mention/在线平台不是本地系统的前置条件。

本次不把Paseo、Pigo、pi-workflows、pi-herdr等未逐函数核验的实现写成关键依赖；它们仍可留在pi-learn作为后续材料。无需为了列更多项目而扩大实施面。

## 4. 官方技术资料（不是本次逐行代码审计）

- [Go net](https://pkg.go.dev/net)：本地Unix socket相关API，供Go IPC实现核对。
- [SQLite WAL](https://sqlite.org/wal.html)：本地事务/并发行为；设计采用Go单写者，模型/网络不持有长事务。
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)：Go SQLite driver候选；实施时验证工具链并固定版本，不把在线页版本称为“已安装”或“最新版”。

Pi公开API的兼容性以固定源码和实装doctor结果共同判断；不能只看相似方法名。升级依赖前记录旧SHA、新SHA、受影响函数和回归用例。

## 5. 本地复核与变更纪律

```bash
# 在 pi-learn 根目录；只读核对，不自动更新引用
git rev-parse HEAD
git ls-tree 2ee5bd7995d1504f73aa5955181f3b9fa5289b8e pi-dev pi-intercom pi-subagents
git -C pi-dev rev-parse HEAD
git -C pi-intercom rev-parse HEAD
git -C pi-subagents rev-parse HEAD
```

submodule未初始化时由使用者决定执行`git submodule update --init`；不要把未初始化或本地已漂移当作参考已正确。需查看固定文件时可用`git -C <submodule> show <sha>:<path>`。不要直接在上游源码内写本实验overlay。

实现中若复制而非仅借鉴开源代码，要按对应版本的许可证保留必要声明；本次只提供设计与路径，不把未核查许可的代码整段搬入。机器可读版本信息见[sources.lock.json](sources.lock.json)。
