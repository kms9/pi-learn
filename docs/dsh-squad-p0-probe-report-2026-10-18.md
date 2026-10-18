---
title: DS Bot + Squad P0 探针实测与可行性复评
type: process
status: active
created: 2026-10-18
updated: 2026-10-18
tags:
  - dsh-bot
  - pi-squad
  - feasibility
  - probe
---

# DS Bot + Squad P0 探针实测与可行性复评（2026-10-18）

> 本文基于 P0 阶段的**实际运行数据**，替代 [读代码版评估](dsh-squad-feasibility-2026-10-18.md) 中尚未验证的部分。
>
> **运行环境**：DSH `0.2.1-rc.2`（npm 发布版，与子模块 `dsh-v0.2.1-rc.2` 同一 tag）+ DS Bot `main@e13bc34`（v0.1.7 之后）+ 只观察的探针插件 `probes/dsh-probe`。模型是 DS Bot 自带的脚本化 mock（`ds-bot/dev/mock-llm.mjs`），**没有接真实 DeepSeek API，也没有接 IM 渠道**。
>
> **原始证据**：`probes/scenarios/S*.jsonl`；可读时间线 `S*.timeline.md`；操作记录 `S*.meta.json`。
>
> **第二轮（同日）**：切到**真实 DeepSeek API**（`deepseek-flash`，Reviewer 用 `deepseek-v4-pro`，thinking/effort high），重跑六个场景，并补测 S7 回合内切段、S8 嵌套 PTC 调用、S9 模型回退。证据在 `probes/scenarios-real/`，结果见 [§3A](#3a-真实-deepseek-模型复跑)。凭据只通过 `source` 进入进程环境；探针对每一行做脱敏；仓库、日志、记录里都没有 key（提交前已 grep 检查）。

## 1. 结论

**仍是「有条件可行」，条件比读代码时更清楚：**

- **DSH 公开 Hook 足够做「看见」和「拦截」**。每次唤醒模型都经过 `agent/inbox/*` 和 `agent/pre-step`；每次模型路由都能在 `agent/request` 看到 provider/model/effort；每次工具调用都经过 `tools/pre-execute → tools/execute → tools/result`。DS Bot 的群聊转发和 DSH 原生定时任务也都走这条路，没有发现绕开 Hook 的唤醒路径。
- **「真正结束」和「恢复」不能只靠 Hook 判断，必须同时读 DSH 的持久日志，并接管 DS Bot 的自动续跑。** 这一点已被实测证实。
- **Bot/Session 归属拿不到**：DS Bot 的 Bot↔Session 映射只在插件私有状态里。只观察的探针有 21% 的事件行写入时无法归属到具体 Bot，而这些行恰好集中在新建 Session 的第一步。因此 **ds-bot 必须提供一个归属接口（seam）**。这是 M1 的硬前置，已被数据证实。
- **真实模型复跑后的修正**：结论仍是有条件可行，但有两条要改。
  1. **「在 pre-step 统一拦截」不能靠插件注册顺序。** 真实运行里出现 2 次 `turn/end {kind:"blocked"}`，探针却一次 reject 都没看到：ds-bot 的 pre-step 监听排到了探针外层，直接 reject、没有调 `next()`。Squad Gate 必须由 ds-bot seam 或 DSH 的确定顺序保证位置，否则会被其他插件「先拒或先放」。
  2. **自动续跑在真实模型下会产生真实副作用。** 重启后续跑的回合做了 10 次 bash、2 次 write、1 次 edit，还改动了工作目录里的文件；**静默模型回退**也已实测确认。另外，嵌套 PTC 调用在 `tools/pre-execute` 可见，可以用 `rootCallId` 识别，工具门这条路是通的。

## 2. 版本统一结果

| 项 | 统一前 | 统一后 |
|---|---|---|
| 主仓 gitlink `deepseek-harness` | `ddefc45`（dsh 0.1.6-alpha.2） | **`687f282e86`（`dsh-v0.2.1-rc.2`，等于上游 master HEAD）** |
| 子模块检出 `deepseek-harness` | `687f282e86`（与 gitlink 不一致） | `687f282e86`（一致） |
| 主仓 gitlink `dsh-bot` | `e13bc34` | **`e13bc34`（上游默认分支 main HEAD；最新 tag v0.1.7 = `939a663` 是它的祖先）** |
| DS Bot 声明的 DSH | `0.2.0-rc.2`（`ds-bot/dev/harness/package.json`） | 不改上游文件；本仓库在 `probes/versions.lock.json` 中覆盖为 `0.2.1-rc.2`。上游分支 `chore/dsh-0.2.1-rc.2@5c6e116` 也在做同样的升级，尚未合入 |
| 运行时 | — | npm `@deepseek-ai/dsh@0.2.1-rc.2`。源码 checkout 要先完整构建 monorepo（`lib/typert.host.js` 缺失），P0 不做这一步 |

**升级回归**：DS Bot main 在 DSH 0.2.1-rc.2 上 `npm test` **635/635 通过**，`npm run lint` 只有 warning。升级本身没有引入需要修复的构建问题。只有两处本机环境问题：DSH 的 lefthook postinstall 在子模块 worktree 下失败，用 `CI=true` 跳过；DSH 要求 pnpm 11.28.5，本机是 9，另装在 scratchpad。

## 3. 六个场景的实测结果

所有场景都在**同一次干净重置**后连续跑完（`bench.sh reset` + `drive.mjs`）。四个 Bot：Chief 和 Builder 用 `deepseek-v4-pro`，Researcher 和 Reviewer 用 `deepseek-flash`；一个四人群「研发群」，管理员是 Chief。

| 场景 | 结果 | 事件数 | 关键观察（证据行号见各 timeline） |
|---|---|---|---|
| S1 `@Researcher` | PASS | 73 | 用户消息先进**群自身 Session**，经 `pre-step:enter` 后由 ds-bot 在 `llm/stream` **合成** `group_relay`。mock 共收到 37 次调用，来自群自身 Session 的是 **0 次**。之后才按需新建 Researcher 的群成员 Session（`agent/created source=startup`）；它的 `inbox/inserted`、`pre-step:in` 写入时**无法归属到 Bot** |
| S2 message_bot / post_to_group / group_relay | PASS | 258 | `message_bot` 把 `bot:request` 写进对方的 **next-step**（steer），并立即唤醒对方，工具本身 21 ms 就返回。`post_to_group` 先写进群自身 Session（`bot:post`），再触发 `group_relay`，依次唤醒三个成员 Session（每个都是新建，都有归属空窗） |
| S3 定时任务 | PASS | 22 | DSH 原生 schedule 服务**直接**往 Reviewer 的 Session 插入 `source.kind=schedule`，不经过 ds-bot 的投递函数。不过它仍然走 inbox → pre-step → request 这条路 |
| S4 重启续跑 | PASS | 116 | 收到 SIGTERM 时 Builder 正在一次 25 s 的模型调用中。关机时 `whenIdle()` resolve 了，但**没有** `turn-stopping`，也**没有**实时 `turn/end`。重启 4 s 后，ds-bot 的 `resume.js` 自动以 `bot:request:resumed` **重新投递同一请求**，mock 第二次收到同一工作（**重放**）。Builder 回复 Chief 后，Chief 又被唤醒一次。DSH 持久日志里，那个中断的回合在重新打开时被补写成 `turn/end {kind:"interrupted"}`，这条**没有作为实时 session/event 发出** |
| S5 上下文切段 | PASS | 90 | 第 2 篇长文结束后，ds-bot 在**回合之间**发起两次 `purpose=compaction` 的辅助调用（steward 判断 + handoff 笔记），然后新建 part Session，注入 `bot:handoff`，**自己启动一个模型回合**。新 part 的前约 40 ms 无法归属。这一过程中 pre-step 没有出现 reject；回合内（mid-turn）切段的 reject 路径没有被触发 |
| S6 用户取消 | PASS | 137 | `stop-member-work` → `agent.cancel({kind:'user'})`，持久日志里是 `turn/end {kind:"aborted",reason:{kind:"user"}}`。**被取消的回合没有 `agent/turn-stopping`**（全部 25 次实时 turn/end 对应 24 次 turn-stopping，差的那一次就是它）。取消后 ds-bot 自动发一条空的 `bot:post`（stopped），群自身 Session 因此又跑了一轮 |

**跨场景统计**：

- **唤醒来源**（`agent/inbox/claimed` 的 `source`），共 9 类：`user` 7、`bot:room` 6、`bot:kickoff` 4、`bot:request` 2、`bot:reply` 2、`bot:post` 2、`schedule` 1、`bot:request:resumed` 1、`bot:handoff` 1。加上代码里有、本次没触发的 `retry`（tool call 写成文字后的重试）和 `stopped`，**至少 11 类**。
- **pre-step**：30 次全部 `enter`，没有 reject。
- **工具**：`group_relay` 4、`message_bot` 2、`ask_user` 2、`post_to_group` 1、`glob` 1。standard preset 下没有出现嵌套（PTC）子调用。
- **模型路由**：每一步的 route 都等于该 Bot 配置的模型，effort=high，没有出现 fallback。
- **辅助调用**：mock 的 37 次调用里约 13 次不是回合本身：每个回合结束后 ds-bot 做的记忆整理（约 11 次）、steward、handoff 笔记。`llm/stream` 上只有切段的 2 次带 `purpose`，**记忆整理调用不带 purpose**。
- **归属**：844 行带 session 的事件里有 **181 行（21%，涉及 10 个 Session）** 写入时无法从 DS Bot 公开状态归属到 Bot。

## 3A. 真实 DeepSeek 模型复跑

**配置**：
- 同一 bench，`MODEL=real`：DSH 走 DeepSeek 的 Anthropic 兼容端点 `<DEEPSEEK_BASE_URL>/anthropic`。
- Chief、Researcher、Builder 用 `deepseek-flash`；Reviewer 用 `deepseek-v4-pro`。
- 上下文窗口 60000，checkRatio 0.45：检查线约 23.4k，硬线约 49.4k。
- 每个 Bot 的指令都要求「一句话回答」，以控制成本。

### 场景结果（`probes/scenarios-real/`）

| 场景 | 结果 | 与 mock 的差异 / 新发现 |
|---|---|---|
| S1 @Bot | PASS | 事件序列与 mock 一致：群自身 Session 合成 relay，**0 token**（4 条合成的 assistant/message，usage 都是 0）；成员 Session 仍有归属空窗。成员回合 1 次调用，cache read 13.8k / 新输入 3.2k |
| S2 Bot 互发 | PASS | 13 步（mock 10）。真实模型多做了一次 `list_bots`，其余与 mock 相同（message_bot → 对方 next-step；post_to_group → relay → 成员） |
| S3 定时 | PASS | 与 mock 完全相同；v4-pro 1 次调用 |
| S4 重启续跑 | PASS | 关机前 Builder 只发出 1 次模型流，没有工具调用。重启后 `bot:request:resumed`（同一 exchangeId）被重新领取，**真实模型把任务重新规划**：10× bash、2× write、1× edit、1× read，共 20 步，并新建、修改了文件。mock 下续跑只是重复一次回复，真实模型下是**重做并扩大范围** |
| S5 切段（回合间） | PASS | 一轮约 10k token 的输入就越过检查线。2 次 compaction 辅助调用（steward + handoff 笔记），然后新 part 自启。与 mock 一致 |
| S6 取消 | PASS | `turn/end aborted {user}`，没有 turn-stopping，与 mock 一致。**新增两点**：①Builder 的群 Session 一开始先 `blocked` 并切段（S7 改 workDir 的连锁效应，M10）；②被取消的回合**没有任何 usage**（M11） |
| **S7 回合内切段（补测）** | PASS* | Builder 做「三次 read」，第 1 次 read 完成后把它的 workDir 改到另一个目录。下一步被拒，`turn/end {kind:"blocked"}`，新 part 由 `bot:handoff` 自启，**从头又读了 a.txt、b.txt、c.txt**（同一回合内的工作被重做）。探针**没看到** reject 本身（H7）。*原判据只认探针看到的 reject，按本场景自己的事件重判为 PASS，没有重跑（见 meta.json 的 `rescored`） |
| **S8 嵌套 PTC（补测）** | PASS | 测试专用插件 `dsh-probe-driver` 建了一个普通（非 Bot）Session，用 `ptc` preset（可选：standard、ptc、minimal、cordis）。模型 1 次 `run_code`，程序内 2 次 `read`：`tools/pre-execute`、`tools/execute` 都能看到它们，`rootCallId` 指向 run_code。**工具门能看见嵌套调用** |
| **S9 模型回退（补测）** | PASS | 用 `CATALOG=flash-only` 重启主机，让 v4-pro 不再出现在本地目录。Reviewer 下一回合的 route 仍是 `v4-pro`（Session 已存的选择；API 实际仍可用），回合中途出现两次 `model/selection → deepseek-flash`，`appliedModel` 变成 flash，`model` 仍是 v4-pro，**没有任何报错或通知**。之后的回合会静默跑在 flash 上 |

### mock 与真实模型对照（全部场景合计）

| 指标 | mock（S0–S6） | 真实（S0–S9） | 说明 |
|---|---|---|---|
| 无法归属的事件行 | 181/844（21%），10 个 Session | 360/1454（25%），13 个 Session | 多出的来自新 part 和 PTC Session |
| pre-step | 30 enter / 0 reject | 57 enter / 0 reject，但有 **2 次 blocked** | reject 发生在探针外层（H7） |
| turn/end | 24 completed、1 aborted | 28 completed、**2 blocked**、1 aborted | `interrupted` 只在持久日志里 |
| 唤醒来源 | 9 类；handoff 1 次 | 9 类；**handoff 4 次** | 改 workDir、回合内切段都会触发 handoff |
| 工具 | 10 次，全是 DS Bot 协作工具和 glob | 37 次：bash 12、read 10、write 2、edit 1、run_code 1 等 | 真实模型在续跑时大量调用外部工具 |
| 嵌套调用 | 0 | 2（S8） | |
| tool call 写成文字后的重试（retry） | 0 | 0 | 本次 deepseek-flash 没有出现 |

### Token 用量（`probes/scenarios-real/tokens.json`，由 `probes/tokens.mjs` 计算）

| 场景 | 回合调用 | 新输入 | cache read | 输出 | 辅助调用（种类） | 辅助 新输入 / cache / 输出 |
|---|---|---|---|---|---|---|
| S0 setup | 4 | 67,442 | 0 | 353 | 0 | — |
| S1 | 1 | 3,167 | 13,824 | 17 | 1（memory） | 745 / 0 / 5 |
| S2 | 12 | 16,888 | 192,256 | 723 | 4（memory） | 2,074 / 1,152 / 20 |
| S3 | 1 | 196 | 16,768 | 24 | 0 | — |
| S4 | 18 | 6,108 | 394,624 | 7,806 | 3（compaction×2、memory） | 2,718 / 30,336 / 1,391 |
| S5 | 1 | 12,733 | 16,640 | 3 | 3（compaction×2、memory） | 2,447 / 29,952 / 774 |
| S6 | 0 | 0 | 0 | 0 | 1（memory） | 316 / 512 / 5 |
| S7 | 6 | 17,133 | 94,976 | 1,072 | 2（compaction、memory） | 1,264 / 19,200 / 954 |
| S8 | 5 | 17,579 | 70,400 | 342 | 2（session-title、memory） | 525 / 512 / 10 |
| S9 | 1 | 102 | 16,896 | 2 | 1（memory） | 345 / 384 / 5 |
| **合计** | **49** | **141,348** | **816,384** | **10,342** | **17** | **10,434 / 82,048 / 3,164** |

总计约 **106 万 token**，其中 cache read 约 89.8 万（85%），新输入约 15.2 万，输出约 1.35 万。另外：
- 本机预检用了 1 次 32 token 的 curl。
- S6 被取消的流、S4 关机时被切断的流都没有被计量（M11），实际用量略高于上表。
- 每个 Bot 的首个回合都要付约 17k 的系统提示加工具定义，后面基本走缓存。所以**新建 Session（成员 Session、新 part、PTC Session）是主要的新输入成本来源**。
- 本文不估算费用，因为单价随服务商调整，未核对。

## 4. 与读代码结论的对照

| 读代码时的判断 | 实测 | 判定 |
|---|---|---|
| H1 DSH 版本三处不一致 | 已统一到 0.2.1-rc.2，DS Bot 测试全绿 | **已解决** |
| H2 DS Bot 没有对外接缝，旁挂插件只能猜映射 | 21% 事件无法归属，集中在新 Session 的第一步，也就是 Gate 最需要判断的时刻 | **证实，并量化** |
| H3 普通入口会绕过 Gate | 所有入口确实都会唤醒模型，但**全部经过 DSH 的 inbox 和 pre-step**，包括 DSH 原生定时和 ds-bot 合成的 relay。在 DSH 层可以统一拦住 | **部分推翻**：风险仍在，但不需要逐个改 ds-bot 入口，在 pre-step 统一判定即可，前提是有 seam 给出归属 |
| 难点 1 列了 7 个入口 | 实测 9 类，代码可见至少 11 类；新增 `bot:handoff`（切段后自启回合）、`bot:kickoff`、取消后的 `stopped` post | **扩充** |
| H4 「真正结束」证据不全，`whenIdle` 覆盖面未知 | `whenIdle` 在关机时也会 resolve；被取消的回合没有 `turn-stopping`；中断只在持久日志里补写 | **证实，并更严重** |
| H5 自动续跑会和「不重放」冲突 | 重启后自动重投同一请求，模型重做了一遍 | **证实** |
| M2 模型回退会污染对照 | 本次没有 fallback；`agent/request` 能逐步观察到 route，冻结校验可以只靠观察实现 | **缓解路径已证实**；回退触发条件（C9）这次没测 |
| M3 PTC | standard preset 下没有嵌套调用 | 未测 PTC，维持原判断 |
| 「`pre-step` 多个 prepend 的顺序未知」 | 后注册的 prepend 在最外层，30 步全部可见 | **已回答**（仅限本版本） |
| 「辅助调用的成本归属」（ACCEPTANCE M3-04） | 约 35% 的调用是辅助调用，多数不带 purpose | **新发现：比预想更大** |
| 「切段与 Squad 冲突」 | 切段发生在回合之间，会自启一个新回合 | **新发现：切段本身也是一种唤醒** |

## 5. 更新后的风险清单

### 高

| ID | 风险 | 变化 | 实测证据 |
|---|---|---|---|
| H2 | **没有归属 seam**：Gate 在新 Session 的第一步无法判断它属于哪个 Bot 和哪次正式派发 | 证实 | 181/844 行无法归属；S1 seq 179–192；S5 seq 112–125 |
| H4 | **结束判定**：`whenIdle` 在关机时也会 resolve；取消没有 turn-stopping；中断不实时发出 | 证实，升级为最高优先 | S4 seq 561–562；S6；持久日志 `interrupted`/`aborted` |
| H5 | **自动重放**：`resume.js` 重启后重投同一请求 | 证实 | S4 mock 收到同一请求两次 |
| H6（新） | **自启回合**：切段 handoff、取消后的 stopped post、回复回传都会在没有新的人类或 Controller 输入时唤醒模型 | 新增；真实模型下 handoff 自启从 1 次增至 4 次 | S5 `bot:handoff`；S6 stopped post；S4 `bot:reply`；real S5/S6/S7 |
| H7（真实模型新增） | **pre-step 顺序不可控**：DSH 把 reject 转成 `turn/end blocked`；ds-bot 的监听可以排在别的插件外层，直接 reject 而不调 `next()`，外层观察和 Gate 都可能看不到 | 新增 | real：57 次 enter、0 次 reject，却有 2 次 blocked（S6、S7） |
| H5+ | **重放带副作用**：续跑的回合由真实模型重新规划，执行了 bash/write/edit 并改了文件 | H5 加重 | real S4：14 次工具调用；`build-environment.md` 新建，`c.txt` 被改 |
| M2→H | **静默模型回退**：Bot 的模型下架后，第一回合仍按 Session 已存的选择发出，紧接着 ds-bot 在回合中途把 Session 切到 profile 默认模型；Bot 的配置仍显示原模型，用户和 Controller 都没有收到通知 | 从中升为高（对照实验和正式 Run 冻结会被直接破坏） | real S9：route `v4-pro`，随后两次 `model/selection → deepseek-flash`，`appliedModel=flash`、`model=v4-pro` |

### 中

| ID | 风险 | 变化 |
|---|---|---|
| H3→M | 入口绕过：在 DSH pre-step 可以统一拦截，前提是 H2 有 seam | 从高降到中 |
| M8（新） | 辅助调用成本：记忆整理、steward、handoff 笔记约占调用数的 35%，且多数不带 purpose，Task 级成本统计会算错 | 新增 |
| M1 | 上游节奏：DS Bot `dev` 领先 `main` 92 个提交，rc.2 升级还在分支上 | 维持 |
| M2 | 模型回退：已实测，升级为高（见上表 M2→H） | 升级 |
| M9（新） | 实验环境：DSH 源码 checkout 要完整构建才能运行；npm 包里 node-pty、spawn-helper 的安装脚本未执行（allow-scripts） | 新增；真实模型下 `bash` 共执行 12 次且正常，shell 不可用的担心**被推翻**，剩下的只是源码构建问题 |
| M10（真实模型新增） | **改工作目录会连锁切段**：Bot 的 workDir 一变，它每个群 Session 在下一回合都会 blocked 并自启新 part | 新增 | real S6 一开始的 blocked 来自 S7 改的 workDir |
| M11（真实模型新增） | **被取消和被中断的调用不计成本**：取消的流和关机时被切断的流都没有 `assistant/message` usage，Task 成本会少算 | 新增 | real S6 回合用量 0；S4 被切断的那次调用没有记录 |
| M3 | PTC：嵌套调用在 `tools/pre-execute`、`tools/execute` 可见，`rootCallId` ≠ `callId`；可以按根调用归到 Attempt | 已测，风险降为低 | real S8：`run_code` 内 2 次嵌套 `read` |

### 低

维持读代码版的 L1–L4（许可证 NOTICE、上游贡献规则、长结果截断、Pi PASS 不继承）。

## 6. 主要难点与方案（按数据修订）

1. **归属 seam（升为第一难点）**
   - **方案**：ds-bot 最小 Fork（或上游 PR）暴露 `ds-bot.squad` 服务，要求**在 `agent/created` 时同步提供** `ownerOf(sessionId) → {botId, roomId, place, partOf}`。Session 是 ds-bot 自己建的，它在建之前就知道归属，所以没有空窗。
   - 再附加 `source.squad` 透传：deliver / postToRoom / resume / handoff 生成的消息带上 Controller 的 `attempt_id/segment_id/fence`。
   - **验证**：同一组 6 个场景重跑，归属空窗应降为 0。

2. **结束与中断判定**
   - **方案**：settled 只能由以下信号**组合**判定：
     - 实时 `turn/end`；
     - 持久日志里的 `turn/end.kind`（`completed`/`aborted`/`interrupted`）；
     - 当前 Attempt 的 `tools/execute:in/out` 配对归零；
     - 没有审批等待。
   - `whenIdle` 和 `turn-stopping` 只能作为辅助信号。
   - 主机重启后，Adapter 先读每个受控 Session 的持久日志尾部，看到 `interrupted` 就上报 `outcome_unknown`。
   - **验证**：S4、S6 改为受控 Session 再跑一次。

3. **自启回合与自动续跑**
   - **方案**：受控 Session 在 seam 上关掉 `resume.js` 自动重投，以及切段后的 handoff 自启（改为由 Controller 决定是否 rebind 并继续）。
   - 取消后的 stopped post 降级为只展示。
   - pre-step 统一兜底：没有 `source.squad` 且不在白名单（`user` 走 Run Guidance 分类）的输入一律 reject。
   - **验证**：受控 Session 上重放 S4、S5、S6，预期 0 次未授权的 `pre-step:enter`。

4. **成本归属（新）**
   - **方案**：Adapter 在 `llm/stream` 按 sessionId 归到 Attempt；不带 purpose 的非回合调用（tools=0、请求时没有活跃回合）单列为「辅助」。同时向 ds-bot seam 请求给记忆整理加 purpose 标签。

## 7. 下一步

**P1 = seam 原型 + 受控负例**：

1. 在本仓库 `dsh_squad/` 下做 ds-bot 最小 Fork 补丁（不改上游子模块），只实现 `ownerOf` 和关闭受控 Session 的 resume/handoff 自启。
2. 把探针升级为「观察 + 可开关 Gate」：只对标记为 managed 的一个 Session 做 pre-step reject。
3. 重跑 S1–S6，再加 ACCEPTANCE 的 M1-03、M1-04、M1-05、M1-07 负例，目标是归属空窗 0、未授权 enter 0、重启后不重放。
4. ~~再接一轮真实 DeepSeek key~~ 已完成，见 §3A。真实模型新增的待办：
   - seam 必须保证 Gate 在 pre-step 的**确定位置**（H7）；
   - Run 冻结时拒绝回退：`desiredModel` 返回值 ≠ 冻结路由就让 Attempt 失败（M2→H）；
   - 受控 Session 改 workDir 前先确认没有活跃 Attempt（M10）；
   - Adapter 从 `agent/assistant-stream` 和 DS Bot ledger 估算被取消调用的成本（M11）。

## 8. 复现方式

```bash
# 需要 node>=22.19、pnpm 11（或用 corepack/npx pnpm@11.28.5）
CONTEXT_WINDOW=100000 CHECK_RATIO=0.45 probes/bench.sh p0 3197 8897 reset
node probes/drive.mjs p0 3197 8897          # 可只跑某个场景：... S4-restart
node probes/analyze.mjs                     # 生成 *.timeline.md
probes/bench.sh p0 3197 8897 stop
```

详见 `probes/README.md`。
